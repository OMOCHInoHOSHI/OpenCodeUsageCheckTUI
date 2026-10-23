export interface UsageWindow {
  percent: number | null
  resetsAt: string | null
}

export interface UsageSnapshot {
  rolling: UsageWindow
  weekly: UsageWindow
  monthly: UsageWindow
}

const USAGE_ENDPOINT = "https://opencode.ai/zen/go/v1/usage"
const FETCH_TIMEOUT_MS = 10_000
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function parseWindow(v: unknown): UsageWindow {
  if (!isRecord(v)) return { percent: null, resetsAt: null }
  return {
    percent: typeof v.percent === "number" && Number.isFinite(v.percent) ? v.percent : null,
    resetsAt: typeof v.resetsAt === "string" ? v.resetsAt : null,
  }
}

function parseUsage(json: unknown): UsageSnapshot {
  const u = isRecord(json) && isRecord(json.usage) ? json.usage : {}
  return {
    rolling: parseWindow(u.rolling),
    weekly: parseWindow(u.weekly),
    monthly: parseWindow(u.monthly),
  }
}

function getRemainingMs(resetsAt: string | null, now: number): number | null {
  if (!resetsAt) return null
  const target = Date.parse(resetsAt)
  if (Number.isNaN(target)) return null
  return Math.max(0, target - now)
}

function formatHoursMinutes(resetsAt: string | null, now: number): string {
  const diff = getRemainingMs(resetsAt, now)
  if (diff === null) return "あと-"
  const hours = Math.floor(diff / HOUR_MS)
  const minutes = Math.floor((diff % HOUR_MS) / MINUTE_MS)
  return `あと${hours}時間${minutes}分`
}

function formatDaysHours(resetsAt: string | null, now: number): string {
  const diff = getRemainingMs(resetsAt, now)
  if (diff === null) return "あと-"
  const days = Math.floor(diff / DAY_MS)
  const hours = Math.floor((diff % DAY_MS) / HOUR_MS)
  return `あと${days}日${hours}時間`
}

function formatPercent(percent: number | null): string {
  return percent === null ? "-" : `${Math.round(percent)}%`
}

export function formatSummary(s: UsageSnapshot, now: number): string {
  const rolling = `${formatPercent(s.rolling.percent)}(${formatHoursMinutes(s.rolling.resetsAt, now)})`
  const weekly = `${formatPercent(s.weekly.percent)}(${formatDaysHours(s.weekly.resetsAt, now)})`
  const monthly = `${formatPercent(s.monthly.percent)}(${formatDaysHours(s.monthly.resetsAt, now)})`
  return `Go 5h ${rolling} 週 ${weekly} 月 ${monthly}`
}

export async function fetchUsage(apiKey: string): Promise<UsageSnapshot> {
  const res = await fetch(USAGE_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`usage ${res.status}`)
  return parseUsage(await res.json())
}
