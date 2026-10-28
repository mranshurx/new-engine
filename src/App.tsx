import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Zap, Trash2, RefreshCw, LogOut, Send, ShieldCheck, AlertTriangle,
  Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import {
  checkShizukuStatus,
  requestShizukuPermission,
  openShizukuApp,
  pasteFilesToDestination,
  cleanupPastedFiles,
  openExternalUrl,
  type ShizukuStatus,
} from './services/shizuku';
import { loadPayloadFiles } from './services/payload';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
const KEY_SOURCES = [
  'https://raw.githubusercontent.com/mranshurx/new-engine/main/key.txt',
  'https://cdn.jsdelivr.net/gh/mranshurx/new-engine@main/key.txt',
  'https://api.github.com/repos/mranshurx/new-engine/contents/key.txt',
];
const PRIMARY_CHANNEL_URL = 'https://t.me/anshuxmodpanel';
const UPDATE_LINK_URL =
  'https://raw.githubusercontent.com/mranshurx/new-engine/main/src/telegram-redirect/channel-link.txt';

const KEY_STORAGE = 'cyber_engine_key';
const FIRST_LAUNCH_STORAGE = 'cyber_engine_first_launch';

const TARGET_DIR = '/storage/emulated/0/Android/data/com.garena.game.ffi/files';

type Screen = 'loading' | 'auth' | 'update' | 'dashboard';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
async function fetchValidKeys(): Promise<string[]> {
  for (const url of KEY_SOURCES) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      let text = await res.text();
      if (url.includes('api.github.com')) {
        const json = JSON.parse(text);
        text = atob((json.content || '').replace(/\n/g, ''));
      }
      return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    } catch {
      /* try next source */
    }
  }
  return [];
}

