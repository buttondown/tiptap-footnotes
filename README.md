# tiptap-footnotes
A footnotes extension for Tiptap
### Demo
See it in action [here](https://codesandbox.io/p/devbox/tiptap-footnotes-example-7n53s4).
## Getting Started
### Installation
```shell
$ npm install tiptap-footnotes
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
        content: "block+ footnotes",
      }),
      Footnotes,
      Footnote,
      FootnoteReference,
    ],
    content: "Hello world",
  });


  return (
      <>
        <EditorContent editor={editor} />
      </>
  );
};

export default Editor;
```
