import { useSyncExternalStore } from 'react'

// A new version is waiting in the service worker. It is never applied on its own
// (that could reload the page mid-check); Home offers it as a button instead.
let apply: (() => void) | null = null
const subs = new Set<() => void>()

export function offerUpdate(fn: () => void) {
  apply = fn
  subs.forEach((s) => s())
}

/** The function that installs the waiting version and reloads, or null if none is waiting. */
export function useAppUpdate() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => apply)
}
