import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  PresetSchema,
  preset,
  resolveInstructionsPath,
  resolveOptions,
  resolvePresetInstructions,
  type PresetOptions,
} from "../src/extension.ts";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preset-instructions-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

type BeforeAgentStartHandler = (
  event: { systemPrompt: string },
  ctx: ExtensionContext,
) => Promise<{ systemPrompt?: string } | undefined>;

type CommandHandler = (args: string, ctx: ExtensionContext) => Promise<void>;

type HarnessOverrides = {
  getFlag?: (name: string) => string | undefined;
  entries?: unknown[];
  allTools?: Array<{ name: string }>;
  model?: unknown;
  findModel?: (provider: string, model: string) => unknown;
};

type Harness = {
  beforeAgentStart: BeforeAgentStartHandler;
  sessionStart: () => Promise<void>;
  turnStart: () => Promise<void>;
  command: CommandHandler;
  shortcut: () => Promise<void>;
  notify: Mock;
  setStatus: Mock;
  registerFlag: Mock;
  registerShortcut: Mock;
  registerCommand: Mock;
  appendEntry: Mock;
  setActiveTools: Mock;
  setThinkingLevel: Mock;
  setModel: Mock;
  ctx: ExtensionContext;
};

const createHarness = (options: PresetOptions, overrides: HarnessOverrides = {}): Harness => {
  const notify = vi.fn();
  const setStatus = vi.fn();
  const ctx = {
    model: overrides.model,
    modelRegistry: { find: overrides.findModel ?? (() => undefined) },
    sessionManager: { getEntries: () => overrides.entries ?? [] },
    ui: {
      notify,
      setStatus,
      select: vi.fn(),
      theme: { fg: (_color: string, text: string) => text },
    },
  } as unknown as ExtensionContext;

  const registerFlag = vi.fn();
  const registerShortcut = vi.fn();
  const registerCommand = vi.fn();
  const appendEntry = vi.fn();
  const setActiveTools = vi.fn();
  const setThinkingLevel = vi.fn();
  const setModel = vi.fn().mockResolvedValue(true);

  const handlers = new Map<string, (...args: never[]) => unknown>();
  let command: CommandHandler | undefined;
  let shortcut: ((ctx: ExtensionContext) => Promise<void>) | undefined;

  const pi = {
    registerFlag: (name: string, definition: unknown) => registerFlag(name, definition),
    registerShortcut: (key: unknown, definition: { handler: (ctx: ExtensionContext) => Promise<void> }) => {
      registerShortcut(key, definition);
      shortcut = definition.handler;
    },
    registerCommand: (name: string, definition: { handler: CommandHandler }) => {
      registerCommand(name, definition);
      command = definition.handler;
    },
    on: (event: string, handler: (...args: never[]) => unknown) => {
      handlers.set(event, handler);
    },
    getThinkingLevel: () => "medium",
    getActiveTools: () => [],
    setActiveTools,
    setThinkingLevel,
    getAllTools: () => overrides.allTools ?? [],
    setModel,
    getFlag: (name: string) => overrides.getFlag?.(name),
    appendEntry,
  } as unknown as ExtensionAPI;

  preset(options)(pi);

  const beforeAgentStart = handlers.get("before_agent_start") as BeforeAgentStartHandler | undefined;
  const sessionStart = handlers.get("session_start") as
    | ((event: unknown, ctx: ExtensionContext) => Promise<void>)
    | undefined;
  const turnStart = handlers.get("turn_start") as
    | ((event: unknown, ctx: ExtensionContext) => Promise<void>)
    | undefined;

  if (!beforeAgentStart || !sessionStart || !turnStart || !command) {
    throw new Error("preset extension did not register its handlers");
  }

  return {
    beforeAgentStart,
    sessionStart: () => sessionStart(undefined, ctx),
    turnStart: () => turnStart(undefined, ctx),
    command,
    shortcut: () => {
      if (!shortcut) throw new Error("shortcut was not registered");
      return shortcut(ctx);
    },
    notify,
    setStatus,
    registerFlag,
    registerShortcut,
    registerCommand,
    appendEntry,
    setActiveTools,
    setThinkingLevel,
    setModel,
    ctx,
  };
};

