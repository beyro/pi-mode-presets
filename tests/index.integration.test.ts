import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Proves the real entry point wires the config directory into `instructionsBaseDir`.
 * `src/index.ts` reads `PI_EXTENSION_CONFIG_DIR` and loads `preset.jsonc` at import
 * time, so each test sets the env var, resets modules, then imports it fresh.
 */

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preset-index-"));
  tempDirs.push(dir);
  return dir;
};

const originalConfigDir = process.env.PI_EXTENSION_CONFIG_DIR;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  if (originalConfigDir === undefined) delete process.env.PI_EXTENSION_CONFIG_DIR;
  else process.env.PI_EXTENSION_CONFIG_DIR = originalConfigDir;
  vi.resetModules();
});

type BeforeAgentStartHandler = (
  event: { systemPrompt: string },
  ctx: ExtensionContext,
) => Promise<{ systemPrompt?: string } | undefined>;

type CommandHandler = (args: string, ctx: ExtensionContext) => Promise<void>;

const loadEntryPoint = async (configDir: string): Promise<((pi: ExtensionAPI) => void) | undefined> => {
  process.env.PI_EXTENSION_CONFIG_DIR = configDir;
  vi.resetModules();
  const module = await import("../src/index.ts");
  return module.default as ((pi: ExtensionAPI) => void) | undefined;
};

const drive = (
  initializer: (pi: ExtensionAPI) => void,
): { beforeAgentStart: BeforeAgentStartHandler; command: CommandHandler; ctx: ExtensionContext } => {
  let beforeAgentStart: BeforeAgentStartHandler | undefined;
  let command: CommandHandler | undefined;

  const pi = {
    registerFlag: vi.fn(),
    registerShortcut: vi.fn(),
    registerCommand: (_name: string, definition: { handler: CommandHandler }) => {
      command = definition.handler;
    },
    on: (event: string, handler: BeforeAgentStartHandler) => {
      if (event === "before_agent_start") beforeAgentStart = handler;
    },
    getThinkingLevel: () => "medium",
    getActiveTools: () => [],
    setActiveTools: vi.fn(),
    setThinkingLevel: vi.fn(),
    getAllTools: () => [],
    setModel: vi.fn().mockResolvedValue(true),
    getFlag: () => undefined,
    appendEntry: vi.fn(),
  } as unknown as ExtensionAPI;

  initializer(pi);

  if (!beforeAgentStart || !command) throw new Error("entry point did not register handlers");

  const ctx = {
    model: undefined,
    modelRegistry: { find: () => undefined },
    sessionManager: { getEntries: () => [] },
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
      select: vi.fn(),
      theme: { fg: (_color: string, text: string) => text },
    },
  } as unknown as ExtensionContext;

  return { beforeAgentStart, command, ctx };
};

describe("src/index.ts", () => {
  it("resolves instructionsFile against PI_EXTENSION_CONFIG_DIR", async () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, "prompts"));
    fs.writeFileSync(path.join(dir, "prompts", "plan.md"), "entry point file text", "utf8");
    fs.writeFileSync(
      path.join(dir, "preset.jsonc"),
      JSON.stringify({ presets: { plan: { instructionsFile: "prompts/plan.md" } } }),
      "utf8",
    );

    const initializer = await loadEntryPoint(dir);
    expect(initializer).toBeTypeOf("function");

    const { beforeAgentStart, command, ctx } = drive(initializer!);
    await command("plan", ctx);
    const result = await beforeAgentStart({ systemPrompt: "base" }, ctx);

    expect(result?.systemPrompt).toBe("base\n\nentry point file text");
  }, 20000);

  it("loads with defaults when preset.jsonc is absent", async () => {
    const dir = makeTempDir();

    const initializer = await loadEntryPoint(dir);
    expect(initializer).toBeTypeOf("function");

    const { beforeAgentStart, ctx } = drive(initializer!);
    const result = await beforeAgentStart({ systemPrompt: "base" }, ctx);

    expect(result).toBeUndefined();
  }, 20000);
});
