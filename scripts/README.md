# Scripts Directory

## Image Processing Script

### `process-location-images.js`

Processes location images for the carousel. Converts images to WebP format (with JPEG fallback) and resizes them to 320x200px.

**Note**: Location data and image metadata are now managed by the API backend. This script only processes images. Image URLs and metadata must be updated in the API backend.

**Usage**:
```bash
node scripts/process-location-images.js
```

**What it does**:
- Reads images from `assets/locations/`
- Processes images to 320x200px WebP and JPEG formats
- Saves processed images to `assets/locations/processed/`
- Does NOT update any JSON files (locations are managed by API)

## Performance Strategy

TempHist now relies on:

- **API-level caching**: The API uses Redis caching with cache warming for optimal performance
- **Client-side caching**: Browser caching and service workers for static assets
- **CDN caching**: For API responses and static files

This approach provides excellent performance (1-5ms API response times) while maintaining a simple, maintainable architecture.