const warningCalls = (notify: Mock): string[] =>
  notify.mock.calls.filter(([, level]) => level === "warning").map(([message]) => String(message));

describe("resolveInstructionsPath", () => {
  it("resolves relative paths against the base dir", () => {
    expect(resolveInstructionsPath("prompts/plan.md", path.resolve("/config"))).toBe(
      path.resolve("/config", "prompts/plan.md"),
    );
  });

  it("keeps absolute paths unchanged", () => {
    const absolute = path.resolve("/tmp", "plan.md");
    expect(resolveInstructionsPath(absolute, path.resolve("/config"))).toBe(absolute);
  });

  it("expands a leading home directory", () => {
    expect(resolveInstructionsPath("~/prompts/plan.md", path.resolve("/config"))).toBe(
      path.join(os.homedir(), "prompts/plan.md"),
    );
  });

  it("expands a home directory using the platform separator", () => {
    expect(resolveInstructionsPath(`~${path.sep}prompts${path.sep}plan.md`, path.resolve("/c"))).toBe(
      path.join(os.homedir(), "prompts", "plan.md"),
    );
  });
});

describe("resolvePresetInstructions", () => {
  it("returns inline instructions when no file is configured", () => {
    expect(resolvePresetInstructions({ instructions: "inline" }, process.cwd())).toEqual({
      text: "inline",
      error: undefined,
    });
  });

  it("reads file contents relative to the base dir", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "plan.md"), "from file", "utf8");

    expect(resolvePresetInstructions({ instructionsFile: "plan.md" }, dir)).toEqual({
      text: "from file",
      error: undefined,
    });
  });

  it("appends inline instructions after file contents", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "plan.md"), "from file", "utf8");

    expect(
      resolvePresetInstructions({ instructionsFile: "plan.md", instructions: "inline" }, dir),
    ).toEqual({ text: "from file\n\ninline", error: undefined });
  });

  it("warns and falls back to inline instructions when the file is missing", () => {
    const dir = makeTempDir();
    const result = resolvePresetInstructions(
      { instructionsFile: "missing.md", instructions: "inline" },
      dir,
    );

    expect(result.text).toBe("inline");
    expect(result.error).toContain("missing.md");
  });

  it("warns and returns no text when the file is missing and no inline text exists", () => {
    const dir = makeTempDir();
    const result = resolvePresetInstructions({ instructionsFile: "missing.md" }, dir);

    expect(result.text).toBeUndefined();
    expect(result.error).toContain("missing.md");
  });
});

describe("resolveOptions", () => {
  it("defaults instructionsBaseDir to the current working directory", () => {
    expect(resolveOptions().instructionsBaseDir).toBe(process.cwd());
  });

  it("preserves an explicit instructionsBaseDir", () => {
    expect(resolveOptions({ instructionsBaseDir: "/config" }).instructionsBaseDir).toBe("/config");
  });

  it("accepts instructionsFile presets", () => {
    const options = resolveOptions({ presets: { plan: { instructionsFile: "plan.md" } } });
    expect(options.presets.plan?.instructionsFile).toBe("plan.md");
  });

  it("preserves cycleShortcut false", () => {
    expect(resolveOptions({ cycleShortcut: false }).cycleShortcut).toBe(false);
  });
});

describe("PresetSchema", () => {
  it("keeps instructions, instructionsFile, and both", () => {
    expect(PresetSchema.parse({ instructions: "inline" })).toEqual({ instructions: "inline" });
    expect(PresetSchema.parse({ instructionsFile: "plan.md" })).toEqual({
      instructionsFile: "plan.md",
    });
    expect(PresetSchema.parse({ instructions: "inline", instructionsFile: "plan.md" })).toEqual({
      instructions: "inline",
      instructionsFile: "plan.md",
    });
  });

  it("rejects an unknown thinking level", () => {
    expect(PresetSchema.safeParse({ thinkingLevel: "bogus" }).success).toBe(false);
  });
});

