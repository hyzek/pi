# Input Box — current state and implementation notes

This doc captures the current redesign of the coding-agent input box (the prompt editor)
so another agent can pick it up without re-reading the whole change. Everything below is
on branch `openai-alike`.

## Goal

Match the compact Codex-style prompt shown in the reference screenshot: a neutral-gray
filled block, a slim `›` prompt prefix, and the muted placeholder `Ask flux anything`
when the editor is empty. The fill is theme-driven rather than a hardcoded
terminal color.

## Current behavior

- The input editor renders as a filled block:
  - `[0]` dark fill (padding)
  - `[1]` `› <text>` (prompt + input)
  - `[2]` dark fill (padding)
- The `›` prefix is on the **first input line only**.
- Empty input shows the muted placeholder. It is display-only and is not submitted as
  prompt text; the first placeholder grapheme is rendered under the reverse-video cursor.
- The cursor (reverse video) sits right after `› <text>` for real input.
- Mouse click on the first line accounts for the prompt width.
- Long input keeps the existing wrapping, history, autocomplete, and vertical scrolling
  behavior.
- Without the block options, the editor behaves exactly as before (borders, `─` lines).

## Where it's implemented

### `packages/tui/src/components/editor.ts` (core component)

- `EditorOptions` (line ~241) gained:
  - `prompt?: string` — prefix glyph (the default coding-agent value is `"›"`).
  - `placeholder?: string` — display-only text shown while the editor is empty.
  - `placeholderStyle?: (text: string) => string` — styling for placeholder text.
  - `blockFill?: (text: string) => string` — wraps each rendered line in a background.
  - `rightHint?: () => string` — right-aligned, display-only text on the first input line.
- Fields (line ~303): `protected promptPrefix`, `protected promptPrefixWidth`, `private placeholder`,
  `private placeholderStyle`, `private blockFill`, and `private rightHint`.
  `promptPrefix` = `${prompt} ` (glyph + space); `promptPrefixWidth` = its visible width.
- Constructor (line ~376) reads the prompt, placeholder, placeholder style, block fill, and
  right-hint options.
- `renderTopBorder` / `renderBottomBorder` (line ~512 / 521): when `blockFill` is set they
  return a filled blank line (or the `↑ N more` scroll label, filled), instead of `─` + border color.
- `render()` (line ~536):
  - `layoutWidth` subtracts `promptPrefixWidth` so text wraps after the prompt.
  - Each input line is wrapped in `blockFill`; the first line (when `scrollOffset === 0`)
    is prefixed with the prompt.
  - Empty input uses a width-limited placeholder and styles its text without changing the
    logical editor value. The cursor marker is offset by `promptPrefixWidth`.
  - On the first input line only, `rightHint()` is consulted and, when it returns non-empty
    text and at least `RIGHT_HINT_MIN_GAP` (2) blank columns remain after the typed text, the
    hint is appended flush right. It is display-only: never part of the editor value, and
    dropped entirely when a long line leaves no room, so it can never be typed over.
- `handleMouse` (line ~688): `targetColumn = event.x - paddingX - promptOffset`, where
  `promptOffset` is `promptPrefixWidth` when `event.y === 1 && scrollOffset === 0`.
  The right hint needs no mouse handling because clicks past the text already clamp to the
  end of the line.

### `packages/coding-agent/src/modes/interactive/interactive-mode.ts` (wiring)

- The default editor is constructed around **line 562**:
  ```ts
  this.defaultEditor = new CustomEditor(this.ui, getEditorTheme(), this.keybindings, {
      paddingX: editorPaddingX,
      autocompleteMaxVisible,
      embedWorkingStatus: false,
      prompt: "›",
      placeholder: "Ask flux anything",
      placeholderStyle: (text) => theme.fg("muted", text),
      blockFill: (text) => theme.bg("inputBg", text),
      rightHint: () => this.buildContextWarning(),
  });
  ```
  The block fill uses the dedicated `inputBg` theme token (`#3c3c3c` in the dark theme).
  `inputBg` is optional for custom themes and falls back to `selectedBg`.
- `buildContextWarning()` returns `theme.fg("warning", "NN% ctx")` once
  `session.getContextUsage().percent` reaches `settingsManager.getContextWarningPercent()`
  (default 85, `0` disables), and `""` below it. The footer no longer shows context usage.

