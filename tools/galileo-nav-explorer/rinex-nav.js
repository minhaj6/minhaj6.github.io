// RINEX 3.0x navigation file reader for Galileo records, plus the broadcast
// ephemeris maths (ICD OS SIS 5.1). No DOM; also usable from Node.

/* ---------- field layout (RINEX 3.04, Table A8) ---------- */

// [orbit line, slot, key, name, unit]. Line 0 slots 1..3 sit after the epoch;
// lines 1..7 hold four 19-character values starting at column 4.
const GAL_FIELDS = [
  [0, 1, "af0", "SV clock bias (af0)", "s"],
  [0, 2, "af1", "SV clock drift (af1)", "s/s"],
  [0, 3, "af2", "SV clock drift rate (af2)", "s/s²"],
  [1, 0, "iodnav", "IODnav", ""],
  [1, 1, "crs", "Crs", "m"],
  [1, 2, "deltaN", "Δn", "rad/s"],
  [1, 3, "m0", "M0", "rad"],
  [2, 0, "cuc", "Cuc", "rad"],
  [2, 1, "e", "Eccentricity e", ""],
  [2, 2, "cus", "Cus", "rad"],
  [2, 3, "sqrtA", "√A", "√m"],
  [3, 0, "toe", "Toe", "s of week"],
  [3, 1, "cic", "Cic", "rad"],
  [3, 2, "omega0", "Ω0", "rad"],
  [3, 3, "cis", "Cis", "rad"],
  [4, 0, "i0", "i0", "rad"],
  [4, 1, "crc", "Crc", "m"],
  [4, 2, "omega", "ω (argument of perigee)", "rad"],
  [4, 3, "omegaDot", "Ω̇ (OMEGA DOT)", "rad/s"],
  [5, 0, "idot", "IDOT", "rad/s"],
  [5, 1, "dataSources", "Data sources", ""],
  [5, 2, "week", "GAL week", ""],
  [5, 3, "spare5", "Spare", ""],
  [6, 0, "sisa", "SISA", "m"],
  [6, 1, "health", "SV health", ""],
  [6, 2, "bgdE5a", "BGD E5a/E1", "s"],
  [6, 3, "bgdE5b", "BGD E5b/E1", "s"],
  [7, 0, "ttom", "Transmission time", "s of week"],
  [7, 1, "spare7a", "Spare", ""],
  [7, 2, "spare7b", "Spare", ""],
  [7, 3, "spare7c", "Spare", ""],
];

/* ---------- parsing ---------- */

const num = (s) => {
  const t = s.trim().replace(/[dD]/, "e");
  return t === "" ? null : Number(t);
};

function slotColumn(line, slot) {
  return line === 0 ? 23 + 19 * (slot - 1) : 4 + 19 * slot;
}

function parseHeader(lines) {
  const h = { lines: [], comments: [], ionoGal: null, timeCorr: [], leap: null };
  for (const raw of lines) {
    const label = raw.slice(60).trim(), body = raw.slice(0, 60);
    h.lines.push({ text: raw, label });
    if (label === "RINEX VERSION / TYPE") {
      h.version = body.slice(0, 9).trim();
      h.fileType = body.slice(20, 21);
      h.system = body.slice(40, 41);
    } else if (label === "PGM / RUN BY / DATE") {
      h.program = body.slice(0, 20).trim();
      h.runBy = body.slice(20, 40).trim();
      h.date = body.slice(40, 60).trim();
    } else if (label === "COMMENT") h.comments.push(body.trim());
    else if (label === "IONOSPHERIC CORR" && body.startsWith("GAL"))
      h.ionoGal = [5, 17, 29].map((c) => num(body.slice(c, c + 12)));
    else if (label === "TIME SYSTEM CORR")
      h.timeCorr.push({ type: body.slice(0, 4).trim(), a0: num(body.slice(5, 22)), a1: num(body.slice(22, 38)), t: num(body.slice(38, 45)), w: num(body.slice(45, 50)) });
    else if (label === "LEAP SECONDS")
      h.leap = { now: num(body.slice(0, 6)), future: num(body.slice(6, 12)), week: num(body.slice(12, 18)), day: num(body.slice(18, 24)) };
  }
  return h;
}

