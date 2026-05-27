import { getPlayerAvatar, getPlayerAvatarsBatch } from '@/api/players';

const CACHE_KEY = 'mj_player_avatars_v2';
const TTL = 2 * 60 * 60 * 1000;

interface CacheEntry {
  url: string;
  ts: number;
}

const memory = new Map<string, string>();
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const data: Record<string, CacheEntry> = JSON.parse(raw);
    const now = Date.now();
    for (const [id, entry] of Object.entries(data)) {
      if (typeof entry.url === 'string' && entry.ts + TTL > now) {
        memory.set(id, entry.url);
      }
    }
  } catch {
    /* quota etc */
  }
}

function persist(): void {
  try {
    const data: Record<string, CacheEntry> = {};
    for (const [id, url] of memory) {
      if (url.length < 2048 && (url.startsWith('http://') || url.startsWith('https://'))) {
        data[id] = { url, ts: Date.now() };
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* quota etc */
  }
}

export function getCachedPlayerAvatar(id: string): string | undefined {
  hydrate();
  return memory.get(id);
}

export async function loadPlayerAvatar(id: string): Promise<string> {
  hydrate();
  const cached = memory.get(id);
  if (cached !== undefined) return cached;
  const url = await getPlayerAvatar(id);
  memory.set(id, url);
  persist();
  return url;
}

export async function loadPlayerAvatarsForList(ids: string[], signal?: AbortSignal): Promise<Record<string, string>> {
  hydrate();
  const unique = [...new Set(ids.filter(Boolean))];
  const need = unique.filter((id) => !memory.has(id));
  if (need.length > 0) {
    const batch = await getPlayerAvatarsBatch(need, { signal });
    for (const [id, url] of Object.entries(batch)) {
      memory.set(id, typeof url === 'string' ? url : '');
    }
    persist();
  }
  const out: Record<string, string> = {};
  for (const id of unique) {
    out[id] = memory.get(id) ?? '';
  }
  return out;
}
