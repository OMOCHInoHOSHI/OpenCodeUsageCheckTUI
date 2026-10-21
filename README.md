# opencode-usage-check-tui

Goクォータ `Rolling/Weekly/Monthly %` をTUI入力欄直下の1行に表示するプラグイン。

表示: `prompt.footer.status` にappend (`Go 5h 62%·3h30m Wk 28%·3d Mo 12%·16d`)
重なり回避: `append`のみ、`replace`不使用、単一`<text muted>`+`Go`接頭辞。sidebar系と併存可。

## 使い方

`~/.config/opencode/cli.json` に追加:

```json
{
  "plugins": ["/home/omochinohoshi/cording/OpenCodeUsageCheckTUI"]
}
```

キー解決: `OPENCODE_API_KEY`優先、無ければ `opencode-go` credential。401/403・非Go選択・未発話セッションでは非表示。
更新: 起動時+`session.idle`/`session.execution.succeeded`、5分間隔、カウントダウンは60s tick。
