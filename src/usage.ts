export interface UsageWindow {
  percent: number | null
  resetsAt: string | null
}

export interface UsageSnapshot {
  rolling: UsageWindow
  weekly: UsageWindow
  monthly: UsageWindow
}

const emptyWindow: UsageWindow = { percent: null, resetsAt: null }

export function parseWindow(v: unknown): UsageWindow {
  if (typeof v !== "object" || v === null) return { ...emptyWindow }
  const o = v as Record<string, unknown>
  const percent = typeof o["percent"] === "number" && Number.isFinite(o["percent"]) ? (o["percent"] as number) : null
  const resetsAt = typeof o["resetsAt"] === "string" ? (o["resetsAt"] as string) : null
  return { percent, resetsAt }
}

export function parseUsage(json: unknown): UsageSnapshot {
  if (typeof json !== "object" || json === null) {
    return { rolling: { ...emptyWindow }, weekly: { ...emptyWindow }, monthly: { ...emptyWindow } }
  }
  const o = json as Record<string, unknown>
  const u = (typeof o["usage"] === "object" && o["usage"] !== null ? o["usage"] : {}) as Record<string, unknown>
  return {
    rolling: parseWindow(u["rolling"]),
    weekly: parseWindow(u["weekly"]),
    monthly: parseWindow(u["monthly"]),
  }
}

export function formatRemaining(resetsAt: string | null, now: number): string {
  if (!resetsAt) return "-"
  const t = Date.parse(resetsAt)
  if (Number.isNaN(t)) return "-"
  const diff = t - now
  if (diff <= 0) return "0m"
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (d > 0) return h > 0 ? `${d}d${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`
  return `${m}m`
}

function fmtPct(p: number | null): string {
  return p === null ? "-" : `${Math.round(p)}%`
}

export function formatSummary(s: UsageSnapshot, now: number): string {
  const r = `${fmtPct(s.rolling.percent)}·${formatRemaining(s.rolling.resetsAt, now)}`
  const w = `${fmtPct(s.weekly.percent)}·${formatRemaining(s.weekly.resetsAt, now)}`
  const m = `${fmtPct(s.monthly.percent)}·${formatRemaining(s.monthly.resetsAt, now)}`
  return `Go 5h ${r} Wk ${w} Mo ${m}`
}

export async function fetchUsage(apiKey: string): Promise<UsageSnapshot> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10000)
  try {
    const res = await fetch("https://opencode.ai/zen/go/v1/usage", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`usage ${res.status}`)
    return parseUsage(await res.json())
  } finally {
    clearTimeout(timer)
  }
}
