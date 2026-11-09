---
"tiptap-footnotes": major
---

Rewrite footnote syncing to fix footnotes going out of sync or losing their content.

- Dragging a reference keeps its footnote, and a copy-pasted one gets a new id and a copy of it
- References sharing a `data-id` share a footnote and a number
- Changes in later steps of a transaction are no longer missed
- Initial content is synced when the editor is mounted
- Only the footnotes that change are replaced, so a cursor inside another one no longer jumps when
  references are added or removed
