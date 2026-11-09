import { findParentNodeClosestToPos, mergeAttributes, Node } from "@tiptap/core";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
import { Selection, TextSelection } from "@tiptap/pm/state";

import { findFootnote, findList } from "./utils";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      /**
       * Scrolls to & sets the text selection at the end of the footnote with the given id
       *
       * @example
       *   editor.commands.focusFootnote("a43956c1-1ab8-462f-96e4-be3a4b27fd50");
       *
       * @param id The id of the footnote (i.e. the `data-id` attribute value of the footnote)
       */
      focusFootnote: (id: string) => ReturnType;
    };
  }
}

export interface FootnoteOptions {
  /**
   * HTML attributes to add to the footnote element
   *
   * @default {}
   */
  HTMLAttributes: Record<string, unknown>;
  /**
   * Content expression for this node
   *
   * @default "paragraph+"
   */
  content: string;
}

const Footnote = Node.create<FootnoteOptions>({
  name: "footnote",
  content() {
    return this.options.content;
  },
  isolating: true,
  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      content: "paragraph+",
    };
  },

  addAttributes() {
    return {
      // derived from the footnote's position (`fn:N`), filled in when footnotes are synced
      id: {
        default: null,
      },
      // the data-id field should match the data-id field of a footnote reference.
      // it's used to link footnotes and references together.
      // footnotes without one are orphans, and are deleted when footnotes are synced
      "data-id": {
        default: null,
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "li",
        // only list items directly inside the footnotes list are footnotes
        context: "footnotes/",
        priority: 1000,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["li", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      focusFootnote:
        (id: string) =>
        ({ tr, chain }) => {
          const pos = findFootnote(tr.doc, id);
          if (pos === undefined) {
            return false;
          }

          return chain().focus(endOfNode(tr.doc, pos).from).run();
        },
    };
  },
  addKeyboardShortcuts() {
    const moveToEnd = (pos: number) =>
      this.editor.commands.command(({ tr }) => {
        tr.setSelection(endOfNode(tr.doc, pos)).scrollIntoView();
        return true;
      });
    const findFootnoteAt = ($pos: ResolvedPos) =>
      findParentNodeClosestToPos($pos, (node) => node.type === this.type);

    return {
      // when inside a footnote, Mod-a should select only the footnote content
      "Mod-a": ({ editor }) => {
        const footnote = findFootnoteAt(editor.state.selection.$from);
        if (!footnote) {
          return false;
        }

        return editor.commands.command(({ tr }) => {
          const { start, node } = footnote;
          tr.setSelection(
            TextSelection.between(tr.doc.resolve(start), tr.doc.resolve(start + node.content.size)),
          );
          return true;
        });
      },
      // move the cursor to the end of the next footnote. from the end of the body, that's the first
      // footnote.
      Tab: ({ editor }) => {
        const { $from } = editor.state.selection;
        const { doc } = editor.state;
        const footnote = findFootnoteAt($from);

        if (!footnote) {
          const list = findList(doc);
          const inLastBlock =
            $from.depth === 1 &&
            $from.index(0) === doc.childCount - 2 &&
            $from.parent.isTextblock &&
            !$from.parent.type.spec.code;
          if (!list?.node.childCount || !inLastBlock) {
            return false;
          }

          return moveToEnd(list.pos + 1);
        }

        const after = footnote.pos + footnote.node.nodeSize;
        if (!doc.nodeAt(after)) {
          return false;
        }

        return moveToEnd(after);
      },
      // move the cursor to the end of the previous footnote
      "Shift-Tab": ({ editor }) => {
        const { doc } = editor.state;
        const footnote = findFootnoteAt(editor.state.selection.$from);
        if (!footnote) {
          return false;
        }

        const previous = doc.resolve(footnote.pos).nodeBefore;
        if (!previous) {
          return false;
        }

        return moveToEnd(footnote.pos - previous.nodeSize);
      },
    };
  },
});

/** A cursor at the end of the node at `pos`. */
function endOfNode(doc: PMNode, pos: number): Selection {
  return Selection.near(doc.resolve(pos + doc.nodeAt(pos)!.nodeSize - 1), -1);
}

export default Footnote;
