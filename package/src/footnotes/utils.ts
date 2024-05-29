import { EditorState, Transaction } from "@tiptap/pm/state";
import { Node } from "@tiptap/pm/model";

import { v4 as uuid } from "uuid";

function createFootnoteRefNode(state: EditorState, refNum: number) {
  const type = state.schema.nodes.footnoteReference;

  return type.create({
    referenceNumber: `${refNum}`,
    "data-id": uuid(),
  });
}

// this function updates the reference number of all the footnote references in the document & if insertNewRef is set to true, it inserts a new referenece at the current cursor position
export function updateFootnoteReferences(
  tr: Transaction,
  state: EditorState,
  insertNewRef = false,
) {
  let count = 1;
  let newNodeInserted = false;
  const insertPos = state.selection.anchor;

  const nodes: any[] = [];

  tr.doc.descendants((node, pos) => {
    if (node.type.name == "footnoteReference") {
      if (insertNewRef && !newNodeInserted && pos >= insertPos) {
        const newFootnote = createFootnoteRefNode(state, count);
        tr.insert(tr.mapping.map(insertPos), newFootnote);

        count += 1;
        newNodeInserted = true;
        nodes.push(newFootnote);
      }
      tr.setNodeAttribute(tr.mapping.map(pos), "referenceNumber", `${count}`);

      nodes.push(node);
      count += 1;
    }
  });
  if (insertNewRef && !newNodeInserted) {
    const newFootnote = createFootnoteRefNode(state, count);
    tr.insert(tr.mapping.map(insertPos), newFootnote);
    nodes.push(newFootnote);
  }

  // return the updated footnote references
  return nodes;
}

export function getFootnotes(tr: Transaction) {
  let footnotesRange: { from: number; to: number } | undefined;
  const footnotes: Node[] = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name == "footnote") {
      footnotes.push(node);
    } else if (node.type.name == "footnotes") {
      footnotesRange = { from: pos, to: pos + node.nodeSize };
    } else {
      return false;
    }
  });
  return { footnotesRange, footnotes };
}