// Returns { header, records, skipped: {system: count}, errors: [{line, why, text}] }.
// A record starts on a line whose first character is not a space.
function parseNav(text) {
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((l) => l.slice(60).trim() === "END OF HEADER");
  const header = parseHeader(end >= 0 ? lines.slice(0, end) : []);
  const records = [], skipped = {}, errors = [];
  let i = end + 1;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const start = i++;
    while (i < lines.length && /^ /.test(lines[i]) && lines[i].trim()) i++;
    const block = lines.slice(start, i);
    const sys = block[0][0];
    if (sys !== "E") { skipped[sys] = (skipped[sys] || 0) + 1; continue; }
    try { records.push(parseGalRecord(block, start + 1)); }
    catch (e) { errors.push({ line: start + 1, why: e.message, text: block[0] }); }
  }
  return { header, records, skipped, errors };
}

function parseGalRecord(block, lineNo) {
  if (block.length < 8) throw new Error(`record has ${block.length} lines, expected 8`);
  const l0 = block[0];
  const m = l0.slice(0, 23).match(/^E(\d\d) (\d{4}) (\d\d) (\d\d) (\d\d) (\d\d) (\d\d)$/);
  if (!m) throw new Error("cannot read satellite and epoch");
  const [, prn, Y, M, D, h, mi, s] = m.map(Number);
  const rec = { sv: l0.slice(0, 3), prn, line: lineNo, lines: block.slice(0, 8), v: {}, fields: [] };
  rec.toc = new Date(Date.UTC(Y, M - 1, D, h, mi, s)); // GST, kept in a UTC Date for arithmetic
  rec.fields.push({ key: "sv", name: "Satellite", unit: "", line: 0, col: 0, len: 3, text: l0.slice(0, 3), value: prn });
  rec.fields.push({ key: "toc", name: "Toc (clock reference time)", unit: "GST", line: 0, col: 4, len: 19, text: l0.slice(4, 23), value: rec.toc });
  for (const [ln, slot, key, name, unit] of GAL_FIELDS) {
    const col = slotColumn(ln, slot), text = block[ln].slice(col, col + 19);
    const value = num(text);
    if (value === null && !key.startsWith("spare")) throw new Error(`${name} is blank`);
    rec.v[key] = value;
    rec.fields.push({ key, name, unit, line: ln, col, len: 19, text, value });
  }
  rec.v.dataSources = Math.round(rec.v.dataSources);
  rec.v.health = Math.round(rec.v.health);
  rec.source = navSource(rec.v.dataSources);
  rec.tocGst = gstTime(rec.toc);
  return rec;
}

/* ---------- flag fields ---------- */

const DATA_SOURCE_BITS = [
  [0, "I/NAV E1-B"], [1, "F/NAV E5a-I"], [2, "I/NAV E5b-I"], [3, "reserved"], [4, "reserved"],
  [5, "reserved"], [6, "reserved"], [7, "reserved"],
  [8, "clock for E5a,E1"], [9, "clock for E5b,E1"],
];

function navSource(ds) {
  if (ds & 2) return "F/NAV";
  if (ds & 5) return "I/NAV";
  return "?";
}

function dataSourcesText(ds) {
  const got = [];
  if (ds & 1) got.push("E1-B");
  if (ds & 4) got.push("E5b-I");
  let s = ds & 2 ? "F/NAV from E5a-I" : got.length ? `I/NAV from ${got.join(" + ")}` : "no signal bit set";
  if (ds & 256) s += "; af0–af2, Toc and SISA are for the E5a,E1 pair";
  if (ds & 512) s += "; af0–af2, Toc and SISA are for the E5b,E1 pair";
  return s;
}

// RINEX 3.04: bit 0 E1-B DVS, bits 1-2 E1-B HS, bit 3 E5a DVS, bits 4-5 E5a HS,
// bit 6 E5b DVS, bits 7-8 E5b HS.
const HEALTH_BITS = [
  [0, "E1-B DVS"], [1, "E1-B HS bit 0"], [2, "E1-B HS bit 1"],
  [3, "E5a DVS"], [4, "E5a HS bit 0"], [5, "E5a HS bit 1"],
  [6, "E5b DVS"], [7, "E5b HS bit 0"], [8, "E5b HS bit 1"],
];
const HS_TEXT = ["signal OK", "signal out of service", "signal will be out of service", "signal component in test"];
const DVS_TEXT = ["navigation data valid", "working without guarantee"];

