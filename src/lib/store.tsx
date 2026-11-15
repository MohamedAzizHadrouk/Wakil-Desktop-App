import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { buildModel } from './model'
import { buildUsage } from './usage'
import type { Model, ScanResult, UsageRaw, UsageView } from './types'

export type Route =
  | { page: 'dashboard' }
  | { page: 'entities' }
  | { page: 'entity'; slug: string; tab?: string }
  | { page: 'projects' }
  | { page: 'personal-projects' }
  | { page: 'project'; key: string; tab?: string }
  | { page: 'agents' }
  | { page: 'agent'; id: string }
  | { page: 'skills'; id?: string }
  | { page: 'commands'; name?: string }
  | { page: 'profile' }
  | { page: 'knowledge'; slug?: string }
  | { page: 'news'; date?: string; tab?: string }
  | { page: 'brand'; channel?: string }
  | { page: 'files'; path?: string }
  | { page: 'workspace' }
  | { page: 'usage'; tab?: string }

type Change = { at: number; changed: string[]; added: string[]; removed: string[] }

type Ctx = {
  model: Model | null
  loading: boolean
  error: string | null
  route: Route
  go: (r: Route) => void
  back: () => void
  canBack: boolean
  choose: () => Promise<void>
  close: () => Promise<void>
  refresh: () => Promise<void>
  lastChange: Change | null
  recentlyChanged: Set<string>
  usage: UsageView | null
  usageLoading: boolean
  refreshUsage: () => Promise<void>
  init: (mode: 'new' | 'complete') => Promise<string[] | null>
}

const AppCtx = createContext<Ctx | null>(null)

export const api = () => {
  if (!window.wakil) throw new Error('API Electron indisponible – lancez l’application avec Electron.')
  return window.wakil
}

function diff(prev: Model | null, next: ScanResult): Change {
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []
  if (prev) {
    const seen = new Set<string>()
    for (const f of next.files) {
      seen.add(f.path)
      const old = prev.byPath.get(f.path)
      if (!old) added.push(f.path)
      else if (old.mtime !== f.mtime || old.size !== f.size) changed.push(f.path)
    }
    for (const p of prev.byPath.keys()) if (!seen.has(p)) removed.push(p)
  }
  return { at: Date.now(), changed, added, removed }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [model, setModel] = useState<Model | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stack, setStack] = useState<Route[]>([{ page: 'dashboard' }])
  const [lastChange, setLastChange] = useState<Change | null>(null)
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(new Set())
  const modelRef = useRef<Model | null>(null)
  const [usageRaw, setUsageRaw] = useState<UsageRaw | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)

  const apply = useCallback((scan: ScanResult | null, isUpdate = false) => {
    if (!scan) {
      modelRef.current = null
      setModel(null)
      return
    }
    if (isUpdate) {
      const c = diff(modelRef.current, scan)
      if (c.changed.length || c.added.length || c.removed.length) {
        setLastChange(c)
        setRecentlyChanged((s) => new Set([...s, ...c.changed, ...c.added]))
      }
    }
    const m = buildModel(scan)
    modelRef.current = m
    setModel(m)
  }, [])

  useEffect(() => {
    let off = () => {}
    try {
      const w = api()
      w.getWorkspace()
        .then((s) => apply(s))
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false))
      off = w.onChanged((s) => apply(s, true))
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      setLoading(false)
    }
    return () => off()
  }, [apply])

  const go = useCallback((r: Route) => {
    setStack((s) => [...s.slice(-40), r])
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [])
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), [])

  const choose = useCallback(async () => {
    setLoading(true)
    try {
      const s = await api().chooseWorkspace()
      if (s) {
        apply(s)
        setStack([{ page: 'dashboard' }])
        setRecentlyChanged(new Set())
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [apply])

  const close = useCallback(async () => {
    await api().closeWorkspace()
    apply(null)
    setStack([{ page: 'dashboard' }])
  }, [apply])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      apply(await api().getWorkspace(), true)
    } finally {
      setLoading(false)
    }
  }, [apply])

  const refreshUsage = useCallback(async () => {
    if (!modelRef.current) return
    setUsageLoading(true)
    try {
      setUsageRaw(await api().getUsage())
    } catch (e) {
      console.error(e)
    } finally {
      setUsageLoading(false)
    }
  }, [])

  const rootPath = model?.root
  useEffect(() => {
    if (!rootPath) {
      setUsageRaw(null)
      return
    }
    refreshUsage()
    const t = setInterval(refreshUsage, 60_000)
    return () => clearInterval(t)
  }, [rootPath, refreshUsage])

  const usage = useMemo(() => (model && usageRaw ? buildUsage(model, usageRaw) : null), [model, usageRaw])

  const init = useCallback(
    async (mode: 'new' | 'complete') => {
      setLoading(true)
      try {
        const r = await api().initWorkspace(mode)
        if (!r) return null
        apply(r.scan, mode === 'complete')
        if (mode === 'new') setStack([{ page: 'dashboard' }])
        return r.created
      } catch (e) {
        setError(String(e))
        return null
      } finally {
        setLoading(false)
      }
    },
    [apply],
  )

  const value = useMemo<Ctx>(
    () => ({
      model,
      loading,
      error,
      route: stack[stack.length - 1],
      go,
      back,
      canBack: stack.length > 1,
      choose,
      close,
      refresh,
      lastChange,
      recentlyChanged,
      usage,
      usageLoading,
      refreshUsage,
      init,
    }),
    [model, loading, error, stack, go, back, choose, close, refresh, lastChange, recentlyChanged, usage, usageLoading, refreshUsage, init],
  )
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp() {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

/** Model is guaranteed inside workspace pages. */
export function useModel(): Model {
  const m = useApp().model
  if (!m) throw new Error('No workspace loaded')
  return m
}
