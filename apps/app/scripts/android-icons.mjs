// Renders the legacy Android launcher icons (Android 7, before adaptive icons) from public/logo.svg.
// Android 8+ uses the vector in android/app/src/main/res/drawable/ic_launcher_foreground.xml.
// Run with `pnpm generate:icons` after changing the logo.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RES = new URL('../android/app/src/main/res/', import.meta.url);
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

const logo = await readFile(new URL('../public/logo.svg', import.meta.url), 'utf8');
// The round icon is the same logo on a circle instead of a rounded square.
const roundLogo = logo.replace(
  /<rect width="512" height="512" rx="112" (fill="[^"]+")\/>/,
  '<circle cx="256" cy="256" r="256" $1/>',
);
if (roundLogo === logo) {
  throw new Error('logo.svg changed shape: update the round icon in this script');
}

for (const [density, size] of Object.entries(SIZES)) {
  for (const [name, svg] of [
    ['ic_launcher', logo],
    ['ic_launcher_round', roundLogo],
  ]) {
    const file = new URL(`mipmap-${density}/${name}.png`, RES);
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(fileURLToPath(file));
  }
}
console.log('Android launcher icons written to', fileURLToPath(RES));
