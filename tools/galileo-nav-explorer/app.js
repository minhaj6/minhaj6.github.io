// UI for the Galileo Navigation Explorer. Parsing and orbit maths live in rinex-nav.js.

const SAMPLE_URL = "sample.26l";
const SAMPLE_NAME = "al50276a00.26l (NGS CORS AL50, 2026-10-03)";
const STALE_DAYS = 3; // records this far from the file's median Toc are left off the timeline

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const DEG = 180 / Math.PI;

const state = {
  files: [], recs: [], view: [], sel: -1, isSample: false, errors: [], skipped: {},
  srcs: new Set(), svs: new Set(), unhealthyOnly: false, showSpare: false,
  pinned: null, hover: null, span: null,
};

/* ---------- formatting ---------- */

function fmt(v, sig = 10) {
  if (v == null || Number.isNaN(v)) return "";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e-3 && a < 1e9) return String(Number(v.toPrecision(sig)));
  return v.toExponential(sig - 1).replace(/\.?0+e/, "e");
}
const signed = (v, d) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);
const hms = (d) => d.toISOString().slice(11, 19);
const ymdhms = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function towText(tow) {
  const d = Math.floor(tow / 86400), s = tow - d * 86400;
  const t = new Date(s * 1000).toISOString().slice(11, 19);
  return `${DAYS[d] || "day " + d} ${t}`;
}
function durText(s) {
  const a = Math.abs(s), sign = s < 0 ? "−" : "";
  if (a < 120) return `${sign}${fmt(a, 4)} s`;
  if (a < 7200) return `${sign}${fmt(a / 60, 4)} min`;
  if (a < 172800) return `${sign}${fmt(a / 3600, 4)} h`;
  return `${sign}${fmt(a / 86400, 4)} days`;
}

/* ---------- what each value means ---------- */

const DESC = {
  sv: "Satellite system letter E (Galileo) and the two-digit PRN, which is the Galileo SVID.",
  toc: "Clock reference time Toc: the epoch for af0, af1 and af2, in Galileo System Time. In Galileo it equals Toe; I/NAV and F/NAV each carry their own clock set.",
  af0: "Clock bias at Toc. The satellite clock offset from GST at time t is af0 + af1·(t−Toc) + af2·(t−Toc)², plus the relativistic term. Which dual-frequency pair it applies to (E1,E5a or E1,E5b) is in the data sources field.",
  af1: "Clock drift: the rate at which the satellite clock offset changes.",
  af2: "Clock drift rate. Usually broadcast as zero.",
  iodnav: "Issue of Data of the navigation batch. Ephemeris, clock, SISA and health from different pages belong together when they carry the same IODnav. It changes with each new upload; I/NAV and F/NAV use the same counter.",
  crs: "Amplitude of the sine harmonic correction to the orbit radius.",
  deltaN: "Mean motion difference from the computed value √(μ/A³).",
  m0: "Mean anomaly at Toe: where the satellite is along its orbit at the reference time.",
  cuc: "Amplitude of the cosine harmonic correction to the argument of latitude.",
  e: "Orbit eccentricity. Galileo orbits are nearly circular; E14 and E18 are in eccentric orbits after their 2014 launch anomaly.",
  cus: "Amplitude of the sine harmonic correction to the argument of latitude.",
  sqrtA: "Square root of the orbit semi-major axis. The nominal Galileo orbit has A ≈ 29 600 km.",
  toe: "Ephemeris reference time Toe, in seconds of the Galileo week. Orbit terms are evaluated at t − Toe.",
  cic: "Amplitude of the cosine harmonic correction to the inclination.",
  omega0: "Longitude of the ascending node of the orbit plane at the start of the week (Ω0).",
  cis: "Amplitude of the sine harmonic correction to the inclination.",
  i0: "Inclination at Toe. Nominal Galileo inclination is 56°.",
  crc: "Amplitude of the cosine harmonic correction to the orbit radius.",
  omega: "Argument of perigee: angle from the ascending node to the perigee.",
  omegaDot: "Rate of change of the right ascension of the ascending node.",
  idot: "Rate of change of the inclination.",
  dataSources: "Bit field telling which message and signal the record came from (bits 0–2) and which frequency pair the clock terms belong to (bits 8–9). RINEX stores it as a floating-point number.",
  week: "Galileo week number as RINEX writes it: a continuous count aligned with the GPS week (not the 12-bit GST week in the message).",
  sisa: "Signal-in-Space Accuracy: the predicted 1-sigma error of the orbit and clock, in metres. −1 (or a very large value) means NAPA, no accuracy prediction available, and the satellite should not be used.",
  health: "Signal health (HS) and data validity (DVS) bits for E1-B, E5a and E5b. I/NAV reports E1-B and E5b; F/NAV reports E5a. RINEX stores it as a floating-point number.",
  bgdE5a: "Broadcast group delay between E1 and E5a. A single-frequency E5a user subtracts (f1/f5a)²·BGD from the clock offset; an E1 user of the E1,E5a clock subtracts BGD.",
  bgdE5b: "Broadcast group delay between E1 and E5b. Only I/NAV carries it; F/NAV records write 0. A single-frequency E1 or E5b user of the E1,E5b clock applies it.",
  ttom: "Transmission time of message, in seconds of the Galileo week: when the receiver got the start of the pages carrying this data, as the receiver wrote it.",
  spare: "Spare field, written as blank or zero.",
};

