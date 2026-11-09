import { Editor, Extension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import { BulletList, ListItem } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { history, undo } from "@tiptap/pm/history";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { expect, test } from "vitest";

import { Footnote, FootnoteReference, Footnotes } from "../lib";
import "./matchers";
import { gatherFootnotes, newEditor } from "./utils";

test("basic footnote reference insertion", () => {
  const editor = newEditor();
  editor.commands.addFootnote();
  const footnotes = gatherFootnotes(editor);
  expect(footnotes).toHaveMatchingFootnotes();
});

test("footnote insertion between two refs", () => {
  const editor = newEditor();
  editor.commands.addFootnote();
  editor.commands.insertContent("-----------");
  editor.commands.addFootnote();

  // add footnote betwween refs 1 & 2
  editor.commands.setTextSelection(10);
  editor.commands.addFootnote();

  const footnotes = gatherFootnotes(editor);

  expect(footnotes).toHaveMatchingFootnotes();
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

  expect(footnotes).toHaveMatchingFootnotes();
});

test("footnote reference deletion", () => {
  const editor = newEditor();
  editor.commands.addFootnote();
  editor.commands.addFootnote();
  editor.commands.addFootnote();

  const prevFootnotes = gatherFootnotes(editor);

  // delete the first footnote ref
  editor.commands.deleteRange({ from: 1, to: 2 });

  const footnotes = gatherFootnotes(editor);

  expect(footnotes.refs.length).toEqual(2);

  expect(footnotes.refs[0].attrs["data-id"]).toEqual(prevFootnotes.refs[1].attrs["data-id"]);
  expect(footnotes.refs[1].attrs["data-id"]).toEqual(prevFootnotes.refs[2].attrs["data-id"]);

  expect(footnotes).toHaveMatchingFootnotes();
});

test("parses footnotes without an id attribute", () => {
  const editor = newEditor();
  editor.commands.setContent(
    '<p>x<sup><a class="footnote-ref" data-id="abc">1</a></sup></p>' +
      '<ol class="footnotes"><li data-id="abc"><p>note</p></li></ol>',
  );

  const footnotes = gatherFootnotes(editor);
  expect(footnotes.footnotes.length).toEqual(1);
  expect(footnotes.footnotes[0].textContent).toEqual("note");
  expect(footnotes).toHaveMatchingFootnotes();
});

test("does not parse list items outside the footnotes list as footnotes", () => {
  const editor = new Editor({
    extensions: [
      Document.extend({
        content: "block+ footnotes?",
      }),
      Text,
      Paragraph,
      BulletList,
      ListItem,
      Footnotes,
      Footnote,
      FootnoteReference,
    ],
    content: '<ul><li data-id="x"><p>bullet</p></li><li data-id="y" id="z"><p>other</p></li></ul>',
  });

  const json = editor.getJSON();
  expect(json.content).toHaveLength(1);
  expect(json.content?.[0].type).toEqual("bulletList");
  expect(json.content?.[0].content?.map((item) => item.type)).toEqual(["listItem", "listItem"]);
});

test("existing HTML round-trips unchanged", () => {
  const html =
    '<p>a<sup id="fnref:1"><a class="footnote-ref" data-id="one" href="#fn:1" data-reference-number="1">1</a></sup>' +
    'b<sup id="fnref:2"><a class="footnote-ref" data-id="two" href="#fn:2" data-reference-number="2">2</a></sup></p>' +
    '<ol class="footnotes"><li id="fn:1" data-id="one"><p>first</p></li>' +
    '<li id="fn:2" data-id="two"><p>second</p></li></ol>';

  const editor = newEditor();
  editor.commands.setContent(html);

  expect(editor.getHTML()).toEqual(html);
});

const twoFootnotesHTML =
  '<p>a<sup><a class="footnote-ref" data-id="one">1</a></sup>' +
  'b<sup><a class="footnote-ref" data-id="two">2</a></sup></p>' +
  '<ol class="footnotes"><li data-id="one"><p>first</p></li>' +
  '<li data-id="two"><p>second</p></li></ol>';

const footnoteSummary = (editor: Editor) => {
  const { refs, footnotes } = gatherFootnotes(editor);
  return {
    refs: refs.map((ref) => ref.attrs["data-id"]),
    footnotes: footnotes.map((footnote) => [footnote.attrs["data-id"], footnote.textContent]),
  };
};

const findNode = (editor: Editor, name: string, id: string) => {
  let found: { node: PMNode; pos: number } | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === name && node.attrs["data-id"] === id) found = { node, pos };
  });
  if (!found) throw new Error(`no ${name} with id ${id}`);
  return found;
};

