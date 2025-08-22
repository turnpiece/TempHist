# Temperature History Visualization

A web application that visualizes historical temperature data for any location, showing how temperatures have changed over the past 50 years for a specific date.

## Security & Privacy

**Location Access Required**: This application requires location permissions to function. Manual location entry is disabled to prevent API abuse and ensure data accuracy. Users can only access temperature data for their actual GPS location.

**Data Protection**:

- No location data is stored permanently
- Location cookies expire after 1 hour
- All API requests are authenticated via Firebase
- Manual location input is disabled for security

## Features

- Visualizes 50 years of temperature data in an interactive chart
- Automatically detects user's location
- Shows average temperature
- Responsive design that works on both desktop and mobile
- Handles edge cases like leap years and timezone differences
- Zero layout shift (CLS) with skeleton loader and background fallback
- Fast, modern build with Vite and SCSS support
- Firebase anonymous authentication for secure API access

## Tech Stack

- **Frontend**: Vanilla JavaScript with Chart.js for visualization
- **Build Tool**: [Vite](https://vitejs.dev/) (for fast dev/build and modern ES modules)
- **Styles**: SCSS (with hot reload and code splitting via Vite)
- **Authentication**: Firebase Anonymous Auth
- **Backend**: Node.js with Express (for API/proxy and development mock data)
- **Data Source**: Historical weather data API (with fallback mock data for development)
- **Hosting**: Static site (e.g., SiteGround, Netlify, Vercel, or any Apache/Nginx host)

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

3. Create a `.env` file in the root directory with your configuration:

   ```
   PORT=3000
   NODE_ENV=development
   API_BASE=https://api.temphist.com
   ```

4. Start the development server with Vite:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5173`

## Building for Production

1. Build the app:

   ```bash
   npm run build
   ```

   This outputs static files to the `dist/` directory.

2. Deploy the contents of `dist/` to your web root.

3. Set environment variables for production:

   ```bash
   NODE_ENV=production
   API_BASE=https://api.temphist.com
   PORT=3000
   ```

## Deployment

### Automated Deployment (Recommended)

The project uses GitHub webhooks for automated deployment:

- **Production**: Push to `main` branch → automatically deploys to production
- **Development**: Push to `develop` branch → automatically deploys to dev environment

#### Webhook Setup

1. **Create webhook in GitHub:**

   - Go to your repository → Settings → Webhooks
   - Add webhook: `https://yourdomain.com/webhook.php`
   - Set content type to `application/json`
   - Add your webhook secret

2. **Server Requirements:**
   - PHP 7.4+ with `exec()` enabled
   - SSH access for git operations
   - Node.js and npm for building
   - Proper file permissions

#### Manual Deployment

If you need to deploy manually:

```bash
# Production
git checkout main
git pull origin main
npm install
npm run build
# Copy dist/ contents to web root

# Development
git checkout develop
git pull origin develop
npm install
npm run build
# Copy dist/ contents to dev web root
```

### Deployment Scripts

The project includes deployment scripts (not committed to Git for security):

- `deploy.sh` - Production deployment script
- `deploy-dev.sh` - Development deployment script

These scripts handle:

- Git operations with SSH keys
- Dependency installation
- Build process
- File copying to web directories

**Note**: Deployment scripts contain server-specific paths and should not be committed to version control.

## SPA Deployment and .htaccess

If you are deploying to Apache (e.g., SiteGround) and using client-side routing, add a `.htaccess` file to your web root:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

This ensures all routes are handled by your SPA.

## Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
2. Enable Anonymous Authentication in the Firebase Auth settings.
3. Add your Firebase config to `app.js`.
4. The app will sign in users anonymously and use the Firebase ID token for API requests.

## Lighthouse/CLS Optimization

- The app uses a skeleton loader and reserves space for all dynamic content to achieve a CLS (Cumulative Layout Shift) score near zero.
- A background colour and gradient are set inline in the `<head>` to prevent FOUC (Flash of Unstyled Content).
- All images and SVGs have explicit width/height attributes.
- Responsive min-heights are set for text elements to prevent layout shift on mobile.

## Webhook and Cloudflare Notes

- If you use webhooks (e.g., for auto-deployment), ensure Cloudflare is set to **bypass cache** for your webhook endpoint (e.g., `/webhook.php`).
- Use a `.htaccess` file for SPA routing if deploying to Apache.

## Usage

1. The application will automatically try to detect your location
2. The chart will display temperature data for the current date (or yesterday if before 1 AM)
3. Hover over bars to see exact temperatures for each year
4. The average temperature is shown as a vertical line
5. The current year's temperature is highlighted in green

## Development

- `app.js`: Main frontend application code (ES modules, Vite, SCSS imports, Firebase auth)
- `server.js`: Backend server implementation (API/proxy, development mock data, CORS handling)
- `package.json`: Project dependencies and scripts
- `styles.scss`: Main SCSS file (imported in JS)
- `.env`: Environment configuration (API endpoints, ports, environment mode)

## License

MIT License

Copyright (c) 2025 [Turnpiece](https://turnpiece.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Current Issues & Limitations

### Known Issues

- **Mobile Geolocation**: Some mobile devices experience timeouts or permission issues with location detection
- **Firebase Configuration**: Firebase config is currently hardcoded in `app.js` (should be moved to environment variables)
- **Error Handling**: Limited fallback options when the weather API is unavailable
- **Mobile Debug Mode**: Debug overlay appears on mobile devices and may interfere with UI

### Technical Debt

- **Hardcoded Values**: Firebase config and API endpoints should be configurable
- **Mock Data**: Development mode uses static mock data instead of realistic historical data
- **Error Recovery**: Limited retry logic for failed API calls
- **Mobile Optimization**: Some mobile-specific optimizations could be improved

### Browser Compatibility

- **Modern Browsers**: Requires ES6+ support (Chrome 60+, Firefox 55+, Safari 12+)
- **Mobile Browsers**: iOS Safari 12+, Chrome Mobile 60+
- **Geolocation**: Requires HTTPS in production for location detection

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
