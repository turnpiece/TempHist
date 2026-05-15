# Graph Report - .  (2026-05-15)

## Corpus Check
- Corpus is ~46,379 words - fits in a single context window. You may not need a graph.

## Summary
- 381 nodes · 857 edges · 16 communities (13 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Temperature Data & Config|Temperature Data & Config]]
- [[_COMMUNITY_Analytics & Routing|Analytics & Routing]]
- [[_COMMUNITY_API Fetching & Jobs|API Fetching & Jobs]]
- [[_COMMUNITY_Data Validation & Types|Data Validation & Types]]
- [[_COMMUNITY_Chart Visualization|Chart Visualization]]
- [[_COMMUNITY_Utils & Feature Flags|Utils & Feature Flags]]
- [[_COMMUNITY_Assets & Deployment|Assets & Deployment]]
- [[_COMMUNITY_Logging & Tests|Logging & Tests]]
- [[_COMMUNITY_Data Cache|Data Cache]]
- [[_COMMUNITY_Views & Location UI|Views & Location UI]]
- [[_COMMUNITY_Debouncer Utility|Debouncer Utility]]
- [[_COMMUNITY_Mobile Layout Tests|Mobile Layout Tests]]
- [[_COMMUNITY_Build Configuration|Build Configuration]]
- [[_COMMUNITY_TypeScript Env Types|TypeScript Env Types]]
- [[_COMMUNITY_Logo Asset|Logo Asset]]

## God Nodes (most connected - your core abstractions)
1. `Logger` - 23 edges
2. `fetchHistoricalData()` - 21 edges
3. `DataCache` - 17 edges
4. `getApiUrl()` - 16 edges
5. `getDisplayCity()` - 15 edges
6. `fetchTemperatureDataSync()` - 15 edges
7. `renderPeriod()` - 14 edges
8. `renderShareChart()` - 13 edges
9. `updateDataNotice()` - 12 edges
10. `apiFetch()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Permanent snapshot URLs and client share flow` --rationale_for--> `createShare()`  [INFERRED]
  README.md → src/share.ts
- `Default Open Graph preview image` --conceptually_related_to--> `Server-side OG meta for crawlers on share URLs`  [INFERRED]
  assets/og-default.png → README.md
- `Server-side OG meta for crawlers on share URLs` --rationale_for--> `getIndexHtml()`  [INFERRED]
  README.md → server.js
- `Server-side OG meta for crawlers on share URLs` --rationale_for--> `formatSharePeriodHeading()`  [INFERRED]
  README.md → server.js
- `Server-side OG meta for crawlers on share URLs` --rationale_for--> `ogTags`  [INFERRED]
  README.md → server.js

## Communities (16 total, 3 thin omitted)

### Community 0 - "Temperature Data & Config"
Cohesion: 0.09
Nodes (33): calculateTemperatureRange(), checkApiHealth(), transformToChartData(), CACHE_CONFIG, LOADING_TIMEOUTS, refreshLocationFlag(), startPeriodDataPrefetch(), result (+25 more)

### Community 1 - "Analytics & Routing"
Cohesion: 0.08
Nodes (33): reportAnalytics(), sendAnalytics(), setupAnalyticsReporting(), Main HTML shell (Chart.js, Firebase), TempHistRouter, handleWindowResize(), setupMobileNavigation(), auth (+25 more)

### Community 2 - "API Fetching & Jobs"
Cohesion: 0.09
Nodes (33): apiFetch(), createAsyncJob(), fetchTemperatureDataSync(), getApiUrl(), pollJobStatus(), validateIdentifier(), validateLocation(), hideLocationSelectionSection() (+25 more)

### Community 3 - "Data Validation & Types"
Cohesion: 0.08
Nodes (34): validateAverageData(), validateTemperatureDataPoint(), validateTemperatureDataResponse(), validateTrendData(), API_CONFIG, DATE_RANGE_CONFIG, GEOLOCATION_CONFIG, LOCATION_VALIDATION_CONFIG (+26 more)

### Community 4 - "Chart Visualization"
Cohesion: 0.09
Nodes (35): barColorForZScore(), buildExternalTooltipHandler(), calculateTrendLine(), computeBarColors(), COOL_RGB, createTemperatureChart(), getOrCreateTooltipEl(), getTemperatureLinearAxisExtents() (+27 more)

### Community 5 - "Utils & Feature Flags"
Cohesion: 0.09
Nodes (4): FeatureFlagCondition, CoreWebVitals, PerformanceMetric, PerformanceReport

### Community 6 - "Assets & Deployment"
Cohesion: 0.09
Nodes (32): Default Open Graph preview image, Railway deployment notes, Server-side OG meta for crawlers on share URLs, outputDir, sharp, sizes, svgPath, toIco (+24 more)

### Community 7 - "Logging & Tests"
Cohesion: 0.09
Nodes (13): entries, error, errorLogs, exported, logs, logs1, logs2, parsed (+5 more)

### Community 8 - "Data Cache"
Cohesion: 0.17
Nodes (6): get(), set(), CacheEntry, CacheOptions, cleaned, DataCache

### Community 9 - "Views & Location UI"
Cohesion: 0.45
Nodes (11): renderImageAttributions(), appendBulletList(), appendHeading(), appendParagraph(), appendSection(), appendSectionWithLink(), buildAboutContent(), buildPrivacyAppContent() (+3 more)

### Community 10 - "Debouncer Utility"
Cohesion: 0.22
Nodes (4): callback, callback1, callback2, DebouncedFunction

### Community 11 - "Mobile Layout Tests"
Cohesion: 0.25
Nodes (7): appShell, canvas, container, element, fixedElement, img, wideElement

## Knowledge Gaps
- **69 isolated node(s):** `filePath`, `{ createProxyMiddleware }`, `allowedOrigins`, `distExists`, `packageJson` (+64 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getOrdinal()` connect `Temperature Data & Config` to `Analytics & Routing`, `Chart Visualization`, `Assets & Deployment`?**
  _High betweenness centrality (0.135) - this node is a cross-community bridge._
- **Why does `Logger` connect `Logging & Tests` to `Temperature Data & Config`, `Analytics & Routing`, `Utils & Feature Flags`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `DataCache` connect `Data Cache` to `Temperature Data & Config`, `Analytics & Routing`, `API Fetching & Jobs`, `Utils & Feature Flags`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `filePath`, `{ createProxyMiddleware }`, `allowedOrigins` to the rest of the system?**
  _69 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Temperature Data & Config` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Analytics & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `API Fetching & Jobs` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._