// jsdom has no ClipboardEvent, which `pasteHTML` creates by default
const paste = (editor: Editor, html: string) =>
  editor.view.pasteHTML(html, Object.assign(new Event("paste"), { clipboardData: null }));

test("syncs reference deletions in later steps of a transaction", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);

  // step 1 shifts positions, step 2 deletes the first reference
  const ref = findNode(editor, "footnoteReference", "one");
  const { tr } = editor.state;
  tr.insertText("shifted", 1);
  const from = tr.mapping.map(ref.pos);
  tr.delete(from, from + ref.node.nodeSize);
  editor.view.dispatch(tr);

  expect(footnoteSummary(editor)).toEqual({ refs: ["two"], footnotes: [["two", "second"]] });
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});

test("syncs footnotes on initial content", () => {
  const editor = new Editor({
    element: document.createElement("div"),
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
    content:
      '<p><sup><a class="footnote-ref" data-id="two" data-reference-number="7">7</a></sup></p>' +
      '<ol class="footnotes"><li data-id="orphan"><p>gone</p></li>' +
      '<li data-id="two" id="fn:7"><p>second</p></li></ol>',
  });

  expect(footnoteSummary(editor)).toEqual({ refs: ["two"], footnotes: [["two", "second"]] });
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});

test("moving a reference keeps its footnote", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);

  // move the first reference to the end of the paragraph, like a drag-and-drop does
  const ref = findNode(editor, "footnoteReference", "one");
  const paragraphEnd = editor.state.doc.firstChild!.nodeSize - 1;
  const { tr } = editor.state;
  tr.delete(ref.pos, ref.pos + ref.node.nodeSize);
  tr.insert(tr.mapping.map(paragraphEnd), ref.node);
  editor.view.dispatch(tr);

  expect(footnoteSummary(editor)).toEqual({
    refs: ["two", "one"],
    footnotes: [
      ["two", "second"],
      ["one", "first"],
    ],
  });
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});

test("pasting a copied reference gives it a new id and copies its footnote", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);

  editor.commands.setTextSelection(1);
  paste(
    editor,
    '<p data-pm-slice="1 1 []"><sup><a class="footnote-ref" data-id="one">1</a></sup></p>',
  );

  const { refs, footnotes } = footnoteSummary(editor);
  expect(refs).toHaveLength(3);
  expect(new Set(refs).size).toEqual(3);
  expect(refs.slice(1)).toEqual(["one", "two"]);
  expect(footnotes.map(([, text]) => text)).toEqual(["first", "first", "second"]);
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});

test("pasting a reference whose id isn't in the document keeps its id", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);

  editor.commands.setTextSelection(1);
  paste(
    editor,
    '<p data-pm-slice="1 1 []"><sup><a class="footnote-ref" data-id="pasted">1</a></sup></p>',
  );

  expect(footnoteSummary(editor).refs).toEqual(["pasted", "one", "two"]);
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});

test("adding a reference doesn't move the cursor inside a footnote", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);

  // inside "second", after "se"
  editor.commands.setTextSelection(findNode(editor, "footnote", "two").pos + 4);

  const { tr } = editor.state;
  tr.insert(1, editor.schema.nodes.footnoteReference.create({ "data-id": "zero" }));
  editor.view.dispatch(tr);

  expect(footnoteSummary(editor).refs).toEqual(["zero", "one", "two"]);
  expect(editor.state.selection.$from.parent.textContent).toEqual("second");
  expect(editor.state.selection.$from.parentOffset).toEqual(2);
});

