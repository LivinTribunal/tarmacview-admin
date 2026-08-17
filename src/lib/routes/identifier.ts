// the one place a url segment becomes a row id. Number() alone would take `1e3` and
// ` 1 `, and a value past int4 raises out of range inside the query rather than
// answering - so only a plain decimal ever reaches a read.
//
// stated once rather than per handler. it was a local copy in each of the two file
// routes and the workspace page is the third caller, which is what earns the
// extraction: three copies of an input-validation rule is three places for one of them
// to drift, and the one that drifts is the one nobody rereads.
export const identifier = (raw: string): number | null =>
  /^\d{1,9}$/.test(raw) ? Number(raw) : null
