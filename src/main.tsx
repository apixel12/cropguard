import './security/trustedTypes' // must run before anything touches the DOM
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ModelProvider } from './hooks/useModels'
import { ModeProvider } from './hooks/useMode'
import { AuthProvider } from './auth/AuthProvider'
import { installNetworkGuard } from './utils/networkGuard'
import { offerUpdate } from './utils/appUpdate'
import '@fontsource/public-sans/latin-400.css'
import '@fontsource/public-sans/latin-500.css'
import '@fontsource/public-sans/latin-600.css'
import '@fontsource/public-sans/latin-700.css'
import './styles.css'

installNetworkGuard()
const updateSW = registerSW({ immediate: true, onNeedRefresh: () => offerUpdate(() => updateSW(true)) })

createRoot(document.getElementById('root')!).render(
  <ModelProvider>
    <AuthProvider>
    <ModeProvider>
    <main className="app">
      <App />
    </main>
    </ModeProvider>
    </AuthProvider>
  </ModelProvider>,
)
