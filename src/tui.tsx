// TUIエントリ。JSX構文を使わない。
// github:/npm配布では node_modules 配下の .tsx が OpenTUI transform対象外となり、
// 自動生成される react/jsx-runtime import で `Cannot find package 'react'` になる。
// そのため仮想ID経由の import + jsx()/jsxs() 手書きでホスト単一インスタンスに載せる。
// 参考: anomalyco/opencode#39986, pistonex/opencode-go-usage@0.1.3
import { createSignal, Show } from "opentui:runtime-module:solid-js"
import { Plugin, usePlugin } from "opentui:runtime-module:%40opencode%2Fplugin%2Ftui"
import { jsx } from "opentui:runtime-module:%40opentui%2Fsolid%2Fjsx-runtime"
import { fetchUsage, formatSummary, parseUsageLimits, UsageError, type UsageSnapshot } from "./usage.js"

const FETCH_INTERVAL_MS = 5 * 60_000
const MIN_REFRESH_MS = 30_000
const TICK_MS = 60_000

// jsx-runtime の型は (props: Record<string, unknown>) => unknown のため、
// ジェネリックな Show との型差を吸収する。
type AnyComponent = (props: Record<string, unknown>) => unknown
const show = Show as unknown as AnyComponent

const ENV_KEYS = ["OPENCODE_API_KEY", "OPENCODE_ZEN_API_KEY"] as const

function credentialKey(item: any): string | null {
  const value = item?.value ?? item
  if (typeof value === "string") return value.length > 0 ? value : null
  if (value?.type === "oauth") {
    return typeof value.access === "string" && value.access.length > 0 ? value.access : null
  }
  const key = value?.key ?? value?.token ?? value?.apiKey
  return typeof key === "string" && key.length > 0 ? key : null
}

function isGoCredential(item: any): boolean {
  const id = String(item?.integrationID ?? item?.integration ?? item?.provider ?? "").toLowerCase()
  return id.includes("opencode-go") || id === "go"
}

function isOpenCodeCredential(item: any): boolean {
  const id = String(item?.integrationID ?? item?.integration ?? item?.provider ?? "").toLowerCase()
  return id.includes("opencode") || id.includes("zen")
}

async function resolveApiKey(ctx: any): Promise<string | null> {
  for (const name of ENV_KEYS) {
    const value = process?.env?.[name]
    if (typeof value === "string" && value.length > 0) return value
  }

  try {
    const list = ctx?.client?.credential?.list
    if (typeof list !== "function") return null
    const res = await list.call(ctx.client)
    // SDKは data を展開済み。HTTP生レスポンスの場合は data 配下を見る。
    const items: any[] = Array.isArray(res) ? res : (res?.data ?? res?.credentials ?? [])
    const active = items.filter((item) => item?.active !== false)

    // Go優先 → その他OpenCode → それ以外の順で鍵を探す
    for (const pick of [isGoCredential, isOpenCodeCredential, () => true]) {
      for (const item of active) {
        if (!pick(item)) continue
        const key = credentialKey(item)
        if (key) return key
      }
    }
  } catch {
    // credential API未対応・取得失敗時は無視
  }
  return null
}

type ClientUsage =
  | { supported: false }
  | { supported: true; snapshot: UsageSnapshot | null }

// ホストの usage.limits API は認証をサーバ側で解決するため、鍵不要でGo値を返す。
// 旧ホスト（API未提供）では supported: false を返し、直叩きfetchへフォールバックする。
async function fetchUsageFromClient(ctx: any): Promise<ClientUsage> {
  const limits = ctx?.client?.experimental?.usage?.limits ?? ctx?.client?.usage?.limits
  if (typeof limits !== "function") return { supported: false }
  const directory = ctx?.location?.directory
  const input = typeof directory === "string" ? { location: { directory } } : undefined
  const res: any = await limits.call(ctx.client, input)
  const info = res && typeof res === "object" && "data" in res ? res.data : res
  return { supported: true, snapshot: parseUsageLimits(info) }
}