test("footnote content options", () => {
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

test("references inside footnotes get footnotes after their parent", () => {
  const editor = newEditor();
  editor.commands.setContent(
    '<p>a<sup><a class="footnote-ref" data-id="outer">1</a></sup>' +
      'b<sup><a class="footnote-ref" data-id="last">2</a></sup></p>' +
      '<ol class="footnotes"><li data-id="outer"><p>see<sup><a class="footnote-ref" data-id="inner">3</a></sup></p></li>' +
      '<li data-id="last"><p>last</p></li><li data-id="inner"><p>inner</p></li></ol>',
  );

  expect(footnoteSummary(editor).footnotes.map(([id]) => id)).toEqual(["outer", "last", "inner"]);
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();

  // deleting the outer reference deletes its footnote, and the inner one with it
  const ref = findNode(editor, "footnoteReference", "outer");
  editor.commands.deleteRange({ from: ref.pos, to: ref.pos + ref.node.nodeSize });

  expect(footnoteSummary(editor)).toEqual({ refs: ["last"], footnotes: [["last", "last"]] });
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});

test("selections can't span the body and footnotes", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);
  const first = findNode(editor, "footnote", "one");
  const second = findNode(editor, "footnote", "two");

  // body into a footnote
  editor.commands.setTextSelection({ from: 1, to: first.pos + 3 });
  expect(editor.state.selection.from).toEqual(1);
  expect(editor.state.selection.$to.parent).toBe(editor.state.doc.firstChild);

  // across two footnotes
  editor.commands.setTextSelection({ from: first.pos + 3, to: second.pos + 3 });
  expect(editor.state.selection.from).toEqual(first.pos + 3);
  expect(editor.state.selection.$to.node(2)).toBe(first.node);

  // within a footnote
  editor.commands.setTextSelection({ from: second.pos + 2, to: second.pos + 5 });
  expect(editor.state.selection.from).toEqual(second.pos + 2);
  expect(editor.state.selection.to).toEqual(second.pos + 5);

  // selecting everything is still allowed
  editor.commands.selectAll();
  expect(editor.state.selection.from).toEqual(0);
  expect(editor.state.selection.to).toEqual(editor.state.doc.content.size);
});

test("selections made with the mouse can't span the body and footnotes", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);
  const first = findNode(editor, "footnote", "one");
  const { doc } = editor.state;

  const selection = editor.view.someProp("createSelectionBetween", (f) =>
    f(editor.view, doc.resolve(first.pos + 3), doc.resolve(1)),
  );
  expect(selection?.anchor).toEqual(first.pos + 3);
  expect(selection?.$head.node(2)).toBe(first.node);
});

test("document changes aren't blocked by a selection spanning the body and footnotes", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);
  const first = findNode(editor, "footnote", "one");

  const { tr } = editor.state;
  tr.insertText("x", 1);
  tr.setSelection(TextSelection.create(tr.doc, 1, first.pos + 4));
  editor.view.dispatch(tr);

  expect(editor.state.doc.firstChild?.textContent.startsWith("x")).toBe(true);
});

test("references are leaf nodes", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);

  const { refs } = gatherFootnotes(editor);
  expect(refs.map((ref) => ref.nodeSize)).toEqual([1, 1]);
  expect(editor.getText()).toMatch(/^a\[1\]b\[2\]\n/);
});

test("pasting a reference at the edge of the pasted HTML keeps it", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);

  editor.commands.setTextSelection(1);
  paste(editor, '<sup><a class="footnote-ref" data-id="pasted">1</a></sup>');

  expect(footnoteSummary(editor).refs).toEqual(["pasted", "one", "two"]);
});

