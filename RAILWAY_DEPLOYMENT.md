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

## Automated Cache Updates

TempHist includes scripts to automatically update location and temperature data. Since Railway doesn't support traditional cron jobs, we use GitHub Actions.

### GitHub Actions Setup (Recommended)

The GitHub Actions workflow automatically updates your cache data:

- **Hourly**: Run `fetch-daily-data.js` to update temperature data
- **Daily**: Run `fetch-locations.js` to update location list
- **Automatically**: Commit changes and trigger Railway redeployment

#### Setup Steps

1. **Add GitHub Secret**:

   - Go to your GitHub repository
   - Click **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `API_TOKEN`
   - Value: Your API token (e.g., `r2whxLDXQ35Q`)

2. **Test the Workflow**:

   - Go to your GitHub repo → **Actions** tab
   - Click **Update TempHist Cache (Dev Testing)** workflow
   - Click **Run workflow** → **Run workflow**

3. **Monitor the Workflow**:
   - **Actions tab**: See run history and logs
   - **Commits**: Look for "Update cache data [skip ci]" commits
   - **Railway**: Should automatically redeploy when data changes

#### How It Works

**Hourly Schedule (fetch-daily-data.js)**:

- Runs at minute 0 of every hour
- Fetches temperature data for all locations
- Updates files in `public/data/daily-data/`

**Daily Schedule (fetch-locations.js)**:

- Runs at midnight UTC daily
- Fetches updated location list
- Updates `public/data/preapproved-locations.json`

**Auto-Deployment**:

- Changes are committed with `[skip ci]` to prevent infinite loops
- Railway detects the commit and redeploys automatically
- Your app gets fresh data without manual intervention

### Alternative: Railway Cron Services

Railway now supports cron services! This is an alternative approach:

1. **Create a new Railway service**:

   - Go to your Railway project dashboard
   - Click "New Service" → "Cron Job"
   - Connect it to your GitHub repo

2. **Configure the cron service**:

   - **Name**: `temphist-cache`
   - **Cron Schedule**: `0 * * * *` (runs every hour)
   - **Command**: `node scripts/fetch-daily-data.js`

3. **Create a second cron service for locations**:

   - **Name**: `temphist-locations`
   - **Cron Schedule**: `0 0 * * *` (runs daily at midnight)
   - **Command**: `node scripts/fetch-locations.js`

4. **Set environment variables** for both services:
   ```
   VITE_API_BASE=https://temphist-api-develop.up.railway.app
   API_TOKEN=your_api_token_here
   OUTPUT_DIR=/tmp/data
   ```

**Important Notes for Railway Cron**:

- **Output Directory**: Use `/tmp/data` or similar temp directory
- **Data Persistence**: Cron services are ephemeral - data doesn't persist between runs
- **Alternative**: Use external storage (S3, etc.) or modify scripts to upload data to your main app

### Alternative: External Cron Service

Use a third-party service like cron-job.org:

1. **Sign up at [cron-job.org](https://cron-job.org)**
2. **Create two cron jobs**:

   **Job 1: Daily Locations**

   - URL: `https://your-app.up.railway.app/api/update-locations`
   - Schedule: `0 0 * * *` (daily)

   **Job 2: Hourly Data**

   - URL: `https://your-app.up.railway.app/api/update-daily-data`
   - Schedule: `0 * * * *` (hourly)

3. **Add API endpoints to your Railway app**:

Create `src/api/cron.ts`:

```typescript
import express from "express";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const router = express.Router();

// Add basic auth middleware
const requireAuth = (req: any, res: any, next: any) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

router.post("/update-locations", requireAuth, async (req, res) => {
  try {
    await execAsync("node scripts/fetch-locations.js");
    res.json({ success: true, message: "Locations updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/update-daily-data", requireAuth, async (req, res) => {
  try {
    await execAsync("node scripts/fetch-daily-data.js");
    res.json({ success: true, message: "Daily data updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

Then add to `server.js`:

```javascript
import cronRoutes from "./src/api/cron.js";

// Add after other middleware
app.use("/api", cronRoutes);
```

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

### GitHub Actions Issues

**Workflow Not Running**:

- Check GitHub Actions is enabled in repo settings
- Verify the cron syntax is correct
- Check if the repo has been active (GitHub pauses workflows on inactive repos)

**API Token Issues**:

- Verify `API_TOKEN` secret is set correctly
- Check the token has proper permissions
- Look at workflow logs for authentication errors

**No Changes Committed**:

- The workflow only commits if data actually changed
- Check if your API is returning new data
- Look at workflow logs to see if scripts ran successfully

**Railway Not Redeploying**:

- Verify Railway is connected to the correct branch
- Check if Railway auto-deploy is enabled
- Look for Railway deployment logs

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

| Traditional Hosting           | Railway                                 |
| ----------------------------- | --------------------------------------- |
| Uses `.htaccess` for routing  | Uses Express routing in `server.js`     |
| Static file hosting           | Node.js server hosting static files     |
| Manual deployment via FTP/SSH | Automatic deployment on git push        |
| Manual environment setup      | Environment variables in dashboard      |
| Cron jobs on server           | GitHub Actions or Railway Cron services |

## Benefits of Railway + GitHub Actions

✅ **Automated**: No manual intervention needed for deployments or cache updates  
✅ **Reliable**: GitHub's and Railway's infrastructure are very stable  
✅ **Free**: GitHub Actions provides 2000 minutes/month (plenty for your scripts)  
✅ **Visible**: Easy to monitor and debug in both platforms  
✅ **Integrated**: Works seamlessly with Railway auto-deploy  
✅ **Scalable**: Easy to add more scheduled tasks or environments

## Next Steps

- Set up automatic deployments from your main branch
- Configure a custom domain
- Set up monitoring/alerts
- Test the GitHub Actions workflow with your Railway dev environment
- Migrate production to Railway when ready
