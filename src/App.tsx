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
  Download,
  ArrowUpCircle,
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

// Fetch live update / telegram-redirect link directly from GitHub
// When ANY link is placed in telgram-redirect (or telegram-redirect), the app is locked and redirects to Telegram
async function fetchOnlineUpdateLink(): Promise<string | null> {
  const timestamp = Date.now();
  const randomSalt = Math.floor(Math.random() * 1000000);

  const candidateUrls = [
    `https://raw.githubusercontent.com/mranshurx/new-engine/refs/heads/main/telgram-redirect/channel-link.txt?_t=${timestamp}_${randomSalt}`,
    `https://raw.githubusercontent.com/mranshurx/new-engine/main/telgram-redirect/channel-link.txt?_t=${timestamp}_${randomSalt}`,
    `https://raw.githubusercontent.com/mranshurx/new-engine/refs/heads/main/src/telgram-redirect/channel-link.txt?_t=${timestamp}_${randomSalt}`,
    `https://raw.githubusercontent.com/mranshurx/new-engine/main/src/telgram-redirect/channel-link.txt?_t=${timestamp}_${randomSalt}`,
    `https://raw.githubusercontent.com/mranshurx/new-engine/refs/heads/main/src/telegram-redirect/channel-link.txt?_t=${timestamp}_${randomSalt}`,
    `https://raw.githubusercontent.com/mranshurx/new-engine/main/src/telegram-redirect/channel-link.txt?_t=${timestamp}_${randomSalt}`,
    `https://raw.githubusercontent.com/mranshurx/new-engine/refs/heads/main/telegram-redirect/channel-link.txt?_t=${timestamp}_${randomSalt}`,
    `https://raw.githubusercontent.com/mranshurx/new-engine/main/telegram-redirect/channel-link.txt?_t=${timestamp}_${randomSalt}`,
    `https://cdn.jsdelivr.net/gh/mranshurx/new-engine@main/telgram-redirect/channel-link.txt?_t=${timestamp}`,
    `https://cdn.jsdelivr.net/gh/mranshurx/new-engine@main/src/telegram-redirect/channel-link.txt?_t=${timestamp}`,
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        const parsed = parseTelegramChannelLink(text);
        if (parsed) return parsed;
      }
    } catch {
      // try next URL
    }
  }

  // Local fallback if present in bundle
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

export default function App() {
  // Custom Icon
  const customAppIcon = getCustomAppIcon();

  // Online Update link state (when present, app is locked in update mode and redirects to Telegram)
  const [updateLink, setUpdateLink] = useState<string | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);

  // Function to re-check update mode
  const refreshUpdateStatus = useCallback(async () => {
    setIsCheckingUpdate(true);
    try {
      const link = await fetchOnlineUpdateLink();
      setUpdateLink(link);
      if (link) {
        openExternalUrl(link);
      }
    } catch {
      // Ignore
    } finally {
      setIsCheckingUpdate(false);
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

  // Check update mode on mount and periodically: if any link is present, directly redirect to Telegram
  useEffect(() => {
    let isMounted = true;

    async function checkUpdateOnLaunch() {
      const link = await fetchOnlineUpdateLink();
      if (!isMounted) return;
      setUpdateLink(link);
      if (link) {
        // Directly open the Telegram link placed in telgram-redirect immediately
        openExternalUrl(link);
      }
    }

    checkUpdateOnLaunch();

    // Re-check update status periodically every 15 seconds
    const interval = setInterval(async () => {
      const link = await fetchOnlineUpdateLink();
      if (!isMounted) return;
      setUpdateLink((prev) => {
        if (link && !prev) {
          openExternalUrl(link);
        }
        return link;
      });
    }, 15000);

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

  // UPDATE BANNER / SCREEN: Triggered when any link is placed in telgram-redirect
  // The app is strictly blocked from opening and redirects directly to Telegram for update.
  if (updateLink) {
    return (
      <div className="min-h-screen bg-[#06090e] text-slate-100 flex flex-col items-center justify-center p-5 selection:bg-cyan-500/20 relative overflow-hidden">
        {/* Subtle Cyber Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a15_1px,transparent_1px),linear-gradient(to_bottom,#0f172a15_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        {/* Glowing Ambient Orbs */}
        <div className="absolute top-1/4 -left-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm flex flex-col items-center text-center gap-6 relative z-10">
          {/* Logo / Update Badge */}
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-cyan-500 via-sky-400 to-emerald-400 p-[2px] shadow-2xl shadow-cyan-950/80 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center overflow-hidden">
                {customAppIcon ? (
                  <img
                    src={customAppIcon}
                    alt="Cyber Engine"
                    className="w-14 h-14 object-contain rounded-xl"
                  />
                ) : (
                  <ArrowUpCircle className="w-10 h-10 text-cyan-400 animate-pulse" />
                )}
              </div>
            </div>
            {/* Pulsing indicator tag */}
            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-cyan-400 rounded-full animate-ping opacity-75" />
            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-cyan-400 rounded-full" />
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="inline-flex items-center gap-1.5 self-center text-[10px] font-mono tracking-widest text-cyan-300 bg-cyan-950/70 border border-cyan-500/40 px-3.5 py-1 rounded-full uppercase font-bold shadow-sm">
              <Download className="w-3.5 h-3.5 text-cyan-400 animate-bounce" />
              <span>UPDATE REQUIRED</span>
            </div>

            <h1 className="font-['Cabinet_Grotesk'] text-2xl font-black tracking-tight text-white uppercase leading-snug">
              NEW UPDATE AVAILABLE
            </h1>

            <p className="text-xs text-slate-400 font-mono leading-relaxed">
              A new update has been released. The application is locked until you update. Please open our Telegram channel to download the latest APK.
            </p>
          </div>

          {/* Active Telegram Link Card */}
          <div
            onClick={() => openExternalUrl(updateLink)}
            className="w-full p-3.5 bg-slate-900/80 border border-cyan-500/25 hover:border-cyan-500/50 rounded-xl flex items-center justify-between text-left cursor-pointer transition-all hover:bg-slate-900 shadow-lg shadow-black/40 group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400 group-hover:scale-105 transition-transform">
                <Send className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                  Update Channel
                </div>
                <div className="text-xs font-mono text-cyan-300 truncate font-semibold">
                  {updateLink}
                </div>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 shrink-0 ml-2 transition-colors" />
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-col gap-3">
            <button
              onClick={() => openExternalUrl(updateLink)}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 via-sky-500 to-emerald-400 text-slate-950 font-['Cabinet_Grotesk'] font-bold rounded-xl shadow-lg shadow-cyan-950/60 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider cursor-pointer"
            >
              <Send className="w-4 h-4 text-slate-950" />
              <span>DIRECT TO TELEGRAM FOR UPDATE</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-950/80" />
            </button>

            <button
              onClick={() => refreshUpdateStatus()}
              disabled={isCheckingUpdate}
              className="w-full py-2.5 px-3 bg-slate-900/90 border border-slate-800 text-slate-300 font-mono text-xs rounded-xl hover:text-white hover:border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isCheckingUpdate ? 'Checking update status...' : 'Check Again'}</span>
            </button>
          </div>

          <div className="text-[10px] font-mono text-slate-600 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>CYBER-ENGINE CLOUD ENFORCEMENT</span>
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
