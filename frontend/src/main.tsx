import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from '@/components/ErrorBoundary'
import { ServerErrorProvider } from '@/context/ServerErrorContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ServerErrorProvider>
        <App />
      </ServerErrorProvider>
    </ErrorBoundary>
  </StrictMode>,
)
