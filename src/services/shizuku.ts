import { registerPlugin, Capacitor } from '@capacitor/core';

export interface ShizukuStatus {
  isAndroid: boolean;
  shizukuAvailable: boolean;
  shizukuPermission: boolean;
  shizukuInstalled?: boolean;
  shizukuVersion?: number;
  shizukuUid?: number;
  rootAvailable: boolean;
}

export interface PasteFileItem {
  name: string;
  content: string;
  isBase64?: boolean;
}

export interface PasteResult {
  success: boolean;
  method: 'shizuku' | 'root' | 'direct' | 'simulation';
  count: number;
  targetDir: string;
  message: string;
  output?: string;
}

export interface ShizukuPluginInterface {
  checkStatus(): Promise<ShizukuStatus>;
  requestPermission(): Promise<{ granted: boolean; message?: string }>;
  pasteFiles(options: { targetDir: string; files: PasteFileItem[] }): Promise<PasteResult>;
  cleanupPastedFiles(): Promise<{ success: boolean; message: string }>;
  openShizuku(): Promise<{ opened: boolean; message?: string }>;
  openUrl(options: { url: string }): Promise<{ success: boolean; message?: string }>;
}

const ShizukuNative = registerPlugin<ShizukuPluginInterface>('ShizukuPlugin');

export const isNativeAndroid = (): boolean => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
};

export const checkShizukuStatus = async (): Promise<ShizukuStatus> => {
  if (isNativeAndroid()) {
    try {
      return await ShizukuNative.checkStatus();
    } catch (err) {
      console.warn('Shizuku checkStatus native call failed:', err);
      return {
        isAndroid: true,
        shizukuAvailable: false,
        shizukuPermission: false,
        rootAvailable: false,
      };
    }
  }

  // Web Browser Simulation
  return {
    isAndroid: false,
    shizukuAvailable: true,
    shizukuPermission: true,
    shizukuVersion: 13,
    shizukuUid: 2000,
    rootAvailable: false,
  };
};

export const requestShizukuPermission = async (): Promise<{ granted: boolean; message?: string }> => {
  if (isNativeAndroid()) {
    try {
      return await ShizukuNative.requestPermission();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { granted: false, message: msg };
    }
  }

  return { granted: true, message: 'Browser simulation: Permission granted' };
};

export const openShizukuApp = async (): Promise<{ opened: boolean; message?: string }> => {
  if (isNativeAndroid()) {
    try {
      return await ShizukuNative.openShizuku();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { opened: false, message: msg };
    }
  }

  try {
    const a = document.createElement('a');
    a.href = 'https://shizuku.rikka.app/';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  } catch (e) {
    console.warn('Unable to navigate to Shizuku guide:', e);
  }
  return { opened: true, message: 'Opened Shizuku guide' };
};

export const pasteFilesToDestination = async (
  targetDir: string,
  files: PasteFileItem[]
): Promise<PasteResult> => {
  if (isNativeAndroid()) {
    return await ShizukuNative.pasteFiles({ targetDir, files });
  }

  // Web fallback simulation
  return {
    success: true,
    method: 'simulation',
    count: files.length,
    targetDir,
    message: '',
  };
};

export const cleanupPastedFiles = async (): Promise<{ success: boolean; message: string }> => {
  if (isNativeAndroid()) {
    try {
      return await ShizukuNative.cleanupPastedFiles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg };
    }
  }

  return { success: true, message: '' };
};

export const openExternalUrl = async (url: string): Promise<boolean> => {
  if (!url || !url.trim()) return false;
  const cleanUrl = url.trim();

  // 1. In native Android Capacitor environment, use native plugin intent
  if (isNativeAndroid()) {
    try {
      await ShizukuNative.openUrl({ url: cleanUrl });
      return true;
    } catch (e) {
      console.warn('Native openUrl failed, attempting web view bridges:', e);
    }
  }

  // 2. Try window.open with '_system' (standard Capacitor/Cordova hook to launch external app)
  try {
    const win = window.open(cleanUrl, '_system');
    if (win) return true;
  } catch (err) {
    console.warn('window.open _system failed:', err);
  }

  // 3. Anchor click fallback
  try {
    const a = document.createElement('a');
    a.href = cleanUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch (err) {
    console.warn('Anchor click failed:', err);
  }

  // 4. Final browser location assignment
  try {
    window.location.href = cleanUrl;
    return true;
  } catch (err) {
    console.warn('window.location.href failed:', err);
    return false;
  }
};
