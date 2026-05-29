import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

type StringPatch = Record<string, string | null | undefined>;

function readInt(params: URLSearchParams, key: string, fallback: number, min = 1): number {
  const raw = params.get(key);
  if (raw == null || raw === '') return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  return n;
}

function readString(params: URLSearchParams, key: string, fallback: string): string {
  const raw = params.get(key);
  return raw != null && raw !== '' ? raw : fallback;
}

function readOptionalString(params: URLSearchParams, key: string): string {
  return params.get(key) ?? '';
}

/** Param absent → default; present (including empty) → stored value */
function readFilterString(params: URLSearchParams, key: string, defaultWhenMissing: string): string {
  if (!params.has(key)) return defaultWhenMissing;
  return params.get(key) ?? '';
}

function readEnum<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = params.get(key);
  if (raw != null && (allowed as readonly string[]).includes(raw)) return raw as T;
  return fallback;
}

export function useSyncedSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const patch = useCallback(
    (updates: StringPatch, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === undefined) {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          }
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const queryString = useMemo(() => {
    const s = searchParams.toString();
    return s ? `?${s}` : '';
  }, [searchParams]);

  return {
    searchParams,
    patch,
    queryString,
    readInt: (key: string, fallback: number, min?: number) => readInt(searchParams, key, fallback, min),
    readString: (key: string, fallback: string) => readString(searchParams, key, fallback),
    readOptionalString: (key: string) => readOptionalString(searchParams, key),
    readFilterString: (key: string, defaultWhenMissing: string) =>
      readFilterString(searchParams, key, defaultWhenMissing),
    readEnum: <T extends string>(key: string, allowed: readonly T[], fallback: T) =>
      readEnum(searchParams, key, allowed, fallback),
  };
}
