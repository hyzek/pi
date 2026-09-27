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
- Fields (line ~303): `protected promptPrefix`, `protected promptPrefixWidth`, `private placeholder`,
  `private placeholderStyle`, and `private blockFill`.
  `promptPrefix` = `${prompt} ` (glyph + space); `promptPrefixWidth` = its visible width.
- Constructor (line ~376) reads the prompt, placeholder, placeholder style, and block fill options.
- `renderTopBorder` / `renderBottomBorder` (line ~512 / 521): when `blockFill` is set they
  return a filled blank line (or the `↑ N more` scroll label, filled), instead of `─` + border color.
- `render()` (line ~536):
  - `layoutWidth` subtracts `promptPrefixWidth` so text wraps after the prompt.
  - Each input line is wrapped in `blockFill`; the first line (when `scrollOffset === 0`)
    is prefixed with the prompt.
  - Empty input uses a width-limited placeholder and styles its text without changing the
    logical editor value. The cursor marker is offset by `promptPrefixWidth`.
- `handleMouse` (line ~688): `targetColumn = event.x - paddingX - promptOffset`, where
  `promptOffset` is `promptPrefixWidth` when `event.y === 1 && scrollOffset === 0`.

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
  });
  ```
  The block fill uses the dedicated `inputBg` theme token (`#3c3c3c` in the dark theme).
  `inputBg` is optional for custom themes and falls back to `selectedBg`.

### Selector menus

The model picker and settings menu use the same gray surface through the shared TUI
`Box` component. The box adds horizontal and vertical padding, fills every rendered row,
and preserves the selector's mouse coordinates.

- Model rows keep the existing visible count and align the model name on the left with
  status markers, followed by the provider in a muted right-hand column. The model
  description is not rendered.
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
