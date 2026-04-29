# Lakes Surf — Great Lakes Surf Forecast PWA

A progressive web app for Great Lakes surfing. Uses the same NOAA forecast feed as weather.gov/greatlakes, but lets you save spots, see a 7-day hourly outlook, and color-code conditions like Surfline.

## What's in this folder

- `index.html` — the entire app (open this in any browser)
- `manifest.json` — tells iOS/Android this is an installable app
- `service-worker.js` — caches the app shell so it opens offline
- `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` — home-screen icons
- `README.md` — this file

You don't need to edit any of these. Just deploy them.

---

## Quick test (no deployment yet)

Open `index.html` directly in your computer's browser by double-clicking it. The app will work, but **it won't install as a PWA** until it's hosted over HTTPS. You'll see the spots/map/settings UI and forecast data should load if you're online.

> Note: When opened from a `file://` path, browsers block service workers, so install-to-home-screen won't work yet. That's what hosting is for.

---

## Deploy to your iPhone (GitHub Pages — free, ~10 minutes)

GitHub Pages is the easiest way to host a PWA for free with HTTPS (required for "Add to Home Screen").

### One-time setup

1. **Make a free GitHub account** at https://github.com/signup (skip if you have one).
2. **Install GitHub Desktop** at https://desktop.github.com — it's the easiest way to publish without using the command line.
3. **Sign into GitHub Desktop** with your account.

### Publish the app

1. In GitHub Desktop: **File → Add Local Repository** and pick this folder (`Surfing App`).
2. It'll say *"This directory does not appear to be a Git repository."* Click **"create a repository"** in the message.
3. Give it a name like `lakes-surf` (this becomes part of your URL). Description optional. Click **Create repository**.
4. Click **Publish repository** at the top. Uncheck *"Keep this code private"* (Pages requires public repos on free accounts). Click **Publish**.
5. Click **View on GitHub** to open your repo in the browser.
6. On the GitHub page, click **Settings** (top-right of the repo header) → **Pages** in the left sidebar.
7. Under *"Build and deployment" → "Source"*, choose **Deploy from a branch**.
8. Under *"Branch"*, pick **main** (or `master`) and folder **/ (root)**, then click **Save**.
9. Wait ~1 minute. The Pages page will show a green checkmark and your URL: `https://YOUR-USERNAME.github.io/lakes-surf/`

### Add to iPhone home screen

1. On your iPhone, open **Safari** (must be Safari — Chrome on iOS can't install PWAs).
2. Go to your URL: `https://YOUR-USERNAME.github.io/lakes-surf/`
3. Tap the **Share** icon (square with up-arrow) at the bottom.
4. Scroll down and tap **Add to Home Screen**.
5. Tap **Add**. The app icon appears on your home screen — tap it to launch full-screen, no Safari chrome.

That's it. From now on it behaves like a native app.

---

## Updating the app later

When you (or I) change any file:

1. In GitHub Desktop, you'll see the changed files in the left panel.
2. Type a short message ("update rating logic"), click **Commit to main**.
3. Click **Push origin** at the top.
4. GitHub Pages redeploys in ~30s. On your iPhone, close and reopen the app — the service worker will pull in the new version on next launch (sometimes takes a second open).

---

## How the app works

### Spots tab
Tap a spot to see its 7-day forecast. The colored chip shows current rating. The 7-day strip shows the best rating per day at a glance.

### Map tab
Tap anywhere on the Great Lakes (or anywhere with NOAA coverage, really) to drop a pin. Tap **Add this point** to save it as a named spot.

### Forecast view
Day tabs across the top, each colored by best rating that day. Tap a day to see the hourly breakdown. The colored bar on the left of each row indicates that hour's rating. Columns:
- **Wave** — significant wave height
- **Per** — wave period (seconds; longer = better)
- **Wind / Gust / Dir** — wind speed, gust, and compass direction (where it's coming from)
- **Power** — wave power index (height² × period). Like Windy's wave power; bigger numbers = more energy.
- **Air** — air temperature
- **Rain** — chance of precipitation

Tap **Edit** in the header to set the spot's offshore wind directions (the directions wind should come *from* for clean surf). Adding offshore directions makes the rating bump up when wind is offshore and bumps down when it's onshore.

### Settings tab
- **Default thresholds** — applied to new spots. Each spot can override these from its forecast view.
- **Units** — feet/meters, mph/kt/km/h, °F/°C
- **Export / Import / Clear** — back up your spots to a JSON file

### Rating logic (smart defaults)
- **Wave size**: ideal 3–6 ft, falls off below and above
- **Period**: longer = better (4s minimum decent, 6s+ great)
- **Wind**: light is best (≤10 mph); ≥25 mph = blown out
- **Offshore bonus**: if you set offshore directions for a spot, wind from those gets a boost; opposite (onshore) gets a penalty
- Five buckets: 🔴 Poor → 🟠 Fair → 🟡 OK → 🟢 Good → 💚 Epic

All thresholds are editable per spot.

---

## Data source & coverage

Forecasts come from **NOAA's `api.weather.gov`** — the same feed weather.gov/greatlakes uses. It's free, no key required, no rate limits for personal use, and CORS-enabled (works directly from your browser).

**Coverage**: U.S. Great Lakes. Canadian-side points may not return wave data since NOAA's grid stops at the U.S. border. Lake Superior, Michigan, Huron (U.S. side), Erie (U.S. side), and Ontario (U.S. side) all work.

If a point fails to load, try moving it slightly offshore — sometimes near-shore grid cells lack marine fields.

---

## Troubleshooting

**"Couldn't load forecast"** — Either you're offline, the point is outside NOAA U.S. coverage, or NOAA's API is having a moment (it occasionally throttles; reopening the spot usually works).

**Doesn't install on iPhone** — Make sure you're using **Safari**, not Chrome. The site must be HTTPS (GitHub Pages handles this).

**App opens stale data** — The app caches the shell (HTML/CSS/JS) for offline use, but forecasts are always fetched fresh from NOAA when online. If the UI itself looks stale after an update, force-quit the app and reopen.

**Want to share it** — The URL is public (it's on GitHub Pages). Send it to surfing buddies and they can add it to their home screens too.

---

## Future ideas

Things we deliberately left out of v1 but could add later:
- Buoy observations (real-time conditions from NOAA NDBC buoys)
- Push notifications when a saved spot hits a target rating
- Wave power chart over time
- Sunrise/sunset overlay on the hourly table
- Multiple wave components (primary swell + wind chop separately)
- Tide info (limited in Great Lakes, but seiches & lake levels exist)

If any of these matter to you, just ask.
