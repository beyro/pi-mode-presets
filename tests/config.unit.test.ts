import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { loadConfig } from "../src/config.ts";
import { ConfigSchema } from "../src/schema.ts";

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preset-config-"));
  tempDirs.push(dir);
  return dir;
};

const writeConfig = (content: string): string => {
  const dir = makeTempDir();
  const file = path.join(dir, "preset.jsonc");
  fs.writeFileSync(file, content, "utf8");
  return file;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const Schema = z.object({ name: z.string().default("default") });

describe("loadConfig", () => {
  it("applies schema defaults when the file is missing", () => {
    const dir = makeTempDir();
    expect(loadConfig(path.join(dir, "preset.jsonc"), Schema)).toEqual({ name: "default" });
  });

  it("reads JSONC with comments and trailing commas", () => {
    const file = writeConfig('{\n  // comment\n  "name": "custom",\n}\n');
    expect(loadConfig(file, Schema)).toEqual({ name: "custom" });
  });

  it("throws a helpful error for invalid JSONC", () => {
    const file = writeConfig("{ oops }");
    expect(() => loadConfig(file, Schema)).toThrow(/Invalid JSONC in .*:1:3/);
  });

  it("throws a helpful error when validation fails", () => {
    const file = writeConfig('{ "name": 123 }');
    expect(() => loadConfig(file, Schema)).toThrow(/Invalid config/);
  });
});

describe("loadConfig with the real ConfigSchema", () => {
  it("applies every default when the file is missing", () => {
    const dir = makeTempDir();
    const config = loadConfig(path.join(dir, "preset.jsonc"), ConfigSchema);

    expect(config.presets).toEqual({});
    expect(config.commandName).toBe("preset");
    expect(config.flagName).toBe("preset");
    expect(config.cycleShortcut).toBe("ctrl+shift+u");
    expect(config.defaultTools).toEqual(["read", "bash", "edit", "write"]);
    expect(config.persistState).toBe(true);
  });

  it("round-trips a preset with instructionsFile", () => {
    const file = writeConfig('{"presets":{"plan":{"instructionsFile":"prompts/plan.md"}}}');
    const config = loadConfig(file, ConfigSchema);

    expect(config.presets.plan?.instructionsFile).toBe("prompts/plan.md");
  });

  it("accepts cycleShortcut false", () => {
    const file = writeConfig('{"presets":{"plan":{}},"cycleShortcut":false}');
    expect(loadConfig(file, ConfigSchema).cycleShortcut).toBe(false);
  });

  it("names the offending preset when a field is invalid", () => {
    const file = writeConfig('{"presets":{"plan":{"thinkingLevel":"bogus"}}}');
    expect(() => loadConfig(file, ConfigSchema)).toThrow(/plan/);
  });

  it("does not accept instructionsBaseDir from the config file", () => {
    const file = writeConfig('{"instructionsBaseDir":"/tmp"}');
    expect(loadConfig(file, ConfigSchema)).not.toHaveProperty("instructionsBaseDir");
  });
});
