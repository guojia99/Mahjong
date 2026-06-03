import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installRuntimeErrorHandlers, markAppReady, reportBootstrapError } from '@/bootstrap'
import './i18n'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from '@/components/ErrorBoundary'
import { ServerErrorProvider } from '@/context/ServerErrorContext'

installRuntimeErrorHandlers()

const rootEl = document.getElementById('root')
if (!rootEl) {
  reportBootstrapError('Root element #root not found')
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <ServerErrorProvider>
            <App />
          </ServerErrorProvider>
        </ErrorBoundary>
      </StrictMode>,
    )
    markAppReady()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const detail = err instanceof Error ? err.stack : undefined
    reportBootstrapError(message, detail)
    console.error('Bootstrap render failed:', err)
  }
}
