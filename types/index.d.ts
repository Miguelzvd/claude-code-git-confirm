export type Rules = string[]

declare module 'claude-code' {
  interface PluginState {
    'git-confirm': { draft: Rules; coauthorDraft: boolean; focused: string; top: number }
  }
}
