# opencode-usage-check-tui

Goクォータ `Rolling/Weekly/Monthly %` をTUI入力欄直下の1行に表示するプラグイン。

日本語でパッと使用量が見れて便利

表示: `app` スロットにappendし、画面最下段の独立1行に出す (`Go 5h 15%(あと0時間34分) 週 56%(あと2日7時間) 月 33%(あと12日17時間)`)
重なり回避: `append`のみ、`replace`不使用。フッタ行（ディレクトリ/コスト）の一段下、横並びに入り込まない。単一`<text muted>`+`Go`接頭辞。sidebar系と併存可。

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

取得: `usage.limits` API（`ctx.client` 経由・サーバ側で認証解決）を優先。APIキー不要で、`/connect` のアカウントログインでも動く。
旧ホスト（API未提供）のみ `OPENCODE_API_KEY` → `OPENCODE_ZEN_API_KEY` → `opencode-go` credential（`key`/`oauth.access`）の順で鍵を解決し `zen/go/v1/usage` を直叩き。
失敗時: `Go 鍵なし` / `Go 取得失敗(HTTP 401)` / `Go 情報なし` を1行に表示（非Go選択時は非表示）。
更新: 起動時+`session.idle`/`session.execution.succeeded`、5分間隔、カウントダウンは60s tick。

パーセントは整数表示。公式API (`zen/go/v1/usage`) も整数で返すため実質一致。ただし本家コンソール（内部値を切り上げ表示している可能性）と±1%ずれることがある。

## 表示確認

- セッション画面: 入力欄フッタ（ディレクトリ名・コスト行）の一段下＝画面最下段
- ホーム画面（起動直後・セッション未選択）: ホームフッタ行の一段下

TUI再起動が必要。

## 更新方法

```
opencode plugin update
```

新規で導入したときや、このプラグインに更新が入った時はこのコマンドをターミナルで打つ
