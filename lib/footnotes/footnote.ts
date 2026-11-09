import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as PMNode, NodeType, ResolvedPos } from "@tiptap/pm/model";
import { Selection, TextSelection } from "@tiptap/pm/state";

import { findFootnote } from "./utils";

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
      "data-id": {
        isRequired: true,
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "li",
        // only list items directly inside the footnotes list are footnotes
        context: "footnotes/",
        getAttrs(node) {
          // attribute values are read by Tiptap's default attribute parsing
          return node.hasAttribute("data-id") ? null : false;
        },
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
          if (pos === undefined) return false;

          return chain().focus(endOfNode(tr.doc, pos).from).run();
        },
    };
  },
  addKeyboardShortcuts() {
    // moves the cursor to the end of the node at `pos`
    const moveToEnd = (pos: number) =>
      this.editor.commands.command(({ tr }) => {
        tr.setSelection(endOfNode(tr.doc, pos)).scrollIntoView();
        return true;
      });

    return {
      // when inside a footnote, Mod-a should select only the footnote content
      "Mod-a": ({ editor }) => {
        const { $from } = editor.state.selection;
        const depth = findDepth($from, this.type);
        if (depth === undefined) return false;

        return editor.commands.command(({ tr }) => {
          tr.setSelection(
            TextSelection.between(
              tr.doc.resolve($from.start(depth)),
              tr.doc.resolve($from.end(depth)),
            ),
          );
          return true;
        });
      },
      // move the cursor to the end of the next footnote. from the end of the body, that's the first
      // footnote.
      Tab: ({ editor }) => {
        const { $from } = editor.state.selection;
        const { doc } = editor.state;
        const depth = findDepth($from, this.type);

        if (depth === undefined) {
          const list = doc.lastChild;
          const inLastBlock =
            $from.depth === 1 &&
            $from.index(0) === doc.childCount - 2 &&
            $from.parent.isTextblock &&
            !$from.parent.type.spec.code;
          if (list?.type.name !== "footnotes" || !list.childCount || !inLastBlock) return false;

          return moveToEnd(doc.content.size - list.nodeSize + 1);
        }

        const next = $from.node(depth - 1).maybeChild($from.index(depth - 1) + 1);
        if (!next) return false;

        return moveToEnd($from.after(depth));
      },
      // move the cursor to the end of the previous footnote
      "Shift-Tab": ({ editor }) => {
        const { $from } = editor.state.selection;
        const depth = findDepth($from, this.type);
        if (depth === undefined) return false;

        const previous = $from.node(depth - 1).maybeChild($from.index(depth - 1) - 1);
        if (!previous) return false;

        return moveToEnd($from.before(depth) - previous.nodeSize);
      },
    };
  },
});

/** The depth of the closest ancestor of `$pos` with the given type. */
function findDepth($pos: ResolvedPos, type: NodeType): number | undefined {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type === type) return depth;
  }
  return undefined;
}

/** A cursor at the end of the node at `pos`. */
function endOfNode(doc: PMNode, pos: number): Selection {
  return Selection.near(doc.resolve(pos + doc.nodeAt(pos)!.nodeSize - 1), -1);
}

export default Footnote;
