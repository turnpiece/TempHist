# Graph Report - /Users/paul/Sites/temphist-workspace/web  (2026-05-14)

## Corpus Check
- Corpus is ~46,299 words - fits in a single context window. You may not need a graph.

## Summary
- 447 nodes · 911 edges · 23 communities (19 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.8)
- Token cost: 12,000 input · 1,800 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Period views and chart flow|Period views and chart flow]]
- [[_COMMUNITY_Splash, carousel, and static pages|Splash, carousel, and static pages]]
- [[_COMMUNITY_Share UI and chart presentation|Share UI and chart presentation]]
- [[_COMMUNITY_Bootstrap, router, and analytics|Bootstrap, router, and analytics]]
- [[_COMMUNITY_Logger utilities and tests|Logger utilities and tests]]
- [[_COMMUNITY_Location detection and shared types|Location detection and shared types]]
- [[_COMMUNITY_Temperature API and data loading|Temperature API and data loading]]
- [[_COMMUNITY_Express production server and OG|Express production server and OG]]
- [[_COMMUNITY_Feature flags|Feature flags]]
- [[_COMMUNITY_Performance monitoring|Performance monitoring]]
- [[_COMMUNITY_Local dev server with proxy|Local dev server with proxy]]
- [[_COMMUNITY_In-memory data cache|In-memory data cache]]
- [[_COMMUNITY_Location cookies and integration tests|Location cookies and integration tests]]
- [[_COMMUNITY_Debouncer utility|Debouncer utility]]
- [[_COMMUNITY_Loading manager|Loading manager]]
- [[_COMMUNITY_Favicon generation script|Favicon generation script]]
- [[_COMMUNITY_Mobile overflow tests|Mobile overflow tests]]
- [[_COMMUNITY_OG default image script|OG default image script]]
- [[_COMMUNITY_Vite build configuration|Vite build configuration]]
- [[_COMMUNITY_Vite environment typings|Vite environment typings]]
- [[_COMMUNITY_Raster logo asset|Raster logo asset]]

## God Nodes (most connected - your core abstractions)
1. `Logger` - 23 edges
2. `FeatureFlags` - 22 edges
3. `fetchHistoricalData()` - 22 edges
4. `PerformanceMonitor` - 17 edges
5. `DataCache` - 17 edges
6. `getApiUrl()` - 17 edges
7. `LoadingManager` - 16 edges
8. `getDisplayCity()` - 15 edges
9. `fetchTemperatureDataAsync()` - 14 edges
10. `renderPeriod()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Server-side OG meta for crawlers on share URLs` --rationale_for--> `getIndexHtml()`  [INFERRED]
  README.md → server.js
- `Server-side OG meta for crawlers on share URLs` --rationale_for--> `ogTags`  [INFERRED]
  README.md → server.js
- `Permanent snapshot URLs and client share flow` --rationale_for--> `createShare()`  [INFERRED]
  README.md → src/share.ts
- `Default Open Graph preview image` --conceptually_related_to--> `Server-side OG meta for crawlers on share URLs`  [INFERRED]
  assets/og-default.png → README.md
- `Server-side OG meta for crawlers on share URLs` --rationale_for--> `formatSharePeriodHeading()`  [INFERRED]
  README.md → server.js

## Hyperedges (group relationships)
- **Share URL client render plus server OG injection** — src_share_initsharepage, web_server_getindexhtml, web_server_ogtags, rationale_og_tag_injection [INFERRED 0.75]

## Communities (23 total, 4 thin omitted)

### Community 0 - "Period views and chart flow"
Cohesion: 0.12
Nodes (43): calculateTemperatureRange(), checkApiHealth(), transformToChartData(), validateTemperatureDataArray(), validateTemperatureDataResponse(), createTemperatureChart(), updateChartTrendLine(), LOADING_TIMEOUTS (+35 more)

### Community 1 - "Splash, carousel, and static pages"
Cohesion: 0.12
Nodes (30): hideLocationSelectionSection(), initCarouselScroll(), initLocationCarousel(), loadPreapprovedLocations(), parsePreapprovedLocations(), renderImageAttributions(), resetCarouselState(), waitForAuthentication() (+22 more)