test("loads JSON saved by previous versions", () => {
  const editor = newEditor();
  editor.commands.setContent({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "a" },
          {
            type: "footnoteReference",
            attrs: { class: "footnote-ref", "data-id": "one", referenceNumber: "1", href: null },
            content: [{ type: "text", text: "1" }],
          },
        ],
      },
      {
        type: "footnotes",
        attrs: { class: "footnotes" },
        content: [
          {
            type: "footnote",
            attrs: { id: "fn:1", "data-id": "one" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }],
          },
        ],
      },
    ],
  });

  expect(editor.getHTML()).toEqual(
    '<p>a<sup id="fnref:1"><a class="footnote-ref" data-id="one" href="#fn:1" data-reference-number="1">1</a></sup></p>' +
      '<ol class="footnotes"><li id="fn:1" data-id="one"><p>first</p></li></ol>',
  );
  expect(gatherFootnotes(editor).refs[0].nodeSize).toEqual(1);
});

test("footnotes don't inherit list behaviour", () => {
  const editor = newEditor();
  const extensionNames = editor.extensionManager.extensions.map((extension) => extension.name);
  expect(extensionNames).not.toContain("footnoteBranchingDeleteKeymap");
});

const multiParagraphHTML =
  '<p>a<sup><a class="footnote-ref" data-id="one">1</a></sup>' +
  'b<sup><a class="footnote-ref" data-id="two">2</a></sup></p>' +
  '<ol class="footnotes"><li data-id="one"><p>first</p><p>more</p></li>' +
  '<li data-id="two"><p>second</p><p>last</p></li></ol>';

const pressKey = (editor: Editor, key: string, init: KeyboardEventInit = {}) =>
  editor.view.someProp("handleKeyDown", (f) =>
    f(editor.view, new KeyboardEvent("keydown", { key, ...init })),
  );

const cursorText = (editor: Editor) => {
  const { $from } = editor.state.selection;
  return $from.parent.textContent.slice(0, $from.parentOffset);
};

test("addFootnote replaces the selection", () => {
  const editor = newEditor();
  editor.commands.setContent("<p>abc</p>");
  editor.commands.setTextSelection({ from: 2, to: 3 });
  editor.commands.addFootnote();

  expect(editor.state.doc.firstChild?.textContent).toEqual("ac");
  expect(gatherFootnotes(editor).refs).toHaveLength(1);
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});

test("focusFootnote moves the cursor to the end of a footnote", () => {
  const editor = newEditor();
  editor.commands.setContent(multiParagraphHTML);
  editor.commands.setTextSelection(1);

  expect(editor.can().focusFootnote("one")).toBe(true);
  expect(editor.state.selection.from).toEqual(1);

  expect(editor.commands.focusFootnote("one")).toBe(true);
  expect(editor.state.selection.empty).toBe(true);
  expect(cursorText(editor)).toEqual("more");

  expect(editor.commands.focusFootnote("missing")).toBe(false);
});

test("Mod-a selects a footnote's content", () => {
  const editor = newEditor();
  editor.commands.setContent(multiParagraphHTML);
  editor.commands.setTextSelection(findNode(editor, "footnote", "one").pos + 3);

  pressKey(editor, "a", { ctrlKey: true });

  const { from, to } = editor.state.selection;
  expect(editor.state.doc.textBetween(from, to, "|")).toEqual("first|more");
});

test("Tab and Shift-Tab move between footnotes", () => {
  const editor = newEditor();
  editor.commands.setContent(multiParagraphHTML);

  // from the end of the body to the first footnote
  editor.commands.setTextSelection(2);
  expect(pressKey(editor, "Tab")).toBe(true);
  expect(editor.state.selection.$from.node(2).attrs["data-id"]).toEqual("one");
  expect(cursorText(editor)).toEqual("more");

  // from the first paragraph of a footnote to the next footnote
  editor.commands.setTextSelection(findNode(editor, "footnote", "one").pos + 3);
  expect(pressKey(editor, "Tab")).toBe(true);
  expect(editor.state.selection.$from.node(2).attrs["data-id"]).toEqual("two");
  expect(cursorText(editor)).toEqual("last");

  // no footnote after the last one
  expect(pressKey(editor, "Tab")).toBeFalsy();

  expect(pressKey(editor, "Tab", { shiftKey: true })).toBe(true);
  expect(editor.state.selection.$from.node(2).attrs["data-id"]).toEqual("one");
  expect(cursorText(editor)).toEqual("more");

  expect(pressKey(editor, "Tab", { shiftKey: true })).toBeFalsy();
});

