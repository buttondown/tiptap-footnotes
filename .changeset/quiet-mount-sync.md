---
"tiptap-footnotes": patch
---

Don't emit `update` when syncing the initial content on mount.

The sync runs inside the `Editor` constructor, so an `onUpdate` handler that used the editor ran
before it was assigned. It also made just opening a document look like an edit.
