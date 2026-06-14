import { useEffect } from 'react';
import { isLoggedIn, refreshAuthToken } from '@/api/auth';

/** Rotate auth token every 30 minutes while logged in. */
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export function useTokenRefresh() {
  useEffect(() => {
    if (!isLoggedIn()) return;

    let active = true;

    const refresh = async () => {
      if (!active || !isLoggedIn()) return;
      try {
        await refreshAuthToken();
      } catch {
        // Background refresh failure is non-fatal; next interval retries.
      }
    };

    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
}
