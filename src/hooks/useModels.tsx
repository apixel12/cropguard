import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { loadModel, type LoadedModel, type ModelState } from '../ml/modelLoader'
import type { ModelId } from '../ml/modelRegistry'

interface Ctx {
  state: Record<ModelId, ModelState>
  models: Partial<Record<ModelId, LoadedModel>>
  retry: (id: ModelId) => void
}

const ModelCtx = createContext<Ctx | null>(null)

export function ModelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Record<ModelId, ModelState>>({
    'router-v2': { status: 'loading' },
    'lemon-v1': { status: 'loading' },
    'crops-v2': { status: 'loading' },
  })
  const [models, setModels] = useState<Partial<Record<ModelId, LoadedModel>>>({})

  const load = (id: ModelId) => {
    setState((s) => ({ ...s, [id]: { status: 'loading' } }))
    loadModel(id)
      .then((m) => {
        setModels((ms) => ({ ...ms, [id]: m }))
        setState((s) => ({ ...s, [id]: { status: 'ready', loadMs: m.loadMs, selfTestMs: m.selfTestMs } }))
        console.info(`[cropguard] ${id} ready: load ${m.loadMs.toFixed(0)}ms, self-test ${m.selfTestMs.toFixed(0)}ms`)
      })
      .catch((e: unknown) => {
        console.error(`[cropguard] ${id} failed`, e)
        setState((s) => ({ ...s, [id]: { status: 'error', message: e instanceof Error ? e.message : String(e) } }))
      })
  }

  useEffect(() => {
    // lemon first: it is the primary demo path
    load('router-v2')
    load('lemon-v1')
    load('crops-v2')
  }, [])

  return <ModelCtx.Provider value={{ state, models, retry: load }}>{children}</ModelCtx.Provider>
}

export function useModels() {
  const c = useContext(ModelCtx)
  if (!c) throw new Error('useModels outside provider')
  return c
}