### Community 2 - "Share UI and chart presentation"
Cohesion: 0.09
Nodes (33): barColorForZScore(), buildExternalTooltipHandler(), calculateTrendLine(), computeBarColors(), COOL_RGB, getOrCreateTooltipEl(), getTemperatureLinearAxisExtents(), lerpColor() (+25 more)

### Community 3 - "Bootstrap, router, and analytics"
Cohesion: 0.08
Nodes (24): reportAnalytics(), sendAnalytics(), setupAnalyticsReporting(), Main HTML shell (Chart.js, Firebase), TempHistRouter, app, auth, debugLog() (+16 more)

### Community 4 - "Logger utilities and tests"
Cohesion: 0.08
Nodes (14): entries, error, errorLogs, exported, logs, logs1, logs2, parsed (+6 more)

### Community 5 - "Location detection and shared types"
Cohesion: 0.08
Nodes (28): GEOLOCATION_CONFIG, NOMINATIM_CONFIG, detectUserLocationWithGeolocation(), getCityFromCoords(), getLocationFromIP(), mockError, mockPosition, platform (+20 more)

### Community 6 - "Temperature API and data loading"
Cohesion: 0.11
Nodes (24): apiFetch(), createAsyncJob(), fetchTemperatureDataAsync(), fetchTemperatureDataSync(), getApiUrl(), pollJobStatus(), validateAverageData(), validateIdentifier() (+16 more)

### Community 7 - "Express production server and OG"
Cohesion: 0.1
Nodes (22): Default Open Graph preview image, Railway deployment notes, Server-side OG meta for crawlers on share URLs, app, applySiteOriginToHtml(), cityName, controller, cspDirectives (+14 more)

### Community 8 - "Feature flags"
Cohesion: 0.13
Nodes (4): FeatureFlag, FeatureFlagCondition, FeatureFlagConfig, FeatureFlags

### Community 9 - "Performance monitoring"
Cohesion: 0.16
Nodes (4): CoreWebVitals, PerformanceMetric, PerformanceMonitor, PerformanceReport

### Community 10 - "Local dev server with proxy"
Cohesion: 0.11
Nodes (16): allowedOrigins, app, cityName, controller, { createProxyMiddleware }, cspDirectives, distExists, express (+8 more)

### Community 11 - "In-memory data cache"
Cohesion: 0.15
Nodes (4): CacheEntry, CacheOptions, cleaned, DataCache

### Community 12 - "Location cookies and integration tests"
Cohesion: 0.17
Nodes (13): CACHE_CONFIG, chartCanvas, consoleSpy, cookieData, dataNotice, missingElement, result, consoleSpy (+5 more)

### Community 13 - "Debouncer utility"
Cohesion: 0.15
Nodes (8): callback, callback1, callback2, debounced, debounced1, debounced2, DebouncedFunction, Debouncer

### Community 15 - "Favicon generation script"
Cohesion: 0.28
Nodes (8): fs, generateFavicons(), outputDir, path, sharp, sizes, svgPath, toIco

### Community 16 - "Mobile overflow tests"
Cohesion: 0.25
Nodes (7): appShell, canvas, container, element, fixedElement, img, wideElement

### Community 17 - "OG default image script"
Cohesion: 0.33
Nodes (6): fs, main(), outPath, path, sharp, svgPath

## Knowledge Gaps
- **114 isolated node(s):** `express`, `path`, `fs`, `app`, `cspDirectives` (+109 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TempHist product overview (README)` connect `Share UI and chart presentation` to `Express production server and OG`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `Logger` connect `Logger utilities and tests` to `Period views and chart flow`, `Bootstrap, router, and analytics`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `Server-side OG meta for crawlers on share URLs` connect `Express production server and OG` to `Share UI and chart presentation`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `fetchHistoricalData()` (e.g. with `debugTime()` and `debugTimeEnd()`) actually correct?**
  _`fetchHistoricalData()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `express`, `path`, `fs` to the rest of the system?**
  _114 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Period views and chart flow` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Splash, carousel, and static pages` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._