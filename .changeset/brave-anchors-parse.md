---
"tiptap-footnotes": patch
---

Fix footnote reference content when parsing HTML.

The content is now taken from the `a.footnote-ref` anchor instead of the `<sup>`'s first child, which could be a whitespace text node.
