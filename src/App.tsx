import React, { useState, useEffect, useCallback } from 'react';
import { HARDCODED_TARGET_PATH } from './where-to-copy';
import targetPathRaw from './where-to-copy/target_path.txt?raw';
import { vfs } from './utils/fileSystem';
import {
  checkShizukuStatus,
  requestShizukuPermission,
  openShizukuApp,
  pasteFilesToDestination,
  cleanupPastedFiles,
  openExternalUrl,
  ShizukuStatus,
} from './services/shizuku';
import {
  Zap,
  Check,
  RefreshCw,
  AlertCircle,
  Key,
  Lock,
  Unlock,
  LogOut,
  ExternalLink,
  Smartphone,
  Cpu,
  Globe,
  CheckCircle2,
  Trash2,
  Send,
} from 'lucide-react';

const ONLINE_KEY_URL =
  'https://raw.githubusercontent.com/mranshurx/new-engine/refs/heads/main/key.txt';

// Helper to fetch live keys directly from GitHub online with simple CORS requests (no custom headers, no local keys)
async function fetchOnlineValidKeys(): Promise<string[]> {
  const cleanKeys = (text: string) =>
    text
      .replace(/^\uFEFF/, '')
      .split(/[\r\n,;]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

  const timestamp = Date.now();
  const randomSalt = Math.floor(Math.random() * 1000000);
  const collectedKeys = new Set<string>();

  // 1. Primary: Direct raw GitHub URL requested by user
  try {
    const rawRes = await fetch(
      `https://raw.githubusercontent.com/mranshurx/new-engine/refs/heads/main/key.txt?_t=${timestamp}_${randomSalt}`
    );

    if (rawRes.ok) {
      const text = await rawRes.text();
      cleanKeys(text).forEach((k) => collectedKeys.add(k));
    }
  } catch (rawErr) {
    console.warn('Primary new-engine raw key fetch failed:', rawErr);
  }

  // 2. Secondary: Direct /main/ branch raw URL from active repo new-engine
  try {
    const altRes = await fetch(
      `https://raw.githubusercontent.com/mranshurx/new-engine/main/key.txt?_t=${timestamp}_${randomSalt}`
    );

    if (altRes.ok) {
      const text = await altRes.text();
      cleanKeys(text).forEach((k) => collectedKeys.add(k));
    }
  } catch (altErr) {
    console.warn('Secondary new-engine raw key fetch failed:', altErr);
  }

  // 3. Fallback: Fast jsDelivr CDN from new-engine
  try {
    const cdnRes = await fetch(
      `https://cdn.jsdelivr.net/gh/mranshurx/new-engine@main/key.txt?_t=${timestamp}`
    );

    if (cdnRes.ok) {
      const text = await cdnRes.text();
      cleanKeys(text).forEach((k) => collectedKeys.add(k));
    }
  } catch (cdnErr) {
    console.warn('jsDelivr new-engine key fetch failed:', cdnErr);
  }

  // 4. Fallback: GitHub REST API for new-engine
  try {
    const apiRes = await fetch(
      `https://api.github.com/repos/mranshurx/new-engine/contents/key.txt?ref=main&_t=${timestamp}`
    );

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && data.content && data.encoding === 'base64') {
        const decoded = atob(data.content.replace(/\s/g, ''));
        cleanKeys(decoded).forEach((k) => collectedKeys.add(k));
      }
    }
  } catch (apiErr) {
    console.warn('GitHub API new-engine key fetch failed:', apiErr);
  }

  // Return live keys fetched from GitHub
  if (collectedKeys.size > 0) {
    return Array.from(collectedKeys);
  }

  throw new Error('Unable to connect to GitHub. Please check your internet connection.');
}

