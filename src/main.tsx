import React from 'react'
import ReactDOM from 'react-dom/client'
// Polices embarquées : l'app fonctionne sans connexion.
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/latin-800.css'
import App from './App'
import { listenForSharedLinks } from './lib/incomingShare'
import './index.css'
import './screens.css'
import './goals.css'
import './cooking.css'
import './themes.css'
import './meals.css'

// Lien de partage ouvert avec l'appli Android : gardé jusqu'au déverrouillage.
void listenForSharedLinks().catch(() => undefined)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
