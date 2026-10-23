// TUIエントリ。JSX構文を使わない。
// github:/npm配布では node_modules 配下の .tsx が OpenTUI transform対象外となり、
// 自動生成される react/jsx-runtime import で `Cannot find package 'react'` になる。
// そのため仮想ID経由の import + jsx()/jsxs() 手書きでホスト単一インスタンスに載せる。
// 参考: anomalyco/opencode#39986, pistonex/opencode-go-usage@0.1.3
import { createSignal, Show } from "opentui:runtime-module:solid-js"
import { Plugin, usePlugin } from "opentui:runtime-module:%40opencode%2Fplugin%2Ftui"
import { jsx } from "opentui:runtime-module:%40opentui%2Fsolid%2Fjsx-runtime"
import { fetchUsage, formatSummary, type UsageSnapshot } from "./usage.js"

const FETCH_INTERVAL_MS = 5 * 60 * 1000
const MIN_REFRESH_MS = 30 * 1000
const TICK_MS = 60 * 1000

// jsx-runtime の型は (props: Record<string, unknown>) => unknown のため、
// ジェネリックな Show との型差を吸収する。
type AnyComponent = (props: Record<string, unknown>) => unknown
const show = Show as unknown as AnyComponent

function getEnvKey(): string | null {
  try {
    const k = (globalThis as any)?.process?.env?.["OPENCODE_API_KEY"]
    return typeof k === "string" && k.length > 0 ? k : null
  } catch {
    return null
  }
}

async function getCredentialKey(ctx: any): Promise<string | null> {
  try {
    const list = ctx?.client?.credential?.list
    if (typeof list !== "function") return null
    const res = await list.call(ctx.client)
    const items: any[] = Array.isArray(res) ? res : (res?.data ?? res?.credentials ?? [])
    for (const c of items) {
      const id = c?.integrationID ?? c?.integration ?? c?.provider ?? ""
      const active = c?.active ?? c?.isActive ?? true
      if (String(id).toLowerCase().includes("opencode") && active) {
        const v = c?.value ?? c?.credential ?? c
        const key = v?.key ?? v?.token ?? v?.apiKey ?? (typeof v === "string" ? v : null)
        if (typeof key === "string" && key.length > 0) return key
      }
    }
    return null
  } catch {
    return null
  }
}

function isNonGoProvider(providerID: unknown): boolean {
  if (typeof providerID !== "string" || providerID.length === 0) return false
  const p = providerID.toLowerCase()
  if (p === "go" || p === "opencode-go" || p.startsWith("opencode") || p.includes("zen")) return false
  return true
}

type UsageLineProps = {
  snapshot: UsageSnapshot | null
  now: number
  hasKey: boolean
}

// 画面最下段の独立1行に表示する（app スロットappend）。
// ディレクトリ名・コストなどのフッタ行は横並び1行で wrap しないため、
// 同じ行に入れると折り返す。app スロットはルート内容の下に全幅で積まれる。
function UsageLine(props: UsageLineProps) {
  const context = usePlugin() as any
  const visible = () => {
    try {
      const model = context?.ui?.model?.current?.()
      if (isNonGoProvider(model?.providerID)) return false
    } catch {
      // 判定不能時は表示
    }
    return true
  }
  const label = () => {
    if (props.snapshot) return formatSummary(props.snapshot, props.now)
    return "Go …"
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
    const [now, setNow] = createSignal(Date.now())
    const [hasKey, setHasKey] = createSignal(false)
    let lastFetch = 0
    let inFlight = false
    let disposed = false

    const refresh = async () => {
      if (inFlight || disposed) return
      const t = Date.now()
      if (t - lastFetch < MIN_REFRESH_MS) return
      inFlight = true
      try {
        const key = getEnvKey() ?? (await getCredentialKey(context))
        if (!key) {
          if (!disposed) setHasKey(false)
          return
        }
        if (!disposed) setHasKey(true)
        const s = await fetchUsage(key)
        lastFetch = Date.now()
        if (!disposed) setSnapshot(s)
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

    let stopIdle: (() => void) | undefined
    try {
      stopIdle = context?.data?.on?.("session.idle", () => void refresh())
    } catch {
      stopIdle = undefined
    }
    let stopExec: (() => void) | undefined
    try {
      stopExec = context?.data?.on?.("session.execution.succeeded", () => void refresh())
    } catch {
      stopExec = undefined
    }

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
          get hasKey() {
            return hasKey()
          },
        }),
    })

    return () => {
      disposed = true
      clearInterval(tick)
      try {
        stopIdle?.()
      } catch {}
      try {
        stopExec?.()
      } catch {}
      try {
        ;(unregister as unknown as () => void)?.()
      } catch {}
    }
  },
})
