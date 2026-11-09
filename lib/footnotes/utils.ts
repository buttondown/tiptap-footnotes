import type { Range } from "@tiptap/core";
import type { Node, NodeType, Schema } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

interface FootnoteTypes {
  reference: NodeType;
  list: NodeType;
  footnote: NodeType;
}

function getTypes(schema: Schema): FootnoteTypes | undefined {
  const { footnoteReference, footnotes, footnote } = schema.nodes;
  if (!footnoteReference || !footnotes || !footnote) return undefined;
  return { reference: footnoteReference, list: footnotes, footnote };
}

/** The footnotes list, which is always the last child of the document. */
function getList(doc: Node, types: FootnoteTypes): Node | undefined {
  const last = doc.lastChild;
  return last?.type === types.list ? last : undefined;
}

// documents share unchanged nodes between versions, so caching per textblock means only edited
// textblocks get rescanned
const refCache = new WeakMap<Node, Node[]>();

/** Collects the footnote references inside `node`, in document order. */
function collectRefs(node: Node, type: NodeType, out: Node[] = []): Node[] {
  if (node.inlineContent) {
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
 * `valid` is false when a reference has a missing or duplicate id.
 */
function getOrder(doc: Node, types: FootnoteTypes) {
  const list = getList(doc, types);

  const footnotes = new Map<string, Node>();
  list?.forEach((footnote) => {
    const id = footnote.attrs["data-id"];
    if (!footnotes.has(id)) footnotes.set(id, footnote);
  });

  const order: string[] = [];
  const seen = new Set<string>();
  let valid = true;
  let numbered = true;

  const visit = (refs: Node[]) => {
    for (const ref of refs) {
      const id = ref.attrs["data-id"];
      if (!id || seen.has(id)) {
        valid = false;
        continue;
      }
      seen.add(id);
      order.push(id);
      if (ref.attrs.referenceNumber !== `${order.length}`) numbered = false;
    }
  };

  doc.forEach((child) => {
    if (child !== list) visit(collectRefs(child, types.reference));
  });
  for (let i = 0; i < order.length; i++) {
    const footnote = footnotes.get(order[i]);
    if (footnote) visit(collectRefs(footnote, types.reference));
  }

  return { list, footnotes, order, valid, numbered };
}

function isSynced(doc: Node, types: FootnoteTypes): boolean {
  const { list, order, valid, numbered } = getOrder(doc, types);
  if (!valid || !numbered) return false;
  if (!list) return order.length === 0;
  if (list.childCount !== order.length || order.length === 0) return false;

  return order.every((id, i) => {
    const footnote = list.child(i);
    return footnote.attrs["data-id"] === id && footnote.attrs.id === `fn:${i + 1}`;
  });
}

/**
 * Gives references with a missing or duplicate id a new one. Of the references sharing an id, the
 * first one that wasn't just inserted keeps it.
 */
function dedupeRefs(
  tr: Transaction,
  types: FootnoteTypes,
  copyFrom: Map<string, string>,
  isInserted: (pos: number) => boolean,
) {
  const list = getList(tr.doc, types);
  const listPos = list ? tr.doc.content.size - list.nodeSize : Infinity;

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

  for (const { id, pos } of refs) {
    if (id && keepers.get(id) === pos) continue;

    const newId = crypto.randomUUID();
    tr.setNodeAttribute(pos, "data-id", newId);
    // a copied reference in the body gets a copy of the original footnote. copies inside footnotes
    // get an empty one, as a footnote's content may contain a reference to itself.
    if (id && pos < listPos) copyFrom.set(newId, id);
  }
}

/** Deletes, inserts and moves footnotes so the list matches `order`. */
function syncList(
  tr: Transaction,
  types: FootnoteTypes,
  order: string[],
  createFootnote: (id: string) => Node,
) {
  let list = getList(tr.doc, types);

  if (order.length === 0) {
    if (list) tr.delete(tr.doc.content.size - list.nodeSize, tr.doc.content.size);
    return;
  }
  if (!list) {
    tr.insert(tr.doc.content.size, types.list.create(null, order.map(createFootnote)));
    return;
  }

  const listStart = () => tr.doc.content.size - getList(tr.doc, types)!.nodeSize + 1;

  // delete orphans and duplicates, back to front so positions stay valid
  const wanted = new Set(order);
  const kept = new Set<string>();
  const deletions: [from: number, to: number][] = [];
  const deleteStart = listStart();
  list.forEach((footnote, offset) => {
    const id = footnote.attrs["data-id"];
    if (wanted.has(id) && !kept.has(id)) {
      kept.add(id);
    } else {
      deletions.push([deleteStart + offset, deleteStart + offset + footnote.nodeSize]);
    }
  });
  for (let i = deletions.length - 1; i >= 0; i--) tr.delete(...deletions[i]);

  // insert missing footnotes and move out of order ones, front to back
  order.forEach((id, index) => {
    list = getList(tr.doc, types)!;
    if (list.maybeChild(index)?.attrs["data-id"] === id) return;

    const start = listStart();
    let insertAt = start;
    let moving: { node: Node; from: number } | undefined;
    list.forEach((footnote, offset, i) => {
      if (i < index) insertAt = start + offset + footnote.nodeSize;
      else if (i > index && footnote.attrs["data-id"] === id) {
        moving = { node: footnote, from: start + offset };
      }
    });

    if (moving) {
      // `moving` comes after `insertAt`, so deleting it doesn't shift `insertAt`
      tr.delete(moving.from, moving.from + moving.node.nodeSize);
      tr.insert(insertAt, moving.node);
    } else {
      tr.insert(insertAt, createFootnote(id));
    }
  });
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
      if (number && node.attrs.id !== `fn:${number}`)
        tr.setNodeAttribute(pos, "id", `fn:${number}`);
    }
    return true;
  });
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
 * @param getInserted Returns the ranges of `state.doc` that were just inserted. References in them
 *   are the ones given new ids when they duplicate an existing one. Only called when out of sync.
 * @returns A transaction with the changes, or `null` if the document is already in sync
 */
export function syncFootnotes(
  state: EditorState,
  getInserted: () => readonly Range[] = () => [],
): Transaction | null {
  const types = getTypes(state.schema);
  if (!types || isSynced(state.doc, types)) return null;

  const inserted = getInserted();
  const tr = state.tr;
  const copyFrom = new Map<string, string>();
  const { footnotes: originals } = getOrder(state.doc, types);

  const createFootnote = (id: string) => {
    const source = originals.get(copyFrom.get(id) ?? "");
    const attrs = { "data-id": id };
    return source
      ? types.footnote.create(attrs, source.content)
      : types.footnote.createAndFill(attrs)!;
  };

  // copied footnote content can bring in more duplicate references, so repeat until settled. the
  // second pass gives those empty footnotes, so this won't go past 2 passes in practice.
  for (let pass = 0; pass < 3 && !isSynced(tr.doc, types); pass++) {
    // earlier passes may have moved footnotes around, so map the ranges through their changes
    const isInserted = (pos: number) =>
      inserted.some((range) => {
        const from = tr.mapping.map(range.from, -1);
        const to = tr.mapping.map(range.to, 1);
        return pos >= from && pos < to;
      });
    dedupeRefs(tr, types, copyFrom, isInserted);
    const { order } = getOrder(tr.doc, types);
    syncList(tr, types, order, createFootnote);
    syncAttrs(tr, types, order);
  }

  return tr.docChanged ? tr : null;
}
