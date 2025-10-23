# Scripts Directory

This directory is currently empty. Previous cron job scripts for server-side caching have been removed as they added unnecessary architectural complexity for minimal performance gains.

## Performance Strategy

TempHist now relies on:

- **API-level caching**: The API uses Redis caching with cache warming for optimal performance
- **Client-side caching**: Browser caching and service workers for static assets
- **CDN caching**: For API responses and static files

This approach provides excellent performance (1-5ms API response times) while maintaining a simple, maintainable architecture.

## If You Need Server-Side Caching

If you determine that server-side caching is necessary in the future, consider:

1. **Database caching**: Store frequently accessed data in a shared database
2. **External storage**: Use services like AWS S3 or Google Cloud Storage
3. **CDN optimization**: Enhance CDN caching strategies
4. **API optimization**: Improve the existing Redis caching layer

The previous cron job approach added complexity without significant performance benefits and has been removed to keep the codebase clean and maintainable.
