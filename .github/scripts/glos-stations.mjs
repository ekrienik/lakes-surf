// Builds the station list for the app's live readings (spot cards, spot Live
// tab, Buoys → Live): every Great Lakes buoy and lakefront station in GLOS
// Seagull (https://seagull.glos.org), with which of its parameter ids carry the
// readings the app shows. GLOS's own catalogue is several MB (the parameter
// list alone is ~3.6 MB), too much for phones; the app then fetches only the
// live values (api/v2/obs-latest, ~350 KB) and maps them with this file.
//
// Usage: node glos-stations.mjs <outDir>   → <outDir>/glos/stations.json

const API = 'https://seagull-api.glos.org/api/';

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

async function main(outDir) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const get = async (path) => {
    const r = await fetch(API + path, { headers: { 'User-Agent': 'lakes-surf (github.com/ekrienik/lakes-surf)' } });
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return r.json();
  };
  const [summaries, params] = await Promise.all([get('v1/obs-dataset-summaries'), get('v1/parameters')]);
  const stations = build(summaries, params);
  if (stations.length < 50) throw new Error(`only ${stations.length} stations`);
  await mkdir(`${outDir}/glos`, { recursive: true });
  await writeFile(`${outDir}/glos/stations.json`, JSON.stringify({ updated: Math.round(Date.now() / 1000), stations }));
  console.log(`${stations.length} stations written`);
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('glos-stations.mjs')) {
  main(process.argv[2] || 'out').catch(e => { console.error(e.message); process.exit(1); });
}
