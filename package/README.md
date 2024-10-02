# tiptap-footnotes

A footnotes extension for Tiptap

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)][demo]

[demo]: https://stackblitz.com/github/buttondown/tiptap-footnotes/tree/main/examples/react?file=src%2FApp.tsx&title=tiptap-footnotes%20demo

## Getting Started

### Installation

```shell
npm install tiptap-footnotes
```

This extension requires the `@tiptap/extension-list-item`, `@tiptap/extension-ordered-list`, and the `@tiptap/pm` extensions, so you need to install them as well:

```shell
npm install @tiptap/extension-list-item @tiptap/extension-ordered-list @tiptap/pm
```

### Usage

This package is separated into 3 main extensions:

- `Footnotes`: The footnotes ordered list extension
- `Footnote`: The footnote list item extension
- `FootnoteReference`: the footnote reference extension

Typically, the footnotes should be placed at the bottom of the document, so you should adjust the topNode node (i.e. Document) to have the footnotes placed at the end (as shown below):

```typescript
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Footnotes, FootnoteReference, Footnote } from "tiptap-footnotes";
import Document from "@tiptap/extension-document";

const Editor = () => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        document: false,
      }),
      Document.extend({
        content: "block+ footnotes?",
      }),
      Footnotes,
      Footnote,
      FootnoteReference,
    ],
    content: "Hello world",
  });

  return <EditorContent editor={editor} />;
};

export default Editor;
```

If you want the footnotes to look like the example, you can add this CSS to your app:

```css
ol.footnotes {
  margin-top: 20px;
  padding: 20px 0;
  list-style-type: decimal;
  padding-left: 20px;
}

ol.footnotes:has(li) {
  border-top: 1px solid black;
}
```
