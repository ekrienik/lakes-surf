# Lakes Surf — notes for Claude Code

Great Lakes surf-forecast PWA. One file does everything: `index.html` (HTML + CSS + ~3,400 lines of inline JS). No build step, no framework, no backend. Hosted on GitHub Pages from `main`; installed as a PWA on phones.

## Release checklist (every change)

1. Bump the version: `const CACHE = 'lakes-surf-v5_11_14';` in `service-worker.js` → next number. Nothing else carries the version.
2. Syntax-check the inline script before committing (there is no linter in the repo):
   ```bash
   python3 -c "import re;s=open('index.html',encoding='utf-8').read();open('/tmp/inline.js','w').write('\n'.join(re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>',s,re.S)))" && node --check /tmp/inline.js && node --check service-worker.js
   ```
3. Smoke-test in a headless browser if the change touches rendering (Playwright is fine; mock the external APIs, they're all blocked/flaky from sandboxes).
4. Commit as `vX.Y.Z` and push `main`. The old Evanston cam ID `qv5XF6USv7M` must appear only in the `loadState()` migration and `CAM_NO_EMBED`.

Line endings: the working copy on Windows is CRLF; `.gitattributes` has `* text=auto`, so git normalizes to LF. Don't fight it.

## Code map (`index.html`, line numbers approximate)

| Area | Where |
|---|---|
| Tabs/views: `view-spots`, `view-forecast`, `view-map`, `view-settings` | markup ~370–520, `switchView()` ~884 |
| Constants: `NOAA_BASE`, `MESOWEST_BASE` + public token, `STORAGE_KEY='lakesurf-v1'` | ~610–630 |
| `POPULAR_SPOTS` (built-in spots, ids `pop_*`) | ~640 |
| `loadState()` — localStorage + migrations (cam URL swap, coord fixes via `COORD_MIGRATIONS`, camAlt/camLabel backfill) | ~655 |
| `getForecast(lat, lon)` — NOAA `api.weather.gov` points → gridpoints, hourly series | ~977 |
| Live obs: `fetchAllLakeStations()`, `dedupeByStation()`, `getNearestStationForSpot()`, `getNearestWaveBuoyForSpot()`, `extractObs()` | ~1120–1260 |
| `rateHour()` — rating 1–5 from wave/period/wind + offshore dirs | ~1373 |
| Spots tab: `renderSpots()` (edit mode has Delete buttons), `loadLiveForSpotCard()` | ~1453 |
| Live charts: `fetchWaveTimeseries()`, `makeLineChart()` (dir-arrow row, touch readout), `attachChartReadouts()`, `renderLiveCharts()` | ~1620–1870 |
| Forecast page: `openForecast()`, water quality card, `renderCamSection()` | ~1879–2080 |
| Map tab: NDFD WMS overlay, time slider, wind arrows, spot pins, drop pin | ~2640–3100 |
| Add/edit spot modal (new spots pre-fill offshore dirs from the shoreline via `guessOffshoreDirs()`; never overwrite saved or built-in dirs, they're hand-tuned), settings, SW registration | end of file |

## External data (all called straight from the browser, no keys except the app's own Synoptic public token, `MESOWEST_TOKEN`; the private API key that generates it is never in the repo)

- **Forecast**: NOAA `api.weather.gov/points/{lat},{lon}` → `forecastGridData`. A coordinate on land gets a grid cell with no wave data, so built-in spots sit a few hundred metres offshore (e.g. Bradford Beach is at `-87.866`, not the beach's `-87.873`). When adding a spot, probe the gridpoint and check `waveHeight.values` isn't a single `0`. User-added spots do this automatically on save (`findForecastPoint()`): if the pin's cell has no waves, the forecast comes from a point stepped out into the lake, stored as `spot.fcLat/fcLon` while `lat/lon` stays the pin; always fetch forecasts via `forecastLatLon(spot)`.
- **Live obs**: Synoptic/Mesowest `latest` + `timeseries`. The `latest` search area is `stationsBbox()`: the saved spots plus 60 mi, so any Great Lake works (all five lakes at once is ~2,300 stations / ~2 MB per refresh, too heavy; `LAKE_MI_BBOX` is only the no-spots fallback). Quirk: most Lake Michigan buoys are listed twice (`45186` and `NDBC45186`); only the NDBC listing has `mean_wave_direction`/`dominant_wave_period`. `dedupeByStation()` merges listings (richest = base STID). Many buoys are pulled out of the water Nov–Apr.
- **Map heat map**: NOAA NDFD WMS, same layers as weather.gov/greatlakes. Image overlay, one request per frame:
  `https://digital.weather.gov/ndfd/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=TRUE&EXCEPTIONS=INIMAGE&STYLES=&REGION=conus&CRS=EPSG:3857&LAYERS=ndfd.conus.{waveheight|windspd|windgust}&VTIT={valid}_{issuance}&BBOX={EPSG:3857}&WIDTH=..&HEIGHT=..`
  Valid times come from `https://www.weather.gov/source/dlh/ndfd_times.json` (CORS `*`); never invent a VTIT — unknown times silently return a default map. Legend: `digital.weather.gov/scripts/wxmap_legendImage.php?dataset=ndfd&element=..&ms=english|nautical|metric&...`. The WMS has no CORS, so it only works as `<img>`, never `fetch()`. `ndfd.conus.windspd.windbarbs` exists but draws on an opaque grey background — unusable.
- **Wind/gust layers on the map**: drawn locally (not NDFD) as a Windfinder-style color field + animated streaks on canvases in a `windPane`, from Open-Meteo (CORS open, multi-point): `api.open-meteo.com/v1/forecast?latitude=a,b,..&longitude=..&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&forecast_days=7&wind_speed_unit=mph&timezone=UTC&timeformat=unixtime` on the 0.5° `WIND_GRID` (684 points, fetched in chunks of 240, cached 1 h). See `loadWindGrid()`, `windRedraw()`, `windStep()`. Colors are clipped to the lakes using `great-lakes.json` (Natural Earth 10m lakes v5.1.2, public domain, Douglas-Peucker simplified to 0.005°, coords rounded to 3 dp; array of `[lon,lat]` rings incl. islands, drawn with even-odd fill). It's in the service worker's `SHELL` list.
- **Map source switch**: one Smooth / NOAA switch for all three layers, `state.mapSource` (`'blend'` default / `'noaa'`; falls back to the older wave-only `state.waveMapSource`). Smooth = canvas fields from Open-Meteo: wind grid above, and waves from Open-Meteo marine `marine-api.open-meteo.com/v1/marine?...&hourly=wave_height,wave_direction` on `WAVE_GRID` (1/4° × 1/3°, only points in a lake or nearest its shore, ~490 points), with streaks kept to the water that move at the deep-water crest speed g·T/2π from `wave_period` (also fetched; `WAVE_STREAK_SPEED` is only the fallback when period is missing). NOAA = the NDFD WMS images (wave, windspd, windgust). Colors: `WAVE_STOPS_FT` (NOAA's 1-ft wave bands, used banded for NOAA and blended for Smooth), `NOAA_WIND_STOPS_MPH` (NOAA wind legend, transcribed by eye), `WIND_STOPS_KT` (Windfinder-style, Smooth wind). The legend (`fieldUpdateLegend()`) is drawn locally for every layer. Tap readouts: Smooth samples the grid (with direction); NOAA calls `getForecast()` for the tapped point (~2 s). Tapping again closes the reading (`closePopupOnClick: false` + own click handler).
- **Open-Meteo rate limits**: every grid point counts as an API call (free tier ≈ 10k/day, a few thousand per hour, per device). Grids go through `fetchJsonCached()` (Cache Storage `lakes-surf-data`, 1 h, survives SW version bumps) and load only when their layer is shown. Testing repeatedly from one machine can hit 429s. The wave layer is still the NDFD WMS. NOAA's NDFD point XML client is NOT CORS-open, don't try it.
- **Pin names**: a dropped pin's suggested name comes from OpenStreetMap Nominatim (`suggestSpotName()`): nearest named beach ≤1.6 km, else park ≤1 km, else town. Plain reverse geocoding returns roads/footpaths. Max 1 request/s (usage policy). Overpass was too slow (15 s timeouts); Google needs a billed key and its terms forbid showing its data on OSM maps.
- **Water quality**: Chicago Data Portal `2ivx-z93u` (Chicago Park District beaches only, Memorial Day–Labor Day). Grade only shown when the sample is ≤24 h old.
- **Water temp fallback**: NWS OMR bulletins via api.weather.gov products.
- **Basemap**: OpenStreetMap tiles everywhere (Map tab and both spot mini-maps). CARTO basemaps now show an "API KEY REQUIRED" watermark; don't reintroduce them.
- **Cams**: YouTube IDs via `extractYouTubeId()` (handles watch/embed/v/live/shorts/youtu.be). `CAM_NO_EMBED` lists IDs whose owners block iframes (open in new tab instead). Evanston Dempster St is `live/xrqe-P1uT_I`, backup webcamtaxi link in `camAlt`.

## Conventions

- Units live in `state.units` (`wave` ft/m, `wind` mph/kt/km/h, `temp` F/C); format with `fmtWave()/fmtWind()/fmtTemp()`. Internally waves are metres, wind km/h, from NOAA; Mesowest is requested in ft/mph.
- `dirArrow(deg)` draws a FROM-direction arrow pointing where the wind/swell goes (rotates deg+180).
- Spot ids: saved `sp_xxxx`, built-ins keep `builtinId: 'pop_*'` so migrations can find them.
- External links get `rel="noopener"`. All user/station strings go through `escapeHtml()`.
- Service worker: cross-origin requests are never intercepted; the page is network-first, other shell files cache-first. It was silently broken (missing `});`) before v5.11.14 — if PWA updates seem stuck, check it parses.

## Testing tips

- Playwright headless works well: route `unpkg.com/leaflet*` to a local copy, mock `api.weather.gov/points` + `gridpoints`, `mesowest`, `open-meteo`, `ndfd_times.json`, and return a 1×1 PNG for tile/WMS hosts. Use an iPhone device profile for touch tests (chart readout uses touch events).
- To force a forecast page: `state.spots=[...]; saveState(); openForecast(id)`. To force the map: `switchView('map')`.