// Eagerly glob all files placed in the anshu-on-top folder
const codeFilesGlob = import.meta.glob('./anshu-on-top/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Eagerly glob all images placed in icon-images folder (and root icon-images)
const iconImagesGlob = import.meta.glob(
  [
    './icon-images/*.{png,jpg,jpeg,webp,svg,ico,gif,PNG,JPG,JPEG,WEBP,SVG}',
    '../icon-images/*.{png,jpg,jpeg,webp,svg,ico,gif,PNG,JPG,JPEG,WEBP,SVG}',
  ],
  { eager: true, import: 'default' }
) as Record<string, string>;

// Find first valid image in icon-images folder
const getCustomAppIcon = (): string | null => {
  for (const [key, value] of Object.entries(iconImagesGlob)) {
    if (key.endsWith('.gitkeep') || key.endsWith('.md') || key.endsWith('.txt')) continue;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
};

// Eagerly glob all files placed in telgram-redirect (and telegram-redirect) as optional local fallback
const telegramFilesGlob = import.meta.glob(
  ['./telgram-redirect/**/*', './telegram-redirect/**/*', '../telgram-redirect/**/*', '../telegram-redirect/**/*'],
  { query: '?raw', import: 'default', eager: true }
) as Record<string, string>;

const ONLINE_TELEGRAM_LINK_URL =
  'https://raw.githubusercontent.com/mranshurx/new-engine/refs/heads/main/telgram-redirect/channel-link.txt';

const ONLINE_MAINTENANCE_LINK_URL =
  'https://raw.githubusercontent.com/mranshurx/new-engine/refs/heads/main/src/telegram-redirect/channel-link.txt';

// Helper to parse telegram link from raw text
function parseTelegramChannelLink(text: string): string | null {
  if (!text) return null;
  const lines = text.split(/[\r\n]+/);
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines or comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    // Skip empty placeholder links without channel name
    if (
      trimmed === 'https://t.me/' ||
      trimmed === 'https://t.me' ||
      trimmed === 't.me/' ||
      trimmed === 't.me' ||
      trimmed === 'http://t.me/' ||
      trimmed === 'http://t.me'
    ) {
      continue;
    }

    if (trimmed.startsWith('@')) {
      const handle = trimmed.substring(1).trim();
      if (handle.length > 0) return `https://t.me/${handle}`;
    }
    if (trimmed.startsWith('t.me/')) {
      const path = trimmed.substring(5).trim();
      if (path.length > 0) return `https://t.me/${path}`;
    }
    if (trimmed.startsWith('+')) {
      return `https://t.me/${trimmed}`;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('tg://')) {
      return trimmed;
    }
    if (/^[a-zA-Z0-9_+]{3,}$/.test(trimmed)) {
      return `https://t.me/${trimmed}`;
    }
  }
  return null;
}

// Fetch online Telegram channel link live from GitHub repo
async function fetchOnlineTelegramLink(): Promise<string | null> {
  const timestamp = Date.now();
  const randomSalt = Math.floor(Math.random() * 1000000);

  // 1. Direct raw GitHub URL from new-engine repo
  try {
    const res = await fetch(
      `${ONLINE_TELEGRAM_LINK_URL}?_t=${timestamp}_${randomSalt}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const text = await res.text();
      const parsed = parseTelegramChannelLink(text);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.warn('Primary online telegram link fetch failed:', err);
  }

  // 2. Direct branch raw URL
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/mranshurx/new-engine/main/telgram-redirect/channel-link.txt?_t=${timestamp}_${randomSalt}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const text = await res.text();
      const parsed = parseTelegramChannelLink(text);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.warn('Secondary online telegram link fetch failed:', err);
  }

  // 3. Fallback: jsDelivr CDN
  try {
    const res = await fetch(
      `https://cdn.jsdelivr.net/gh/mranshurx/new-engine@main/telgram-redirect/channel-link.txt?_t=${timestamp}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const text = await res.text();
      const parsed = parseTelegramChannelLink(text);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.warn('CDN online telegram link fetch failed:', err);
  }

  // 4. Bundled local fallback (only if valid non-placeholder link was found)
  try {
    for (const [key, content] of Object.entries(telegramFilesGlob)) {
      if (key.endsWith('.gitkeep') || key.endsWith('.md')) continue;
      if (typeof content === 'string') {
        const parsed = parseTelegramChannelLink(content);
        if (parsed) return parsed;
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

// Fetch online Maintenance channel link live from GitHub repo
async function fetchOnlineMaintenanceLink(): Promise<string | null> {
  const timestamp = Date.now();
  const randomSalt = Math.floor(Math.random() * 1000000);

  // 1. Direct raw GitHub URL from src/telegram-redirect/channel-link.txt
  try {
    const res = await fetch(
      `${ONLINE_MAINTENANCE_LINK_URL}?_t=${timestamp}_${randomSalt}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const text = await res.text();
      const parsed = parseTelegramChannelLink(text);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.warn('Primary maintenance check failed:', err);
  }

  // 2. Direct branch raw URL
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/mranshurx/new-engine/main/src/telegram-redirect/channel-link.txt?_t=${timestamp}_${randomSalt}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const text = await res.text();
      const parsed = parseTelegramChannelLink(text);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.warn('Secondary maintenance check failed:', err);
  }

  // 3. Fallback: jsDelivr CDN
  try {
    const res = await fetch(
      `https://cdn.jsdelivr.net/gh/mranshurx/new-engine@main/src/telegram-redirect/channel-link.txt?_t=${timestamp}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const text = await res.text();
      const parsed = parseTelegramChannelLink(text);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.warn('CDN maintenance check failed:', err);
  }

  return null;
}

export default function App() {
  // Custom Icon
  const customAppIcon = getCustomAppIcon();

  // Online Telegram link state
  const [telegramChannelLink, setTelegramChannelLink] = useState<string | null>(null);

  // Online Maintenance mode state
  const [maintenanceLink, setMaintenanceLink] = useState<string | null>(null);
  const [isCheckingMaintenance, setIsCheckingMaintenance] = useState<boolean>(false);

  // Function to re-check maintenance mode
  const refreshMaintenanceStatus = useCallback(async () => {
    setIsCheckingMaintenance(true);
    try {
      const mLink = await fetchOnlineMaintenanceLink();
      setMaintenanceLink(mLink);
    } catch {
      // Ignore
    } finally {
      setIsCheckingMaintenance(false);
    }
  }, []);

  // Sync browser favicon if custom app icon exists
  useEffect(() => {
    if (customAppIcon) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = customAppIcon;
    }
  }, [customAppIcon]);

  // Online service checks: checks maintenance mode and first-time telegram redirect
  useEffect(() => {
    let isMounted = true;

    async function checkOnlineServices() {
      // 1. Check Maintenance mode first
      const mLink = await fetchOnlineMaintenanceLink();
      if (!isMounted) return;
      setMaintenanceLink(mLink);

      // 2. Check general Telegram redirect
      const onlineLink = await fetchOnlineTelegramLink();
      if (!isMounted) return;

      if (onlineLink) {
        setTelegramChannelLink(onlineLink);

        const REDIRECTED_URL_KEY = 'cyber_engine_last_redirected_url';
        const lastRedirectedUrl = localStorage.getItem(REDIRECTED_URL_KEY);

        // Redirect on first launch for this channel link when not in maintenance
        if (lastRedirectedUrl !== onlineLink && !mLink) {
          localStorage.setItem(REDIRECTED_URL_KEY, onlineLink);
          // Directly open Telegram immediately without failing
          openExternalUrl(onlineLink);
        }
      } else {
        setTelegramChannelLink(null);
      }
    }

    checkOnlineServices();

    // Re-check maintenance status periodically every 30 seconds
    const interval = setInterval(() => {
      fetchOnlineMaintenanceLink().then((mLink) => {
        if (isMounted) setMaintenanceLink(mLink);
      });
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Authorization states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authKeyInput, setAuthKeyInput] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isInitialCheckDone, setIsInitialCheckDone] = useState<boolean>(false);

  // Shizuku native states
  const [shizuku, setShizuku] = useState<ShizukuStatus | null>(null);
  const [isRequestingPerm, setIsRequestingPerm] = useState<boolean>(false);
  const [isRefreshingShizuku, setIsRefreshingShizuku] = useState<boolean>(false);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);

  // Activation & status states
  const [status, setStatus] = useState<'idle' | 'pasting' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [pasteMethod, setPasteMethod] = useState<string>('');

  // Target path from where-to-copy
  const targetPath = (HARDCODED_TARGET_PATH || targetPathRaw || '').trim();

  // Extract all files from anshu-on-top (ignoring .gitkeep)
  const getAnshuFiles = () => {
    const list: { relPath: string; content: string }[] = [];
    for (const [rawKey, content] of Object.entries(codeFilesGlob)) {
      const relPath = rawKey.replace(/^\.\/anshu-on-top\//, '');
      if (relPath && relPath !== '.gitkeep') {
        list.push({ relPath, content: content as string });
      }
    }
    return list;
  };

  const files = getAnshuFiles();

  // Refresh Shizuku status
  const refreshShizuku = useCallback(async () => {
    setIsRefreshingShizuku(true);
    try {
      const s = await checkShizukuStatus();
      setShizuku(s);
      return s;
    } catch {
      return null;
    } finally {
      setIsRefreshingShizuku(false);
    }
  }, []);

  // Exit cleanup listener: When app is exited/closed/unloaded, delete pasted files
  useEffect(() => {
    const handleExit = () => {
      cleanupPastedFiles().catch(() => {});
      try {
        const cleanDest = targetPath.replace(/\/+$/, '');
        for (const file of files) {
          const fullDestPath = `${cleanDest}/${file.relPath}`;
          if (vfs.getItem(fullDestPath)) {
            vfs.deleteItem(fullDestPath);
          }
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('beforeunload', handleExit);
    window.addEventListener('pagehide', handleExit);
    window.addEventListener('unload', handleExit);

    return () => {
      window.removeEventListener('beforeunload', handleExit);
      window.removeEventListener('pagehide', handleExit);
      window.removeEventListener('unload', handleExit);
    };
  }, [files, targetPath]);

  // Online verification against GitHub
  const verifyKeyAgainstGithub = async (keyToTest: string, isSilent = false) => {
    const trimmedInput = keyToTest.trim();
    if (!trimmedInput) {
      if (!isSilent) setAuthError('Please enter an authorization key.');
      setIsInitialCheckDone(true);
      return;
    }

    setIsVerifying(true);
    setAuthError(null);

    try {
      // 100% online verification from GitHub
      const validKeys = await fetchOnlineValidKeys();

      const isValid = validKeys.some(
        (valid) => valid.trim().toLowerCase() === trimmedInput.toLowerCase()
      );

      if (isValid) {
        localStorage.setItem('cyber_engine_auth_key', trimmedInput);
        setIsAuthenticated(true);
        setAuthError(null);
        setTimeout(() => refreshShizuku(), 100);
      } else {
        // If the key was changed and is no longer valid, clear local storage
        localStorage.removeItem('cyber_engine_auth_key');
        setIsAuthenticated(false);
        setAuthError('Invalid key.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isSilent) {
        setAuthError(msg);
      } else {
        // In silent mode, if offline, allow cached key only if already saved
        const savedKey = localStorage.getItem('cyber_engine_auth_key');
        if (savedKey && savedKey.toLowerCase() === trimmedInput.toLowerCase()) {
          setIsAuthenticated(true);
        }
      }
    } finally {
      setIsVerifying(false);
      setIsInitialCheckDone(true);
    }
  };

  // Check saved key on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('cyber_engine_auth_key');
    if (savedKey) {
      setAuthKeyInput(savedKey);
      verifyKeyAgainstGithub(savedKey, true);
    } else {
      setIsInitialCheckDone(true);
    }
  }, []);

  // Poll Shizuku status when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      refreshShizuku();
      const interval = setInterval(refreshShizuku, 3500);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, refreshShizuku]);

  // Request Shizuku permission handler
  const handleRequestShizuku = async () => {
    setIsRequestingPerm(true);
    try {
      const res = await requestShizukuPermission();
      await refreshShizuku();
      if (!res.granted) {
        setStatus('error');
        setStatusMessage(res.message || 'Shizuku permission not granted by user.');
      } else {
        setStatus('idle');
        setStatusMessage('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('error');
      setStatusMessage(`Shizuku error: ${msg}`);
    } finally {
      setIsRequestingPerm(false);
    }
  };

  // Launch Shizuku app
  const handleOpenShizuku = async () => {
    await openShizukuApp();
  };

  const handleLogout = () => {
    localStorage.removeItem('cyber_engine_auth_key');
    setIsAuthenticated(false);
    setAuthKeyInput('');
    setAuthError(null);
    setStatus('idle');
  };

  // Deactivate & Delete all pasted files
  const handleDeactivate = async () => {
    setIsCleaning(true);
    try {
      await cleanupPastedFiles();
      // Also clean in Web VFS
      const cleanDest = targetPath.replace(/\/+$/, '');
      for (const file of files) {
        const fullDestPath = `${cleanDest}/${file.relPath}`;
        if (vfs.getItem(fullDestPath)) {
          vfs.deleteItem(fullDestPath);
        }
      }
      setStatus('idle');
      setStatusMessage('');
      setPasteMethod('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('error');
      setStatusMessage(`Cleanup failed: ${msg}`);
    } finally {
      setIsCleaning(false);
    }
  };

  // Main ACTIVATE Click Handler
  const handleActivate = async () => {
    if (status === 'pasting') return;

    if (files.length === 0) {
      setStatus('error');
      setStatusMessage('No files found in /src/anshu-on-top/. Please add files and try again.');
      return;
    }

    const cleanDest = targetPath.replace(/\/+$/, '');
    if (!cleanDest) {
      setStatus('error');
      setStatusMessage('Target directory path in /src/where-to-copy/ is empty.');
      return;
    }

    // On Android: check Shizuku status
    const currentStatus = await refreshShizuku();
    if (currentStatus?.isAndroid) {
      // If Shizuku is running but permission not granted, request it first
      if (currentStatus.shizukuAvailable && !currentStatus.shizukuPermission) {
        setStatus('pasting');
        setStatusMessage('Requesting Shizuku authorization dialog...');
        const req = await requestShizukuPermission();
        if (!req.granted) {
          setStatus('error');
          setStatusMessage('Shizuku permission was rejected. Please allow CYBER-ENGINE in the Shizuku prompt.');
          return;
        }
      } else if (!currentStatus.shizukuAvailable && !currentStatus.rootAvailable) {
        // If Shizuku is not running and no root
        setStatus('error');
        setStatusMessage('Shizuku service is not connected yet. Tap "RECHECK" or launch Shizuku.');
        return;
      }
    }

    setStatus('pasting');
    setStatusMessage('Executing...');

    try {
      // 1. Execute native paste via Shizuku / Root / Direct
      const payload = files.map((f) => ({
        name: f.relPath,
        content: f.content,
        isBase64: false,
      }));

      const pasteRes = await pasteFilesToDestination(cleanDest, payload);

      if (!pasteRes.success) {
        throw new Error(pasteRes.message || 'Paste operation failed.');
      }

      // 2. Also sync to web VFS
      try {
        const parts = cleanDest.split('/').filter(Boolean);
        let curr = '';
        for (const seg of parts) {
          const parent = curr || '/';
          curr = `${curr}/${seg}`;
          if (!vfs.getItem(curr)) {
            try {
              vfs.createDirectory(parent, seg);
            } catch {
              // ignore
            }
          }
        }

        for (const file of files) {
          const fullDestPath = `${cleanDest}/${file.relPath}`;
          const parentDir = vfs.getParentPath(fullDestPath);
          if (vfs.getItem(fullDestPath)) {
            vfs.deleteItem(fullDestPath);
          }
          const size = new Blob([file.content]).size;
          vfs.createFile(parentDir, file.relPath.split('/').pop() || 'file', file.content, size);
        }
      } catch {
        // VFS error non-fatal
      }

      setPasteMethod(pasteRes.method);
      setStatus('success');
      setStatusMessage('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('error');
      setStatusMessage(msg);
    }
  };

  // MAINTENANCE SCREEN: Triggered when any link is put in src/telegram-redirect/channel-link.txt
  if (maintenanceLink) {
    return (
      <div className="min-h-screen bg-[#06090e] text-slate-100 flex flex-col items-center justify-center p-5 selection:bg-rose-500/20">
        <div className="w-full max-w-sm flex flex-col items-center text-center gap-6">
          {/* Logo / Warning Badge */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-600 via-amber-500 to-orange-400 p-[1.5px] shadow-2xl shadow-rose-950/60 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[15px] flex items-center justify-center text-amber-400">
              <AlertCircle className="w-8 h-8 text-amber-400 animate-pulse" />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-mono tracking-widest text-amber-400 bg-amber-950/50 border border-amber-500/30 px-3 py-1 rounded-full uppercase font-bold self-center">
              SYSTEM MAINTENANCE
            </span>
            <h1 className="font-['Cabinet_Grotesk'] text-xl font-black tracking-tight text-white uppercase leading-snug">
              PROXY UNDER MAINTAINACE CHECK TELEGRAM FOR UPDATE
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              The service is currently undergoing routine maintenance. Please visit our official Telegram channel for status updates and announcements.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-col gap-3">
            <button
              onClick={() => openExternalUrl(maintenanceLink)}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-slate-950 font-['Cabinet_Grotesk'] font-bold rounded-xl shadow-lg shadow-amber-950/50 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
            >
              <Send className="w-4 h-4 text-slate-950" />
              <span>Open Telegram Channel</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-950/80" />
            </button>

            <button
              onClick={() => refreshMaintenanceStatus()}
              disabled={isCheckingMaintenance}
              className="w-full py-2.5 px-3 bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs rounded-xl hover:text-white hover:border-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingMaintenance ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isCheckingMaintenance ? 'Checking status...' : 'Check Again'}</span>
            </button>
          </div>

          <div className="text-[10px] font-mono text-slate-500">
            CYBER-ENGINE CLOUD SAFEGUARD
          </div>
        </div>
      </div>
    );
  }

  // Initial loading state
  if (!isInitialCheckDone) {
    return (
      <div className="min-h-screen bg-[#06090e] text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <span className="text-xs font-mono text-slate-400">CYBER-ENGINE: Checking Key...</span>
        </div>
      </div>
    );
  }

  // SCREEN 1: KEY AUTHORIZATION PAGE
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#06090e] text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-emerald-500/20">
        <div className="w-full max-w-sm flex flex-col items-center gap-6">
          {/* Logo / Header */}
          <div className="flex flex-col items-center text-center gap-2">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-[1.5px] shadow-2xl shadow-emerald-950/60 flex items-center justify-center overflow-hidden">
              <div className="w-full h-full bg-slate-950 rounded-[15px] flex items-center justify-center text-emerald-400 overflow-hidden">
                {customAppIcon ? (
                  <img src={customAppIcon} alt="App Icon" className="w-full h-full object-cover rounded-[15px]" />
                ) : (
                  <Lock className="w-7 h-7" />
                )}
              </div>
            </div>
            <h1 className="font-['Cabinet_Grotesk'] text-2xl font-bold tracking-tight text-white mt-1">
              CYBER-ENGINE
            </h1>
          </div>

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyKeyAgainstGithub(authKeyInput);
            }}
            className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md flex flex-col gap-4 shadow-2xl"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400 font-mono">
                  ENTER ACTIVATION KEY:
                </label>
                <span className="text-[10px] font-mono text-emerald-400/80">
                  LIVE CHECK
                </span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={authKeyInput}
                  onChange={(e) => {
                    setAuthKeyInput(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  placeholder="Enter key..."
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700/80 rounded-xl text-emerald-300 font-mono text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors uppercase tracking-wider"
                  autoFocus
                />
                <Key className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Error Message */}
            {authError && (
              <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded-lg border border-rose-500/30">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isVerifying || !authKeyInput.trim()}
              className={`w-full py-3 rounded-xl font-['Cabinet_Grotesk'] font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-all select-none shadow-lg ${
                isVerifying || !authKeyInput.trim()
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 active:scale-[0.98]'
              }`}
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>VERIFYING KEY...</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>VERIFY & AUTHORIZE</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // SCREEN 2: AUTHORIZED MAIN DASHBOARD
  const isShizukuReady = shizuku?.shizukuPermission;
  const isShizukuAvailableNoPerm = shizuku?.shizukuAvailable && !shizuku?.shizukuPermission;
  const isShizukuOffline = shizuku?.isAndroid && !shizuku?.shizukuAvailable && !shizuku?.rootAvailable;

  return (
    <div className="min-h-screen bg-[#06090e] text-slate-100 flex flex-col items-center justify-between p-4 selection:bg-emerald-500/20 relative">
      {/* Top Header & Shizuku Status Bar */}
      <header className="w-full max-w-md pt-2 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 overflow-hidden">
              {customAppIcon ? (
                <img src={customAppIcon} alt="App Icon" className="w-full h-full object-cover rounded-xl" />
              ) : (
                <Cpu className="w-4 h-4" />
              )}
            </div>
            <div>
              <h2 className="font-['Cabinet_Grotesk'] font-bold text-sm text-white tracking-wide">
                CYBER-ENGINE
              </h2>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                <span>KEY:</span>
                <span className="text-emerald-400 font-bold">{authKeyInput.toUpperCase()}</span>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {telegramChannelLink && (
              <button
                onClick={() => openExternalUrl(telegramChannelLink)}
                title="Open Telegram Channel"
                className="p-2 text-slate-400 hover:text-cyan-400 bg-slate-900 border border-slate-800 rounded-lg transition-colors flex items-center text-xs"
              >
                <Send className="w-3.5 h-3.5 text-cyan-400" />
              </button>
            )}

            <button
              onClick={() => refreshShizuku()}
              disabled={isRefreshingShizuku}
              title="Refresh status"
              className="p-2 text-slate-400 hover:text-emerald-400 bg-slate-900 border border-slate-800 rounded-lg transition-colors flex items-center text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingShizuku ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            <button
              onClick={handleLogout}
              title="Lock / Logout"
              className="p-2 text-slate-400 hover:text-rose-400 bg-slate-900 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-mono"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Shizuku Status Badge / Bar */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-500" />
              <span>SUBSYSTEM:</span>
            </span>

            {isShizukuReady && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                SHIZUKU ACTIVE (UID 2000)
              </span>
            )}

            {isShizukuAvailableNoPerm && (
              <button
                onClick={handleRequestShizuku}
                disabled={isRequestingPerm}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-semibold hover:bg-amber-900/60 transition-colors animate-pulse"
              >
                <span>GRANT SHIZUKU PERMISSION</span>
              </button>
            )}

            {shizuku?.rootAvailable && !shizuku?.shizukuAvailable && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-purple-300 bg-purple-950/60 border border-purple-500/30 px-2 py-0.5 rounded-full font-semibold">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                ROOT (SU) ACTIVE
              </span>
            )}

            {isShizukuOffline && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => refreshShizuku()}
                  disabled={isRefreshingShizuku}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full hover:bg-slate-700 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshingShizuku ? 'animate-spin' : ''}`} />
                  <span>RECHECK</span>
                </button>

                <button
                  onClick={handleOpenShizuku}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-rose-400 bg-rose-950/60 border border-rose-500/30 px-2 py-0.5 rounded-full font-semibold hover:bg-rose-900/60 transition-colors"
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>OPEN SHIZUKU</span>
                </button>
              </div>
            )}
          </div>

          {/* Action prompt if Shizuku needs attention */}
          {isShizukuAvailableNoPerm && (
            <div className="text-[11px] font-mono text-amber-400 bg-amber-950/30 border border-amber-500/20 p-2 rounded-lg flex items-center justify-between">
              <span>Shizuku is ready. Allow CYBER-ENGINE:</span>
              <button
                onClick={handleRequestShizuku}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded font-bold uppercase text-[10px]"
              >
                Authorize
              </button>
            </div>
          )}

          {isShizukuOffline && (
            <div className="text-[11px] font-mono text-slate-300 bg-slate-950/50 border border-slate-800 p-2 rounded-lg flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 leading-tight">
                If Shizuku is running, tap <strong className="text-white">RECHECK</strong> to connect:
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => refreshShizuku()}
                  disabled={isRefreshingShizuku}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold uppercase text-[10px] inline-flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshingShizuku ? 'animate-spin' : ''}`} />
                  <span>Recheck</span>
                </button>
                <button
                  onClick={handleOpenShizuku}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold uppercase text-[10px] inline-flex items-center gap-1"
                >
                  <span>App</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Center: BIG ACTIVATE BUTTON & DELETE BUTTON */}
      <main className="flex flex-col items-center gap-6 max-w-md w-full text-center my-auto py-6">
        <div className="flex items-center justify-center gap-4 sm:gap-6 w-full flex-wrap sm:flex-nowrap">
          {/* ACTIVATE BUTTON */}
          <button
            onClick={handleActivate}
            disabled={status === 'pasting'}
            className={`relative w-36 h-36 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center font-['Cabinet_Grotesk'] text-2xl sm:text-3xl font-black tracking-wider uppercase transition-all duration-300 transform select-none shadow-2xl active:scale-95 ${
              status === 'pasting'
                ? 'bg-slate-900 border-4 border-emerald-500/60 text-emerald-400 shadow-emerald-500/20 cursor-wait'
                : status === 'success'
                ? 'bg-emerald-600 hover:bg-emerald-500 border-4 border-emerald-400 text-white shadow-emerald-600/40 hover:scale-105'
                : 'bg-emerald-500 hover:bg-emerald-400 border-4 border-emerald-300 text-slate-950 shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-105'
            }`}
          >
            {status === 'pasting' ? (
              <>
                <RefreshCw className="w-10 h-10 sm:w-12 sm:h-12 animate-spin text-emerald-400 mb-2" />
                <span className="text-base sm:text-xl font-bold">PASTING</span>
              </>
            ) : status === 'success' ? (
              <>
                <Check className="w-10 h-10 sm:w-12 sm:h-12 text-white mb-2 stroke-[3]" />
                <span className="text-xl sm:text-2xl">ACTIVE</span>
              </>
            ) : (
              <>
                <Zap className="w-10 h-10 sm:w-12 sm:h-12 text-slate-950 fill-slate-950 mb-2" />
                <span>ACTIVATE</span>
              </>
            )}
          </button>

          {/* DELETE BUTTON */}
          <button
            onClick={handleDeactivate}
            disabled={isCleaning || status === 'pasting'}
            className={`relative w-36 h-36 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center font-['Cabinet_Grotesk'] text-2xl sm:text-3xl font-black tracking-wider uppercase transition-all duration-300 transform select-none shadow-2xl active:scale-95 ${
              isCleaning
                ? 'bg-slate-900 border-4 border-rose-500/60 text-rose-400 shadow-rose-500/20 cursor-wait'
                : 'bg-rose-500 hover:bg-rose-400 border-4 border-rose-300 text-slate-950 shadow-rose-500/30 hover:shadow-rose-500/50 hover:scale-105'
            }`}
          >
            {isCleaning ? (
              <>
                <RefreshCw className="w-10 h-10 sm:w-12 sm:h-12 animate-spin text-rose-400 mb-2" />
                <span className="text-base sm:text-xl font-bold">DELETING</span>
              </>
            ) : (
              <>
                <Trash2 className="w-10 h-10 sm:w-12 sm:h-12 text-slate-950 mb-2" />
                <span>DELETE</span>
              </>
            )}
          </button>
        </div>

        {/* Clean status feedback below buttons */}
        <div className="min-h-[36px] flex items-center justify-center text-center px-4 w-full">
          {status === 'pasting' && (
            <span className="text-xs font-mono text-emerald-400 animate-pulse flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Executing...</span>
            </span>
          )}

          {isCleaning && (
            <span className="text-xs font-mono text-rose-400 animate-pulse flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Deleting...</span>
            </span>
          )}

          {status === 'error' && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-rose-300 bg-rose-950/60 px-3 py-1.5 rounded-lg border border-rose-500/40 text-left">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
