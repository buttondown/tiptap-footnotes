# tiptap-footnotes

## 4.0.1

### Patch Changes

- 842f931: Don't emit `update` when syncing the initial content on mount.

  The sync runs inside the `Editor` constructor, so an `onUpdate` handler that used the editor ran
  before it was assigned. It also made just opening a document look like an edit.

## 4.0.0

### Major Changes

- 5e28307: Throw when `Footnotes`, `Footnote` or `FootnoteReference` is missing, instead of silently
  not syncing footnotes.
- 827c6d7: `Footnotes` and `Footnote` no longer extend Tiptap's list extensions.

  `@tiptap/extension-list-item` and `@tiptap/extension-ordered-list` are no longer required peer
  dependencies.

  Footnote references are now leaf nodes, and their `class` and `href` attributes have been removed.

- af4cb31: CommonJS build has been dropped, this package is now ESM-only.
- b4b3307: Rewrite footnote syncing to fix footnotes going out of sync or losing their content.

  - Dragging a reference keeps its footnote, and a copy-pasted one gets a new id and a copy of it
  - References sharing a `data-id` share a footnote and a number
  - Changes in later steps of a transaction are no longer missed
  - Initial content is synced when the editor is mounted
  - Only the footnotes that change are replaced, so a cursor inside another one no longer jumps when
    references are added or removed

### Patch Changes

- 1e31445: Keep selections within the body or a single footnote by adjusting them, instead of
  rejecting transactions.
- bec0f7c: Keep a footnote's content when cutting and pasting its reference.
- 4689640: Stop a footnote without a `data-id` from emptying the whole document when loading JSON.
- 329abcf: Only parse list items inside `ol.footnotes` as footnotes, and no longer require their
  `id` attribute.
- bec0f7c: Only match the `[^label]` input rule at the cursor, and make it undoable.
- bec0f7c: Stop `focusFootnote` from scrolling when used with `can()`.
- bec0f7c: Make `addFootnote` replace the selection instead of inserting before it.
- bec0f7c: Fix `focusFootnote`, Tab, Shift-Tab and Mod-a in footnotes with more than one paragraph.
