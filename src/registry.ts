/**
 * 预设配置类型。
 * 与 dsh-codex 的 registry 同款。
 */

export type PresetConfig = {
  presets: Record<string, {
    agent?: string
    models?: { id: string; name: string; description?: string; contextWindow?: number }[]
  }>
}
