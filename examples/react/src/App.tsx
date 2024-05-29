import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Footnotes, FootnoteReference, Footnote } from "tiptap-footnotes";
import Document from "@tiptap/extension-document";

const extensions = [
  StarterKit.configure({
    document: false,
  }),
  Document.extend({
    content: "block+ footnotes",
  }),
  Placeholder.configure({
    placeholder: "Start typing here...",
  }),
  Footnotes,
  Footnote,
  FootnoteReference,
];

const Tiptap = () => {
  const editor = useEditor({
    extensions,
    content: "Hello world",
  });

  return (
    <div className="mx-auto w-fit flex flex-col justify-center h-screen">
      <h1 className="text-3xl mb-2">Footnotes Demo</h1>
      <p>
        Click the "Add footnote" button below or type <code>[^text]</code> to
        insert a footnote
      </p>
      <br />
      <button
        className="bg-neutral-200 text-gray-700 font-semibold text-sm rounded-md w-fit px-3 py-2"
        onClick={() => editor?.commands.addFootnote()}
      >
        Add footnote
      </button>
      <br />
      <EditorContent editor={editor} />
    </div>
  );
};

export default Tiptap;
