const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../assets/logo.svg');
const outputDir = path.join(__dirname, '..');

// Common favicon sizes
const sizes = [
  { size: 16, name: 'favicon-16.png' },
  { size: 32, name: 'favicon-32.png' },
  { size: 48, name: 'favicon-48.png' },
  { size: 64, name: 'favicon-64.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'favicon-192.png' },
  { size: 512, name: 'favicon-512.png' },
];

async function generateFavicons() {
  console.log('Generating favicons from SVG...');
  
  for (const { size, name } of sizes) {
    try {
      const outputPath = path.join(outputDir, name);
      await sharp(svgPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✓ Generated ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`✗ Failed to generate ${name}:`, error.message);
    }
  }
  
  console.log('\nFavicon generation complete!');
}

generateFavicons().catch(console.error);

