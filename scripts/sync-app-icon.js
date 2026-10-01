import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const searchDirs = [
  path.join(rootDir, 'src', 'icon-images'),
  path.join(rootDir, 'icon-images')
];

const validExts = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

function findIconImage() {
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (
        validExts.includes(ext) &&
        !file.endsWith('.gitkeep') &&
        !file.endsWith('.md') &&
        !file.endsWith('.txt')
      ) {
        return path.join(dir, file);
      }
    }
  }
  return null;
}

async function syncIcons() {
  const foundIcon = findIconImage();
  if (!foundIcon) {
    console.log('[Icon Sync] No custom icon image found. Using default assets.');
    process.exit(0);
  }

  console.log(`[Icon Sync] Found custom icon: ${foundIcon}`);

  let sharp = null;
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default || sharpModule;
  } catch (err) {
    console.warn('[Icon Sync] sharp not available, will use direct copy if PNG:', err.message);
  }

  // Target directories for mipmap icons
  const androidMipmaps = [
    { dir: 'android/app/src/main/res/mipmap-mdpi', iconSize: 48, fgSize: 108 },
    { dir: 'android/app/src/main/res/mipmap-hdpi', iconSize: 72, fgSize: 162 },
    { dir: 'android/app/src/main/res/mipmap-xhdpi', iconSize: 96, fgSize: 216 },
    { dir: 'android/app/src/main/res/mipmap-xxhdpi', iconSize: 144, fgSize: 324 },
    { dir: 'android/app/src/main/res/mipmap-xxxhdpi', iconSize: 192, fgSize: 432 },
  ];

  // Target directories for splash screens
  const splashDrawables = [
    'android/app/src/main/res/drawable',
    'android/app/src/main/res/drawable-port-mdpi',
    'android/app/src/main/res/drawable-port-hdpi',
    'android/app/src/main/res/drawable-port-xhdpi',
    'android/app/src/main/res/drawable-port-xxhdpi',
    'android/app/src/main/res/drawable-port-xxxhdpi',
    'android/app/src/main/res/drawable-land-mdpi',
    'android/app/src/main/res/drawable-land-hdpi',
    'android/app/src/main/res/drawable-land-xhdpi',
    'android/app/src/main/res/drawable-land-xxhdpi',
    'android/app/src/main/res/drawable-land-xxxhdpi',
  ];

  const ext = path.extname(foundIcon).toLowerCase();

  // If sharp is available, convert any format (PNG, JPG, WEBP, SVG) to high-quality PNGs
  if (sharp) {
    try {
      const inputBuffer = fs.readFileSync(foundIcon);

      // 1. Render input once to a crisp master PNG buffer (1024x1024)
      const masterBuffer = await sharp(inputBuffer)
        .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      // 2. Render splash master once (1024x1024 with app theme background)
      const splashBuffer = await sharp(inputBuffer)
        .resize(1024, 1024, { fit: 'contain', background: { r: 6, g: 9, b: 14, alpha: 1 } })
        .png()
        .toBuffer();

      // 3. Replace ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png in all mipmaps
      for (const target of androidMipmaps) {
        const fullDir = path.join(rootDir, target.dir);
        if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

        const iconBuf = await sharp(masterBuffer)
          .resize(target.iconSize, target.iconSize)
          .png()
          .toBuffer();

        const fgBuf = await sharp(masterBuffer)
          .resize(target.fgSize, target.fgSize)
          .png()
          .toBuffer();

        fs.writeFileSync(path.join(fullDir, 'ic_launcher.png'), iconBuf);
        fs.writeFileSync(path.join(fullDir, 'ic_launcher_round.png'), iconBuf);
        fs.writeFileSync(path.join(fullDir, 'ic_launcher_foreground.png'), fgBuf);
        console.log(`[Icon Sync] Updated ic_launcher, ic_launcher_round, ic_launcher_foreground in ${target.dir}`);
      }

      // 4. Replace splash.png in all drawable directories
      for (const relDir of splashDrawables) {
        const fullDir = path.join(rootDir, relDir);
        if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

        fs.writeFileSync(path.join(fullDir, 'splash.png'), splashBuffer);
        console.log(`[Icon Sync] Updated splash.png in ${relDir}`);
      }

      // 5. Remove old vector foreground XML if present so Android prioritizes custom PNG
      const vectorForeground = path.join(rootDir, 'android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml');
      if (fs.existsSync(vectorForeground)) {
        try {
          fs.unlinkSync(vectorForeground);
          console.log('[Icon Sync] Removed old drawable-v24/ic_launcher_foreground.xml to prioritize custom icon');
        } catch (e) {
          // ignore
        }
      }

      console.log('[Icon Sync] SUCCESS: Replaced ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png, and splash.png across all Android resource folders.');
      process.exit(0);
    } catch (err) {
      console.warn('[Icon Sync] sharp processing encountered error, attempting direct copy fallback:', err);
    }
  }

  // Fallback if sharp fails or not available and image is PNG
  if (ext === '.png') {
    for (const target of androidMipmaps) {
      const fullDir = path.join(rootDir, target.dir);
      if (fs.existsSync(fullDir)) {
        fs.copyFileSync(foundIcon, path.join(fullDir, 'ic_launcher.png'));
        fs.copyFileSync(foundIcon, path.join(fullDir, 'ic_launcher_round.png'));
        fs.copyFileSync(foundIcon, path.join(fullDir, 'ic_launcher_foreground.png'));
      }
    }

    for (const relDir of splashDrawables) {
      const fullDir = path.join(rootDir, relDir);
      if (fs.existsSync(fullDir)) {
        fs.copyFileSync(foundIcon, path.join(fullDir, 'splash.png'));
      }
    }
    console.log('[Icon Sync] Directly copied PNG to all launcher icons, foreground, and splash.');
    process.exit(0);
  }
}

await syncIcons();
process.exit(0);
