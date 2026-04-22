/**
 * 雀士头像：通过 `POST /api/v1/players/batch-avatars/` 拉取，内存 + sessionStorage 复用，避免同页/多次导航重复请求。
 * 大体积 base64 不落 sessionStorage，仅存在内存，避免占满配额。
 */
import { getPlayerAvatarsBatch } from '@/api/players';

const memory = new Map<string, string>();
const STORAGE_KEY = 'mj_player_avatars_v1';
const MAX_PERSIST_LEN = 2048; // 单条过长（多为 base64）不持久化

function safePersistSubset(): void {
  try {
    const out: Record<string, string> = {};
    for (const [k, v] of memory) {
      if (v && v.length < MAX_PERSIST_LEN && (v.startsWith('http://') || v.startsWith('https://') || v === '')) {
        out[k] = v;
      }
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    // 配额等：忽略
  }
}

function hydrateFromStorage(): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw) as Record<string, string>;
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && !memory.has(k)) memory.set(k, v);
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * 为当前 id 集合加载头像，返回 id -> 头像地址或空串（与内存合并）。
 * 已缓存在内存中的 id 不会再次请求。
 */
export async function loadPlayerAvatarsForList(ids: string[]): Promise<Record<string, string>> {
  hydrateFromStorage();
  const need = [...new Set(ids.map(String).filter(Boolean))].filter((id) => !memory.has(id));
  if (need.length > 0) {
    const res = await getPlayerAvatarsBatch(need);
    for (const [k, v] of Object.entries(res)) {
      memory.set(k, typeof v === 'string' ? v : '');
    }
    safePersistSubset();
  }
  const out: Record<string, string> = {};
  for (const id of [...new Set(ids.map(String).filter(Boolean))]) {
    out[id] = memory.get(id) ?? '';
  }
  return out;
}

export function getCachedPlayerAvatar(id: string): string | undefined {
  hydrateFromStorage();
  if (!memory.has(id)) return undefined;
  return memory.get(id);
}
