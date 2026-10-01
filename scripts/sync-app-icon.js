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
    return;
  }

  console.log(`[Icon Sync] Found custom icon: ${foundIcon}`);

  let sharp = null;
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default || sharpModule;
  } catch (err) {
    console.warn('[Icon Sync] sharp not available, will use direct copy if PNG:', err.message);
  }

  // Target densities for launcher icons
  const androidMipmaps = [
    { dir: 'android/app/src/main/res/mipmap-mdpi', iconSize: 48, fgSize: 108 },
    { dir: 'android/app/src/main/res/mipmap-hdpi', iconSize: 72, fgSize: 162 },
    { dir: 'android/app/src/main/res/mipmap-xhdpi', iconSize: 96, fgSize: 216 },
    { dir: 'android/app/src/main/res/mipmap-xxhdpi', iconSize: 144, fgSize: 324 },
    { dir: 'android/app/src/main/res/mipmap-xxxhdpi', iconSize: 192, fgSize: 432 },
  ];

  const ext = path.extname(foundIcon).toLowerCase();

  // Clean up legacy duplicate splash folders that bloated APK by 25+ MB
  const legacySplashDirs = [
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

  for (const relDir of legacySplashDirs) {
    const fullDir = path.join(rootDir, relDir);
    if (fs.existsSync(fullDir)) {
      try {
        fs.rmSync(fullDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  // If sharp is available, convert any format (PNG, JPG, WEBP, SVG) to high-quality compressed PNGs
  if (sharp) {
    try {
      const inputBuffer = fs.readFileSync(foundIcon);

      // 1. High-efficiency splash buffer (512x512 with palette quantization: ~100KB instead of 2.4MB)
      const splashBuffer = await sharp(inputBuffer)
        .resize(512, 512, { fit: 'contain', background: { r: 6, g: 9, b: 14, alpha: 1 } })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();

      const drawableDir = path.join(rootDir, 'android/app/src/main/res/drawable');
      if (!fs.existsSync(drawableDir)) fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(path.join(drawableDir, 'splash.png'), splashBuffer);
      console.log(`[Icon Sync] Updated compressed splash.png (${Math.round(splashBuffer.length / 1024)} KB)`);

      // 2. High-efficiency launcher icons with density scaling and palette quantization
      for (const target of androidMipmaps) {
        const fullDir = path.join(rootDir, target.dir);
        if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

        const iconBuf = await sharp(inputBuffer)
          .resize(target.iconSize, target.iconSize, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png({ compressionLevel: 9, palette: true })
          .toBuffer();

        const fgBuf = await sharp(inputBuffer)
          .resize(target.fgSize, target.fgSize, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png({ compressionLevel: 9, palette: true })
          .toBuffer();

        fs.writeFileSync(path.join(fullDir, 'ic_launcher.png'), iconBuf);
        fs.writeFileSync(path.join(fullDir, 'ic_launcher_round.png'), iconBuf);
        fs.writeFileSync(path.join(fullDir, 'ic_launcher_foreground.png'), fgBuf);
        console.log(`[Icon Sync] Updated optimized icons in ${target.dir}`);
      }

      // 3. Remove old vector foreground XML if present so Android prioritizes custom PNG
      const vectorForeground = path.join(rootDir, 'android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml');
      if (fs.existsSync(vectorForeground)) {
        try {
          fs.unlinkSync(vectorForeground);
        } catch {
          // ignore
        }
      }

      console.log('[Icon Sync] SUCCESS: Replaced ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png, and splash.png with size-optimized assets.');
      return;
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

    const drawableDir = path.join(rootDir, 'android/app/src/main/res/drawable');
    if (fs.existsSync(drawableDir)) {
      fs.copyFileSync(foundIcon, path.join(drawableDir, 'splash.png'));
    }
    console.log('[Icon Sync] Directly copied PNG to launcher icons, foreground, and splash.');
  }
}

await syncIcons();
process.exit(0);
