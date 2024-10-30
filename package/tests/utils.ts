import { Editor } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Footnote, Footnotes, FootnoteReference } from "../src/index";

export type GatheredFootnotes = {
  refs: Node[];
  footnotes: Node[];
};
export function gatherFootnotes(editor: Editor) {
  const footnotes: GatheredFootnotes = { refs: [], footnotes: [] };

  editor.state.doc.descendants((node) => {
    if (node.type.name == "footnoteReference") {
      footnotes.refs.push(node);
    } else if (node.type.name == "footnote") {
      footnotes.footnotes.push(node);
    }
  });
  return footnotes;
}

const createEditorEl = () => {
  const editorEl = document.createElement("div");

  editorEl.classList.add("tiptap");
  document.body.appendChild(editorEl);

  return editorEl;
};
export function newEditor() {
  return new Editor({
    element: createEditorEl(),
    extensions: [
      Document.extend({
        content: "block+ footnotes?",
      }),
      Text,
      Paragraph,
      Footnotes,
      Footnote,
      FootnoteReference,
    ],
  });
}