function meaning(key, v, rec) {
  const A = rec.v.sqrtA ** 2;
  switch (key) {
    case "sv": return `Galileo SVID ${v}`;
    case "toc": return `${ymdhms(v)} GST · week ${rec.tocGst.week}, ${towText(rec.tocGst.tow)}`;
    case "af0": return `${signed(v * 1e6, 6)} µs ≈ ${signed(v * 299792458 / 1000, 3)} km of range`;
    case "af1": return `${signed(v * 3600 * 1e9, 4)} ns per hour`;
    case "af2": return v ? `${fmt(v)} s/s²` : "not used";
    case "iodnav": {
      const p = state.prev[rec.index];
      return p ? (p.v.iodnav === v ? "same batch as the previous record" : `new batch (previous ${p.v.iodnav})`) : "first record of this satellite and message";
    }
    case "crs": case "crc": return `${fmt(v, 5)} m`;
    case "cuc": case "cus": return `${fmt(v * A, 4)} m along track at this orbit`;
    case "cic": case "cis": return `${fmt(v * A, 4)} m across track at this orbit`;
    case "deltaN": return `${fmt(v * DEG * 86400, 5)}° per day`;
    case "m0": case "omega0": case "omega": return `${fmt(v * DEG, 8)}°`;
    case "i0": return `${fmt(v * DEG, 8)}°`;
    case "omegaDot": case "idot": return `${fmt(v * DEG * 86400, 5)}° per day`;
    case "e": return `perigee and apogee differ by ${fmt(2 * v * A / 1000, 4)} km`;
    case "sqrtA": return `A = ${(A / 1000).toFixed(3)} km, ${((A - 6378137) / 1000).toFixed(0)} km above the equator`;
    case "toe": return `${towText(v)} GST${v === rec.tocGst.tow ? " (equals Toc)" : ` (Toc − Toe = ${durText(rec.tocGst.tow - v)})`}`;
    case "dataSources": return `${v} = ${nav.dataSourcesText(v)}`;
    case "week": return `week starts ${nav.gstDate(v, 0).toISOString().slice(0, 10)}`;
    case "sisa": return v < 0 || v > 1000 ? "NAPA: no accuracy prediction available" : `${fmt(v, 4)} m (1-sigma)`;
    case "health": return nav.healthText(v, rec.v.dataSources);
    case "bgdE5a": case "bgdE5b": return v ? `${signed(v * 1e9, 3)} ns` : "0 (not given)";
    case "ttom": return `${towText(v)} GST · ${durText(v - rec.v.toe)} from Toe`;
    default: return "";
  }
}

/* ---------- loading ---------- */

function loadTexts(list, isSample) {
  const recs = [], errors = [], files = [], skipped = {};
  for (const { name, text } of list) {
    const r = nav.parseNav(text);
    r.records.forEach((x) => (x.file = name));
    r.errors.forEach((e) => (e.file = name));
    recs.push(...r.records); errors.push(...r.errors);
    for (const [k, n] of Object.entries(r.skipped)) skipped[k] = (skipped[k] || 0) + n;
    files.push({ name, text, header: r.header, count: r.records.length });
  }
  recs.sort((a, b) => a.toc - b.toc || a.prn - b.prn || a.source.localeCompare(b.source));
  recs.forEach((r, i) => (r.index = i));
  // previous record of the same satellite and message type, for change tracking
  const last = new Map(), prev = [];
  for (const r of recs) { const k = r.sv + r.source; prev[r.index] = last.get(k) || null; last.set(k, r); }
  // records far from the bulk of the file (old ephemerides kept by the receiver)
  let span = null;
  if (recs.length) {
    const med = recs[recs.length >> 1].toc.getTime();
    for (const r of recs) r.stale = Math.abs(r.toc - med) > STALE_DAYS * 86400e3;
    const fresh = recs.filter((r) => !r.stale);
    span = [fresh[0].toc.getTime(), fresh[fresh.length - 1].toc.getTime()];
  }
  Object.assign(state, { files, recs, prev, errors, skipped, isSample, span, srcs: new Set(), svs: new Set(), unhealthyOnly: false, pinned: null, hover: null });
  state.multiDay = span && new Date(span[0]).toISOString().slice(0, 10) !== new Date(span[1]).toISOString().slice(0, 10);
  applyFilters();
  renderSummary();
  renderHeader();
  renderRawFile();
  renderFilters();
  const first = state.view.find((i) => !recs[i].stale);
  select(first ?? (state.view.length ? state.view[0] : null), true);
}

async function loadSample() {
  try {
    const res = await fetch(SAMPLE_URL);
    if (!res.ok) throw new Error(res.statusText);
    loadTexts([{ name: SAMPLE_NAME, text: await res.text() }], true);
  } catch (e) {
    $("#summary").innerHTML = `<span class="notice">Could not fetch the sample (${esc(e.message)}). Open the page through a web server, or open a file instead.</span>`;
  }
}
async function readFiles(fl) {
  if (fl.length) loadTexts(await Promise.all(fl.map(async (f) => ({ name: f.name, text: await f.text() }))), false);
}

