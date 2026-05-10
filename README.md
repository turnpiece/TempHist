# TempHist — Temperature History Visualisation

A web application that shows how today's temperature (or this week's, month's, or year's) compares to the same period across the past 50 years, for any supported location.

## Features

### Charts & data
- **50-year bar chart** — one bar per year for the current date, week, month, or year; bars are colour-coded by Z-score: red = warmer than average, blue = cooler, grey = near average; the current year is always highlighted in green
- **Four time-period views** — Today, Past Week, Past Month, Past Year
- **Summary text** — a natural-language sentence describing where this year sits relative to history (e.g. "This has been the warmest week ending 8th May since 2022")
- **Stats bubble** — mean temperature ± standard deviation and the long-term trend rate ± error margin (°C/decade), shown below the chart
- **Average & trend lines** — historical mean (grey) and long-term trend (yellow), both extending past the data range for clarity
- **Temperature anomaly tooltip** — hover any bar to see the year, temperature, and deviation from the period average

### Location
- **Automatic location detection** — GPS when permission is granted; falls back to IP geolocation, then manual selection
- **Location carousel** — curated list of global cities with location photographs, browsable on the splash screen
- **Country flag disambiguation** — flag emoji before the city name (e.g. 🇬🇧 Birmingham vs 🇺🇸 Birmingham), sourced from the preapproved locations list
- **Editable location heading** — tap/click the location name at the top of any view to change location
- **°C / °F toggle** — US locations default to Fahrenheit

### Sharing
- **Social sharing** — tap the share icon next to the period heading to generate a permanent snapshot URL
- **Open Graph previews** — server-side OG tag injection so shared links render correctly on social platforms

### UX
- Responsive layout — sidebar navigation on desktop, hamburger menu on mobile
- No layout shift — skeleton loader and inline background colour prevent FOUC and CLS
- Handles edge cases: leap years, sub-1 AM timezone boundary, incomplete current-year data

## Tech Stack

