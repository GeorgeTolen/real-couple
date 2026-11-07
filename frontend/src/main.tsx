import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider, createLightTheme, type BrandVariants } from '@fluentui/react-components'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import './app.css'

const freedomGreen: BrandVariants = {
  10: '#03140b', 20: '#062414', 30: '#0a361e', 40: '#0c4728', 50: '#0e5932', 60: '#0e6b3c',
  70: '#117a45', 80: '#138a4e', 90: '#2f9862', 100: '#4aa676', 110: '#66b48b', 120: '#82c2a0',
  130: '#9ed0b5', 140: '#badeca', 150: '#d4ebdf', 160: '#e7f3ec',
}

const theme = {
  ...createLightTheme(freedomGreen),
  fontFamilyBase: "'Segoe UI Variable', 'Segoe UI', Inter, system-ui, sans-serif",
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={theme} style={{ height: '100%', background: 'transparent' }}>
      <HashRouter>
        <App />
      </HashRouter>
    </FluentProvider>
  </StrictMode>,
)
