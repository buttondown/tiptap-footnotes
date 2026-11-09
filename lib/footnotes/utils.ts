import { findParentNodeClosestToPos, minMax, type Range } from "@tiptap/core";
import type { Fragment, Node, NodeType, ResolvedPos, Schema } from "@tiptap/pm/model";
import {
  type EditorState,
  type Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";

interface FootnoteTypes {
  reference: NodeType;
  list: NodeType;
  footnote: NodeType;
}

interface FootnoteList {
  node: Node;
  /** The position before the list */
  pos: number;
}

const typesCache = new WeakMap<Schema, FootnoteTypes>();

/** The footnote node types in `schema`. Throws if any of them are missing. */
export function getTypes(schema: Schema): FootnoteTypes {
  let types = typesCache.get(schema);
  if (!types) {
    const { footnoteReference, footnotes, footnote } = schema.nodes;
    if (!footnoteReference || !footnotes || !footnote) {
      throw new Error(
        "tiptap-footnotes: the Footnotes, Footnote and FootnoteReference extensions must all be added",
      );
    }
    types = { reference: footnoteReference, list: footnotes, footnote };
    typesCache.set(schema, types);
  }
  return types;
}

/** The `id` of the footnote numbered `number`. */
export const footnoteId = (number: number | string) => `fn:${number}`;

/** The footnotes list, which is always the last child of the document. */
function getList(doc: Node, types: FootnoteTypes): FootnoteList | undefined {
  const node = doc.lastChild;
  if (node?.type !== types.list) return undefined;
  return { node, pos: doc.content.size - node.nodeSize };
}

export function findList(doc: Node): FootnoteList | undefined {
  return getList(doc, getTypes(doc.type.schema));
}

/** The footnotes in `list` by id. The first of any duplicates wins. */
function getFootnotes(list: Node | undefined): Map<string, Node> {
  const footnotes = new Map<string, Node>();
  list?.forEach((footnote) => {
    const id = footnote.attrs["data-id"];
    if (!footnotes.has(id)) footnotes.set(id, footnote);
  });
  return footnotes;
}

// documents share unchanged nodes between versions, so caching per textblock means only edited
// textblocks get rescanned
const refCache = new WeakMap<Node, Node[]>();

/** Collects the footnote references inside `node`, in document order. */
function collectRefs(node: Node, type: NodeType, out: Node[] = []): Node[] {
  if (node.type === type) {
    out.push(node);
  } else if (node.inlineContent) {
    let refs = refCache.get(node);
    if (!refs) {
      refs = [];
      node.forEach((child) => {
        if (child.type === type) refs!.push(child);
      });
      refCache.set(node, refs);
    }
    out.push(...refs);
  } else {
    node.forEach((child) => collectRefs(child, type, out));
  }
  return out;
}

/**
 * Works out which footnotes should exist and in what order: the references in the body, followed by
 * the references inside those footnotes, and so on. A footnote that isn't reachable from the body
 * is an orphan.
 *
 * `valid` is false when a reference has a missing or duplicate id, or the wrong number.
 */
function getOrder(doc: Node, types: FootnoteTypes) {
  const list = getList(doc, types)?.node;
  const footnotes = getFootnotes(list);

  const order: string[] = [];
  const seen = new Set<string>();
  let valid = true;

  const visit = (refs: Node[]) => {
    for (const ref of refs) {
      const id = ref.attrs["data-id"];
      if (!id || seen.has(id)) {
        valid = false;
        continue;
      }
      seen.add(id);
      order.push(id);
      if (ref.attrs.referenceNumber !== `${order.length}`) valid = false;
    }
  };

  doc.forEach((child) => {
    if (child !== list) visit(collectRefs(child, types.reference));
  });
  for (let i = 0; i < order.length; i++) {
    const footnote = footnotes.get(order[i]);
    if (footnote) visit(collectRefs(footnote, types.reference));
  }

  return { list, footnotes, order, valid };
}

function isSynced({ list, order, valid }: ReturnType<typeof getOrder>): boolean {
  if (!valid) return false;
  if (!list) return order.length === 0;
  if (list.childCount !== order.length || order.length === 0) return false;

  return order.every((id, i) => {
    const footnote = list.child(i);
    return footnote.attrs["data-id"] === id && footnote.attrs.id === footnoteId(i + 1);
  });
}

/**
 * Gives references with a missing or duplicate id a new one. Of the references sharing an id, the
 * first one that wasn't just inserted keeps it.
 *
 * @returns The new ids of copied references in the body, mapped to the ids they were copied from
 */
function dedupeRefs(
  tr: Transaction,
  types: FootnoteTypes,
  isInserted: (pos: number) => boolean,
): Map<string, string> {
  const listPos = getList(tr.doc, types)?.pos ?? Infinity;

  const refs: { id: string | null; pos: number }[] = [];
  const keepers = new Map<string, number>();
  tr.doc.descendants((node, pos) => {
    if (node.type !== types.reference) return true;

    const id: string | null = node.attrs["data-id"];
    refs.push({ id, pos });
    if (id && (!keepers.has(id) || (isInserted(keepers.get(id)!) && !isInserted(pos)))) {
      keepers.set(id, pos);
    }
    return false;
  });

  const copyFrom = new Map<string, string>();
  for (const { id, pos } of refs) {
    if (id && keepers.get(id) === pos) continue;

    const newId = crypto.randomUUID();
    tr.setNodeAttribute(pos, "data-id", newId);
    // a copied reference in the body gets a copy of the original footnote. copies inside footnotes
    // get an empty one, as a footnote's content may contain a reference to itself.
    if (id && pos < listPos) copyFrom.set(newId, id);
  }
  return copyFrom;
}

/** Deletes, inserts and moves footnotes so the list matches `order`. */
function syncList(
  tr: Transaction,
  types: FootnoteTypes,
  order: string[],
  createFootnote: (id: string) => Node,
) {
  const list = getList(tr.doc, types);

  if (order.length === 0) {
    if (list) tr.delete(list.pos, tr.doc.content.size);
    return;
  }
  if (!list) {
    tr.insert(tr.doc.content.size, types.list.create(null, order.map(createFootnote)));
    return;
  }

  const targets = new Map(order.map((id, i) => [id, i]));
  const deletions: { from: number; to: number }[] = [];
  const candidates: { footnote: Node; from: number; target: number }[] = [];
  const seen = new Set<string>();
  list.node.forEach((footnote, offset) => {
    const id = footnote.attrs["data-id"];
    const target = targets.get(id);
    const from = list.pos + 1 + offset;
    if (target === undefined || seen.has(id)) {
      // an orphan or a duplicate
      deletions.push({ from, to: from + footnote.nodeSize });
    } else {
      seen.add(id);
      candidates.push({ footnote, from, target });
    }
  });

  // the longest run of footnotes that are already in order stays put, and the rest are moved
  const staying = longestIncreasing(candidates.map((c) => c.target));
  const moving = new Map<string, Node>();
  candidates.forEach(({ footnote, from }, i) => {
    if (staying.has(i)) return;
    moving.set(footnote.attrs["data-id"], footnote);
    deletions.push({ from, to: from + footnote.nodeSize });
  });

  // back to front, so positions stay valid
  deletions.sort((a, b) => b.from - a.from);
  for (const { from, to } of deletions) tr.delete(from, to);

  // the remaining footnotes are in order, so fill the gaps between them front to back
  const { node, pos } = getList(tr.doc, types)!;
  let insertAt = pos + 1;
  let index = 0;
  for (const id of order) {
    const next = node.maybeChild(index);
    if (next?.attrs["data-id"] === id) {
      insertAt += next.nodeSize;
      index++;
      continue;
    }
    const footnote = moving.get(id) ?? createFootnote(id);
    tr.insert(insertAt, footnote);
    insertAt += footnote.nodeSize;
  }
}

/** The indices of a longest strictly increasing subsequence of `values`. */
function longestIncreasing(values: number[]): Set<number> {
  // `tails[k]` is the index of the smallest value ending an increasing run of length k + 1
  const tails: number[] = [];
  const previous: number[] = [];
  values.forEach((value, i) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (values[tails[mid]] < value) low = mid + 1;
      else high = mid;
    }
    previous[i] = low > 0 ? tails[low - 1] : -1;
    tails[low] = i;
  });

  const result = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i !== -1; i = previous[i]) result.add(i);
  return result;
}

