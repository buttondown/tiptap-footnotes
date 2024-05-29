import OrderedList from "@tiptap/extension-ordered-list";
import { Fragment, Node } from "@tiptap/pm/model";

import { getFootnotes, updateFootnoteReferences } from "./utils";
import FootnoteRules from "./rules";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnotes: {
      /**
       * updates the footnotes definition list
       * @param insertNew if set to true, we insert a new footnote reference at the current anchor
       * @example editor.commands.updateFootnotesList(false)
       */
      updateFootnotesList: (insertNew: boolean) => ReturnType;
    };
  }
}
const Footnotes = OrderedList.extend({
  name: "footnotes",
  group: "", // removed the default group of the ordered list extension
  isolating: true,
  defining: true,
  draggable: false,

  content() {
    return "footnote*";
  },
  addAttributes() {
    return {
      class: {
        default: "footnotes",
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "ol:has(.footnotes)",
        priority: 1000,
      },
    ];
  },

  addKeyboardShortcuts() {
    return {
      // override the default behavior of Mod-a:
      // rather than selecting the whole text content of the editor, only select the text inside the current footnote
      "Mod-a": ({ editor }) => {
        try {
          const { selection } = editor.state;
          const { $from } = selection;
          // footnote listItems are at depth 2, we are getting the start & end position of the parent list item from the current cursor position
          const start = $from.start(2);
          const startNode = editor.$pos(start);

          if (startNode.node.type.name != "footnote") return false;

          const end = $from.end(2);

          editor.commands.setTextSelection({
            from: start + 1,
            to: end - 1,
          });
          return true;
        } catch (e) {
          return false;
        }
      },
    };
  },
  addCommands() {
    return {
      // updateFootnotesList takes a list of footnoteReferences and compares them to the current footnotes.
      // each footnote reference node contains a unique uuid that matches the footnote it references to. So here, we are basically comparing the ids of the references to the current footnotes.
      // If there is a footnote that has no corresponding reference, we delete it. And if there is a reference that has no corresponding footnote, we add a new footnote list item for it.

      // in this command, we also insert new footnotes references. This is because we want to group the new footnote insertions w/ the footnote list adjustments in the history.
      // Doing it this way makes it so that when a user inserts a new footnote reference, then undoes that, the footnote will also be removed.
      updateFootnotesList:
        (insertNew = false) =>
          ({ tr, state, dispatch }) => {
            if (!dispatch) return false;
            tr.setMeta("ignoreChanges", true);

            // this command updates the footnote reference numbers (based on their order), inserts a new footnote if insertNew == true, and returns the updated list of footnodeReferences
            let footnoteReferences = updateFootnoteReferences(
              tr,
              state,
              insertNew,
            );

            const footnoteType = state.schema.nodes.footnote;
            const emptyParagraph = state.schema.nodeFromJSON({
              type: "paragraph",
              content: [],
            });

            const { footnotesRange, footnotes } = getFootnotes(tr);

            // a mapping of footnote id -> footnote node
            const footnoteIds: { [key: string]: Node } = footnotes.reduce(
              (obj, footnote) => {
                obj[footnote.attrs["data-id"]] = footnote;
                return obj;
              },
              {} as any,
            );

            const newFootnotes: Node[] = [];

            for (let i = 0; i < footnoteReferences.length; i++) {
              let ref = footnoteReferences[i];
              // if there is a footnote w/ the same id as this `ref`, we preserve its content and update its id attribute
              if (ref.attrs["data-id"] in footnoteIds) {
                let footnote = footnoteIds[ref.attrs["data-id"]];
                newFootnotes.push(
                  footnoteType.create(
                    { ...footnote.attrs, id: `fn:${i + 1}` },
                    footnote.content,
                  ),
                );
              } else {
                let newNode = footnoteType.create(
                  {
                    "data-id": ref.attrs["data-id"],
                    id: `fn:${i + 1}`,
                  },
                  [emptyParagraph],
                );
                newFootnotes.push(newNode);
              }
            }

            tr.replaceWith(
              footnotesRange!.from + 1, // add 1 to point at the position after the opening ol tag
              footnotesRange!.to - 1, // substract 1 to point to the position before the closing ol tag
              Fragment.from(newFootnotes),
            );

            dispatch(tr);
            return true;
          },
    };
  },
  addInputRules() {
    return [];
  },

  addExtensions() {
    return [FootnoteRules];
  },
});

export default Footnotes;
