import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { registerServerErrorHandler } from '@/api/client';
import type { ParsedApiError } from '@/utils/apiError';
import ServerErrorPanel from '@/components/ServerErrorPanel';

interface ServerErrorContextValue {
  error: ParsedApiError | null;
  showServerError: (error: ParsedApiError) => void;
  clearServerError: () => void;
}

const ServerErrorContext = createContext<ServerErrorContextValue | null>(null);

export function ServerErrorProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<ParsedApiError | null>(null);

  const showServerError = useCallback((e: ParsedApiError) => {
    setError(e);
  }, []);

  const clearServerError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    registerServerErrorHandler(showServerError);
    return () => registerServerErrorHandler(null);
  }, [showServerError]);

  const value = useMemo(
    () => ({ error, showServerError, clearServerError }),
    [error, showServerError, clearServerError],
  );

  return (
    <ServerErrorContext.Provider value={value}>
      {children}
      <ServerErrorPanel />
    </ServerErrorContext.Provider>
  );
}

export function useServerError() {
  const ctx = useContext(ServerErrorContext);
  if (!ctx) {
    throw new Error('useServerError must be used within ServerErrorProvider');
  }
  return ctx;
}
