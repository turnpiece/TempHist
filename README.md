# Temperature History Visualization

A web application that visualizes historical temperature data for any location, showing how temperatures have changed over the past 50 years for a specific date.

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

- Frontend: Vanilla JavaScript with Chart.js for visualization
- Build Tool: [Vite](https://vitejs.dev/) (for fast dev/build and modern ES modules)
- Styles: SCSS (with hot reload and code splitting via Vite)
- Authentication: Firebase Anonymous Auth
- Backend: Node.js with Express (for API/proxy)
- Data Source: Historical weather data API
- Hosting: Static site (e.g., SiteGround, Netlify, Vercel, or any Apache/Nginx host)

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

3. Create a `.env` file in the root directory with your configuration (if needed):

   ```
   PORT=3000
   # Add any other environment variables needed
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

2. Deploy the contents of `dist/` to your web root (e.g., `public_html` on SiteGround).

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
- A background color and gradient are set inline in the `<head>` to prevent FOUC (Flash of Unstyled Content).
- All images and SVGs have explicit width/height attributes.
- Responsive min-heights are set for text elements to prevent layout shift on mobile.

## Webhook and Cloudflare Notes

- If you use webhooks (e.g., for auto-deployment), ensure Cloudflare is set to **bypass cache** for your webhook endpoint (e.g., `/webhook.php`).
- Use a `.htaccess` file for SPA routing if deploying to Apache.

## Usage

1. The application will automatically try to detect your location
2. Alternatively, you can specify a location using the URL parameter:
   ```
   https://yourdomain.com?location=London
   ```
3. The chart will display temperature data for the current date (or yesterday if before 1 AM)
4. Hover over bars to see exact temperatures for each year
5. The average temperature is shown as a vertical line
6. The current year's temperature is highlighted in green

## Development

- `app.js`: Main frontend application code (ES modules, Vite, SCSS imports)
- `server.js`: Backend server implementation (API/proxy)
- `package.json`: Project dependencies and scripts
- `styles.scss`: Main SCSS file (imported in JS)

## License

[Your chosen license]

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
