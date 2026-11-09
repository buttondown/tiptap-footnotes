import { mergeAttributes, Node } from "@tiptap/core";

import FootnoteRules from "./rules";

export interface FootnotesOptions {
  /**
   * HTML attributes to add to the footnotes list element
   *
   * @default {}
   */
  HTMLAttributes: Record<string, unknown>;
}

const Footnotes = Node.create<FootnotesOptions>({
  name: "footnotes",
  content: "footnote*",
  isolating: true,
  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: "ol.footnotes",
        priority: 1000,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "ol",
      mergeAttributes({ class: "footnotes" }, this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addExtensions() {
    return [FootnoteRules];
  },
});

export default Footnotes;
