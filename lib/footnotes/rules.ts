import { combineTransactionSteps, Extension, getChangedRanges } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

import { clampSelection, syncFootnotes } from "./utils";

const FootnoteRules = Extension.create({
  name: "footnoteRules",
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("footnoteRules"),
        props: {
          // keep selections made with the mouse or keyboard within the body or a single footnote
          createSelectionBetween(_view, $anchor, $head) {
            return clampSelection($anchor, $head);
          },
        },

        appendTransaction(transactions, oldState, newState) {
          // keep the footnotes list in sync with the references after every document change
          const tr = transactions.some((t) => t.docChanged)
            ? syncFootnotes(newState, () => {
                return getChangedRanges(
                  combineTransactionSteps(oldState.doc, [...transactions]),
                ).map((t) => t.newRange);
              })
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
    this.editor.on("mount", ({ editor }) => {
      const tr = syncFootnotes(editor.state);
      if (tr) editor.view.dispatch(tr.setMeta("addToHistory", false));
    });
  },
});
export default FootnoteRules;