async function fetchUpdateLink(): Promise<string> {
  try {
    const res = await fetch(UPDATE_LINK_URL, { cache: 'no-store' });
    if (!res.ok) return '';
    return (await res.text()).trim();
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [keyInput, setKeyInput] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [updateLink, setUpdateLink] = useState('');
  const [shizuku, setShizuku] = useState<ShizukuStatus | null>(null);
  const mounted = useRef(true);

  /* ---------- boot ---------- */
  useEffect(() => {
    mounted.current = true;
    (async () => {
      const stored = localStorage.getItem(KEY_STORAGE) || '';
      if (stored) {
        const keys = await fetchValidKeys();
        if (keys.length === 0 || keys.includes(stored)) {
          setSavedKey(stored);
          setScreen('dashboard');
          return;
        }
      }
      setScreen('auth');
    })();

    // first-launch telegram redirect
    if (!localStorage.getItem(FIRST_LAUNCH_STORAGE)) {
      localStorage.setItem(FIRST_LAUNCH_STORAGE, '1');
      openExternalUrl(PRIMARY_CHANNEL_URL);
    }

    return () => {
      mounted.current = false;
    };
  }, []);

  /* ---------- update lock poll ---------- */
  useEffect(() => {
    if (screen !== 'dashboard') return;
    let cancelled = false;
    const tick = async () => {
      const link = await fetchUpdateLink();
      if (!cancelled && link) {
        setUpdateLink(link);
        setScreen('update');
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [screen]);

  /* ---------- shizuku status ---------- */
  const refreshShizuku = useCallback(async () => {
    const s = await checkShizukuStatus();
    if (mounted.current) setShizuku(s);
  }, []);

  useEffect(() => {
    if (screen !== 'dashboard') return;
    refreshShizuku();
    const id = setInterval(refreshShizuku, 3500);
    return () => clearInterval(id);
  }, [screen, refreshShizuku]);

  /* ---------- cleanup on exit ---------- */
  useEffect(() => {
    const clean = () => { cleanupPastedFiles(); };
    window.addEventListener('beforeunload', clean);
    window.addEventListener('pagehide', clean);
    window.addEventListener('unload', clean);
    return () => {
      window.removeEventListener('beforeunload', clean);
      window.removeEventListener('pagehide', clean);
      window.removeEventListener('unload', clean);
    };
  }, []);

  /* ---------- handlers ---------- */
  const verifyKey = async () => {
    setError('');
    setBusy(true);
    const keys = await fetchValidKeys();
    if (keys.length && keys.includes(keyInput.trim())) {
      localStorage.setItem(KEY_STORAGE, keyInput.trim());
      setSavedKey(keyInput.trim());
      setScreen('dashboard');
    } else {
      setError(keys.length ? 'Invalid key.' : 'Could not reach key server.');
    }
    setBusy(false);
  };

  const activate = async () => {
    setBusy(true);
    setMessage('');
    try {
      const files = await loadPayloadFiles();
      const res = await pasteFilesToDestination(TARGET_DIR, files);
      setMessage(res.success ? `Injected ${res.count} file(s) via ${res.method}` : 'Injection failed.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Injection error.');
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setMessage('');
    const res = await cleanupPastedFiles();
    setMessage(res.success ? 'Cleaned up injected files.' : res.message);
    setBusy(false);
  };

  const logout = () => {
    localStorage.removeItem(KEY_STORAGE);
    setSavedKey('');
    setScreen('auth');
  };

  /* ---------- screens ---------- */
  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-[#06090e] text-slate-200 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (screen === 'auth') {
    return (
      <div className="min-h-screen bg-[#06090e] text-slate-200 flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-3xl font-bold tracking-widest text-emerald-400">CYBER ENGINE</h1>
        <input
          className="w-full max-w-xs bg-black/40 border border-emerald-500/30 rounded-lg px-4 py-3 text-center tracking-widest outline-none focus:border-emerald-400"
          placeholder="ENTER KEY"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
        />
        {error && <p className="text-rose-400 text-sm">{error}</p>}
        <button
          onClick={verifyKey}
          disabled={busy || !keyInput.trim()}
          className="px-8 py-3 rounded-lg bg-emerald-500 text-black font-bold disabled:opacity-40"
        >
          {busy ? 'VERIFYING...' : 'VERIFY'}
        </button>
        <button
          onClick={() => openExternalUrl(PRIMARY_CHANNEL_URL)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400"
        >
          <Send className="w-4 h-4" /> Join Telegram Channel
        </button>
      </div>
    );
  }

  if (screen === 'update') {
    return (
      <div className="min-h-screen bg-[#06090e] text-slate-200 flex flex-col items-center justify-center gap-6 p-6">
        <AlertTriangle className="w-12 h-12 text-amber-400" />
        <h1 className="text-2xl font-bold tracking-widest text-amber-400">UPDATE REQUIRED</h1>
        <button
          onClick={() => openExternalUrl(updateLink || PRIMARY_CHANNEL_URL)}
          className="px-8 py-3 rounded-lg bg-amber-500 text-black font-bold"
        >
          GO TO TELEGRAM
        </button>
        <button onClick={() => setScreen('dashboard')} className="text-sm text-slate-400">
          Check Again
        </button>
      </div>
    );
  }

  const statusColor = shizuku?.shizukuPermission
    ? 'text-emerald-400'
    : shizuku?.shizukuAvailable
    ? 'text-amber-400'
    : 'text-rose-400';

  return (
    <div className="min-h-screen bg-[#06090e] text-slate-200 flex flex-col p-6">
      <header className="flex items-center justify-between mb-8">
        <span className="text-xs tracking-widest text-slate-500">{savedKey}</span>
        <div className="flex items-center gap-4">
          <button onClick={() => openExternalUrl(PRIMARY_CHANNEL_URL)}><Send className="w-5 h-5" /></button>
          <button onClick={refreshShizuku}><RefreshCw className="w-5 h-5" /></button>
          <button onClick={logout}><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <div className={`flex items-center gap-2 mb-10 text-sm ${statusColor}`}>
        <ShieldCheck className="w-4 h-4" />
        {shizuku?.shizukuPermission
          ? `Shizuku active (uid ${shizuku.shizukuUid ?? 2000})`
          : shizuku?.rootAvailable
          ? 'Root active'
          : 'Shizuku offline'}
        {shizuku && !shizuku.shizukuPermission && (
          <button
            onClick={async () => {
              await requestShizukuPermission();
              await refreshShizuku();
            }}
            className="ml-2 underline"
          >
            RECHECK
          </button>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center gap-10">
        <button
          onClick={activate}
          disabled={busy}
          className="w-40 h-40 rounded-full bg-emerald-500 text-black font-bold flex flex-col items-center justify-center disabled:opacity-40"
        >
          <Zap className="w-8 h-8 mb-1" /> ACTIVATE
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="w-40 h-40 rounded-full bg-rose-500 text-white font-bold flex flex-col items-center justify-center disabled:opacity-40"
        >
          <Trash2 className="w-8 h-8 mb-1" /> DELETE
        </button>
      </div>

      {message && (
        <p className="mt-8 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
          {message.includes('fail') || message.includes('error')
            ? <XCircle className="w-4 h-4 text-rose-400" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {message}
        </p>
      )}

      <button
        onClick={() => openShizukuApp()}
        className="mt-4 text-xs text-slate-500 underline self-center"
      >
        Open Shizuku
      </button>
    </div>
  );
}
