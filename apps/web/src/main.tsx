import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { JiweiProvider } from './JiweiContext'
import { AppearanceProvider } from './shell/AppearanceContext'

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 容器')

createRoot(container).render(
  <StrictMode>
    <JiweiProvider>
      <AppearanceProvider><App /></AppearanceProvider>
    </JiweiProvider>
  </StrictMode>,
)
