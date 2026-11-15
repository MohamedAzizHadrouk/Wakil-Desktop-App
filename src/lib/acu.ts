// AI Consumption Units (ACU) – relative AI resource consumption, NOT money and NOT a provider credit balance.
//
//   ACU = Σ per model [ (I×Wi + O×Wo + C×Wc) × M ] + R × requests
//   I = uncached input tokens / 1000 (cache writes are processed input → counted here, once)
//   O = output tokens / 1000 (reasoning included)      C = cached input tokens read / 1000
//   M = model multiplier (longest matching prefix, else the default)      R = overhead per request
//
// Cached tokens are never counted twice: Claude logs report input_tokens WITHOUT the cache, Codex logs report
// input_tokens INCLUDING the cache – the log reader already stores uncached input for both. Context utilisation
// (peak context / window) is reported separately and never added to the formula.
import type { AcuConfig, Registry } from './registry'
import type { ByModel } from './types'

export const ACU_FORMULA = 'ACU = (I × Wi + O × Wo + C × Wc) × M + R'

export type AcuMode = 'historical' | 'current'

/** The formula version to use: the one in effect at the record date (historical) or the latest one (recalculation). */
export function configAt(reg: Registry, date: string, mode: AcuMode): AcuConfig {
  const versions = [...reg.acu].sort((a, b) => a.version - b.version)
  if (mode === 'current') return versions[versions.length - 1]
  const day = date.slice(0, 10)
  return versions.filter((v) => v.from <= day).pop() ?? versions[0]
}

export function multiplierFor(model: string, cfg: AcuConfig): number {
  const m = model.toLowerCase()
  let best: { match: string; value: number } | undefined
  for (const x of cfg.multipliers) if (m.startsWith(x.match.toLowerCase()) && (!best || x.match.length > best.match.length)) best = x
  return best ? best.value : cfg.defaultMultiplier
}

export type AcuBreakdown = { model: string; I: number; O: number; C: number; M: number; requests: number; acu: number }

/** Exact ACU from measured tokens. Returns null when there is no telemetry at all (never 0 by default). */
export function acuFromTokens(byModel: ByModel, cfg: AcuConfig): { acu: number; breakdown: AcuBreakdown[] } | null {
  const entries = Object.entries(byModel)
  if (!entries.length) return null
  const w = cfg.weights
  const breakdown: AcuBreakdown[] = []
  let acu = 0
  for (const [model, t] of entries) {
    const I = (t.input + t.cacheWrite5m + t.cacheWrite1h) / 1000
    const O = t.output / 1000
    const C = t.cacheRead / 1000
    const tokens = t.input + t.output + t.cacheWrite5m + t.cacheWrite1h + t.cacheRead
    // a request with tokens but no counter (old logs) counts once; cumulative fallbacks are flagged requestsUnknown
    const requests = t.requestsUnknown ? 1 : t.requests ?? (tokens > 0 ? 1 : 0)
    const M = multiplierFor(model, cfg)
    const v = (I * w.input + O * w.output + C * w.cached) * M + w.overhead * requests
    breakdown.push({ model, I, O, C, M, requests, acu: v })
    acu += v
  }
  return { acu, breakdown }
}

/** Exact ACU from tokens reported in chat (input = TOTAL input incl. cached, as providers usually report it). */
export function acuFromReported(t: { input: number; output: number; cached: number }, model: string, requests: number, cfg: AcuConfig) {
  const uncached = Math.max(0, t.input - t.cached)
  const w = cfg.weights
  return ((uncached / 1000) * w.input + (t.output / 1000) * w.output + (t.cached / 1000) * w.cached) * multiplierFor(model, cfg) + w.overhead * requests
}

/** Mode 2 – estimated ACU from a request count, using a configured per-request estimate. null = no defensible rule. */
export function acuEstimated(requests: number, keys: (string | null | undefined)[], cfg: AcuConfig): number | null {
  let best: { match: string; acuPerRequest: number } | undefined
  for (const key of keys) {
    if (!key) continue
    const k = key.toLowerCase()
    for (const e of cfg.estimation) if (k.startsWith(e.match.toLowerCase()) && (!best || e.match.length > best.match.length)) best = e
  }
  return best ? requests * best.acuPerRequest : null
}
