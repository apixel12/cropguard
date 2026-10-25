import { createContext, useContext, useState, type ReactNode } from 'react'

/** Gardener: short, plain-language results. Farmer: full agronomic detail. */
export type Mode = 'gardener' | 'farmer'

const KEY = 'cg-mode'
const ModeCtx = createContext<{ mode: Mode; setMode: (m: Mode) => void } | null>(null)

function load(): Mode {
  try {
    return localStorage.getItem(KEY) === 'farmer' ? 'farmer' : 'gardener'
  } catch {
    return 'gardener' // storage blocked: fall back silently
  }
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, set] = useState<Mode>(load)
  const setMode = (m: Mode) => {
    set(m)
    try { localStorage.setItem(KEY, m) } catch { /* not persisted; still works this session */ }
  }
  return <ModeCtx.Provider value={{ mode, setMode }}>{children}</ModeCtx.Provider>
}

export function useMode() {
  const c = useContext(ModeCtx)
  if (!c) throw new Error('useMode outside provider')
  return c
}

/** Segmented Gardener / Farmer switch (a radio group for assistive tech). */
export function ModeSwitch() {
  const { mode, setMode } = useMode()
  return (
    <div className="mode-switch" role="radiogroup" aria-label="Level of detail">
      {(['gardener', 'farmer'] as const).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
          {m === 'gardener' ? 'Gardener' : 'Farmer'}
          <span>{m === 'gardener' ? 'Simple advice' : 'Full agronomy'}</span>
        </button>
      ))}
    </div>
  )
}