$("#open").addEventListener("click", () => $("#file").click());
$("#file").addEventListener("change", async (e) => { await readFiles([...e.target.files]); e.target.value = ""; });
$("#sample").addEventListener("click", loadSample);
let dragDepth = 0;
document.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; document.body.classList.add("drop-active"); });
document.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("drop-active"); } });
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove("drop-active");
  readFiles([...(e.dataTransfer?.files || [])]);
});
document.addEventListener("paste", (e) => {
  if (e.target.closest && e.target.closest("input, textarea")) return;
  const text = e.clipboardData?.getData("text");
  if (text && /^E\d\d \d{4} /m.test(text)) loadTexts([{ name: "pasted text", text }], false);
});

// theme: auto (system) -> light -> dark; remembered per browser
const ICON = (d) => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">' + d + "</svg>";
const THEMES = {
  auto: ["Auto", "follows your system setting", ICON('<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/>')],
  light: ["Light", "light", ICON('<circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1"/>')],
  dark: ["Dark", "dark", ICON('<path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/>')],
};
function applyTheme(mode) {
  if (mode === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", mode);
  const [label, tip, icon] = THEMES[mode];
  $("#theme").innerHTML = icon + "<span>" + label + "</span>";
  $("#theme").title = "Color theme: " + tip + " (click to change)";
}
let themeMode = "auto";
try { const saved = localStorage.getItem("galnav-explorer-theme"); if (saved in THEMES) themeMode = saved; } catch (e) {}
applyTheme(themeMode);
$("#theme").addEventListener("click", () => {
  themeMode = { auto: "light", light: "dark", dark: "auto" }[themeMode];
  applyTheme(themeMode);
  try { localStorage.setItem("galnav-explorer-theme", themeMode); } catch (e) {}
});

/* ---------- summary, header, filters ---------- */

function renderSummary() {
  const s = state, el = $("#summary");
  const names = esc(s.files.map((f) => f.name).join(", ") || "none");
  const skippedText = Object.entries(s.skipped).map(([k, n]) => `${n} ${k}`).join(", ");
  if (!s.recs.length) {
    el.innerHTML = `<div class="stat"><span class="k">File</span><span class="v">${names}</span></div><span class="notice">No Galileo records found. Expected RINEX 3 records starting like <span class="mono">E02 2026 10 02 22 10 00 …</span>${skippedText ? ` (skipped other systems: ${esc(skippedText)})` : ""}.</span>`;
    return;
  }
  const n = (f) => s.recs.filter(f).length;
  const h = s.files[0].header;
  const stale = n((r) => r.stale), bad = n((r) => !nav.healthy(r));
  el.innerHTML = `
    ${s.isSample ? `<span class="sample-tag">Sample</span>` : ""}
    <div class="stat"><span class="k">File${s.files.length > 1 ? "s" : ""}</span><span class="v">${names}</span></div>
    ${h.version ? `<div class="stat"><span class="k">RINEX</span><span class="v">${esc(h.version)}</span></div>` : ""}
    <div class="stat"><span class="k">Satellites</span><span class="v">${new Set(s.recs.map((r) => r.sv)).size}</span></div>
    <div class="stat"><span class="k">I/NAV</span><span class="v">${n((r) => r.source === "I/NAV")}</span></div>
    <div class="stat"><span class="k">F/NAV</span><span class="v">${n((r) => r.source === "F/NAV")}</span></div>
    <div class="stat"><span class="k">Toc span (GST)</span><span class="v">${ymdhms(new Date(s.span[0])).slice(5, 16)} → ${ymdhms(new Date(s.span[1])).slice(5, 16)}</span></div>
    <div class="stat"><span class="k">Health flag set</span><span class="v ${bad ? "bad" : "ok"}">${bad}</span></div>
    ${stale ? `<div class="stat"><span class="k">Old records</span><span class="v warn" title="Toc more than ${STALE_DAYS} days from the rest of the file">${stale}</span></div>` : ""}
    ${skippedText ? `<div class="stat"><span class="k">Other systems skipped</span><span class="v">${esc(skippedText)}</span></div>` : ""}
    ${s.errors.length ? `<details class="errors"><summary>${s.errors.length} record(s) not read</summary><pre>${esc(s.errors.slice(0, 20).map((e) => `${e.file}:${e.line}: ${e.why}\n  ${e.text.slice(0, 80)}`).join("\n"))}</pre></details>` : ""}`;
}

function renderHeader() {
  const el = $("#hdr");
  const parts = state.files.filter((f) => f.header.lines.length).map((f) => {
    const h = f.header, bits = [];
    if (h.ionoGal) bits.push(`Galileo ionosphere (NeQuick) ai0 = ${fmt(h.ionoGal[0])} sfu, ai1 = ${fmt(h.ionoGal[1])} sfu/deg, ai2 = ${fmt(h.ionoGal[2])} sfu/deg²`);
    for (const c of h.timeCorr) {
      const what = { GAUT: "GST → UTC", GPGA: "GPS → GST", GAGP: "GST → GPS" }[c.type] || c.type;
      bits.push(`${what} (${c.type}): a0 = ${fmt(c.a0)} s, a1 = ${fmt(c.a1)} s/s, reference ${towText(c.t)} of week ${c.w}`);
    }
    if (h.leap) bits.push(`Leap seconds ${h.leap.now}${h.leap.future != null ? `, ${h.leap.future} from week ${h.leap.week} day ${h.leap.day}` : ""}`);
    if (h.program) bits.push(`Written by ${h.program}${h.runBy ? " / " + h.runBy : ""} on ${h.date}`);
    const raw = h.lines.map((l) => `${esc(l.text.slice(0, 60).padEnd(60))}<span class="lbl">${esc(l.text.slice(60))}</span>`).join("\n");
    return `<p><strong>${esc(f.name)}</strong></p><ul>${bits.map((b) => `<li>${esc(b)}</li>`).join("")}</ul><div class="rawrec">${raw}</div>`;
  });
  el.hidden = !parts.length;
  el.innerHTML = `<summary>File header</summary>${parts.join("")}`;
}

// Raw file viewer: a fixed-height scroll box per file, built on first open.
// The selected record's lines are highlighted; clicking a record line opens it.
function renderRawFile() {
  const el = $("#raw");
  el.hidden = !state.files.length;
  el.dataset.built = "";
  const lines = state.files.reduce((n, f) => n + f.text.replace(/\r?\n$/, "").split(/\r?\n/).length, 0);
  el.innerHTML = `<summary>Raw file <span class="aside">${lines} lines · selected record highlighted · click a record to open it</span></summary>`;
  if (el.open) buildRawFile();
}
function buildRawFile() {
  const el = $("#raw");
  if (el.dataset.built) return;
  el.dataset.built = "1";
  el.insertAdjacentHTML("beforeend", state.files.map((f, k) => {
    const lines = f.text.replace(/\r?\n$/, "").split(/\r?\n/), w = String(lines.length).length;
    const body = lines.map((l, j) => `<div class="rl" data-n="${j + 1}"><span class="ln">${String(j + 1).padStart(w)}  </span>${esc(l)}</div>`).join("");
    return `${state.files.length > 1 ? `<p class="rawname">${esc(f.name)}</p>` : ""}<div class="rawbox" data-file="${k}">${body}</div>`;
  }).join(""));
}
function markRawSelection(scroll) {
  const el = $("#raw"), r = state.recs[state.sel];
  if (!el.open || !el.dataset.built) return;
  el.querySelectorAll(".rl.on").forEach((x) => x.classList.remove("on"));
  if (!r) return;
  const box = el.querySelector(`.rawbox[data-file="${state.files.findIndex((f) => f.name === r.file)}"]`);
  if (!box) return;
  for (let n = r.line; n < r.line + r.lines.length; n++) box.children[n - 1]?.classList.add("on");
  const first = box.children[r.line - 1];
  if (scroll && first) box.scrollTop = first.offsetTop - box.clientHeight / 3;
}
$("#raw").addEventListener("toggle", (e) => { if (e.target.open) { buildRawFile(); markRawSelection(true); } });
$("#raw").addEventListener("click", (e) => {
  const row = e.target.closest(".rl"), box = e.target.closest(".rawbox");
  if (!row || !box) return;
  const name = state.files[+box.dataset.file].name, n = +row.dataset.n;
  const r = state.recs.find((x) => x.file === name && n >= x.line && n < x.line + x.lines.length);
  if (r) { goTo(r.index); markRawSelection(false); }
});

function renderFilters() {
  const s = state, el = $("#filters");
  if (!s.recs.length) { el.innerHTML = ""; return; }
  const count = (f) => s.recs.filter(f).length;
  let html = `<span class="lbl">Message</span>`;
  for (const src of ["I/NAV", "F/NAV"]) html += `<button class="chip" data-src="${src}" aria-pressed="${s.srcs.has(src)}">${src}<span class="n">${count((r) => r.source === src)}</span></button>`;
  html += `<span class="lbl">Satellite</span>`;
  for (const sv of [...new Set(s.recs.map((r) => r.sv))].sort()) html += `<button class="chip" data-sv="${sv}" aria-pressed="${s.svs.has(sv)}">${sv}</button>`;
  html += `<button class="chip" data-bad="1" aria-pressed="${s.unhealthyOnly}" style="margin-left:8px">Health flag set only</button>`;
  el.innerHTML = html;
}
$("#filters").addEventListener("click", (e) => {
  const b = e.target.closest(".chip"); if (!b) return;
  const s = state, toggle = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));
  if (b.dataset.src) toggle(s.srcs, b.dataset.src);
  else if (b.dataset.sv) toggle(s.svs, b.dataset.sv);
  else s.unhealthyOnly = !s.unhealthyOnly;
  const cur = s.sel;
  applyFilters(); renderFilters();
  select(s.view.includes(cur) ? cur : s.view.length ? s.view[0] : null);
});