test("cutting and pasting a reference keeps its footnote", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);

  const ref = findNode(editor, "footnoteReference", "one");
  const slice = editor.state.doc.slice(ref.pos, ref.pos + 1);
  const { dom } = editor.view.serializeForClipboard(slice);
  editor.commands.deleteRange({ from: ref.pos, to: ref.pos + 1 });
  expect(footnoteSummary(editor).footnotes).toEqual([["two", "second"]]);

  editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize - 1);
  paste(editor, dom.innerHTML);

  expect(footnoteSummary(editor)).toEqual({
    refs: ["two", "one"],
    footnotes: [
      ["two", "second"],
      ["one", "first"],
    ],
  });
});

test("footnotes without a data-id load as orphans", () => {
  const editor = newEditor();
  editor.commands.setContent({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "body" }] },
      {
        type: "footnotes",
        content: [
          {
            type: "footnote",
            content: [{ type: "paragraph", content: [{ type: "text", text: "orphan" }] }],
          },
        ],
      },
    ],
  });

  expect(editor.getHTML()).toEqual("<p>body</p>");
});

test("throws when an extension is missing", () => {
  expect(
    () =>
      new Editor({
        extensions: [
          Document.extend({ content: "block+ footnotes?" }),
          Text,
          Paragraph,
          Footnotes,
          Footnote,
        ],
      }),
  ).toThrow(/FootnoteReference/);
});

test("references sharing an id share a footnote", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);

  const { tr } = editor.state;
  tr.insert(1, editor.schema.nodes.footnoteReference.create({ "data-id": "two" }));
  editor.view.dispatch(tr);

  const { refs, footnotes } = gatherFootnotes(editor);
  expect(refs.map((ref) => [ref.attrs["data-id"], ref.attrs.referenceNumber])).toEqual([
    ["two", "1"],
    ["one", "2"],
    ["two", "1"],
  ]);
  expect(footnotes.map((footnote) => [footnote.attrs["data-id"], footnote.attrs.id])).toEqual([
    ["two", "fn:1"],
    ["one", "fn:2"],
  ]);

  // the footnote stays until its last reference is gone
  editor.commands.deleteRange({ from: 1, to: 2 });
  expect(footnoteSummary(editor).footnotes).toEqual([
    ["one", "first"],
    ["two", "second"],
  ]);
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});

const nestedHTML =
  '<p>a<sup><a class="footnote-ref" data-id="outer">1</a></sup>' +
  'b<sup><a class="footnote-ref" data-id="last">2</a></sup></p>' +
  '<ol class="footnotes"><li data-id="outer"><p>see<sup><a class="footnote-ref" data-id="inner">3</a></sup></p></li>' +
  '<li data-id="last"><p>last</p></li><li data-id="inner"><p>inner</p></li></ol>';

test("cutting and pasting a reference keeps the footnotes inside its footnote", () => {
  const editor = newEditor();
  editor.commands.setContent(nestedHTML);

  const ref = findNode(editor, "footnoteReference", "outer");
  const { dom } = editor.view.serializeForClipboard(editor.state.doc.slice(ref.pos, ref.pos + 1));
  editor.commands.deleteRange({ from: ref.pos, to: ref.pos + 1 });
  expect(footnoteSummary(editor).footnotes).toEqual([["last", "last"]]);

  editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize - 1);
  paste(editor, dom.innerHTML);

  expect(footnoteSummary(editor).footnotes).toEqual([
    ["last", "last"],
    ["outer", "see"],
    ["inner", "inner"],
  ]);
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});

