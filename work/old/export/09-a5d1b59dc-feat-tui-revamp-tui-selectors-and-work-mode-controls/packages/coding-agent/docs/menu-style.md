# Menu style

How the interactive selector menus (`/model`, `/effort`, `/resume`, …) are built. Follow this when
adding a menu or migrating one of the remaining legacy selectors, so the prompts keep looking like one
system instead of drifting apart.

## The gray box belongs to the host

A menu component never draws its own container. It returns plain content, and
`InteractiveMode.showSelector` wraps it in a `Box` when the factory asks for it:

```ts
private showSelector(create: (done: () => void) => {
    component: Component;
    focus: Component;
    dispose?: () => void;
    boxed?: boolean;
    /** Key hint rendered below the boxed surface, on the terminal background. */
    hint?: string;
}): void
```

```ts
if (created.boxed) {
    const box = new Box(2, 1, (text) => theme.bg("inputBg", text));
    box.addChild(created.component);
    this.editorContainer.addChild(box);
}
```

`Box(2, 1, …)` is padding only — two columns and one row. The surface is a **background fill, never a
border**: no `─` rules, no box-drawing characters, no `DynamicBorder`. The gray is the `inputBg` token,
the same one the main input box uses, so a menu reads as a temporary occupant of the editor slot.

A menu component that also has a non-interactive host (as `SessionSelectorComponent` does for the
`--resume` startup picker in `src/cli/session-picker.ts`) should not box itself. Apply the same `Box`
at that call site instead, so there is still exactly one box per menu and one place that defines it.

## Layout skeleton

Mirror this and don't hand-roll spacing:

```ts
this.addChild(new Spacer(1));
this.addChild(new Text(theme.bold("Select Model and Effort"), 0, 0));
this.addChild(new Spacer(1));

// optional scope / hint lines

this.addChild(this.list);
this.addChild(new Spacer(1));
```

The title is always `theme.bold`. Blank lines come from `Spacer(1)`, so the padding stays even when the
content above or below it changes height.

## The chevron

The selection marker is the ASCII `> ` — a `>` plus one space, two cells wide:

```
> 1. Default                12 3h
  2. Read-only               8 1d
```

- **ASCII `>`, not `›`** (U+203A) and not `❯`. `›` is the legacy marker; menus on the old style still
  use it and are being migrated away from it.
- The marker is `accent`-colored. Unselected rows emit two spaces so the text columns stay aligned —
  never a single space, and never nothing.
- Position is column 0 of the row. `Box` then contributes its own two columns of left padding, so the
  chevron lands at screen column 2.
- For `SelectList`-based menus set it declaratively with `SelectListLayoutOptions.selectedItemMarker`.
  Hand-rolled rows use `isSelected ? theme.fg("accent", "> ") : "  "`.

The chevron must be the only `>` on screen. `Input` defaults its prompt to `"> "`, so any text field a
menu renders — a filter box, a rename field — needs an explicit blank prompt or the empty field reads as
a phantom selection:

```ts
new Input({ prompt: "  ", placeholder: "Search sessions" });
```

Two spaces, not one, so the typed value lands in the same column as the row text beside the marker.

## Selection has no background

The accent chevron plus accent row text is the entire selection cue. `selectedBg` must not appear in a
menu — that full-width bar is the legacy treatment.

```ts
const marker = isSelected ? theme.fg("accent", "> ") : "  ";
const label = theme.fg(isSelected ? "accent" : "text", `${i + 1}. ${item.id}`);
const detail = theme.fg(isSelected ? "accent" : "muted", description);
```

Pick the color per piece from `isSelected` rather than composing a styled line and re-wrapping it.
Re-wrapping nests ANSI, and the inner reset sequences bleed through the outer color.

Unselected rows stay quiet: plain `text` for the primary column, `muted` for secondary columns. With
`SelectList` this means overriding the theme to `primaryText: (text) => text`, because
`getSelectListTheme()` defaults to bold.

Semantic tints are still allowed on *unselected* rows — a named session may render in `warning`, the
active one in `accent` — but the selected row takes the accent regardless, so the chevron stays the
single reliable cue.

## The hint line

One dim line below the box, on the terminal background, indented two spaces. Pass it as `hint`:

```ts
return {
    component: selector,
    focus: selector,
    boxed: true,
    hint: `Press ${keyDisplayText("tui.select.confirm")} to confirm or ${keyDisplayText("tui.select.cancel")} to go back`,
};
```

`hint` is a static string resolved at mount, so anything that changes with state (a delete-confirm
prompt, a progress or error message) has to live inside the box instead. That is fine — see
`session-selector.ts`, which keeps its dynamic header lines in the box and adds the static hint below.

## Tokens

| Token | Role |
| --- | --- |
| `inputBg` | the box surface; falls back to `selectedBg` for themes that don't define it |
| `accent` | the chevron and the selected row's text |
| `text` | primary text on unselected rows |
| `muted` | secondary columns, unselected descriptions |
| `dim` | the hint line below the box, and key hints |

## Reference implementations

- [`components/model-selector.ts`](../src/modes/interactive/components/model-selector.ts) — hand-rolled
  rows with a fixed-width right-hand description column.
- [`components/thinking-selector.ts`](../src/modes/interactive/components/thinking-selector.ts) —
  `SelectList` with `selectedItemMarker`.

Test coverage for the rule lives in
[`test/session-selector-style.test.ts`](../test/session-selector-style.test.ts) and
[`test/model-selector.test.ts`](../test/model-selector.test.ts) — the latter asserts the accent chevron
is present and the `selectedBg` escape is absent. Reuse that assertion shape for a new menu.

## Still on the legacy style

These menus have not been migrated and are why the two styles currently coexist:

`trust-selector.ts`, `oauth-selector.ts`, `tree-selector.ts`, `user-message-selector.ts`,
`config-selector.ts`, `theme-selector.ts`, `question-picker.ts`, `scoped-models-selector.ts`.

When migrating one, remove its `DynamicBorder` rules, move the box to the host, and convert the
`›` marker to `> `.