function inView(r) {
  const s = state;
  return (!s.srcs.size || s.srcs.has(r.source)) && (!s.svs.size || s.svs.has(r.sv)) && (!s.unhealthyOnly || !nav.healthy(r));
}
function applyFilters() {
  const s = state;
  s.view = s.recs.filter(inView).map((r) => r.index);
  const list = $("#list");
  list.innerHTML = s.view.length ? `<div style="height:${s.view.length * ROW}px"></div>` : `<div class="empty">No records match the filters.</div>`;
  list.scrollTop = 0;
  drawRows();
  drawTimeline();
}

/* ---------- timeline ---------- */

function drawTimeline() {
  const s = state, svg = $("#tl");
  const fresh = s.recs.filter((r) => !r.stale);
  if (!fresh.length) { svg.innerHTML = ""; svg.setAttribute("height", 0); return; }
  const svs = [...new Set(s.recs.map((r) => r.sv))].sort();
  const W = Math.max(640, svg.parentElement.clientWidth), L = 34, R = 10, T = 16, RH = 12;
  const H = T + svs.length * RH + 4;
  const [t0, t1] = s.span[1] > s.span[0] ? s.span : [s.span[0] - 3600e3, s.span[0] + 3600e3];
  const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (sv) => T + svs.indexOf(sv) * RH;
  const selRec = s.recs[s.sel];
  let html = "";
  svs.forEach((sv, k) => {
    html += `<rect class="lane${selRec && selRec.sv === sv ? " on" : ""}" x="0" y="${T + k * RH}" width="${W}" height="${RH}"/>`;
    html += `<text class="lab" x="2" y="${T + k * RH + 9}">${sv}</text>`;
  });
  const hours = (t1 - t0) / 3600e3;
  const step = [1, 2, 3, 6, 12, 24, 48].find((h) => hours / h <= 12) || 96;
  for (let t = Math.ceil(t0 / (step * 3600e3)) * step * 3600e3; t <= t1; t += step * 3600e3) {
    const d = new Date(t), lab = step >= 24 || (s.multiDay && d.getUTCHours() === 0) ? d.toISOString().slice(5, 10) : d.toISOString().slice(11, 16);
    html += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${T - 2}" y2="${H}"/><text class="axis" x="${x(t)}" y="10" text-anchor="middle">${lab}</text>`;
  }
  for (const r of fresh) {
    const cls = !nav.healthy(r) ? "unhealthy" : r.source === "F/NAV" ? "fnav" : "inav";
    const dy = r.source === "F/NAV" ? 6 : 1; // F/NAV in the lower half of the lane
    html += `<rect class="tick ${cls}${inView(r) ? "" : " dim"}" data-i="${r.index}" x="${x(r.toc) - 1.25}" y="${y(r.sv) + dy}" width="2.5" height="5"><title>${r.sv} ${r.source} IODnav ${r.v.iodnav} · Toc ${hms(r.toc)}</title></rect>`;
  }
  if (selRec && !selRec.stale) html += `<rect class="sel" x="${x(selRec.toc) - 3}" y="${y(selRec.sv) - 1}" width="6" height="${RH + 2}" rx="1.5"/>`;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("height", H);
  svg.innerHTML = html;
  const stale = s.recs.length - fresh.length;
  $("#tl-aside").textContent = `one tick per record at Toc · I/NAV top, F/NAV bottom of each lane · click to open${stale ? ` · ${stale} old record(s) not shown` : ""}`;
}
$("#tl").addEventListener("click", (e) => {
  const t = e.target.closest(".tick"); if (!t) return;
  goTo(+t.dataset.i);
});
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawTimeline, 100); });

