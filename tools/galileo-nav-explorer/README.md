# Galileo Navigation Explorer

Open a RINEX 3 navigation file and inspect every Galileo I/NAV and F/NAV record: each value in the file explained, data-source and health bits decoded, changes since the previous record of the same satellite and message, and the satellite position and clock computed from the ephemeris. Runs in the browser; files are never uploaded.

Served at `/tools/galileo-nav-explorer/`. No build step: Jekyll copies this folder as-is because the files have no front matter.

| File | Purpose |
|---|---|
| `index.html` | markup and styles |
| `app.js` | UI |
| `rinex-nav.js` | RINEX 3 Galileo record parser and ephemeris maths (also usable from Node) |
| `galnav.js` | `node galnav.js FILE...` prints one TSV line per Galileo record |
| `sample.26l` | NGS CORS AL50, 2026-10-03, behind "Load sample" |

To try it locally: `python3 -m http.server` in this folder, then open http://localhost:8000 (the sample is fetched, so `file://` won't load it).

References: RINEX 3.04 Table A8; Galileo OS SIS ICD section 5.1.
