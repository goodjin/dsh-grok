/**
 * Grok 模型清单。
 *
 * 从 grok-models-cache.json 加载，如果缺失则使用静态兜底列表。
 * 模型：grok-4.7（默认）、grok-4.7-fast、grok-4.6、grok-4.5。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Grok 模型条目。 */
export type GrokModel = {
  id: string
  name: string
  description?: string
  contextWindow: number
  efforts: readonly string[]
}

/**
 * 加载 Grok 模型清单。
 * 从 ~/.grok/grok-models-cache.json 读取，失败时返回 BUILTIN_MODELS。
 */
export async function loadCatalog(options?: { home?: string }): Promise<readonly GrokModel[]> {
  const home = options?.home ?? homedir()
  const cachePath = join(home, '.grok', 'grok-models-cache.json')
  let raw: string
  try {
    raw = await readFile(cachePath, 'utf8')
  } catch {
    return BUILTIN_MODELS
  }
  let parsed: { models?: GrokModel[] }
  try {
    parsed = JSON.parse(raw) as { models?: GrokModel[] }
  } catch {
    return BUILTIN_MODELS
  }
  if (!Array.isArray(parsed.models) || parsed.models.length === 0) return BUILTIN_MODELS
  return parsed.models
}

/**
 * 静态兜底模型列表（2026-11-25 实测）。
 * 用于 grok-models-cache.json 不可用时。
 */
export const BUILTIN_MODELS: readonly GrokModel[] = [
  { id: 'grok-4.7', name: 'Grok 4.7', description: '最新旗舰 · 256k 上下文', contextWindow: 256000, efforts: ['xhigh', 'high', 'medium', 'low'] },
  { id: 'grok-4.7-build-fast', name: 'Grok 4.7 Fast', description: '快速变体 · 2x 价格', contextWindow: 256000, efforts: ['xhigh', 'high', 'medium', 'low'] },
  { id: 'grok-4.6', name: 'Grok 4.6', contextWindow: 256000, efforts: ['xhigh', 'high', 'medium', 'low'] },
  { id: 'grok-4.5', name: 'Grok 4.5', contextWindow: 256000, efforts: ['high', 'medium', 'low'] },
]
