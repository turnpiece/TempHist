const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Map image filenames to location IDs
const imageMap = {
  'London Eye.jpeg': 'london',
  'manchester.jpg': 'manchester',
  'Birmingham_skyline_from_Snowhill.jpg': 'birmingham',
  'cardiff-castle-shell-keep-8847.jpg': 'cardiff',
  'Belfast_City_Hall.jpg': 'belfast',
  'Samuel_Beckett_Bridge_At_Sunset_Dublin_Ireland_(97037639).jpeg': 'dublin',
  'New York skyline.jpeg': 'new_york',
  'Chicago.jpg': 'chicago',
  'San_Francisco_from_the_Marin_Headlands_in_August_2022.jpg': 'san_francisco',
  'Los_Angeles,_Winter_2016.jpg': 'los_angeles',
  'Sydney.jpg': 'sydney',
  'Melbourne-pexels-nick-english-677917283-18198178.jpg': 'melbourne',
  'Auckland_Harbour_Bridge_Sunset.jpg': 'auckland',
  'Toronto.jpg': 'toronto',
  'vancouver-cityscape.jpg': 'vancouver',
  'Singapore_Skyline_at_Bluehour.jpg': 'singapore',
  'Hong_Kong_from_Victoria_Peak1.jpg': 'hong_kong',
  'Aerial_View_of_Sea_Point,_Cape_Town_South_Africa.jpg': 'cape_town',
  'Skyline_of_Edinburgh.jpg': 'edinburgh',
  'Glasgow_-_aerial_-_2025-04-17_12.jpg': 'glasgow',
};

const inputDir = path.join(__dirname, '../assets/locations');
const outputDir = path.join(__dirname, '../assets/locations/processed');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function processImage(filename, locationId) {
  const inputPath = path.join(inputDir, filename);
  const baseName = locationId.replace(/_/g, '-');
  
  // Check if file exists
  if (!fs.existsSync(inputPath)) {
    console.warn(`⚠️  Image not found: ${filename}`);
    return null;
  }

  const webpPath = path.join(outputDir, `${baseName}.webp`);
  const jpegPath = path.join(outputDir, `${baseName}.jpg`);

  try {
    // Process to WebP
    await sharp(inputPath)
      .resize(320, 200, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 85 })
      .toFile(webpPath);

    // Process to JPEG fallback
    await sharp(inputPath)
      .resize(320, 200, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toFile(jpegPath);

    console.log(`✅ Processed: ${filename} -> ${baseName}.webp & ${baseName}.jpg`);
    return true;
  } catch (error) {
    console.error(`❌ Error processing ${filename}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting image processing...\n');
  console.log('Note: Location data and image metadata are now managed by the API.');
  console.log('This script only processes images. Image URLs and metadata should be updated in the API.\n');

  let processed = 0;
  let failed = 0;

  // Process all images
  for (const [filename, locationId] of Object.entries(imageMap)) {
    const result = await processImage(filename, locationId);
    if (result) {
      processed++;
    } else {
      failed++;
    }
  }

  console.log(`\n✨ Done!`);
  console.log(`✅ Successfully processed: ${processed} images`);
  if (failed > 0) {
    console.log(`❌ Failed to process: ${failed} images`);
  }
  console.log(`📁 Processed images saved to: ${outputDir}`);
  console.log('\n⚠️  Remember: Image URLs and metadata must be updated in the API backend.');
}

main().catch(console.error);

