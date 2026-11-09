import { Extension } from "@tiptap/core";
import type { Fragment } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

import {
  clampSelection,
  collectFootnoteContent,
  getTypes,
  renameCopiedRefs,
  syncFootnotes,
} from "./utils";

const FootnoteRules = Extension.create({
  name: "footnoteRules",
  priority: 1000,
  addProseMirrorPlugins() {
    // footnote content for the references last copied, cut or pasted in this editor, used for
    // footnotes that don't exist when their reference shows up
    let copied = new Map<string, Fragment>();

    return [
      new Plugin({
        key: new PluginKey("footnoteRules"),
        props: {
          // keep selections made with the mouse or keyboard within the body or a single footnote
          createSelectionBetween(_view, $anchor, $head) {
            return clampSelection($anchor, $head);
          },

          // also called when a drag starts
          transformCopied(slice, view) {
            copied = collectFootnoteContent(view.state.doc, slice.content);
            return slice;
          },

          // pasting or dropping a reference that's still in the document makes a copy of its
          // footnote, unless it's being dragged to somewhere else
          transformPasted(slice, view) {
            if (view.dragging?.move) return slice;
            return renameCopiedRefs(view.state.doc, slice, copied);
          },
        },

        appendTransaction(transactions, _oldState, newState) {
          // keep the footnotes list in sync with the references after every document change. this
          // isn't called again for the transaction it returns, so that has to sync everything.
          const tr = transactions.some((t) => t.docChanged)
            ? syncFootnotes(newState, copied)
            : null;

          // and keep any other selections within the body or a single footnote too
          const { selection } = tr ?? newState;
          if (!(selection instanceof TextSelection)) return tr;

          const clamped = clampSelection(selection.$anchor, selection.$head);
          return clamped ? (tr ?? newState.tr).setSelection(clamped) : tr;
        },
      }),
    ];
  },

  // the initial content doesn't go through appendTransaction, so sync it once the editor is mounted.
  // `create` would also work, but it's emitted a tick later. this isn't undoable, as there's nothing
  // before it to undo to.
  onBeforeCreate() {
    // fail early when an extension is missing, rather than silently not syncing
    getTypes(this.editor.schema);

    this.editor.on("mount", ({ editor }) => {
      const tr = syncFootnotes(editor.state);
      if (tr) editor.view.dispatch(tr.setMeta("addToHistory", false));
    });
  },
});
export default FootnoteRules;