test("dragging a reference keeps its id, and dropping a copy of it doesn't", () => {
  const editor = newEditor();
  editor.commands.setContent(twoFootnotesHTML);
  const ref = findNode(editor, "footnoteReference", "one");
  const slice = editor.state.doc.slice(ref.pos, ref.pos + 1);
  const transform = () =>
    editor.view.someProp("transformPasted", (f) => f(slice, editor.view, false))!;

  editor.view.dragging = { slice, move: true };
  expect(transform().content.firstChild?.attrs["data-id"]).toEqual("one");

  editor.view.dragging = { slice, move: false };
  const copy = transform().content.firstChild!;
  expect(copy.attrs["data-id"]).not.toEqual("one");
  editor.view.dragging = null;

  editor.view.dispatch(editor.state.tr.insert(1, copy));
  expect(footnoteSummary(editor).footnotes.map(([, text]) => text)).toEqual([
    "first",
    "first",
    "second",
  ]);
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});

test("syncing a synced document does nothing", () => {
  const editor = newEditor();
  editor.commands.setContent(nestedHTML);
  editor.commands.addFootnote();

  const before = editor.state.doc;
  editor.view.dispatch(editor.state.tr.insertText("x", 1));
  let appended = 0;
  editor.on("transaction", ({ appendedTransactions }) => (appended += appendedTransactions.length));
  editor.view.dispatch(editor.state.tr.delete(1, 2));

  expect(appended).toEqual(0);
  expect(editor.state.doc.eq(before)).toBe(true);
});

test("undo restores a deleted reference and its footnote together", () => {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      Document.extend({ content: "block+ footnotes?" }),
      Text,
      Paragraph,
      Extension.create({ name: "history", addProseMirrorPlugins: () => [history()] }),
      Footnotes,
      Footnote,
      FootnoteReference,
    ],
    content: twoFootnotesHTML,
  });
  const synced = editor.state.doc;

  const ref = findNode(editor, "footnoteReference", "one");
  editor.commands.deleteRange({ from: ref.pos, to: ref.pos + 1 });
  expect(footnoteSummary(editor).footnotes).toEqual([["two", "second"]]);

  undo(editor.state, editor.view.dispatch);
  expect(editor.state.doc.eq(synced)).toBe(true);
});

test("moving the first reference to the end moves its footnote", () => {
  const ids = ["a", "b", "c", "d"];
  const editor = newEditor();
  editor.commands.setContent(
    "<p>" +
      ids.map((id) => `<sup><a class="footnote-ref" data-id="${id}">x</a></sup>`).join("") +
      '</p><ol class="footnotes">' +
      ids.map((id) => `<li data-id="${id}"><p>${id}</p></li>`).join("") +
      "</ol>",
  );

  const ref = findNode(editor, "footnoteReference", "a");
  const { tr } = editor.state;
  tr.delete(ref.pos, ref.pos + 1);
  tr.insert(tr.mapping.map(editor.state.doc.firstChild!.nodeSize - 1), ref.node);
  const { state } = editor.state.applyTransaction(tr);

  expect(state.doc.lastChild?.content.content.map((f) => f.attrs["data-id"])).toEqual([
    "b",
    "c",
    "d",
    "a",
  ]);
});

test("typing [^label] adds a footnote", () => {
  const editor = newEditor();
  editor.commands.setContent("<p>text[^note</p>");
  const end = editor.state.doc.firstChild!.nodeSize - 1;
  editor.commands.setTextSelection(end);

  editor.view.someProp("handleTextInput", (f) =>
    f(editor.view, end, end, "]", () => editor.state.tr),
  );

  expect(editor.state.doc.firstChild?.textContent).toEqual("text");
  expect(gatherFootnotes(editor).refs).toHaveLength(1);
  expect(gatherFootnotes(editor)).toHaveMatchingFootnotes();
});