/* ---------- virtualised record list ---------- */

const ROW = 32;
function timeLabel(r) {
  if (r.stale) return r.toc.toISOString().slice(0, 10);
  return state.multiDay ? r.toc.toISOString().slice(5, 16).replace("T", " ") : hms(r.toc);
}
function rowSummary(r) {
  const bad = nav.healthSignals(r.v.health, r.v.dataSources).filter((x) => x.hs || x.dvs).map((x) => `${x.name} ${nav.HS_TEXT[x.hs]}`);
  return (bad.length ? bad.join(", ") + " · " : "") + `Toe ${towText(r.v.toe).slice(4, 9)} · af0 ${signed(r.v.af0 * 1e6, 3)} µs · SISA ${fmt(r.v.sisa, 4)} m`;
}
function drawRows() {
  const s = state, list = $("#list");
  if (!s.view.length) return;
  const top = list.scrollTop, h = list.clientHeight || 600;
  const a = Math.max(0, Math.floor(top / ROW) - 8), b = Math.min(s.view.length, Math.ceil((top + h) / ROW) + 8);
  [...list.querySelectorAll(".row")].forEach((r) => r.remove());
  let html = "";
  for (let i = a; i < b; i++) {
    const r = s.recs[s.view[i]], ok = nav.healthy(r), src = r.source === "F/NAV" ? "fnav" : "inav";
    html += `<div class="row${r.index === s.sel ? " sel" : ""}" style="top:${i * ROW}px" data-i="${r.index}" role="option" aria-selected="${r.index === s.sel}">
      <span class="t">${timeLabel(r)}</span><span class="p">${r.sv}</span><span class="src ${src}">${r.source}</span><span class="i">${r.v.iodnav}</span>
      <span class="s">${esc(rowSummary(r))}</span><span class="${ok ? "h-ok" : "h-bad"}" title="${ok ? "healthy" : "health flag set"}">${ok ? "✓" : "✗"}</span></div>`;
  }
  list.firstElementChild.insertAdjacentHTML("afterend", html);
}
$("#list").addEventListener("scroll", () => requestAnimationFrame(drawRows));
$("#list").addEventListener("click", (e) => { const r = e.target.closest(".row"); if (r) select(+r.dataset.i); });
$("#list").addEventListener("keydown", (e) => {
  const s = state, pos = s.view.indexOf(s.sel);
  const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 15, PageUp: -15 }[e.key];
  if (!step) return;
  e.preventDefault();
  select(s.view[Math.max(0, Math.min(s.view.length - 1, pos + step))], true);
});
function scrollToSel() {
  const s = state, list = $("#list"), pos = s.view.indexOf(s.sel);
  if (pos < 0) return;
  const y = pos * ROW;
  if (y < list.scrollTop) list.scrollTop = y;
  else if (y + ROW > list.scrollTop + list.clientHeight) list.scrollTop = y - list.clientHeight + ROW;
}
// open a record, clearing filters if they hide it
function goTo(i) {
  const s = state;
  if (!s.view.includes(i)) { s.srcs.clear(); s.svs.clear(); s.unhealthyOnly = false; applyFilters(); renderFilters(); }
  select(i, true);
}

