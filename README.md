# Temperature History Visualization

A web application that visualizes historical temperature data for any location, showing how temperatures have changed over the past 50 years for a specific date.

## Features

- Visualizes 50 years of temperature data in an interactive chart
- Automatically detects user's location
- Shows average temperature
- Responsive design that works on both desktop and mobile
- Handles edge cases like leap years and timezone differences

## Tech Stack

- Frontend: Vanilla JavaScript with Chart.js for visualization
- Backend: Node.js with Express
- Data Source: Historical weather data API
- Hosting: Render (free tier)

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
   # Add any other environment variables needed
   ```

4. Start the development server:
   ```bash
   npm start
   ```

The application will be available at `http://localhost:3000`

## Usage

1. The application will automatically try to detect your location
2. Alternatively, you can specify a location using the URL parameter:
   ```
   http://localhost:3000?location=London
   ```
3. The chart will display temperature data for the current date (or yesterday if before 1 AM)
4. Hover over bars to see exact temperatures for each year
5. The average temperature is shown as a vertical line
6. The current year's temperature is highlighted in green

## Performance Considerations

- API requests are batched in groups of 10 for optimal performance
- Server-side caching is implemented to reduce API load
- Note: On the free tier of Render, the first request after inactivity may take several minutes due to cold start

## Development

- `app.js`: Main frontend application code
- `server.js`: Backend server implementation
- `package.json`: Project dependencies and scripts

## License

[Your chosen license]

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