- **Frontend**: TypeScript, Chart.js
- **Build**: [Vite](https://vitejs.dev/)
- **Styles**: SCSS
- **Authentication**: Firebase Anonymous Auth
- **Testing**: Vitest with JSDOM
- **Backend**: Node.js / Express (proxy, OG tag injection, development mock data)
- **Data**: Historical weather data via the TempHist API (Visual Crossing source)
- **Hosting**: Static site — any Apache/Nginx host; currently SiteGround

## Setup

1. Clone the repository:

   ```bash
   git clone [repository-url]
   cd TempHist
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file:

   ```
   VITE_API_BASE=/api
   VITE_TEST_TOKEN=your_test_token_here
   API_BASE=http://localhost:8000
   ```

   `API_BASE` is the address of the [TempHist API](https://github.com/turnpiece/TempHist-API). With `http://localhost:8000` you'll need the API running locally — follow its setup instructions. Alternatively, point it at the dev or staging API to avoid running the API locally:

   ```
   API_BASE=https://devapi.temphist.com
   ```

4. Start the local dev server (in separate terminals):

   ```bash
   npm run dev          # Vite dev server — hot reload, no OG injection
   ```

   The app is available at `http://localhost:5173`.

### Choosing a local server

There are two ways to run the frontend locally, depending on what you're testing:

| Mode | Command | Port | Hot reload | API proxy | OG tag injection |
|---|---|---|---|---|---|
| **Dev (daily use)** | `npm run dev` | 5173 | ✅ | via Vite | ❌ |
| **Prod-like (OG testing)** | `npm run start:local` | 3000 | ❌ | ✅ | ✅ |

**`npm run dev`** — use this for everyday development, like if you're updating the styles or content. Vite serves source files directly and watches for changes: edits to `.scss` styles, TypeScript, or HTML are reflected in the browser instantly without a build step or page reload. API calls are proxied to `http://localhost:8000` automatically.

**`npm run start:local`** — use this when testing social sharing or OG image previews (e.g. Share to Notes in Safari). It serves the built `dist/` files, proxies `/api` to `localhost:8000`, and injects `og:image` / `og:title` tags server-side for `/s/:id` share URLs.

> **Note:** `npm run start:local` serves the last build. Run `npm run build` first if you've changed source files since the last build.

> **Note:** `npm start` runs `server.js`, the production server. It has no API proxy and is not suitable for local development.

To test OG sharing locally:

```bash
npm run build          # build latest source into dist/
npm run start:local    # serve on localhost:3000 with OG injection
# then visit http://localhost:3000/s/<share-id> in Safari and share
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE` | Yes | API base URL. Dev: `/api` (relative — proxied by Vite or `server-local.js`). Prod: `https://api.temphist.com` |
| `VITE_TEST_TOKEN` | Dev only | Test token injected by `server-local.js` when Firebase auth is unavailable |
| `PORT` | No | Server port (default: 3000). Set automatically by Railway in production |
| `API_BASE` | Dev only | [TempHist API](https://github.com/turnpiece/TempHist-API) URL used by `server-local.js`. Set to `http://localhost:8000` to run the API locally, or point at `https://devapi.temphist.com` / `https://stagingapi.temphist.com` to skip running it locally. |

## Building for Production

```bash
npm run type-check   # TypeScript check
npm run build        # Outputs to dist/
```

Deploy the `dist/` directory to your web root.

## Deployment

Pushes to `main` → production auto-deploy via GitHub webhook.  
Pushes to `develop` → dev/staging auto-deploy.

For manual deployment:

```bash
git checkout main && git pull
npm install && npm run build
# copy dist/ to web root
```

## Static Site & .htaccess

For Apache hosts (e.g. SiteGround), add a `.htaccess` to serve clean URLs:

```apache
RewriteEngine On

# Remove .html extension
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^([^\.]+)$ $1.html [NC,L]

# Redirect .html URLs to clean versions
RewriteCond %{THE_REQUEST} /([^.]+)\.html [NC]
RewriteRule ^ /%1 [NC,L,R=301]
```

## Firebase Setup

1. Create a project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Anonymous Authentication
3. Add your Firebase config to `src/main.ts`

For local development, `server-local.js` injects a test token automatically so Firebase is not required.

## Testing

```bash
npm test                # run all tests
npm run test:coverage   # with coverage report
npm run test:watch      # watch mode
npm run test:ui         # browser UI
```

## Project Structure

```
src/
  main.ts               # App entry point, router, auth, location init
  share.ts              # Share page logic (fetch metadata, render chart)
  chart/
    chart.ts            # Chart creation, bar colours, tooltip handler
  views/
    today.ts            # Today view — fetch, render, location display
    period.ts           # Week/Month/Year views (shared renderer)
    about.ts            # About page content builder
  utils/
    uiHelpers.ts        # Shared DOM helpers: location display, stats rendering
    location.ts         # Country code → flag, location slug lookup
  types/
    index.ts            # TypeScript type definitions
  services/             # Location detection, carousel, API interactions
  api/                  # API client functions
templates/
  header.html           # Site header partial (included at build time)
  nav.html              # Sidebar nav partial
styles.scss             # Global styles
index.html              # Main SPA shell
about.html              # Standalone about page
privacy.html            # Standalone privacy page
server.js               # Production proxy + OG tag injection
server-local.js         # Local dev proxy with test token injection
```

## Usage

1. On first visit, grant location permission or pick a city from the carousel
2. The chart loads immediately for the current date — navigate between Today / Past week / Past month / Past year using the sidebar
3. Bars are colour-coded: **red** = warmer than average, **blue** = cooler, **grey** = near average, **green** = current year
4. Hover any bar to see its year, temperature, and anomaly vs the historical average
5. The summary sentence above the chart describes the current year in plain English
6. The stats bubble below the chart shows the historical mean, standard deviation, and warming/cooling trend
7. Tap the location name at the top of any view to change city
8. Use the share icon (next to the period label) to copy a permanent link to the current view

## Known Issues

- **Mobile Geolocation**: Some devices experience timeouts or permission issues with GPS detection
- **Incomplete current year**: If the current year's data is still accumulating, an incomplete-data notice is shown with the option to retry

## Browser Compatibility

- Chrome 60+, Firefox 55+, Safari 12+
- iOS Safari 12+, Chrome Mobile 60+
- Geolocation requires HTTPS in production

## License

MIT License — Copyright (c) 2025 [Turnpiece](https://turnpiece.com)
