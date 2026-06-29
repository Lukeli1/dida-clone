import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ToastProvider } from './components/Toast'
import { ConfirmDialogProvider } from './components/common/ConfirmDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmDialogProvider>
          <App />
        </ConfirmDialogProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