function describeError(error: unknown): string {
  if (error instanceof UsageError && error.status) return `HTTP ${error.status}`
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "タイムアウト"
    const status = /\b([45]\d{2})\b/.exec(error.message)
    if (status) return `HTTP ${status[1]}`
  }
  return "通信失敗"
}

function isGoProvider(providerID: unknown): boolean {
  if (typeof providerID !== "string" || providerID.length === 0) return true
  const p = providerID.toLowerCase()
  return p === "go" || p === "opencode-go" || p.startsWith("opencode") || p.includes("zen")
}

type UsageLineProps = {
  snapshot: UsageSnapshot | null
  status: string | null
  now: number
}

// 画面最下段の独立1行に表示する（app スロットappend）。
// ディレクトリ名・コストなどのフッタ行は横並び1行で wrap しないため、
// 同じ行に入れると折り返す。app スロットはルート内容の下に全幅で積まれる。
function UsageLine(props: UsageLineProps) {
  const context = usePlugin() as any
  const visible = () => isGoProvider(context?.ui?.model?.current?.()?.providerID)
  const label = () => {
    if (props.snapshot) return formatSummary(props.snapshot, props.now)
    return props.status ? `Go ${props.status}` : "Go …"
  }

  return jsx(show, {
    get when() {
      return visible()
    },
    children: jsx("box", {
      width: "100%",
      paddingLeft: 1,
      flexShrink: 0,
      children: jsx("text", {
        wrapMode: "none",
        truncate: true,
        get fg() {
          return context.theme.text.muted
        },
        get children() {
          return label()
        },
      }),
    }),
  })
}

export default Plugin.define({
  id: "usage-check-tui",
  setup(context: any) {
    const [snapshot, setSnapshot] = createSignal<UsageSnapshot | null>(null)
    const [status, setStatus] = createSignal<string | null>(null)
    const [now, setNow] = createSignal(Date.now())
    let lastFetch = 0
    let inFlight = false
    let disposed = false

    const refresh = async () => {
      if (inFlight || disposed) return
      if (Date.now() - lastFetch < MIN_REFRESH_MS) return
      inFlight = true
      try {
        let clientError: unknown = null
        try {
          const viaClient = await fetchUsageFromClient(context)
          if (viaClient.supported) {
            lastFetch = Date.now()
            if (disposed) return
            // Go未契約・未ログイン時は null。古い値を残さない。
            setSnapshot(viaClient.snapshot)
            setStatus(viaClient.snapshot ? null : "情報なし")
            return
          }
        } catch (error) {
          clientError = error
        }

        const key = await resolveApiKey(context)
        if (!key) {
          if (!disposed) setStatus(clientError ? `取得失敗(${describeError(clientError)})` : "鍵なし")
          return
        }
        try {
          const next = await fetchUsage(key)
          if (disposed) return
          lastFetch = Date.now()
          setSnapshot(next)
          setStatus(null)
        } catch (error) {
          // 401/403/ネットワーク時は前回値保持しつつ、理由を1行に出す
          if (!disposed) setStatus(`取得失敗(${describeError(error)})`)
        }
      } finally {
        inFlight = false
      }
    }

    void refresh()
    const tick = setInterval(() => {
      if (disposed) return
      setNow(Date.now())
      if (Date.now() - lastFetch >= FETCH_INTERVAL_MS) void refresh()
    }, TICK_MS)

    const onRefresh = () => void refresh()
    const stopIdle = context?.data?.on?.("session.idle", onRefresh)
    const stopExec = context?.data?.on?.("session.execution.succeeded", onRefresh)

    // フッタ行（ディレクトリ/コスト）の一段下＝画面最下段、ホーム画面でも表示
    const unregister = context.ui.slot({
      append: "app",
      render: () =>
        jsx(UsageLine as unknown as AnyComponent, {
          get snapshot() {
            return snapshot()
          },
          get status() {
            return status()
          },
          get now() {
            return now()
          },
        }),
    })

    return () => {
      disposed = true
      clearInterval(tick)
      for (const cleanup of [stopIdle, stopExec, unregister]) {
        if (typeof cleanup === "function") cleanup()
      }
    }
  },
})
