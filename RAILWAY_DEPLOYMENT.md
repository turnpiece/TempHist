# Railway Deployment Guide

This comprehensive guide covers deploying TempHist to Railway, including automated cache updates and scheduled tasks.

## Quick Setup

Railway is now configured to automatically build and deploy your app. Here's what happens:

1. **Build**: Railway runs `npm run build` which:

   - Compiles TypeScript
   - Builds the Vite frontend
   - Outputs everything to the `dist/` directory

2. **Deploy**: Railway runs `npm start` which:
   - Starts the Express server (`server.js`)
   - Serves static files from the `dist/` directory
   - Handles SPA routing for `/about` and `/privacy` pages

## Configuration Files

- **`railway.json`**: Tells Railway how to build and start the app
- **`nixpacks.toml`**: Specifies Node.js 20 for Railway (Vite 6 compatible)
- **`server.js`**: Lightweight Express server for all Railway deployments (dev, staging, production)
- **`server-local.js`**: Local development server with API proxy (not used in Railway)

## Environment Variables

Set these in your Railway dashboard (under Variables):

### Required for Production

- `VITE_API_BASE` - Your API base URL (e.g., `https://api.temphist.com`)

### Optional

- `PORT` - Railway sets this automatically (default: 3000)
- `VITE_TEST_TOKEN` - Test token for development features
- `API_TOKEN` - Token for server-side API calls (if needed for future functionality)
- `TEST_TOKEN` - Test token for server-side scripts

## Steps to Deploy

1. **Connect Your GitHub Repo**

   - In Railway dashboard, click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your TempHist repository
   - Select the branch you want to deploy (e.g., `main` or `features/railway-migration`)

2. **Configure Environment Variables**

   - Go to your service in Railway
   - Click on "Variables" tab
   - Add `VITE_API_BASE=https://api.temphist.com` (or your API URL)
   - Add any other environment variables you need

3. **Deploy**
   - Railway will automatically detect the `railway.json` config
   - It will run the build command: `npm run build`
   - Then start the app with: `npm start`
   - Your app will be available at the Railway-provided URL

## Performance Strategy

TempHist relies on efficient caching strategies for optimal performance:

- **API-level caching**: The backend API uses Redis caching with cache warming
- **Client-side caching**: Browser caching and service workers for static assets
- **CDN caching**: For API responses and static files

This approach provides excellent performance (1-5ms API response times) while maintaining a simple, maintainable architecture.

## Monitoring

- **Logs**: Check Railway dashboard → your service → "Deployments" tab
- **Build Logs**: See the build process and any errors
- **Runtime Logs**: See Express server logs after deployment

## Custom Domain (Optional)

1. Go to your Railway service
2. Click "Settings" tab
3. Under "Domains", click "Generate Domain" or add a custom domain
4. Follow Railway's instructions for DNS configuration

## Troubleshooting

### Build Fails

- Check the build logs in Railway dashboard
- Ensure all dependencies are in `package.json` (not just `devDependencies`)
- TypeScript compilation might need more memory - Railway provides adequate resources
- **Node.js version error**: The `nixpacks.toml` file ensures Node.js 20 is used (Vite 6 compatible)

### App Won't Start

- Check that `server.js` exists
- Verify the `start` script in `package.json`
- Look at runtime logs for errors

### Routes Not Working

- The `server.js` handles SPA routing
- Make sure `.htaccess` is not interfering (Railway ignores it)

### Environment Variables Not Working

- Build-time vars (VITE\_\*): Must be set BEFORE building
- If you change VITE\_\* vars, trigger a new deployment to rebuild

### API Resilience Features

TempHist includes built-in resilience features:

**Async Job Fallback**: If async temperature data jobs timeout or fail, the app automatically falls back to synchronous API calls. This ensures users always get data even if the background job system is having issues.

**Error Handling**: The app gracefully handles various failure modes:

- Network timeouts
- API server errors
- Job worker failures
- Authentication issues

### CORS Errors (Preflight Failed)

If you see errors like "Preflight response is not successful" or "Failed to load resource: Preflight response is not successful. Status code: 400":

- The API server needs to allow requests from your Railway domain
- In your API's CORS configuration, add the Railway domain to allowed origins
- For development: `https://temphist-develop.up.railway.app`
- For production: `https://temphist.up.railway.app` (or your custom domain)
- The API must respond to OPTIONS requests with proper CORS headers:
  - `Access-Control-Allow-Origin`: Your Railway domain (or `*` for development)
  - `Access-Control-Allow-Methods`: `GET, POST, OPTIONS`
  - `Access-Control-Allow-Headers`: `Authorization, Content-Type, Accept`
  - `Access-Control-Max-Age`: `600` (or longer)

**Example API CORS fix (FastAPI/Python):**

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://temphist-develop.up.railway.app",
        "https://temphist.up.railway.app",
        "https://temphist.com",
        "https://dev.temphist.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Common Issues

**Build Failures**:

- Check build logs in Railway dashboard
- Ensure all dependencies are properly configured
- Verify TypeScript compilation is successful

**Environment Variables**:

- Build-time vars (VITE\_\*) must be set before building
- Trigger new deployment after changing environment variables

## Local Testing

To test the production build locally:

```bash
# Build the app
npm run build

# Start the server (same as Railway uses)
npm start

# Or run the local dev server with API proxy
npm run start:local
```

Visit `http://localhost:3000` to see the production build.

## Differences from Traditional Hosting

| Traditional Hosting           | Railway                             |
| ----------------------------- | ----------------------------------- |
| Uses `.htaccess` for routing  | Uses Express routing in `server.js` |
| Static file hosting           | Node.js server hosting static files |
| Manual deployment via FTP/SSH | Automatic deployment on git push    |
| Manual environment setup      | Environment variables in dashboard  |
| Manual cache management       | API-level caching with Redis        |

## Benefits of Railway Deployment

✅ **Automated**: No manual intervention needed for deployments  
✅ **Reliable**: Railway's infrastructure is very stable  
✅ **Simple**: Clean, straightforward deployment process  
✅ **Integrated**: Works seamlessly with GitHub auto-deploy  
✅ **Scalable**: Easy to add more services or environments

## Next Steps

- Set up automatic deployments from your main branch
- Configure a custom domain
- Set up monitoring/alerts
- Test with your Railway dev environment
- Migrate production to Railway when ready
