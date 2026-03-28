import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/auth-context'
import { BranchProvider } from './context/branch-context'
import { ToastProvider } from './components/ui/Toast'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BranchProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BranchProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)