/* ---------- detail ---------- */

function fieldClass(f, k) {
  if (f.key === "sv" || f.key === "toc") return "k-h";
  if (f.key.startsWith("spare")) return "k-s";
  return `k-t${k % 6}`;
}
function changed(f, p) {
  if (!p || f.key === "sv" || f.key.startsWith("spare")) return false;
  const pv = p.fields.find((x) => x.key === f.key).value;
  return f.key === "toc" ? pv.getTime() !== f.value.getTime() : pv !== f.value;
}
function deltaText(f, p) {
  if (!p || f.key === "sv" || f.key.startsWith("spare")) return "";
  const pv = p.fields.find((x) => x.key === f.key).value;
  if (f.key === "toc") return `+${durText((f.value - pv) / 1000)}`;
  if (pv === f.value) return "=";
  if (f.key === "dataSources" || f.key === "health") return `was ${pv}`;
  return (f.value > pv ? "+" : "−") + fmt(Math.abs(f.value - pv), 4);
}

function select(i, keyboard) {
  const s = state;
  if (i == null || !s.recs[i]) { s.sel = -1; $("#detail").innerHTML = `<div class="sec empty">Select a record.</div>`; drawRows(); drawTimeline(); return; }
  s.sel = i; s.hover = null;
  const r = s.recs[i];
  r.fields.forEach((f, k) => (f.cls = fieldClass(f, k)));
  if (s.pinned == null || !r.fields[s.pinned]) s.pinned = r.fields.findIndex((f) => f.key === "iodnav");
  renderDetail();
  drawRows();
  drawTimeline();
  markRawSelection(true);
  if (keyboard) scrollToSel();
}

function recLink(r, label) {
  return r ? `<button class="link" data-goto="${r.index}">${esc(label)}</button>` : "";
}

