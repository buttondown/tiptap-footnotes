import { mergeAttributes, Node, } from "@tiptap/core";
import { Node as PMNode, Fragment as PMFragment, Slice } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";

import { v4 as uuid } from "uuid";

const REFNUM_ATTR = "data-reference-number";
const REF_CLASS = "footnote-ref";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnoteReference: {
      /**
       * add a new footnote reference
       * @example editor.commands.addFootnote()
       */
      addFootnote: () => ReturnType;
    };
  }
}

const FootnoteReference = Node.create({
  name: "footnoteReference",
  inline: true,
  content: "text*",
  group: "inline",
  atom: true,
  draggable: true,

  parseHTML() {
    return [
      {
        tag: `sup`,
        priority: 1000,
        getAttrs(node) {
          const anchor = node.querySelector<HTMLAnchorElement>(
            `a.${REF_CLASS}:first-child`
          );

          if (!anchor) {
            return false;
          }

          const id = anchor.getAttribute("data-id");
          const ref = anchor.getAttribute(REFNUM_ATTR);

          return {
            "data-id": id ?? uuid(),
            referenceNumber: ref ?? anchor.innerText,
          };
        },
        contentElement(node) {
          return node.firstChild as HTMLElement;
        },
      },
    ];
  },

  addAttributes() {
    return {
      class: {
        default: REF_CLASS,
      },
      "data-id": {
        renderHTML(attributes) {
          return {
            "data-id": attributes["data-id"] || uuid(),
          };
        },
      },
      referenceNumber: {},

      href: {
        renderHTML(attributes) {
          return {
            href: `#fn:${attributes["referenceNumber"]}`,
          };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const { referenceNumber, ...attributes } = HTMLAttributes;
    const attrs = mergeAttributes(this.options.HTMLAttributes, attributes);
    attrs[REFNUM_ATTR] = referenceNumber;

    return [
      "sup",
      { id: `fnref:${referenceNumber}` },
      ["a", attrs, HTMLAttributes.referenceNumber],
    ];
  },

  addProseMirrorPlugins() {
    const { editor } = this;

    /**
     * A recursive function to traverse a node and its children.
     * It rebuilds the node tree, giving any found `footnoteReference`
     * a new, unique data-id.
     */
    const mapNode = (node: PMNode): PMNode => {
      // 1. If this is a footnoteReference, create a new one with a new ID.
      if (node.type.name === this.name) {
        const newAttrs = { ...node.attrs, "data-id": uuid() };
        return node.type.create(newAttrs, node.content, node.marks);
      }

      // 2. If this node has children, we must recurse by mapping over its content.
      if (node.content && node.content.size > 0) {
        const newChildren: PMNode[] = [];
        node.content.forEach(childNode => {
          newChildren.push(mapNode(childNode));
        });
        const newFragment = PMFragment.from(newChildren);
        return node.copy(newFragment);
      }

      // 3. If it's a plain node with no content, return it as-is.
      return node;
    };

    
    return [
      new Plugin({
        key: new PluginKey("footnotePasteHandler"),
        props: {
          transformPasted(slice) {
            const newTopLevelNodes: PMNode[] = [];
            slice.content.forEach(topNode => {
              newTopLevelNodes.push(mapNode(topNode));
            });

            // Build a new Fragment and a new Slice
            const newFragment = PMFragment.from(newTopLevelNodes);
            return new Slice(newFragment, slice.openStart, slice.openEnd);
          },
        },
      }),
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
            "data-id": uuid(),
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
