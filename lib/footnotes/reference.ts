import { mergeAttributes, Node } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";

const REFNUM_ATTR = "data-reference-number";
const REF_CLASS = "footnote-ref";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnoteReference: {
      /**
       * Add a new footnote reference
       *
       * @example
       *   editor.commands.addFootnote();
       */
      addFootnote: () => ReturnType;
    };
  }
}

export interface FootnoteReferenceOptions {
  /**
   * HTML attributes to add to the footnote reference's anchor element
   *
   * @default {}
   */
  HTMLAttributes: Record<string, unknown>;
}

const FootnoteReference = Node.create<FootnoteReferenceOptions>({
  name: "footnoteReference",
  inline: true,
  group: "inline",
  atom: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: "sup",
        priority: 1000,
        getAttrs(node) {
          const anchor = node.querySelector(`a.${REF_CLASS}:first-child`);
          if (!anchor) return false;

          // missing ids are filled in when footnotes are synced
          return {
            "data-id": anchor.getAttribute("data-id"),
            referenceNumber: anchor.getAttribute(REFNUM_ATTR) ?? anchor.textContent,
          };
        },
      },
    ];
  },

  addAttributes() {
    return {
      // the data-id field should match the data-id field of a footnote.
      // it's used to link footnotes and references together.
      "data-id": {
        default: null,
      },
      // derived from the reference's position, filled in when footnotes are synced
      referenceNumber: {
        default: null,
        rendered: false,
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const number: string | null = node.attrs.referenceNumber;

    return [
      "sup",
      { id: number && `fnref:${number}` },
      [
        "a",
        mergeAttributes({ class: REF_CLASS }, this.options.HTMLAttributes, HTMLAttributes, {
          href: number && `#fn:${number}`,
          [REFNUM_ATTR]: number,
        }),
        number ?? "",
      ],
    ];
  },

  renderText({ node }) {
    return `[${node.attrs.referenceNumber ?? ""}]`;
  },

  addProseMirrorPlugins() {
    const { editor } = this;

    // pasted references keep their ids, duplicates are given new ones when footnotes are synced
    return [
      new Plugin({
        key: new PluginKey("footnoteRefClick"),

        props: {
          // on double-click, focus on the footnote
          handleDoubleClickOn(view, pos, node, nodePos, event) {
            if (node.type.name != "footnoteReference") return false;
            event.preventDefault();
            const id = node.attrs["data-id"];
            return editor.commands.focusFootnote(id);
          },
          // click the footnote reference once to get focus, click twice to scroll to the footnote
          handleClickOn(view, pos, node, nodePos, event) {
            if (node.type.name != "footnoteReference") return false;
            event.preventDefault();
            const { selection } = editor.state.tr;
            if (selection instanceof NodeSelection && selection.node.eq(node)) {
              const id = node.attrs["data-id"];
              return editor.commands.focusFootnote(id);
            } else {
              editor.chain().setNodeSelection(nodePos).run();
              return true;
            }
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      addFootnote:
        () =>
        ({ state, tr }) => {
          const node = this.type.create({
            "data-id": crypto.randomUUID(),
          });
          tr.insert(state.selection.anchor, node);
          return true;
        },
    };
  },

  addInputRules() {
    // when a user types [^text], add a new footnote
    return [
      {
        find: /\[\^(.*?)\]/,
        type: this.type,
        undoable: true,
        handler({ range, match, chain }) {
          const start = range.from;
          let end = range.to;
          if (match[1]) {
            chain().deleteRange({ from: start, to: end }).addFootnote().run();
          }
        },
      },
    ];
  },
});

export default FootnoteReference;