// Per-signal health. Only the signals this message type describes are listed.
function healthSignals(health, ds) {
  const sig = [];
  const add = (name, base) => sig.push({ name, dvs: (health >> base) & 1, hs: (health >> (base + 1)) & 3 });
  if (ds & 2) add("E5a", 3);
  else { if (ds & 1) add("E1-B", 0); if (ds & 4) add("E5b", 6); if (!(ds & 5)) { add("E1-B", 0); add("E5a", 3); add("E5b", 6); } }
  return sig;
}
function healthy(rec) {
  return healthSignals(rec.v.health, rec.v.dataSources).every((s) => s.hs === 0 && s.dvs === 0);
}
function healthText(health, ds) {
  return healthSignals(health, ds).map((s) => `${s.name}: ${HS_TEXT[s.hs]}, ${DVS_TEXT[s.dvs]}`).join("; ");
}

/* ---------- time ---------- */

const GST_EPOCH = Date.UTC(1980, 0, 6); // RINEX Galileo weeks are aligned with GPS weeks

function gstTime(date) {
  const sec = (date.getTime() - GST_EPOCH) / 1000;
  const week = Math.floor(sec / 604800);
  return { week, tow: sec - week * 604800 };
}
function gstDate(week, tow) {
  return new Date(GST_EPOCH + (week * 604800 + tow) * 1000);
}
function wrapWeek(dt) {
  if (dt > 302400) return dt - 604800;
  if (dt < -302400) return dt + 604800;
  return dt;
}

/* ---------- ephemeris maths (Galileo OS SIS ICD, 5.1.1 and 5.1.4) ---------- */

const MU = 3.986004418e14;      // m³/s²
const OMEGA_E = 7.2921151467e-5; // rad/s
const F_REL = -4.442807309e-10;  // s/√m

function eccentricAnomaly(M, e) {
  let E = M;
  for (let k = 0; k < 30; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

// Satellite ECEF position (m) at GST time-of-week t, plus intermediate terms.
function satPosition(v, t) {
  const A = v.sqrtA * v.sqrtA;
  const tk = wrapWeek(t - v.toe);
  const n = Math.sqrt(MU / (A * A * A)) + v.deltaN;
  const M = v.m0 + n * tk;
  const E = eccentricAnomaly(M, v.e);
  const nu = Math.atan2(Math.sqrt(1 - v.e * v.e) * Math.sin(E), Math.cos(E) - v.e);
  const phi = nu + v.omega;
  const s2 = Math.sin(2 * phi), c2 = Math.cos(2 * phi);
  const u = phi + v.cus * s2 + v.cuc * c2;
  const r = A * (1 - v.e * Math.cos(E)) + v.crs * s2 + v.crc * c2;
  const i = v.i0 + v.cis * s2 + v.cic * c2 + v.idot * tk;
  const xp = r * Math.cos(u), yp = r * Math.sin(u);
  const W = v.omega0 + (v.omegaDot - OMEGA_E) * tk - OMEGA_E * v.toe;
  return {
    x: xp * Math.cos(W) - yp * Math.cos(i) * Math.sin(W),
    y: xp * Math.sin(W) + yp * Math.cos(i) * Math.cos(W),
    z: yp * Math.sin(i),
    tk, E, r, A,
  };
}

// SV clock offset (s) at GST time-of-week t: polynomial plus relativistic term.
function clockOffset(v, tocTow, t) {
  const dt = wrapWeek(t - tocTow);
  const E = satPosition(v, t).E;
  const rel = F_REL * v.e * v.sqrtA * Math.sin(E);
  return { poly: v.af0 + v.af1 * dt + v.af2 * dt * dt, rel };
}

// WGS84 geodetic latitude/longitude (deg) and height (m).
function ecefToGeodetic(x, y, z) {
  const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - e2)), h = 0;
  for (let k = 0; k < 10; k++) {
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    h = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - e2 * N / (N + h)));
  }
  return { lat: lat * 180 / Math.PI, lon: Math.atan2(y, x) * 180 / Math.PI, h };
}

// One namespace object: a global in the browser, the module export in Node.
const nav = {
  GAL_FIELDS, DATA_SOURCE_BITS, HEALTH_BITS, HS_TEXT, DVS_TEXT,
  parseNav, parseGalRecord, navSource, dataSourcesText, healthSignals, healthy, healthText,
  gstTime, gstDate, wrapWeek, satPosition, clockOffset, ecefToGeodetic,
};
if (typeof module !== "undefined") module.exports = nav;
