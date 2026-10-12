```text
 ____  ___ 
|  _ \|_ _|   pi-mode-presets
| |_) || |    named presets for pi
|  __/ | |    model | thinking | tools | instructions
|_|   |___| 
```

# pi-mode-presets

Named presets for Pi. Each preset can set the model, thinking level, active tools, and
system-prompt instructions.

Based on the [`pi-preset`](https://github.com/richardgill/pi-extensions/tree/main/extensions/preset)
extension by [@richardgill](https://github.com/richardgill), with `instructionsFile` support added.
Licensed under MIT.

## Install with pi

```bash
pi install npm:pi-mode-presets
```

or from git

```bash
pi install git:github.com/beyro/pi-mode-presets
```

or locally

```bash
pi install ./pi-mode-presets
```

## Configure

You can override individual settings in `preset.jsonc`.

The default location is `~/.pi/agent/preset.jsonc`, or `$PI_EXTENSION_CONFIG_DIR/preset.jsonc` when set.

```jsonc
{
  "presets": {
    "plan": {
      "provider": "openai-codex",
      "model": "gpt-5.2-codex",
      "thinkingLevel": "high",
      "tools": ["read", "bash"],
      "instructions": "Planning mode. Do not edit files."
    },
    "implement": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-5",
      "thinkingLevel": "high",
      "tools": ["read", "bash", "edit", "write"],
      "instructions": "Implementation mode. Make focused changes."
    }
  }
}
```

### Instructions from a markdown file

Instead of inline `instructions`, a preset can point at a markdown file with `instructionsFile`:

```jsonc
{
  "presets": {
    "plan": {
      "provider": "openai-codex",
      "model": "gpt-5.2-codex",
      "tools": ["read", "bash"],
      "instructionsFile": "prompts/plan.md"
    }
  }
}
```

- `instructionsFile` is resolved relative to the config directory (`~/.pi/agent`, or `$PI_EXTENSION_CONFIG_DIR` when set). Absolute paths and a leading `~` are supported.
- The file is re-read on every turn, so edits take effect without restarting pi. If it cannot be read, pi shows a warning and the preset's inline `instructions` (if any) are used instead.
- `instructions` and `instructionsFile` can be combined. When both are set, the file contents come first and the inline `instructions` text is appended after them, separated by a blank line.

### Top-level options

| Option | Default | Description |
| --- | --- | --- |
| `presets` | `{}` | Map of preset name to preset definition. |
| `commandName` | `"preset"` | Slash command name. |
| `flagName` | `"preset"` | CLI flag name. |
| `cycleShortcut` | `"ctrl+shift+u"` | Shortcut that cycles presets. Set to `false` to disable. |
| `defaultTools` | `["read", "bash", "edit", "write"]` | Tools restored when a preset is cleared. |
| `persistState` | `true` | Persist the active preset across turns. |

## Usage

```bash
pi --preset plan
```

- `/preset` opens the selector
- `/preset implement` activates a preset directly
- `ctrl+shift+u` cycles presets
