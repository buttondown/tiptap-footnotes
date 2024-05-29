import { mergeAttributes } from "@tiptap/core";
import ListItem from "@tiptap/extension-list-item";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      /**
       * scrolls to & sets the text selection at the end of the footnote with the given id
       * @param id the id of the footote (i.e. the `data-id` attribute value of the footnote)
       * @example editor.commands.focusFootnote("a43956c1-1ab8-462f-96e4-be3a4b27fd50")
       */
      focusFootnote: (id: string) => ReturnType;
    };
  }
}
const Footnote = ListItem.extend({
  name: "footnote",
  content: "paragraph+",
  isolating: true,
  defining: true,
  draggable: false,

  addAttributes() {
    return {
      id: {
        isRequired: true,
      },
      // the data-id field should match the data-id field of a footnote reference.
      // it's used to link footnotes and references together.
      "data-id": {
        isRequired: true,
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "li",
        getAttrs(node) {
          const id = node.getAttribute("data-id");
          if (id) {
            return {
              "data-id": node.getAttribute("data-id"),
            };
          }
          return false;
        },
        priority: 1000,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      focusFootnote:
        (id: string) =>
          ({ editor, chain }) => {
            const matchedFootnote = editor.$node("footnote", {
              "data-id": id,
            });
            if (matchedFootnote) {
              // sets the text selection to the end of the footnote definition and scroll to it.
              chain()
                .focus()
                .setTextSelection(
                  matchedFootnote.from + matchedFootnote.content.size,
                )
                .scrollIntoView()
                .run();
              return true;
            }
            return false;
          },
    };
  },
  addKeyboardShortcuts() {
    return {};
  },
});

export default Footnote;
