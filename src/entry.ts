/**
 * dsh-grok: Grok 模型行——DSH 真正加载的那一行。
 *
 * Grok 是**模型**，不是外部 agent——DSH 自己的循环已经会读文件、跑命令、请求
 * 批准、取消、写会话了，这一行只回答「向模型要下一句话」：解出 Grok 凭据、
 * 把这一轮的历史与工具发出去、把回来的文本/推理/工具调用交回循环。
 *
 * 登录、清单、请求、流解析都在 `grok/*` 里。
 */

import Schema from '@deepseek-ai/schemastery'
import { modelRowAdapter, providerRoute, runtimeModels } from './modelkit/index.ts'
import type { ReportedModel } from './modelkit/index.ts'
import { grokModelStream, refreshGrokModels } from './grok/grok-model.ts'
import { loadSelection } from './grok/selection.ts'
import type { PresetConfig } from './registry.ts'

export const name = '@goodjin2/dsh-grok'
export const inject = ['llm']

/** 一个模型在目录/选择器里怎么显示。 */
const Model = Schema.object({
  id: Schema.string().required(),
  name: Schema.string().required(),
  description: Schema.string(),
  contextWindow: Schema.number(),
})

/** 一档推理强度。 */
const Effort = Schema.object({
  id: Schema.string().required(),
  name: Schema.string(),
})

export const Config: Schema<Config> = Schema.object({
  presetId: Schema.string().required(),
  agent: Schema.string().required(),
  models: Schema.array(Model),
  collapseEfforts: Schema.boolean(),
  hideFromRoster: Schema.boolean(),
  efforts: Schema.array(Effort),
})

export type Config = {
  presetId: string
  agent: string
  models?: { id: string; name: string; description?: string; contextWindow?: number }[]
  collapseEfforts?: boolean
  hideFromRoster?: boolean
  efforts?: { id: string; name?: string }[]
}

/**
 * 把 Grok 这一行接进宿主的模型目录。
 */
export function apply(ctx: unknown, config: Config): void {
  const presets: PresetConfig = {
    presets: {
      [config.presetId]: {
        agent: config.agent,
        ...(config.models === undefined ? {} : { models: config.models }),
      },
    },
  }

  const ledger = runtimeModels()
  const onRuntimeModels = (presetId: string, models: readonly ReportedModel[]): void => {
    ledger.record(presetId, models)
  }

  void loadSelection()
    .then(() => refreshGrokModels())
    .catch(() => {})

  const adapter = modelRowAdapter({
    presetId: config.presetId,
    displayName: 'Grok (Direct)',
    declaredModels: config.models ?? [],
    runtimeModelsOf: (presetId: string): readonly ReportedModel[] | undefined => ledger.modelsOf(presetId),
    modelStream: grokModelStream(presets, { onRuntimeModels }),
    collapseEfforts: config.collapseEfforts,
    efforts: config.efforts,
  })

  const registry = registryOf(ctx)
  if (registry === undefined) {
    process.stderr.write(`[grok] no host model directory; the ${config.presetId} row is registered but invisible to the picker\n`)
    return
  }
  registry.registerAdapter([providerRoute(config.presetId)], adapter)
}

type RegistryLike = {
  registerAdapter(providers: string[], adapter: unknown): unknown
}

function registryOf(ctx: unknown): RegistryLike | undefined {
  if (typeof ctx !== 'object' || ctx === null) return undefined
  const getter = ctx as { get?: unknown }
  let llm: unknown
  if (typeof getter.get === 'function') {
    try {
      llm = (getter.get as (key: string) => unknown).call(ctx, 'llm')
    } catch {
      return undefined
    }
  } else {
    try {
      llm = (ctx as { llm?: unknown }).llm
    } catch {
      return undefined
    }
  }
  if (typeof llm !== 'object' || llm === null) return undefined
  const register = (llm as { registerAdapter?: unknown }).registerAdapter
  return typeof register === 'function' ? (llm as RegistryLike) : undefined
}
