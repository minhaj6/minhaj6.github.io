#!/usr/bin/env node
// Print one tab-separated line per Galileo record of a RINEX 3 nav file:
// file line, SV, Toc (GST), source, IODnav, SISA (m), health word, healthy,
// and the ECEF position (m) at Toe. Parse problems go to stderr.
//   node galnav.js FILE [FILE...]
const fs = require("fs");
const nav = require("./rinex-nav.js");

const files = process.argv.slice(2);
if (!files.length) { console.error("usage: galnav.js FILE [FILE...]"); process.exit(2); }
console.log(["file", "line", "sv", "toc", "source", "iodnav", "sisa_m", "health", "healthy", "x_m", "y_m", "z_m"].join("\t"));
for (const f of files) {
  const { records, skipped, errors } = nav.parseNav(fs.readFileSync(f, "utf8"));
  for (const e of errors) console.error(`${f}:${e.line}: ${e.why}`);
  for (const [s, n] of Object.entries(skipped)) console.error(`${f}: skipped ${n} record(s) of system ${s}`);
  for (const r of records) {
    const p = nav.satPosition(r.v, r.v.toe);
    console.log([f, r.line, r.sv, r.toc.toISOString().slice(0, 19), r.source, r.v.iodnav, r.v.sisa, r.v.health,
      nav.healthy(r) ? 1 : 0, p.x.toFixed(3), p.y.toFixed(3), p.z.toFixed(3)].join("\t"));
  }
}
