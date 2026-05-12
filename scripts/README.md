# Scripts Directory

## `generate-favicons.js`

Builds favicon and touch icons from `assets/logo.svg`, plus a multi-resolution `favicon.ico` derived from the generated `favicon-512.png`, and **`assets/logo.png`** (raster fallback when SVG fails in header / nav / splash).

```bash
node scripts/generate-favicons.js
```

## `generate-og-default.js`

Builds `assets/og-default.png` (1200×630): site gradient background plus centred logo, used as `og:image` / `twitter:image` for link previews. Re-run after changing brand colours in `styles.scss` (`$colour-bg` / `$colour-bg-bottom`) or the logo SVG.

```bash
node scripts/generate-og-default.js
```

## Location carousel images

Location photos are **not** part of this web repository. The splash location carousel loads preapproved locations from **`GET /v1/locations/preapproved`**. Each entry includes image URLs (typically WebP and JPEG) served from the API host, for example:

`https://devapi.temphist.com/data/locations/processed/london.webp`

Adding, replacing, or re-encoding those assets is handled on the **API / infrastructure** side (source imagery, sharp/resizing pipeline, URL fields in the preapproved response). This repo only consumes those URLs in `src/services/locationCarousel.ts` (and related callers).

## Performance strategy

TempHist relies on:

- **API-level caching**: The API uses Redis caching with cache warming for optimal performance
- **Client-side caching**: Browser caching and service workers for static assets
- **CDN caching**: For API responses and static files

This approach provides excellent performance (1–5 ms API response times) while maintaining a simple, maintainable architecture.
