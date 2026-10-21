import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"

// TODO: 実データ取得に置き換える（現状はダミー固定値）
const usage = { go5h: "-", week: "-", month: "-" } as const

function UsageStatus(props: { sessionID?: string }) {
  const context = usePlugin()

  return (
    <Show when={props.sessionID}>
      <text fg={context.theme.text.base}>
        {`Go 5h ${usage.go5h}% · Wk ${usage.week}% · Mo ${usage.month}%`}
      </text>
    </Show>
  )
}

export default Plugin.define({
  id: "usage-check-tui",
  setup(context) {
    return context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => {
        const sessionID = input?.sessionID
        return <UsageStatus sessionID={sessionID} />
      },
    })
  },
})
