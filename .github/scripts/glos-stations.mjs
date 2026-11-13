// Builds the station list for the app's live readings (spot cards, spot Live
// tab, Buoys → Live): every Great Lakes buoy and lakefront station in GLOS
// Seagull (https://seagull.glos.org), with which of its parameter ids carry the
// readings the app shows. GLOS's own catalogue is several MB (the parameter
// list alone is ~3.6 MB), too much for phones; the app then fetches only the
// live values (api/v2/obs-latest, ~350 KB) and maps them with this file.
//
// It also lists the lakefront wind stations GLOS doesn't carry (`nws`): NOAA's
// fixed stations on the Great Lakes shoreline (NDBC's activestations.xml, which
// sends no CORS headers) whose weather.gov reports include wind. The app reads
// their observations from weather.gov.
//
// Usage: node glos-stations.mjs <outDir>   → <outDir>/glos/stations.json

const API = 'https://seagull-api.glos.org/api/';
const UA = { 'User-Agent': 'lakes-surf (github.com/ekrienik/lakes-surf)' };

// App variable → GLOS standard names, best first
const VARS = {
  wave_height: ['sea_surface_wave_significant_height'],
  dominant_wave_period: ['sea_surface_wave_period_at_variance_spectral_density_maximum'],
  wave_period: ['sea_surface_wave_mean_period', 'sea_surface_wave_significant_period'],
  mean_wave_direction: ['sea_surface_wave_from_direction', 'sea_surface_wave_from_direction_at_variance_spectral_density_maximum'],
  wind_speed: ['wind_speed'],
  wind_gust: ['wind_speed_of_gust'],
  wind_direction: ['wind_from_direction'],
  water_temp: ['sea_water_temperature'],
  air_temp: ['air_temperature']
};
// GLOS files some inland lakes and rivers under the Great Lakes
const INLAND = /winnebago|neenah|muskegon lake|macatawa|river|creek|wild mile|glamr/i;

export function build(summaries, params) {
  const byPlatform = new Map();
  for (const p of params) {
    if (p.public === false) continue;
    if (!byPlatform.has(p.platform_id)) byPlatform.set(p.platform_id, []);
    byPlatform.get(p.platform_id).push(p);
  }
  const stations = [];
  for (const d of summaries) {
    const plat = d.obs_dataset_platform_assignment && d.obs_dataset_platform_assignment.platform;
    const site = d.deployment_site;
    if (!plat || !site || site.latitude == null || d.public === false) continue;
    if (plat.platform_type === 'sampling_location' || INLAND.test(d.platform_name || '')) continue;
    if (/prior (platform|deployment)/i.test(d.platform_name || '')) continue; // a buoy's earlier deployment
    const event = plat.platform_event && plat.platform_event.event;
    if (event === 'decommissioned') continue;
    const ps = byPlatform.get(plat.platform_id) || [];
    const p = {};
    for (const [v, names] of Object.entries(VARS)) {
      for (const n of names) {
        // Several depths (water temp): the one nearest the surface
        const hit = ps.filter(x => x.standard_name === n)
          .sort((a, b) => (a.depth || 0) - (b.depth || 0))[0];
        if (hit) { p[v] = hit.parameter_id; break; }
      }
    }
    if (!Object.keys(p).length) continue;
    const code = String(d.org_platform_id || ''), raw = d.platform_name || code;
    stations.push({
      d: d.obs_dataset_id,
      // NOAA's number when it has one (45214 for the South Michigan Spotter)
      id: String(d.ndbc_id || code || d.obs_dataset_id).replace(/^NDBC_?/i, ''),
      // "CHII2 Harrison-Denver Crib, Chicago, IL" → drop the leading code
      name: (code && raw.startsWith(code + ' ') ? raw.slice(code.length + 1) : raw).trim(),
      lat: +(+site.latitude).toFixed(4), lon: +(+site.longitude).toFixed(4),
      lake: (site.body_of_water || '').replace(/^lake-/, ''),
      type: plat.platform_type,
      out: event === 'recovered',
      p
    });
  }
  return stations;
}