/** Sets reference numbers and footnote ids from their position, where they differ. */
function syncAttrs(tr: Transaction, types: FootnoteTypes, order: string[]) {
  const numbers = new Map(order.map((id, i) => [id, `${i + 1}`]));

  tr.doc.descendants((node, pos) => {
    if (node.type === types.reference) {
      const number = numbers.get(node.attrs["data-id"]);
      if (number && node.attrs.referenceNumber !== number) {
        tr.setNodeAttribute(pos, "referenceNumber", number);
      }
      return false;
    }
    if (node.type === types.footnote) {
      const number = numbers.get(node.attrs["data-id"]);
      if (number && node.attrs.id !== footnoteId(number)) {
        tr.setNodeAttribute(pos, "id", footnoteId(number));
      }
    }
    return true;
  });
}

/** Finds the position of the footnote with the given id. */
export function findFootnote(doc: Node, id: string): number | undefined {
  const list = findList(doc);
  if (!list) return undefined;

  let found: number | undefined;
  list.node.forEach((footnote, offset) => {
    if (found === undefined && footnote.attrs["data-id"] === id) found = list.pos + 1 + offset;
  });
  return found;
}

/**
 * Collects the content of the footnotes for the references in `fragment`, including the footnotes
 * of references inside those footnotes.
 */