### Selector menus

The model picker and settings menu use the same gray surface through the shared TUI
`Box` component. The box adds horizontal and vertical padding, fills every rendered row,
and preserves the selector's mouse coordinates.

- Model rows keep the existing visible count and align `N. <model id>` on the left with
  `(current)` / `(default)` suffixes, followed by a synthesized description — context
  window, price, reasoning — in a muted right-hand column. The selected row is marked with
  an accent `> ` and accent-colored text.
- The effort picker uses the same selection styling: `selectedItemMarker: "> "` on its
  layout, with the base `SelectList` theme supplying the accent color. No menu paints a
  background across the selected row — a full-width `selectedBg` fill was tried and
  dropped, because it read as noise and broke up over the last cells of the row.
- Settings rows keep their selected styling but use a blank two-cell cursor prefix instead
  of the `→` selector marker.
- The standalone selector border rows were removed because the gray surface is now the
  visual container.

### Theme files

- `theme.ts` registers `inputBg` as an optional background token and routes it through
  the same fallback path used by other optional theme values.
- `theme-json.ts` and `theme-schema.json` describe the token for validation and editor
  completion.
- `dark.json` sets `inputBg` to `#3c3c3c`; `light.json` sets it to `#e7e7ea`.

### `packages/coding-agent/src/modes/interactive/components/custom-editor.ts`

- `CustomEditor` passes its options through to the tui `Editor` (`super(tui, theme, options)`),
  so `prompt` / `placeholder` / `blockFill` arrive already wired. It overrides `renderTopBorder` for the
  (now disabled) `embedWorkingStatus` path; when not embedding it falls through to the
  base filled-line behavior.

### Tests

- `packages/tui/test/editor.test.ts` (test "prompt + filled block input", ~line 4207)
  asserts a 3-line filled block, the `› hello` prompt, and the cursor after the prompt.
  The same suite covers `rightHint`: flush-right placement, dropping on a full line, and
  hiding on an empty string.
- The complete TUI editor suite passes with both the new filled path and the default
  unfilled path.

## Possible follow-up work

1. **Block padding / height.** Currently the block is 1 fill + input lines + 1 fill (3 lines
   for a single-line prompt). To make it taller, add an `EditorOptions.blockPaddingRows?: number`
   and render that many extra filled blank lines above/below the input in `render()`. Note:
   any extra top rows shift the autocomplete start row and the mouse row mapping in
   `handleMouse` (`autocompleteStartRow`, `event.y` bounds), so those must be updated too.

2. **Multi-line / wrapped input.** The prompt only appears on the first line, and
   `layoutWidth` is reduced by the prompt width for ALL lines (slightly conservative on
   continuation/wrapped lines). If you want the prompt to visually lead only the first line
   while continuation lines use the full width, you'd need per-line layout width instead of
   the single global `layoutWidth`.

