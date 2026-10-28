
import type { PasteFileItem } from './shizuku';

// These live in /public/anshu-on-top — Vite copies them verbatim (no transform).
// Names must match the files on disk EXACTLY.
const PAYLOAD_DIR = 'anshu-on-top';
const PAYLOAD_FILES = [
  'Assembly-CSharp-patch.bytes',
  'localconfig.json',
  'copypastermkc.txt',
] as const;

// Chunked so large binaries don't blow the call stack
const toBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
};

/** Reads payload files as EXACT bytes, returns them base64-encoded for the native bridge. */
export async function loadPayloadFiles(): Promise<PasteFileItem[]> {
  const base = import.meta.env.BASE_URL || '/';
  const out: PasteFileItem[] = [];

  for (const name of PAYLOAD_FILES) {
    const res = await fetch(`${base}${PAYLOAD_DIR}/${name}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Payload "${name}" failed: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer()); // exact, no re-encoding
    out.push({ name, content: toBase64(bytes), isBase64: true });
  }
  return out;
}
