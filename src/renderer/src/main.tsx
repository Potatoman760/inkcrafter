import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import {
  SIDEBAR_DEFAULT,
  SIDE_DEFAULT,
  SPLITTER_WIDTH
} from './layout/dimensions'
// Tokens first: index.css declares the layer order the app's own rules sit in.
import './design/index.css'
import './styles.css'

// Publish the column defaults before first paint, so the stylesheet's fallback
// grid is the real geometry rather than a stale copy of it. Live widths are set
// on the element itself once React has them.
const root = document.documentElement
root.style.setProperty('--pane-sidebar-default', `${SIDEBAR_DEFAULT}px`)
root.style.setProperty('--pane-side-default', `${SIDE_DEFAULT}px`)
root.style.setProperty('--splitter-width', `${SPLITTER_WIDTH}px`)

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
