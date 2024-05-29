import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { Extension, minMax } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";

const FootnoteRules = Extension.create({
  name: "footnoteRules",
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("footnoteRules"),
        filterTransaction(tr) {
          const { from, to } = tr.selection;

          // allow transactions on the whole document
          const minPos = TextSelection.atStart(tr.doc).from;
          const maxPos = TextSelection.atEnd(tr.doc).to;
          const resolvedFrom = minMax(0, minPos, maxPos);
          const resolvedEnd = minMax(tr.doc.content.size, minPos, maxPos);
          if (from == resolvedFrom && to == resolvedEnd) return true;

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

        // this function below helps with one main thing: when a user deletes a footnote reference, then undoes that, the footnote that was deleted will be undone aswell.
        // we do this by detecting if a user deleted a footnote reference node, and then appending a transaction that deletes the footnote corresponding to it (so that both transactions are grouped in the history & will be undone together)
        appendTransaction(transactions, oldState, newState) {
          let newTr = newState.tr;
          const deleteFootnoteIds: Set<string> = new Set();

          for (let tr of transactions) {
            for (let step of tr.steps) {
              if (!(step instanceof ReplaceStep)) continue;
              const isDelete = step.from != step.to; // the user deleted items from the document (from != to & the step is a replace step)
              const isInsert = step.from === step.to && step.slice.size > 0;

              let insertedRefIds: Set<string> = new Set();

              // get the footnote refs inserted in this step (to make sure we don't delete them)
              step.slice.content.descendants((node) => {
                if (node?.type.name == "footnoteReference") {
                  insertedRefIds.add(node.attrs["data-id"]);
                }
              });

              // we detect a case for isInsert because of drag & drop operations. When a footnoteReference is dragged, 2 steps are performed: the reference is deleted from the current position and inserted at a new position
              // We don't want to delete footnotes for these refs in that case, so we remove them from the deletedFootnoteIds set.
              if (isInsert) {
                for (let id of insertedRefIds) {
                  deleteFootnoteIds.delete(id);
                }
              }
              if (isDelete) {
                // get the deleted footnoteReference nodes & add their ids to the set
                tr.before.nodesBetween(
                  step.from,
                  Math.min(tr.before.content.size, step.to), // make sure to not go over the old document's limit
                  (node) => {
                    if (
                      node.type.name == "footnoteReference" &&
                      !insertedRefIds.has(node.attrs["data-id"])
                    ) {
                      deleteFootnoteIds.add(node.attrs["data-id"]);
                    }
                  },
                );
              }
            }
          }

          if (deleteFootnoteIds.size > 0) {
            newTr.doc.descendants((node, pos) => {
              if (node.type.name != "footnotes" && node.type.name != "footnote")
                return false;
              if (
                node.type.name == "footnote" &&
                deleteFootnoteIds.has(node.attrs["data-id"])
              ) {
                // we traverse through this footnote's content because it may contain footnote references.
                // we want to delete the footnotes associated with these references, so we add them to the delete set.
                node.content.descendants((node) => {
                  if (node.type.name == "footnoteReference")
                    deleteFootnoteIds.add(node.attrs["data-id"]);
                });
                newTr.delete(
                  newTr.mapping.map(pos),
                  newTr.mapping.map(pos) + node.nodeSize,
                );
              }
            });

            return newTr;
          }
          return null;
        },
      }),
    ];
  },
  //@ts-ignore
  onUpdate: ({ transaction, editor }) => {
    let prevFootnotesCount = 0;
    let currentFootnotesCount = 0;
    const footnoteNodes: any[] = [];
    if (transaction.docChanged && !transaction.getMeta("ignoreChanges")) {
      let needsUpdate = false;

      transaction.doc.descendants((node: Node) => {
        if (node.type.name == "footnoteReference") {
          currentFootnotesCount += 1;
          footnoteNodes.push(node);
        }
      });

      transaction.before.descendants((node: Node) => {
        if (node.type.name == "footnoteReference") {
          // this if statement helps us detect if the reference order got changed.
          if (
            node.attrs.referenceNumber !=
            footnoteNodes[prevFootnotesCount]?.attrs.referenceNumber
          ) {
            needsUpdate = true;
            return false; // don't descend further
          }

          prevFootnotesCount += 1;
        }
      });

      if (currentFootnotesCount != prevFootnotesCount || needsUpdate) {
        editor.commands.updateFootnotesList();
      }
    }
  },
});
export default FootnoteRules;
