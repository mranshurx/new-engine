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
      if (validExts.includes(ext)) {
        return path.join(dir, file);
      }
    }
  }
  return null;
}

const foundIcon = findIconImage();
if (foundIcon) {
  console.log(`[Icon Sync] Found custom icon: ${foundIcon}`);
  
  // If PNG, sync to Android launcher icons
  if (foundIcon.endsWith('.png')) {
    const androidMipmaps = [
      'android/app/src/main/res/mipmap-hdpi',
      'android/app/src/main/res/mipmap-mdpi',
      'android/app/src/main/res/mipmap-xhdpi',
      'android/app/src/main/res/mipmap-xxhdpi',
      'android/app/src/main/res/mipmap-xxxhdpi'
    ];

    for (const relDir of androidMipmaps) {
      const fullDir = path.join(rootDir, relDir);
      if (fs.existsSync(fullDir)) {
        try {
          fs.copyFileSync(foundIcon, path.join(fullDir, 'ic_launcher.png'));
          fs.copyFileSync(foundIcon, path.join(fullDir, 'ic_launcher_round.png'));
        } catch (e) {
          console.warn(`[Icon Sync] Could not write to ${relDir}:`, e.message);
        }
      }
    }
  }
} else {
  console.log('[Icon Sync] No custom icon image found. Using default assets.');
}
