import { expect } from "vitest";

import type { GatheredFootnotes } from "./utils";

declare module "vitest" {
  interface Matchers<R, T> {
    /** Each ref is numbered in order and has a matching footnote at the same index. */
    toHaveMatchingFootnotes: () => R;
  }
}

expect.extend({
  toHaveMatchingFootnotes(received: GatheredFootnotes) {
    const actual = {
      refs: received.refs.map((ref) => ({
        "data-id": ref.attrs["data-id"],
        referenceNumber: ref.attrs["referenceNumber"],
      })),
      footnotes: received.footnotes.map((footnote) => ({
        "data-id": footnote.attrs["data-id"],
        id: footnote.attrs["id"],
      })),
    };
    const expected = {
      refs: received.refs.map((ref, i) => ({
        "data-id": ref.attrs["data-id"],
        referenceNumber: String(i + 1),
      })),
      footnotes: received.refs.map((ref, i) => ({
        "data-id": ref.attrs["data-id"],
        id: `fn:${i + 1}`,
      })),
    };

    return {
      pass: this.equals(actual, expected),
      message: () => `expected footnote refs ${this.isNot ? "not " : ""}to match their footnotes`,
      actual,
      expected,
    };
  },
});