describe("before_agent_start", () => {
  it("appends file instructions to the system prompt", async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "plan.md"), "from file", "utf8");
    const harness = createHarness({
      presets: { plan: { instructionsFile: "plan.md" } },
      instructionsBaseDir: dir,
    });

    await harness.command("plan", harness.ctx);
    const result = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);

    expect(result?.systemPrompt).toBe("base\n\nfrom file");
  });

  it("appends inline instructions after file contents", async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "plan.md"), "from file", "utf8");
    const harness = createHarness({
      presets: { plan: { instructionsFile: "plan.md", instructions: "inline" } },
      instructionsBaseDir: dir,
    });

    await harness.command("plan", harness.ctx);
    const result = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);

    expect(result?.systemPrompt).toBe("base\n\nfrom file\n\ninline");
  });

  it("still appends inline-only instructions", async () => {
    const harness = createHarness({
      presets: { plan: { instructions: "inline only" } },
    });

    await harness.command("plan", harness.ctx);
    const result = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);

    expect(result?.systemPrompt).toBe("base\n\ninline only");
  });

  it("trims trailing whitespace from file contents", async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "plan.md"), "from file\n", "utf8");
    const harness = createHarness({
      presets: { plan: { instructionsFile: "plan.md" } },
      instructionsBaseDir: dir,
    });

    await harness.command("plan", harness.ctx);
    const result = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);

    expect(result?.systemPrompt).toBe("base\n\nfrom file");
  });

  it("re-reads the file on each turn", async () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, "plan.md");
    fs.writeFileSync(filePath, "first", "utf8");
    const harness = createHarness({
      presets: { plan: { instructionsFile: "plan.md" } },
      instructionsBaseDir: dir,
    });

    await harness.command("plan", harness.ctx);
    const first = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);
    expect(first?.systemPrompt).toBe("base\n\nfirst");

    fs.writeFileSync(filePath, "second", "utf8");
    const second = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);
    expect(second?.systemPrompt).toBe("base\n\nsecond");
  });

  it("warns once per missing file and leaves the prompt unchanged", async () => {
    const dir = makeTempDir();
    const harness = createHarness({
      presets: { plan: { instructionsFile: "missing.md" } },
      instructionsBaseDir: dir,
    });

    await harness.command("plan", harness.ctx);
    const result = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);

    expect(result).toBeUndefined();
    expect(warningCalls(harness.notify)).toHaveLength(1);
    expect(warningCalls(harness.notify)[0]).toContain("missing.md");

    await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);
    expect(warningCalls(harness.notify)).toHaveLength(1);
  });

  it("warns again after the preset is re-activated", async () => {
    const dir = makeTempDir();
    const harness = createHarness({
      presets: { plan: { instructionsFile: "missing.md" } },
      instructionsBaseDir: dir,
    });

    await harness.command("plan", harness.ctx);
    await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);
    expect(warningCalls(harness.notify)).toHaveLength(1);

    await harness.command("plan", harness.ctx);
    await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);
    expect(warningCalls(harness.notify)).toHaveLength(2);
  });

  it("does nothing when no preset is active", async () => {
    const harness = createHarness({ presets: { plan: { instructions: "inline" } } });

    const result = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);

    expect(result).toBeUndefined();
    expect(harness.notify).not.toHaveBeenCalled();
  });
});

describe("registration", () => {
  it("uses the configured command and flag names", () => {
    const harness = createHarness({
      presets: { plan: {} },
      commandName: "mode",
      flagName: "mode",
    });

    expect(harness.registerCommand.mock.calls[0]?.[0]).toBe("mode");
    expect(harness.registerFlag.mock.calls[0]?.[0]).toBe("mode");
  });

  it("registers the cycle shortcut by default", () => {
    const harness = createHarness({ presets: { plan: {} } });

    expect(harness.registerShortcut).toHaveBeenCalledTimes(1);
    expect(harness.registerShortcut.mock.calls[0]?.[0]).toBe("ctrl+shift+u");
  });

  it("does not register a shortcut when cycleShortcut is false", () => {
    const harness = createHarness({ presets: { plan: {} }, cycleShortcut: false });

    expect(harness.registerShortcut).not.toHaveBeenCalled();
  });
});

