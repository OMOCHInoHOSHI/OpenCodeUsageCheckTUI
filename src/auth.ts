// 使用量API用トークンの解決。
// ホストの usage.limits が使えない場合のみ、ここで得た候補を順に試す。
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

/** env → Go credential → その他OpenCode credential の順で重複を除いたトークン候補を返す。 */
export async function resolveApiKeys(ctx: any): Promise<string[]> {
  const keys: string[] = []
  for (const name of ENV_KEYS) {
    const value = process?.env?.[name]
    if (typeof value === "string" && value.length > 0) keys.push(value)
  }

  try {
    const list = ctx?.client?.credential?.list
    if (typeof list !== "function") return [...new Set(keys)]
    const res = await list.call(ctx.client)
    // SDKは data を展開済み。HTTP生レスポンスの場合は data 配下を見る。
    const items: any[] = Array.isArray(res) ? res : (res?.data ?? res?.credentials ?? [])
    const score = (item: any) => (isGoCredential(item) ? 0 : isOpenCodeCredential(item) ? 1 : 2)
    const ordered = items.filter((item) => item?.active !== false).sort((a, b) => score(a) - score(b))
    for (const item of ordered) {
      const key = credentialKey(item)
      if (key) keys.push(key)
    }
  } catch {
    // credential API未対応・取得失敗時は無視
  }
  return [...new Set(keys)]
}
