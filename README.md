# opencode-usage-check-tui

Goクォータ `Rolling/Weekly/Monthly %` をTUI入力欄直下の1行に表示するプラグイン。

表示: `prompt.footer.status` と `home.footer.status` にappend (`Go 5h 62%·3h30m Wk 28%·3d Mo 12%·14d`)
重なり回避: `append`のみ、`replace`不使用、単一`<text muted>`+`Go`接頭辞。sidebar系と併存可。

## 使い方（mac/win共通・GitHub配布）

`opencode.jsonc`（mac/win共通ファイル）に登録:

```jsonc
{
  "plugins": [
    "github:OMOCHInoHOSHI/OpenCodeUsageCheckTUI"
  ]
}
```

各機のサーバが初回に自動取得する。ローカル配置・`cli.json`登録は不要。
確認: `opencode plugin list` に `usage-check-tui.server` が `github:...` 付きで出ればOK。

キー解決: `OPENCODE_API_KEY`優先、無ければ `opencode-go` credential。401/403・非Go選択時は非表示。
更新: 起動時+`session.idle`/`session.execution.succeeded`、5分間隔、カウントダウンは60s tick。

## 表示確認

- セッション画面: 入力欄直下（`prompt.footer.status`）
- ホーム画面（起動直後・セッション未選択）: フッタ行に表示（`home.footer.status`）

TUI再起動が必要。
