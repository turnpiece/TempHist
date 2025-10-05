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
- Multiple time period views: Today, Past Week, Past Month, Past Year
- Automatically detects user's location with manual location selection
- Shows average temperature and trend analysis
- Responsive design that works on both desktop and mobile
- Handles edge cases like leap years and timezone differences
- Zero layout shift (CLS) with skeleton loader and background fallback
- Fast, modern build with Vite, TypeScript, and SCSS support
- Firebase anonymous authentication for secure API access
- Comprehensive test suite with Vitest

## Tech Stack

- **Frontend**: TypeScript with Chart.js for visualization
- **Build Tool**: [Vite](https://vitejs.dev/) (for fast dev/build and modern ES modules)
- **Styles**: SCSS (with hot reload and code splitting via Vite)
- **Authentication**: Firebase Anonymous Auth
- **Testing**: Vitest with JSDOM for comprehensive test coverage
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
   API_BASE=http://localhost:3000
   ```

4. Start the development server with Vite:

   ```bash
   npm run dev
   ```

5. Start the backend proxy server (in a separate terminal):
   ```bash
   npm start
   ```

The application will be available at `http://localhost:5173`

## Building for Production

1. Type-check the TypeScript code:

   ```bash
   npm run type-check
   ```

2. Build the app:

   ```bash
   npm run build
   ```

   This outputs static files to the `dist/` directory.

3. Deploy the contents of `dist/` to your web root.

4. Set environment variables for production:

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

## Static Site Deployment and .htaccess

If you are deploying to Apache (e.g., SiteGround) and want clean URLs for static pages, add a `.htaccess` file to your web root:

```apache
RewriteEngine On

# Remove .html extension from URLs
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^([^\.]+)$ $1.html [NC,L]

# Redirect .html to clean URLs (optional - removes .html from browser address bar)
RewriteCond %{THE_REQUEST} /([^.]+)\.html [NC]
RewriteRule ^ /%1 [NC,L,R=301]
```

This allows:

- `https://yoursite.com/privacy` → serves `privacy.html`
- `https://yoursite.com/privacy.html` → redirects to `/privacy`
- Clean URLs for all static pages

## Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
2. Enable Anonymous Authentication in the Firebase Auth settings.
3. Add your Firebase config to `src/main.ts`.
4. The app will sign in users anonymously and use the Firebase ID token for API requests.

**Note**: For local development, the app uses a test token instead of Firebase authentication to avoid requiring Firebase setup during development.

## Lighthouse/CLS Optimization

- The app uses a skeleton loader and reserves space for all dynamic content to achieve a CLS (Cumulative Layout Shift) score near zero.
- A background colour and gradient are set inline in the `<head>` to prevent FOUC (Flash of Unstyled Content).
- All images and SVGs have explicit width/height attributes.
- Responsive min-heights are set for text elements to prevent layout shift on mobile.

## Webhook and Cloudflare Notes

- If you use webhooks (e.g., for auto-deployment), ensure Cloudflare is set to **bypass cache** for your webhook endpoint (e.g., `/webhook.php`).
- Use a `.htaccess` file for SPA routing if deploying to Apache.

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

## Usage

1. The application will automatically try to detect your location
2. Navigate between different time periods: Today, Past Week, Past Month, Past Year
3. The chart will display temperature data for the current date (or yesterday if before 1 AM)
4. Hover over bars to see exact temperatures for each year
5. The average temperature is shown as a horizontal line
6. The current year's temperature is highlighted in green
7. Trend analysis shows temperature changes over time

## Development

### Project Structure

- `src/main.ts`: Main TypeScript application entry point
- `src/types/`: TypeScript type definitions
- `src/utils/`: Utility functions (location, platform, data notices)
- `src/services/`: Service modules (location detection, API interactions)
- `src/api/`: API client functions
- `server.js`: Backend proxy server (development mock data, CORS handling)
- `package.json`: Project dependencies and scripts
- `styles.scss`: Main SCSS file
- `.env`: Environment configuration (API endpoints, ports, environment mode)
- `test/`: Comprehensive test suite with Vitest

### Key Features

- **TypeScript**: Full type safety and better development experience
- **Modular Architecture**: Clean separation of concerns with dedicated modules
- **Comprehensive Testing**: Unit tests, integration tests, and API tests
- **Development Server**: Hot reload with Vite for fast development
- **Production Build**: Optimized bundle with TypeScript compilation

### TypeScript Benefits

The application has been converted from JavaScript to TypeScript, providing:

- **Type Safety**: Catch errors at compile time instead of runtime
- **Better IDE Support**: Enhanced autocomplete, refactoring, and navigation
- **Improved Maintainability**: Clear interfaces and type definitions
- **Reduced Bugs**: Type checking prevents common JavaScript pitfalls
- **Better Documentation**: Types serve as inline documentation

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
- **Firebase Configuration**: Firebase config is currently hardcoded in `src/main.ts` (should be moved to environment variables)
- **Error Handling**: Limited fallback options when the weather API is unavailable
- **Mobile Debug Mode**: Debug overlay appears on mobile devices and may interfere with UI

### Technical Debt

- **Environment Configuration**: Firebase config and API endpoints should be configurable via environment variables
- **Mock Data**: Development mode uses static mock data instead of realistic historical data
- **Error Recovery**: Limited retry logic for failed API calls
- **Mobile Optimization**: Some mobile-specific optimizations could be improved
- **TypeScript Strictness**: Could enable stricter TypeScript settings for better type safety

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
