import { useState, useEffect, useCallback } from 'react';

interface ToastState {
  message: string;
  type: 'error' | 'success';
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const ToastComponent = toast ? (
    <div className={`toast toast-${toast.type}`}>{toast.message}</div>
  ) : null;

  return { showToast, ToastComponent };
}