function renderDetail() {
  const s = state, r = s.recs[s.sel], p = s.prev[r.index];
  const ok = nav.healthy(r), src = r.source === "F/NAV" ? "fnav" : "inav";
  const next = s.recs.find((x) => x.index > r.index && x.sv === r.sv && x.source === r.source);
  const twin = s.recs.find((x) => x.sv === r.sv && x.source !== r.source && x.v.iodnav === r.v.iodnav && Math.abs(x.toc - r.toc) < 86400e3);

  // record text with each value wrapped in a hover target
  const rows = r.lines.map((text, ln) => {
    const fs = r.fields.map((f, k) => [f, k]).filter(([f]) => f.line === ln).sort((a, b) => a[0].col - b[0].col);
    let out = "", pos = 0;
    for (const [f, k] of fs) {
      out += esc(text.slice(pos, f.col));
      const t = text.slice(f.col, f.col + f.len) || " ".repeat(f.len);
      out += `<span class="fld ${f.cls}${changed(f, p) ? " chg" : ""}${k === s.pinned ? " hl" : ""}" data-f="${k}">${esc(t.padEnd(f.len))}</span>`;
      pos = f.col + f.len;
    }
    return `<span class="ln">${String(r.line + ln).padStart(5)}  </span>${out}${esc(text.slice(pos))}`;
  }).join("\n");

  $("#detail").innerHTML = `
    <div class="sec">
      <div class="msg-title">
        <h3>${r.sv} · ${r.source} ephemeris</h3>
        <span class="meta">IODnav ${r.v.iodnav} · Toc ${ymdhms(r.toc)} GST</span>
        <span class="badge ${src}">${r.source}</span>
        <span class="badge ${ok ? "ok" : "bad"}">${ok ? "Healthy" : "Health flag set"}</span>
        ${r.v.sisa < 0 || r.v.sisa > 1000 ? `<span class="badge bad">SISA: NAPA</span>` : ""}
        ${r.stale ? `<span class="badge warn">Old record</span>` : ""}
      </div>
      <div class="nav-links">
        ${recLink(p, `← previous ${r.sv} ${r.source} (IOD ${p?.v.iodnav}, ${p ? durText((r.toc - p.toc) / 1000) : ""} earlier)`)}
        ${recLink(next, `next ${r.sv} ${r.source} (IOD ${next?.v.iodnav}) →`)}
        ${recLink(twin, `same IODnav on ${twin?.source}`)}
      </div>
    </div>
    <div class="sec">
      <h2>File record <span class="aside">${esc(r.file)}, lines ${r.line}–${r.line + 7} · hover a value, click to pin</span></h2>
      <div class="rawrec" id="rawrec">${rows}</div>
      <div class="legend">
        <span><i style="background:var(--th)"></i>Satellite and epoch</span>
        <span><i style="background:var(--t0)"></i><i style="background:var(--t1)"></i><i style="background:var(--t2)"></i>Values</span>
        <span><i style="background:repeating-linear-gradient(135deg,var(--ts) 0 3px,var(--hatch) 3px 5px)"></i>Spare</span>
        ${p ? `<span><i style="box-shadow:inset 0 -2px 0 var(--warn);background:var(--ts)"></i>Changed since the previous ${r.sv} ${r.source} record</span>` : ""}
      </div>
    </div>
    <div class="sec inspector" id="inspector"></div>
    <div class="sec">
      <h2>Flags</h2>
      <div class="flags">${flagHtml("Data sources", r.v.dataSources, nav.DATA_SOURCE_BITS, nav.dataSourcesText(r.v.dataSources), [3, 8])}
      ${flagHtml("SV health", r.v.health, nav.HEALTH_BITS, nav.healthText(r.v.health, r.v.dataSources), [3, 6], true)}</div>
    </div>
    <div class="sec">
      <h2>Computed from this record</h2>
      ${derivedHtml(r)}
    </div>
    <div class="sec">
      <h2>Fields <span class="aside">Δ is the change since the previous ${r.sv} ${r.source} record</span> <label class="toggle"><input type="checkbox" id="spare" ${s.showSpare ? "checked" : ""}> Show spare</label></h2>
      <div class="tablewrap"><table id="ftable"></table></div>
    </div>`;
  renderTable();
  renderInspector();
  $("#spare").addEventListener("change", (e) => { s.showSpare = e.target.checked; renderTable(); });
}

function flagHtml(title, value, bits, text, gaps, alarm) {
  const cells = [...bits].reverse().map(([b, label]) => {
    const on = (value >> b) & 1;
    return `<span class="bit${on ? " one" : ""}${on && alarm ? " alarm" : ""}${gaps.includes(b + 1) ? " grp-gap" : ""}" title="bit ${b}: ${esc(label)} = ${on}"><b>${on}</b><small>${b}</small></span>`;
  }).join("");
  return `<div class="flag"><h4>${title}<span>${value} = ${value.toString(2).padStart(bits.length, "0")}b</span></h4><div class="bitrow">${cells}</div><p>${esc(text)}</p></div>`;
}

function derivedHtml(r) {
  const v = r.v, toe = v.toe;
  const pos = nav.satPosition(v, toe);
  const geo = nav.ecefToGeodetic(pos.x, pos.y, pos.z);
  const clk = nav.clockOffset(v, r.tocGst.tow, r.tocGst.tow);
  const period = 2 * Math.PI / (Math.sqrt(3.986004418e14 / pos.A ** 3) + v.deltaN);
  const items = [
    ["Position at Toe (ECEF)", `${(pos.x / 1000).toFixed(3)}, ${(pos.y / 1000).toFixed(3)}, ${(pos.z / 1000).toFixed(3)} km`],
    ["Sub-satellite point", `${geo.lat.toFixed(3)}°, ${geo.lon.toFixed(3)}°`],
    ["Height above ellipsoid", `${(geo.h / 1000).toFixed(1)} km`],
    ["Orbit radius at Toe", `${(pos.r / 1000).toFixed(3)} km`],
    ["Orbital period", `${(period / 3600).toFixed(4)} h`],
    ["Inclination", `${(v.i0 * DEG).toFixed(3)}°`],
    ["Clock offset at Toc", `${signed((clk.poly + clk.rel) * 1e6, 6)} µs`],
    ["  of which relativistic", `${signed(clk.rel * 1e9, 3)} ns`],
    ["Received (Ttom − Toe)", durText(v.ttom - toe)],
  ];
  return `<dl class="derived">${items.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join("")}</dl>
    <p class="note">Ephemeris evaluated at t = Toe with the ICD algorithm; earth rotation during signal travel is not applied.</p>`;
}

