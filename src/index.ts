import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

import { loadConfig } from "./config.ts";
import { preset, type PresetOptions } from "./extension.ts";
import { ConfigSchema } from "./schema.ts";

const configDir = process.env.PI_EXTENSION_CONFIG_DIR ?? getAgentDir();
const config = loadConfig(path.join(configDir, "preset.jsonc"), ConfigSchema);

export default preset({ ...config, instructionsBaseDir: configDir } satisfies PresetOptions);
