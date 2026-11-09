import { combineTransactionSteps, Extension, getChangedRanges } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { syncFootnotes } from "./utils";

const FootnoteRules = Extension.create({
  name: "footnoteRules",
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("footnoteRules"),
        filterTransaction(tr) {
          const { from, to } = tr.selection;

          // Allow full document selections (Mod-a/Ctrl-a)
          if (from === 0 && to === tr.doc.content.size) return true;

          let selectedFootnotes = false;
          let selectedContent = false;
          let footnoteCount = 0;
          tr.doc.nodesBetween(from, to, (node, _, parent) => {
            if (parent?.type.name == "doc" && node.type.name != "footnotes") {
              selectedContent = true;
            } else if (node.type.name == "footnote") {
              footnoteCount += 1;
            } else if (node.type.name == "footnotes") {
              selectedFootnotes = true;
            }
          });
          const overSelected = selectedContent && selectedFootnotes;
          /*
           * Here, we don't allow any transaction that spans between the "content" nodes and the "footnotes" node. This also rejects any transaction that spans between more than 1 footnote.
           */
          return !overSelected && footnoteCount <= 1;
        },

        // keep the footnotes list in sync with the references after every document change
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          return syncFootnotes(newState, () => {
            return getChangedRanges(combineTransactionSteps(oldState.doc, [...transactions])).map(
              (t) => t.newRange,
            );
          });
        },
      }),
    ];
  },

  // the initial content doesn't go through appendTransaction, so sync it once the editor is mounted.
  // `create` would also work, but it's emitted a tick later. this isn't undoable, as there's nothing
  // before it to undo to.
  onBeforeCreate() {
    this.editor.on("mount", ({ editor }) => {
      const tr = syncFootnotes(editor.state);
      if (tr) editor.view.dispatch(tr.setMeta("addToHistory", false));
    });
  },
});
export default FootnoteRules;
