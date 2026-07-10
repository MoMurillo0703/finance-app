import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/index.js'
import App from './App.jsx'

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__installPrompt = e
})

function showUpdateBanner() {
  if (document.getElementById('sw-update-banner')) return

  const banner = document.createElement('div')
  banner.id = 'sw-update-banner'
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:9999;background:#7c3aed;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;'

  const text = document.createElement('span')
  text.textContent = 'Nueva versión disponible / New version available'

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Actualizar / Refresh'
  button.style.cssText =
    'background:#fff;color:#7c3aed;border:none;border-radius:8px;padding:6px 12px;font-weight:600;cursor:pointer;flex-shrink:0;'
  button.addEventListener('click', () => window.location.reload())

  banner.append(text, button)
  document.body.appendChild(banner)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'UPDATE_AVAILABLE') {
      showUpdateBanner()
    }
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
  })
}