# opencode-usage-check-tui

OpenCode のプロンプトフッターに使用量を表示する TUI プラグインの雛形です。現在はダミー値を表示します。

## 使い方

`cli.json` の `plugins` に追加します。

```json
{
  "plugins": ["opencode-usage-check-tui"]
}
```

ローカル配置の場合はパス指定でも追加できます。

```json
{
  "plugins": ["./path/to/OpenCodeUsageCheckTUI"]
}
```