// NDBC's station list: fixed stations with weather sensors on the Great Lakes
// shoreline (within 3 km of great-lakes.json's outline; that drops the St.
// Lawrence and Niagara rivers), minus those GLOS has running. Buoys are left to GLOS.
const SHORE_KM = 3;
export function nwsCandidates(xml, rings, glosIds) {
  // Distance to the outline's edges (straight shores have vertices miles apart)
  const kmTo = (lat, lon) => {
    let best = Infinity;
    const cos = Math.cos(lat * Math.PI / 180);
    for (const r of rings) for (let i = 1; i < r.length; i++) {
      const ax = (r[i - 1][0] - lon) * cos, ay = r[i - 1][1] - lat, bx = (r[i][0] - lon) * cos, by = r[i][1] - lat;
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy) * 111.2;
      if (d < best) best = d;
    }
    return best;
  };
  const out = [];
  for (const m of xml.matchAll(/<station ([^>]*)\/?>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(x => [x[1], x[2]]));
    const id = (a.id || '').toUpperCase(), lat = +a.lat, lon = +a.lon;
    if (a.met !== 'y' || a.type === 'buoy' || /^\d+$/.test(id) || glosIds.has(id)) continue;
    if (!(lat > 40.9 && lat < 49.2 && lon > -92.6 && lon < -75.4) || kmTo(lat, lon) > SHORE_KM) continue;
    // "9087044 - Calumet Harbor, IL" → "Calumet Harbor, IL"
    const name = (a.name || id).replace(/^\d+ - /, '').trim();
    out.push({ id, name, lat: +lat.toFixed(4), lon: +lon.toFixed(4) });
  }
  return out;
}
// Kept only if a weather.gov report in the last ~6 h has a wind speed (some
// stations, e.g. the Harrison-Dever Crib, report none there)
async function hasWind(id) {
  try {
    const r = await fetch(`https://api.weather.gov/stations/${id}/observations?limit=24`, { headers: { ...UA, Accept: 'application/geo+json' } });
    if (!r.ok) return false;
    const j = await r.json();
    return (j.features || []).some(f => f.properties && f.properties.windSpeed && f.properties.windSpeed.value != null);
  } catch (e) { return false; }
}

async function main(outDir) {
  const { mkdir, writeFile, readFile } = await import('node:fs/promises');
  const get = async (path) => {
    const r = await fetch(API + path, { headers: UA });
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return r.json();
  };
  const [summaries, params] = await Promise.all([get('v1/obs-dataset-summaries'), get('v1/parameters')]);
  const stations = build(summaries, params);
  if (stations.length < 50) throw new Error(`only ${stations.length} stations`);

  let nws = [];
  try {
    const xml = await (await fetch('https://www.ndbc.noaa.gov/activestations.xml', { headers: UA })).text();
    const rings = JSON.parse(await readFile(new URL('../../great-lakes.json', import.meta.url), 'utf8'));
    // GLOS stations it lists as recovered may still report through weather.gov
    const cands = nwsCandidates(xml, rings, new Set(stations.filter(s => !s.out).map(s => s.id.toUpperCase())));
    // A few at a time, to be gentle on weather.gov
    for (let i = 0; i < cands.length; i += 6) {
      const batch = cands.slice(i, i + 6);
      const ok = await Promise.all(batch.map(c => hasWind(c.id)));
      nws.push(...batch.filter((c, k) => ok[k]));
    }
    console.log(`${nws.length}/${cands.length} weather.gov lakefront stations with wind`);
  } catch (e) {
    console.warn('weather.gov lakefront stations:', e.message);
  }

  await mkdir(`${outDir}/glos`, { recursive: true });
  // NDBC or weather.gov down: keep the last good lakefront list
  if (!nws.length) {
    try { nws = JSON.parse(await readFile(`${outDir}/glos/stations.json`, 'utf8')).nws || []; } catch (e) {}
  }
  await writeFile(`${outDir}/glos/stations.json`, JSON.stringify({ updated: Math.round(Date.now() / 1000), stations, nws }));
  console.log(`${stations.length} stations written`);
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('glos-stations.mjs')) {
  main(process.argv[2] || 'out').catch(e => { console.error(e.message); process.exit(1); });
}
