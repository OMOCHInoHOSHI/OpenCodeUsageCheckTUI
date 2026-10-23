// OpenCode TUI の仮想モジュール。実行時だけ存在するため型だけ宣言する。
// runtimeではホストの同一インスタンスに解決される。型は実パッケージから再exportする。
declare module "opentui:runtime-module:solid-js" {
  export * from "solid-js"
}

declare module "opentui:runtime-module:%40opencode%2Fplugin%2Ftui" {
  export * from "@opencode/plugin/tui"
}

declare module "opentui:runtime-module:%40opentui%2Fsolid%2Fjsx-runtime" {
  export * from "@opentui/solid/jsx-runtime"
}
