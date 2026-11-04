// Deterministic 3-way text merge, shared by the app and scripts/simulate.mjs.
// Takes the edits that turned `base` into `mine` and replays them onto `theirs`
// at exactly mapped positions (no fuzzy matching, so similar-looking lines can
// never be confused). Text a person inserted is never dropped; a deletion is
// only applied if the text to delete is still unchanged in `theirs`.
import DiffMatchPatch from "diff-match-patch";

const dmp = new DiffMatchPatch();
dmp.Diff_Timeout = 0.5;

/** @param {string} base @param {string} mine @param {string} theirs @returns {string} */
export function merge3(base, mine, theirs) {
  if (mine === base) return theirs;
  if (theirs === base || theirs === mine) return mine;
  const dMine = dmp.diff_main(base, mine);
  dmp.diff_cleanupSemantic(dMine);
  const dTheirs = dmp.diff_main(base, theirs);

  // edits relative to base: { at, del, ins }
  const edits = [];
  let pos = 0;
  for (const [op, text] of dMine) {
    if (op === 0) { pos += text.length; continue; }
    const last = edits[edits.length - 1];
    if (op === -1) {
      if (last && last.at + last.del === pos && last.ins === "") last.del += text.length;
      else edits.push({ at: pos, del: text.length, ins: "" });
      pos += text.length;
    } else {
      if (last && last.at + last.del === pos) last.ins += text;
      else edits.push({ at: pos, del: 0, ins: text });
    }
  }

  let out = theirs;
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    const start = dmp.diff_xIndex(dTheirs, e.at);
    let end = start;
    if (e.del > 0) {
      const candEnd = dmp.diff_xIndex(dTheirs, e.at + e.del);
      if (out.slice(start, candEnd) === base.slice(e.at, e.at + e.del)) end = candEnd;
    }
    out = out.slice(0, start) + e.ins + out.slice(end);
  }
  return out;
}

/** Map a cursor position from `before` to `after`. */
export function mapCursor(before, after, pos) {
  return dmp.diff_xIndex(dmp.diff_main(before, after), pos);
}
