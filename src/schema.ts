import { PresetOptionsSchema } from "./extension.ts";

/**
 * The `preset.jsonc` surface. Derived from `PresetOptionsSchema` so the config file
 * schema cannot drift from the runtime options. `instructionsBaseDir` is omitted
 * because the entry point sets it from the config directory, not the config file.
 */
export const ConfigSchema = PresetOptionsSchema.omit({ instructionsBaseDir: true });
