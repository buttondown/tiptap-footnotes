import { findParentNodeClosestToPos, minMax, type Range } from "@tiptap/core";
import { Fragment, type Node, type ResolvedPos, type Schema, Slice } from "@tiptap/pm/model";
import {
  type EditorState,
  type Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";

interface NodeWithPos {
  node: Node;
  /** The position before the node */
  pos: number;
}

/** The footnote node types in `schema`. Throws if any of them are missing. */
export function getTypes(schema: Schema) {
  const { footnoteReference, footnotes, footnote } = schema.nodes;
  if (!footnoteReference || !footnotes || !footnote) {
    throw new Error(
      "tiptap-footnotes: the Footnotes, Footnote and FootnoteReference extensions must all be added",
    );
  }
  return { reference: footnoteReference, list: footnotes, footnote };
}

/** The `id` of the footnote numbered `number`. */
export const footnoteId = (number: number | string) => `fn:${number}`;

/** The footnotes list, which is always the last child of the document. */
export function findList(doc: Node): NodeWithPos | undefined {
  const node = doc.lastChild;
  if (node?.type.name !== "footnotes") return undefined;
  return { node, pos: doc.content.size - node.nodeSize };
}

/** The footnotes in `list` by id. The first of any duplicates wins. */
function getFootnotes(list: NodeWithPos | undefined): Map<string, NodeWithPos> {
  const footnotes = new Map<string, NodeWithPos>();
  list?.node.forEach((node, offset) => {
    const id = node.attrs["data-id"];
    if (id && !footnotes.has(id)) footnotes.set(id, { node, pos: list.pos + 1 + offset });
  });
  return footnotes;
}

/** Finds the position of the footnote with the given id. */
export function findFootnote(doc: Node, id: string): number | undefined {
  return getFootnotes(findList(doc)).get(id)?.pos;
}

/** Copies `fragment`, replacing every footnote reference in it with the result of `replace`. */
function mapRefs(fragment: Fragment, replace: (ref: Node) => Node): Fragment {
  const nodes: Node[] = [];
  fragment.forEach((node) => {
    if (node.type.name === "footnoteReference") nodes.push(replace(node));
    else nodes.push(node.isLeaf ? node : node.copy(mapRefs(node.content, replace)));
  });
  return Fragment.fromArray(nodes);
}

const withAttr = (node: Node, name: string, value: unknown) =>
  node.type.create({ ...node.attrs, [name]: value }, null, node.marks);

/**
 * Collects the content of the footnotes for the references in `fragment`, including the footnotes
 * of references inside those footnotes.
 */
export function collectFootnoteContent(doc: Node, fragment: Fragment): Map<string, Fragment> {
  const { reference } = getTypes(doc.type.schema);
  const footnotes = getFootnotes(findList(doc));
  const content = new Map<string, Fragment>();
  const visit = (source: Node | Fragment) => {
    source.descendants((node) => {
      if (node.type !== reference) return;

      const id = node.attrs["data-id"];
      const footnote = footnotes.get(id);
      if (!footnote || content.has(id)) return;

      content.set(id, footnote.node.content);
      visit(footnote.node);
    });
  };
  visit(fragment);
  return content;
}

/**
 * Gives the references in a pasted `slice` that are already in `doc` a new id, so that they get
 * their own footnote. The content for it is added to `copied`.
 */
export function renameCopiedRefs(doc: Node, slice: Slice, copied: Map<string, Fragment>): Slice {
  const footnotes = getFootnotes(findList(doc));
  const renamed = new Map<string, string>();
  const content = mapRefs(slice.content, (ref) => {
    const id = ref.attrs["data-id"];
    const footnote = footnotes.get(id);
    if (!footnote) return ref;

    // pasted references that shared a footnote still do
    let newId = renamed.get(id);
    if (!newId) {
      newId = crypto.randomUUID();
      renamed.set(id, newId);
      copied.set(newId, footnote.node.content);
    }
    return withAttr(ref, "data-id", newId);
  });
  return new Slice(content, slice.openStart, slice.openEnd);
}

/** The range a selection starting at `$pos` should stay within: the footnote it's in, or the body. */
function getRegion($pos: ResolvedPos): Range {
  const types = getTypes($pos.doc.type.schema);
  const parent = findParentNodeClosestToPos(
    $pos,
    (node) => node.type === types.footnote || node.type === types.list,
  );
  if (parent) return { from: parent.start, to: parent.start + parent.node.content.size };

  return { from: 0, to: findList($pos.doc)?.pos ?? $pos.doc.content.size };
}

/**
 * Keeps a text selection within the body or a single footnote, by moving its head back into the
 * anchor's.
 *
 * @returns The adjusted selection, or `null` if it doesn't need adjusting
 */
export function clampSelection($anchor: ResolvedPos, $head: ResolvedPos): Selection | null {
  const { from, to } = getRegion($anchor);
  if ($head.pos >= from && $head.pos <= to) return null;

  return TextSelection.between($anchor, $anchor.doc.resolve(minMax($head.pos, from, to)));
}

/**
 * Brings the footnotes list in line with the footnote references in the document.
 *
 * - References without an id get one
 * - References are numbered in order: the ones in the body, followed by the ones inside their
 *   footnotes, and so on. References sharing an id share a number and a footnote.
 * - Every numbered id has a footnote, in the same order
 * - Other footnotes are deleted
 *
 * The result only depends on the document (and `copied`), and syncing a synced document does
 * nothing.
 *
 * @param copied Content for footnotes that are missing, e.g. after cut and paste
 * @returns A transaction with the changes, or `null` if the document is already in sync
 */
export function syncFootnotes(
  state: EditorState,
  copied: ReadonlyMap<string, Fragment> = new Map(),
): Transaction | null {
  const types = getTypes(state.schema);
  const list = findList(state.doc);
  const footnotes = getFootnotes(list);
  const tr = state.tr;

  // attributes are set as we go: unlike replacing, that doesn't move anything, so positions in
  // `state.doc` stay valid
  const numbers = new Map<string, number>();
  const visit = (source: Node | Fragment, start?: number) => {
    source.descendants((node, offset) => {
      if (node.type !== types.reference) return;

      let id: string | null = node.attrs["data-id"];
      if (!id && start !== undefined) {
        id = crypto.randomUUID();
        tr.setNodeAttribute(start + offset, "data-id", id);
      }
      if (!id) return;

      let number = numbers.get(id);
      if (number === undefined) {
        number = numbers.size + 1;
        numbers.set(id, number);
      }
      if (start !== undefined && node.attrs.referenceNumber !== `${number}`) {
        tr.setNodeAttribute(start + offset, "referenceNumber", `${number}`);
      }
    });
  };

  state.doc.forEach((child, offset) => {
    if (child !== list?.node) visit(child, offset + 1);
  });
  // `numbers` grows as footnotes are visited, which this loop picks up
  for (const [id, number] of numbers) {
    const footnote = footnotes.get(id);
    if (!footnote) {
      // this footnote is about to be created, and isn't in the document to set attributes on
      const content = copied.get(id);
      if (content) {
        visit(content);
      }
      continue;
    }

    visit(footnote.node, footnote.pos + 1);

    if (footnote.node.attrs.id !== footnoteId(number)) {
      tr.setNodeAttribute(footnote.pos, "id", footnoteId(number));
    }
  }

  const current = findList(tr.doc);
  const existing = getFootnotes(current);
  const wanted = Array.from(numbers, ([id, number]) => {
    const footnote = existing.get(id);
    if (footnote) return footnote.node;

    const attrs = { id: footnoteId(number), "data-id": id };
    const content = copied.get(id);
    if (!content) return types.footnote.createAndFill(attrs)!;

    const numbered = mapRefs(content, (ref) => {
      const refNumber = numbers.get(ref.attrs["data-id"]);
      return refNumber ? withAttr(ref, "referenceNumber", `${refNumber}`) : ref;
    });
    return types.footnote.create(attrs, numbered);
  });

  if (!current) {
    if (wanted.length) {
      tr.insert(tr.doc.content.size, types.list.create(null, wanted));
    }
  } else if (!wanted.length) {
    tr.delete(current.pos, current.pos + current.node.nodeSize);
  } else {
    // replace only what's between the footnotes that are already in place at either end, so adding
    // or removing footnotes leaves the others untouched
    const { node, pos } = current;

    let start = 0;
    let from = pos + 1;
    while (start < node.childCount && node.child(start) === wanted[start]) {
      from += wanted[start++].nodeSize;
    }

    let end = wanted.length;
    let oldEnd = node.childCount;
    let to = pos + node.nodeSize - 1;
    while (end > start && oldEnd > start && node.child(oldEnd - 1) === wanted[end - 1]) {
      to -= node.child(--oldEnd).nodeSize;
      end--;
    }

    if (from < to || start < end) {
      tr.replaceWith(from, to, wanted.slice(start, end));
    }
  }

  return tr.docChanged ? tr : null;
}
