---
"tiptap-footnotes": patch
---

Rewrite footnote syncing to fix footnotes going out of sync or losing their content.

- Dragging a reference keeps its footnote, and a copy-pasted one gets a copy of it
- Changes in later steps of a transaction are no longer missed
- Initial content is synced when the editor is mounted
- Footnotes are updated in place, so a cursor inside one no longer jumps when references change