describe("turn_start", () => {
  it("appends the active preset name", async () => {
    const harness = createHarness({ presets: { plan: {} } });

    await harness.command("plan", harness.ctx);
    await harness.turnStart();

    expect(harness.appendEntry).toHaveBeenCalledWith("preset-state", { name: "plan" });
  });

  it("does not append when no preset is active", async () => {
    const harness = createHarness({ presets: { plan: {} } });

    await harness.turnStart();

    expect(harness.appendEntry).not.toHaveBeenCalled();
  });

  it("does not append when persistState is false", async () => {
    const harness = createHarness({ presets: { plan: {} }, persistState: false });

    await harness.command("plan", harness.ctx);
    await harness.turnStart();

    expect(harness.appendEntry).not.toHaveBeenCalled();
  });
});

describe("session_start", () => {
  it("activates the preset named by the flag", async () => {
    const harness = createHarness(
      { presets: { plan: { instructions: "from flag" } } },
      { getFlag: (name) => (name === "preset" ? "plan" : undefined) },
    );

    await harness.sessionStart();
    const result = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);

    expect(result?.systemPrompt).toBe("base\n\nfrom flag");
  });

  it("restores the last persisted preset", async () => {
    const harness = createHarness(
      { presets: { plan: { instructions: "restored" } } },
      { entries: [{ type: "custom", customType: "preset-state", data: { name: "plan" } }] },
    );

    await harness.sessionStart();
    const result = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);

    expect(result?.systemPrompt).toBe("base\n\nrestored");
  });

  it("ignores a persisted preset that no longer exists", async () => {
    const harness = createHarness(
      { presets: { plan: { instructions: "restored" } } },
      { entries: [{ type: "custom", customType: "preset-state", data: { name: "gone" } }] },
    );

    await harness.sessionStart();
    const result = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);

    expect(result).toBeUndefined();
  });
});

describe("shortcut", () => {
  it("cycles to the first preset", async () => {
    const harness = createHarness({ presets: { alpha: { instructions: "a" } } });

    await harness.shortcut();
    const result = await harness.beforeAgentStart({ systemPrompt: "base" }, harness.ctx);

    expect(result?.systemPrompt).toBe("base\n\na");
  });
});

describe("status and restore", () => {
  it("sets and clears the status line", async () => {
    const harness = createHarness({ presets: { plan: {} } });

    await harness.command("plan", harness.ctx);
    expect(harness.setStatus).toHaveBeenCalledWith("preset", "preset:plan");

    await harness.command("(none)", harness.ctx);
    expect(harness.setStatus).toHaveBeenLastCalledWith("preset", undefined);
  });

  it("restores the original model, thinking level, and tools when cleared", async () => {
    const originalModel = { id: "original" };
    const harness = createHarness(
      { presets: { plan: { provider: "p", model: "m" } } },
      { model: originalModel, findModel: () => ({ id: "preset-model" }) },
    );

    await harness.command("plan", harness.ctx);
    await harness.command("(none)", harness.ctx);

    expect(harness.setModel).toHaveBeenLastCalledWith(originalModel);
    expect(harness.setThinkingLevel).toHaveBeenLastCalledWith("medium");
    expect(harness.setActiveTools).toHaveBeenLastCalledWith([]);
  });
});

describe("warnings", () => {
  it("warns about unknown tools but still applies valid ones", async () => {
    const harness = createHarness(
      { presets: { plan: { tools: ["read", "write"] } } },
      { allTools: [{ name: "read" }] },
    );

    await harness.command("plan", harness.ctx);

    expect(warningCalls(harness.notify).join("\n")).toContain("write");
    expect(harness.setActiveTools).toHaveBeenCalledWith(["read"]);
  });

  it("warns when the model is not found", async () => {
    const harness = createHarness(
      { presets: { plan: { provider: "p", model: "missing" } } },
      { findModel: () => undefined },
    );

    await harness.command("plan", harness.ctx);

    expect(warningCalls(harness.notify).join("\n")).toContain("p/missing");
  });
});
