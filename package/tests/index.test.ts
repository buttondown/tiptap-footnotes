import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { expect, test } from "vitest";

import { Footnote, FootnoteReference, Footnotes } from "../src";
import { GatheredFootnotes, gatherFootnotes, newEditor } from "./utils";

function testMatchingFootnotes(footnotes: GatheredFootnotes) {
  expect(footnotes.refs.length).toEqual(footnotes.footnotes.length);

  for (let i = 0; i < footnotes.refs.length; i++) {
    const ref = footnotes.refs[i];
    const footnote = footnotes.footnotes[i];
    let refNumber = String(i + 1);

    expect(ref.attrs!["data-id"]).toEqual(footnote.attrs!["data-id"]);
    expect(ref.attrs!["referenceNumber"]).toEqual(refNumber);
    expect(footnote.attrs!["id"]).toEqual(`fn:${refNumber}`);
  }
}

test("basic footnote reference insertion", () => {
  const editor = newEditor();
  editor.commands.addFootnote();
  const footnotes = gatherFootnotes(editor);
  testMatchingFootnotes(footnotes);
});

test("footnote insertion between two refs ", () => {
  const editor = newEditor();
  editor.commands.addFootnote();
  editor.commands.insertContent("-----------");
  editor.commands.addFootnote();

  // add footnote betwween refs 1 & 2
  editor.commands.setTextSelection(10);
  editor.commands.addFootnote();

  const footnotes = gatherFootnotes(editor);

  testMatchingFootnotes(footnotes);
});

test("footnote insertion between two refs (with chained command)", () => {
  const editor = newEditor();
  editor.commands.addFootnote();
  editor.commands.insertContent("-----------");
  editor.commands.addFootnote();

  // add footnote betwween refs 1 & 2
  editor.commands.setTextSelection(10);

  editor.chain().deleteRange({ from: 2, to: 5 }).addFootnote().run();

  const footnotes = gatherFootnotes(editor);

  testMatchingFootnotes(footnotes);
});

test("test footnote reference deletion", () => {
  const editor = newEditor();
  editor.commands.addFootnote();
  editor.commands.addFootnote();
  editor.commands.addFootnote();

  const prevFootnotes = gatherFootnotes(editor);

  // delete the first footnote ref
  editor.commands.deleteRange({ from: 1, to: 3 });

  const footnotes = gatherFootnotes(editor);

  expect(footnotes.refs.length).toEqual(2);

  expect(footnotes.refs[0].attrs["data-id"]).toEqual(
    prevFootnotes.refs[1].attrs["data-id"]
  );
  expect(footnotes.refs[1].attrs["data-id"]).toEqual(
    prevFootnotes.refs[2].attrs["data-id"]
  );

  testMatchingFootnotes(footnotes);
});

test("test footnote content options", () => {
  {
    const editor = new Editor({
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

    const spec = editor.state.schema.nodes.footnote.spec;
    expect(spec.content).toBe("paragraph+");
  }

  {
    const editor = new Editor({
      extensions: [
        Document.extend({
          content: "block+ footnotes?",
        }),
        Text,
        Paragraph,
        Footnotes,
        Footnote.configure({
          content: "paragraph block*",
        }),
        FootnoteReference,
      ],
    });

    const spec = editor.state.schema.nodes.footnote.spec;
    expect(spec.content).toBe("paragraph block*");
  }
});
