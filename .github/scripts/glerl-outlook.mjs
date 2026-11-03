// Builds the data for the Map tab's Buoys view: NOAA GLERL's experimental
// point-based ensemble wave forecast (https://www.glerl.noaa.gov/emf/waves/WW3/?pg=xgb),
// trimmed to what the app charts. GLERL's site doesn't allow cross-site
// fetches and each buoy's chart file is ~590 KB, so this runs on GitHub
// Actions (.github/workflows/glerl-outlook.yml) and the app reads the small
// output files from the `data` branch via raw.githubusercontent.com.
//
// Usage: node glerl-outlook.mjs <outDir>   → <outDir>/glerl/index.json + <id>.json

const BASE = 'https://www.glerl.noaa.gov/emf/waves/WW3/';

// The page lists its buoys in an inline script:
//   45174: {desc: "Wilmette Buoy IL", coords: [42.135, -87.655], src: "xgb/fig/45174.json",},
export function parseStations(html) {
  const re = /(\d+): \{desc: "([^"]*)", coords: \[([-\d.]+), ([-\d.]+)\], src: "([^"]+)"/g;
  return [...html.matchAll(re)].map(m => ({ id: m[1], name: m[2].trim(), lat: +m[3], lon: +m[4], src: m[5] }));
}

// Plotly stores long arrays as base64 typed arrays ({dtype, bdata})
const DTYPES = { f8: ['getFloat64', 8], f4: ['getFloat32', 4], i4: ['getInt32', 4], u4: ['getUint32', 4],
  i2: ['getInt16', 2], u2: ['getUint16', 2], i1: ['getInt8', 1], u1: ['getUint8', 1] };
function decode(v) {
  if (Array.isArray(v)) return v;
  if (!v || !v.bdata || !DTYPES[v.dtype]) return [];
  const bytes = typeof Buffer !== 'undefined' ? Buffer.from(v.bdata, 'base64')
    : Uint8Array.from(atob(v.bdata), c => c.charCodeAt(0));
  const [fn, size] = DTYPES[v.dtype];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  for (let i = 0; i + size <= bytes.byteLength; i += size) out.push(view[fn](i, true));
  return out;
}
const round = (v) => (v == null || !Number.isFinite(v)) ? null : Math.round(v * 100) / 100;

// One buoy's chart → hourly series on the Average trace's times.
// Waves in feet, wind in mph (as GLERL plots them). Bands are drawn as a
// lower trace followed by the named, filled one; min/max sorts out which is which.
export function trim(fig) {
  const tr = fig.data || [];
  const named = (re) => tr.find(t => re.test(t.name || ''));
  const avg = tr.find(t => t.name === 'Average');
  const i90 = tr.findIndex(t => /^10.90 Pctl/.test(t.name || ''));
  const i75 = tr.findIndex(t => /^25.75 Pctl/.test(t.name || ''));
  if (!avg || i90 < 1 || i75 < 1) throw new Error('unexpected chart layout');
  const times = avg.x.map(s => Date.parse(s) / 1000);
  const series = (t) => {
    if (!t) return null;
    const ys = decode(t.y), byTime = new Map(t.x.map((x, i) => [Date.parse(x) / 1000, ys[i]]));
    return times.map(s => round(byTime.get(s)));
  };
  const pair = (lo, hi) => {
    const a = series(lo), b = series(hi);
    return [a.map((v, i) => v == null || b[i] == null ? null : Math.min(v, b[i])),
            a.map((v, i) => v == null || b[i] == null ? null : Math.max(v, b[i]))];
  };
  const [p10, p90] = pair(tr[i90 - 1], tr[i90]);
  const [p25, p75] = pair(tr[i75 - 1], tr[i75]);
  const step = times[1] - times[0];
  if (!(step > 0) || times.some((s, i) => i && s - times[i - 1] !== step)) throw new Error('uneven times');
  return {
    init: times[0], t0: times[0], step, n: times.length,
    wave: { avg: series(avg), p10, p25, p75, p90, xgb: series(named(/^XGBoost/)), ww3: series(named(/^WW3/)) },
    wind: { avg: series(tr.find(t => t.name === 'GEFS Avg' && t.type === 'bar')), hrrr: series(named(/^HRRR\+GFS/)) }
  };
}

async function main(outDir) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const get = async (url) => {
    const r = await fetch(url, { headers: { 'User-Agent': 'lakes-surf (github.com/ekrienik/lakes-surf)' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r;
  };
  const stations = parseStations(await (await get(BASE + '?pg=xgb')).text());
  if (!stations.length) throw new Error('no buoys found on the GLERL page');
  await mkdir(`${outDir}/glerl`, { recursive: true });
  const index = [];
  for (const s of stations) {
    try {
      const d = trim(await (await get(BASE + s.src)).json());
      const { src, ...meta } = s;
      await writeFile(`${outDir}/glerl/${s.id}.json`, JSON.stringify({ ...meta, ...d }));
      index.push({ ...meta, init: d.init });
    } catch (e) {
      console.warn(`${s.id}: ${e.message}`);
    }
  }
  // Mostly failed: keep the last good data on the branch rather than replace it
  if (index.length < stations.length / 2) throw new Error(`only ${index.length}/${stations.length} buoys loaded`);
  await writeFile(`${outDir}/glerl/index.json`, JSON.stringify({ updated: Math.round(Date.now() / 1000), stations: index }));
  console.log(`${index.length}/${stations.length} buoys written`);
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('glerl-outlook.mjs')) {
  main(process.argv[2] || 'out').catch(e => { console.error(e.message); process.exit(1); });
}