3. **Autocomplete menu.** The slash-command / file-completion menu renders below the block
   on the terminal background (it is NOT filled). If the menu should look consistent with the
   block, wrap its lines in `blockFill` too (in `render()`'s autocomplete section).

4. **Custom / extension editors.** Extensions create their own `Editor` via `getEditorTheme()`
   without `prompt` / `blockFill`, so they won't get the block style. To apply it there, pass
   the same options when constructing custom editors (see `setCustomEditorComponent` in
   `interactive-mode.ts`).

5. Keep `blockFill` as a generic editor option unless the TUI needs to make input
   backgrounds part of `EditorTheme` itself.

## Startup shine

A one-shot "light sweeps across the block" effect plays once on the input box when the app
boots, then settles. It is the same curve as the working indicator's fading text, so the two
read as one family — the curve itself lives in
`packages/tui/src/shine.ts` (`shinePhase`, `shineIntensityAt`, `quantizeShine`, …) and
`status-indicator.ts` imports it back.

- **`EditorOptions.blockShine`** (requires `blockFill`) takes `frames` (24), `intervalMs`
  (40, so 960ms), `falloffFraction`, `rowOffset`, and `background(intensity) => ansi`.
- The editor owns the timer and the geometry; the app owns only the colors. `background(0)`
  must return the resting fill, because the level drops back to 0 whenever the band leaves a
  run of columns.
- `Editor.startBlockShine()` / `stopBlockShine()` / `isBlockShining()` are the lifecycle API.
  It is armed from `init()` *after* `this.ui.start()`, and stops early on the first keystroke.
- Rows are indexed `0` = top fill, `1..n` = input lines, `n+1` = bottom fill. The shine only
  restyles existing rows, so the mouse row mapping and the autocomplete start row are
  untouched.
- `placeholderStyle` gained an optional second argument. While a shine runs the editor calls it
  **once per grapheme** with that grapheme's intensity; when idle it makes the original single
  call, so the resting block is byte-identical to before.

Colors are in `packages/coding-agent/src/modes/interactive/theme/input-shine.ts`. The block
blends toward `#ffffff` on the dark theme (`inputBg #3c3c3c` → `#8e8e8e` at the peak,
`INPUT_SHINE_BG_PEAK = 0.42`) and toward `#3c3c3c` on the light theme — the direction is chosen
from `inputBg`'s own luminance, since blending a light fill toward white is invisible. The
placeholder foreground brightens alongside it (`INPUT_SHINE_FG_PEAK = 0.75`), which is not
cosmetic: muted `#808080` on a lightened block is barely 1.2:1 contrast, so a background-only
shine would wash the text out exactly at the peak.

Tuning: *feels like a pulse, not a glint* → lower `falloffFraction` (0.18); *too strong* →
lower `INPUT_SHINE_BG_PEAK`; *placeholder washes out* → raise `INPUT_SHINE_FG_PEAK`.

`Theme` gained `getRawColor`, `blendBgAnsi`, `blendFg` and a module-level `relativeLuminance`
for this. They fall back to the unblended color for non-hex (256-color-index) tokens, so a
custom theme degrades to "no blend" rather than throwing.

### Max-effort variant

The same glint replays, recolored to the effort color, the moment reasoning effort becomes
`max`. Same 3 rows, same curve, same 24 x 40ms — the only difference is the blend target:
`thinkingMax` (`#ff5f3c` dark / `#c2410c` light) instead of the neutral white / `#3c3c3c`.

| Theme | resting `inputBg` | neutral peak | max-effort peak |
|---|---|---|---|
| dark | `#3c3c3c` | `#8e8e8e` | `#8e4b3c` |
| light | `#e7e7ea` | `#9f9fa1` | `#d7a18d` |

- **Trigger.** `shouldPlayMaxShine(previous, next)` fires only on a real transition into `max`,
  from `cycleEffort()` (`shift+tab`) and `selectThinkingLevel()` (`/effort`, both Enter and
  Ctrl+S). Re-confirming max while it is already active does nothing. `next` is the session's
  level *after* clamping, so picking `max` on a model that lacks it clamps to `high` and stays
  silent.
- **Replay.** `startBlockShine()` no-ops while a glint is already running, so
  `playMaxEffortShine()` calls `stopBlockShine()` first — cycling onto max during the launch
  glint's first second would otherwise silently drop the tinted one.
- **Variant state.** `createInputShine()` returns `{ background, placeholderStyle, setVariant }`.
  The editor holds `background` by reference and re-reads it per row per render, so the variant
  lives in a closure on this side of the package boundary and `packages/tui` needed no changes.
  The variant resets on the next change away from max, but only when no glint is in flight, so a
  running max glint never switches color mid-sweep.
- **The fg fade is deliberately shared.** The placeholder keeps brightening toward the normal text
  color; blending it toward `thinkingMax` would put red text on a red band.
- A theme storing `thinkingMax` as a named color or 256-color index cannot be blended, so the
  glint falls back to the neutral target and plays untinted rather than not at all.
- Launch is unaffected: a session that *starts* on `max` still gets the plain gray glint, since
  the variant only changes on a transition.

## Gotchas

- The editor test suite is large and exercises cursor/mouse/wrap/autocomplete heavily. Run
  `node --test test/editor.test.ts` from `packages/tui` after any change.
- The `promptPrefixWidth` offset must stay consistent between `render()` (cursor shift) and
  `handleMouse` (`targetColumn`) or clicks will be off by the prompt width on the first line.
- Don't remove `blockFill`/`prompt` guarding: the default (unfilled) editor must keep its old
  border behavior.

## Verification commands

```bash
cd /Users/leo/dev/flux
npx tsgo --noEmit            # type check
npm run check                # full repo gate
cd packages/tui && node --test test/editor.test.ts   # editor suite (188 tests)
```
