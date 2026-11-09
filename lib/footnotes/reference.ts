import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";

import { footnoteId } from "./utils";

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
          if (!anchor) {
            return false;
          }

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
          href: number && `#${footnoteId(number)}`,
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
    const { editor, type } = this;

    const focus = (node: PMNode) => {
      return editor.commands.focusFootnote(node.attrs["data-id"]);
    };

    return [
      new Plugin({
        key: new PluginKey("footnoteRefClick"),

        props: {
          handleDoubleClickOn(_view, _pos, node, _nodePos, event) {
            if (node.type !== type) {
              return false;
            }

            event.preventDefault();
            return focus(node);
          },
          // click the footnote reference once to get focus, click twice to scroll to the footnote
          handleClickOn(view, _pos, node, nodePos, event) {
            if (node.type !== type) {
              return false;
            }

            event.preventDefault();

            const { selection } = view.state;

            if (selection instanceof NodeSelection && selection.node.eq(node)) {
              return focus(node);
            }
            return editor.commands.setNodeSelection(nodePos);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      // the id and footnote are filled in when footnotes are synced
      addFootnote:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addInputRules() {
    // when a user types [^label], add a new footnote
    return [
      new InputRule({
        find: /\[\^[^\]]+\]$/,
        handler: ({ range, chain }) => {
          chain().insertContentAt(range, { type: this.name }).run();
        },
      }),
    ];
  },
});

export default FootnoteReference;