function renderTable() {
  const s = state, r = s.recs[s.sel], p = s.prev[r.index];
  let html = `<thead><tr><th>Field</th><th>Line</th><th>Value</th><th>Unit</th><th>Δ</th><th>Meaning</th></tr></thead><tbody>`;
  const groups = { sv: "Satellite, epoch and clock", iodnav: "Orbit", dataSources: "Data sources and week", sisa: "Accuracy, health and group delays", ttom: "Transmission" };
  r.fields.forEach((f, k) => {
    if (!s.showSpare && f.key.startsWith("spare")) return;
    if (groups[f.key]) html += `<tr class="grp"><td colspan="6">${groups[f.key]}</td></tr>`;
    const val = f.key === "toc" ? ymdhms(f.value) : f.key === "sv" ? f.text : fmt(f.value, 13);
    const d = deltaText(f, p);
    html += `<tr class="f ${f.cls}${s.pinned === k ? " pinned" : ""}" data-f="${k}" tabindex="0">
      <td>${esc(f.name)}</td><td class="num">${r.line + f.line}</td><td class="num">${esc(val)}</td><td class="dim">${esc(f.unit)}</td>
      <td class="num${d && d !== "=" && f.key !== "toc" ? " chg" : ""}">${esc(d === "=" ? "" : d)}</td>
      <td>${esc(meaning(f.key, f.value, r))}</td></tr>`;
  });
  $("#ftable").innerHTML = html + "</tbody>";
}

// While the pointer is over the detail panel the inspector may grow but not
// shrink, so the table does not jump under the pointer.
const lockInspector = () => { const el = $("#inspector"); if (el) el.style.minHeight = el.offsetHeight + "px"; };
const unlockInspector = () => { const el = $("#inspector"); if (el) el.style.minHeight = ""; };

function renderInspector() {
  const s = state, r = s.recs[s.sel], el = $("#inspector");
  if (!el) return;
  const k = s.hover != null ? s.hover : s.pinned;
  if (k == null || k < 0) {
    el.innerHTML = `<div class="insp-head"><strong>Inspector</strong><span>Hover or tap any value in the record or the table.</span></div>`;
    return;
  }
  const f = r.fields[k], p = s.prev[r.index];
  const pv = p && p.fields[k].value;
  const desc = f.key.startsWith("spare") ? DESC.spare : DESC[f.key];
  const d = deltaText(f, p);
  el.innerHTML = `
    <div class="insp-head"><strong>${esc(f.name)}</strong><span>line ${r.line + f.line}, columns ${f.col + 1}–${f.col + f.len}</span>${s.pinned === k && s.hover == null ? `<span class="pin-note">Pinned · click again to release</span>` : ""}</div>
    <dl class="insp-grid">
      <div><dt>File text</dt><dd>${esc(f.text.trim() || "(blank)")}</dd></div>
      ${f.key !== "sv" && f.key !== "toc" && f.value != null ? `<div><dt>Value</dt><dd>${esc(fmt(f.value, 13))}${f.unit ? " " + esc(f.unit) : ""}</dd></div>` : ""}
      ${meaning(f.key, f.value, r) ? `<div style="grid-column: span 2"><dt>Meaning</dt><dd class="meaning">${esc(meaning(f.key, f.value, r))}</dd></div>` : ""}
      ${d && f.key !== "toc" ? `<div><dt>Previous record</dt><dd>${esc(fmt(pv, 13))}${d !== "=" ? ` (Δ ${esc(d)})` : " (unchanged)"}</dd></div>` : ""}
    </dl>
    <p class="insp-desc">${esc(desc)}</p>`;
}

function setHighlight(k) {
  document.querySelectorAll(".fld.hl, tr.f.hl").forEach((e) => e.classList.remove("hl"));
  if (k == null || k < 0) return;
  document.querySelectorAll(`.fld[data-f="${k}"], tr.f[data-f="${k}"]`).forEach((e) => e.classList.add("hl"));
}

const detailEl = $("#detail");
detailEl.addEventListener("mouseover", (e) => {
  const t = e.target.closest(".fld, tr.f");
  if (!t) return;
  lockInspector();
  const k = +t.dataset.f;
  if (k !== state.hover) { state.hover = k; setHighlight(k); renderInspector(); }
});
detailEl.addEventListener("mouseleave", () => { unlockInspector(); state.hover = null; setHighlight(state.pinned); renderInspector(); });
detailEl.addEventListener("click", (e) => {
  const s = state;
  const go = e.target.closest("[data-goto]");
  if (go) { goTo(+go.dataset.goto); return; }
  const t = e.target.closest(".fld, tr.f");
  if (!t) return;
  const k = +t.dataset.f;
  s.pinned = s.pinned === k ? null : k;
  s.hover = null;
  document.querySelectorAll("tr.f.pinned").forEach((x) => x.classList.remove("pinned"));
  if (s.pinned != null) $(`tr.f[data-f="${s.pinned}"]`)?.classList.add("pinned");
  setHighlight(s.pinned);
  renderInspector();
});
detailEl.addEventListener("keydown", (e) => {
  const row = e.target.closest("tr.f");
  if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); row.click(); }
});

loadSample();
