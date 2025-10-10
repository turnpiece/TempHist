# Railway Deployment Guide

This guide explains how to deploy TempHist to Railway.

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
- **`server.js`**: Lightweight Express server for all Railway deployments (dev, staging, production)
- **`server-local.js`**: Local development server with API proxy (not used in Railway)

## Environment Variables

Set these in your Railway dashboard (under Variables):

### Required for Production

- `VITE_API_BASE` - Your API base URL (e.g., `https://api.temphist.com`)

### Optional

- `PORT` - Railway sets this automatically (default: 3000)
- `VITE_TEST_TOKEN` - Test token for development features
- `API_TOKEN` - Token for server-side API calls (if using cron jobs)
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

| Traditional Hosting           | Railway                                     |
| ----------------------------- | ------------------------------------------- |
| Uses `.htaccess` for routing  | Uses Express routing in `server.js`         |
| Static file hosting           | Node.js server hosting static files         |
| Manual deployment via FTP/SSH | Automatic deployment on git push            |
| Manual environment setup      | Environment variables in dashboard          |
| Cron jobs on server           | Would need Railway Cron or external service |

## Next Steps

- Set up automatic deployments from your main branch
- Configure a custom domain
- Set up monitoring/alerts
- Consider migrating cron jobs to Railway Cron or a separate service
