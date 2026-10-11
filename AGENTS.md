# AGENTS.md

Guidance for agents working in this repo.

## What this is

A standalone Pi extension that gives you named presets. Each preset can set the model,
thinking level, active tools, and system-prompt instructions. Presets can also point at a
Markdown instructions file that is re-read on every turn.

Source lives in `src/`:

- `src/extension.ts` — core factory, schemas, and helpers. Pure logic; no file reads at import.
- `src/schema.ts` — the `preset.jsonc` schema, derived from the runtime options schema.
- `src/config.ts` — JSONC + Zod config loader.
- `src/index.ts` — Pi entry point. Reads `preset.jsonc` and default-exports the initializer.

## Setup

    pnpm install

## Checks

Run these before you finish:

    pnpm typecheck
    pnpm test

## Test with -p (non-interactive)

PowerShell:

    $env:PI_EXTENSION_CONFIG_DIR = "$PWD\.pi-test"
    pi --no-extensions -e ./src/index.ts --preset plan -p "Say OK"

Create `.pi-test\preset.jsonc` and any instructions files first. `.pi-test` is git-ignored.

Expected: Pi starts with the named preset and the system prompt includes the file text.

## Test the config loader

`pnpm test` covers the loader with temp directories. No Pi process is needed.

## Interactive testing

Run Pi directly in a terminal and drive it by hand:

    pi --no-extensions -e ./src/index.ts

Then type `/preset` and check the selector, the `preset:<name>` status, and that `/preset`
plus `(none)` restores the defaults.

## Rules

- Do not publish from a local check. Publishing runs through changesets and CI.
- Keep `src/extension.ts` free of file reads at import time so tests stay fast.
- Add a changeset for any user-visible change: `pnpm changeset`.