export function collectFootnoteContent(doc: Node, fragment: Fragment): Map<string, Fragment> {
  const content = new Map<string, Fragment>();
  const types = getTypes(doc.type.schema);
  const footnotes = getFootnotes(getList(doc, types)?.node);
  const visit = (node: Node) => {
    for (const ref of collectRefs(node, types.reference)) {
      const id = ref.attrs["data-id"];
      const footnote = footnotes.get(id);
      if (!footnote || content.has(id)) continue;

      content.set(id, footnote.content);
      visit(footnote);
    }
  };
  fragment.forEach(visit);
  return content;
}

/** The range a selection starting at `$pos` should stay within: the footnote it's in, or the body. */
function getRegion($pos: ResolvedPos, types: FootnoteTypes): Range {
  const parent = findParentNodeClosestToPos(
    $pos,
    (node) => node.type === types.footnote || node.type === types.list,
  );
  if (parent) return { from: parent.start, to: parent.start + parent.node.content.size };

  return { from: 0, to: getList($pos.doc, types)?.pos ?? $pos.doc.content.size };
}

/**
 * Keeps a text selection within the body or a single footnote, by moving its head back into the
 * anchor's.
 *
 * @returns The adjusted selection, or `null` if it doesn't need adjusting
 */
export function clampSelection($anchor: ResolvedPos, $head: ResolvedPos): Selection | null {
  const { from, to } = getRegion($anchor, getTypes($anchor.doc.type.schema));
  if ($head.pos >= from && $head.pos <= to) return null;

  return TextSelection.between($anchor, $anchor.doc.resolve(minMax($head.pos, from, to)));
}

/**
 * Brings the footnotes list in line with the footnote references in the document, making as few
 * changes as possible.
 *
 * - References with a missing or duplicate id get a new one
 * - References are numbered in order
 * - Every reference has a matching footnote, in the same order
 * - Footnotes without a reference are deleted
 *
 * @returns A transaction with the changes, or `null` if the document is already in sync
 */
export function syncFootnotes(
  state: EditorState,
  options: {
    /**
     * Returns the ranges of `state.doc` that were just inserted. References in them are the ones
     * given new ids when they duplicate an existing one. Only called when out of sync.
     */
    getInserted?: () => readonly Range[];
    /** Content of copied footnotes, used for missing footnotes, e.g. after cut and paste. */
    copied?: ReadonlyMap<string, Fragment>;
  } = {},
): Transaction | null {
  const types = getTypes(state.schema);
  const initial = getOrder(state.doc, types);
  if (isSynced(initial)) return null;

  const inserted = options.getInserted?.() ?? [];
  const tr = state.tr;
  const copyFrom = new Map<string, string>();

  const createFootnote = (id: string) => {
    const attrs = { "data-id": id };
    const source = copyFrom.get(id);
    const content = (source && initial.footnotes.get(source)?.content) || options.copied?.get(id);
    return content ? types.footnote.create(attrs, content) : types.footnote.createAndFill(attrs)!;
  };

  // copied footnote content can bring in more duplicate references, so repeat until settled. the
  // second pass gives those empty footnotes, so this won't go past 2 passes in practice.
  for (let pass = 0; pass < 3; pass++) {
    // earlier passes may have moved footnotes around, so map the ranges through their changes
    const isInserted = (pos: number) =>
      inserted.some((range) => {
        const from = tr.mapping.map(range.from, -1);
        const to = tr.mapping.map(range.to, 1);
        return pos >= from && pos < to;
      });
    for (const [newId, id] of dedupeRefs(tr, types, isInserted)) copyFrom.set(newId, id);

    const { order } = getOrder(tr.doc, types);
    syncList(tr, types, order, createFootnote);
    syncAttrs(tr, types, order);
    if (isSynced(getOrder(tr.doc, types))) break;
  }

  return tr.docChanged ? tr : null;
}
