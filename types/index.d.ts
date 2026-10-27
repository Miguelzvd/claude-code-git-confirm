export type Rules = string[]

declare module 'claude-code' {
  interface PluginState {
    'git-confirm': { draft: Rules; focused: string; top: number }
  }
}
