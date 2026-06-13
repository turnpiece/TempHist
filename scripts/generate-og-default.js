/**
 * Builds assets/og-default.png — 1200×630 Open Graph image with the site gradient
 * (#242456 → #343499) and centred logo, for consistent link previews (iOS, etc.).
 */
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');

const WIDTH = 1200;
const HEIGHT = 630;
const LOGO_MAX = 520;

const svgPath = path.join(__dirname, '../assets/logo.svg');
const outPath = path.join(__dirname, '../assets/og-default.png');

async function main() {
  const gradientSvg = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#242456"/>
          <stop offset="100%" stop-color="#343499"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
    </svg>`
  );

  const background = await sharp(gradientSvg).png().toBuffer();

  const logoBuf = await sharp(svgPath)
    .resize(LOGO_MAX, LOGO_MAX, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp(background)
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png()
    .toFile(outPath);

  const st = fs.statSync(outPath);
  console.log(`✓ Wrote ${outPath} (${WIDTH}×${HEIGHT}, ${Math.round(st.size / 1024)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
