// TUIエントリ。JSX構文を使わない。
// github:/npm配布では node_modules 配下の .tsx が OpenTUI transform対象外となり、
// 自動生成される react/jsx-runtime import で `Cannot find package 'react'` になる。
// そのため仮想ID経由の import + jsx()/jsxs() 手書きでホスト単一インスタンスに載せる。
// 参考: anomalyco/opencode#39986, pistonex/opencode-go-usage@0.1.3
import { createSignal, Show } from "opentui:runtime-module:solid-js"
import { Plugin, usePlugin } from "opentui:runtime-module:%40opencode%2Fplugin%2Ftui"
import { jsx } from "opentui:runtime-module:%40opentui%2Fsolid%2Fjsx-runtime"
import { fetchUsage, formatSummary, type UsageSnapshot } from "./usage.js"

const FETCH_INTERVAL_MS = 5 * 60_000
const MIN_REFRESH_MS = 30_000
const TICK_MS = 60_000

// jsx-runtime の型は (props: Record<string, unknown>) => unknown のため、
// ジェネリックな Show との型差を吸収する。
type AnyComponent = (props: Record<string, unknown>) => unknown
const show = Show as unknown as AnyComponent

async function resolveApiKey(ctx: any): Promise<string | null> {
  const envKey = process?.env?.OPENCODE_API_KEY
  if (envKey) return envKey

  try {
    const list = ctx?.client?.credential?.list
    if (typeof list !== "function") return null
    const res = await list.call(ctx.client)
    const items: any[] = Array.isArray(res) ? res : (res?.data ?? res?.credentials ?? [])
    for (const item of items) {
      const id = String(item?.integrationID ?? item?.integration ?? item?.provider ?? "").toLowerCase()
      const active = item?.active ?? item?.isActive ?? true
      if (!id.includes("opencode") || !active) continue

      const raw = item?.value ?? item?.credential ?? item
      const key = typeof raw === "string" ? raw : (raw?.key ?? raw?.token ?? raw?.apiKey)
      if (typeof key === "string" && key.length > 0) return key
    }
  } catch {
    // credential API未対応・取得失敗時は無視
  }
  return null
}

function isGoProvider(providerID: unknown): boolean {
  if (typeof providerID !== "string" || providerID.length === 0) return true
  const p = providerID.toLowerCase()
  return p === "go" || p === "opencode-go" || p.startsWith("opencode") || p.includes("zen")
}

type UsageLineProps = {
  snapshot: UsageSnapshot | null
  now: number
}

// 画面最下段の独立1行に表示する（app スロットappend）。
// ディレクトリ名・コストなどのフッタ行は横並び1行で wrap しないため、
// 同じ行に入れると折り返す。app スロットはルート内容の下に全幅で積まれる。
function UsageLine(props: UsageLineProps) {
  const context = usePlugin() as any
  const visible = () => isGoProvider(context?.ui?.model?.current?.()?.providerID)
  const label = () => (props.snapshot ? formatSummary(props.snapshot, props.now) : "Go …")

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
    const [now, setNow] = createSignal(Date.now())
    let lastFetch = 0
    let inFlight = false
    let disposed = false

    const refresh = async () => {
      if (inFlight || disposed) return
      if (Date.now() - lastFetch < MIN_REFRESH_MS) return
      inFlight = true
      try {
        const key = await resolveApiKey(context)
        if (!key) return
        const next = await fetchUsage(key)
        lastFetch = Date.now()
        if (!disposed) setSnapshot(next)
      } catch {
        // 401/403/ネットワーク時は沈黙: 前回値保持
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
