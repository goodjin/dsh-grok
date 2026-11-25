/**
 * Grok 模型插件——把 Grok /responses 端点的流式响应转成 DSH 模型流。
 *
 * DSH 的循环负责工具/审批/编排；这一行只回答「向模型要下一句话」。
 * 复用本地 Grok CLI 的 OAuth 凭据（~/.grok/auth.json），不需要 ACP 子进程。
 */

import type { ModelTurnRequest, ModelStreamChunk } from '../modelkit/index.ts'
import type { PresetConfig } from '../registry.ts'
import { loadCredential, refreshCredential } from './auth.ts'
import { GROK_RESPONSES_URL, buildHeaders } from './endpoints.ts'
import { buildResponsesBody } from './request.ts'
import { parseResponsesStream, GrokStreamError } from './stream.ts'
import { loadCatalog } from './catalog.ts'
import { currentSelection, applySelection } from './selection.ts'
import type { ReportedModel } from '../modelkit/index.ts'

/** 运行时清单写进目录账本时用的形状。 */
export type GrokReportedModel = {
  readonly id: string
  readonly name: string
  readonly description?: string | undefined
  readonly contextWindow?: number | undefined
  readonly efforts?: readonly string[] | undefined
}

/**
 * 重新加载模型清单并发布到运行时账本。
 */
export async function refreshGrokModels(): Promise<void> {
  const catalog = await loadCatalog()
  const reported: readonly GrokReportedModel[] = catalog.map(m => ({
    id: m.id,
    name: m.name,
    ...(m.description === undefined ? {} : { description: m.description }),
    ...(m.contextWindow === undefined ? {} : { contextWindow: m.contextWindow }),
    ...(m.efforts === undefined ? {} : { efforts: m.efforts }),
  }))
  applySelection(reported)
}

/**
 * 造一个模型流函数。
 * @param presets - 预设配置
 * @param options - 运行时清单回调
 * @returns 模型流函数
 */
export function grokModelStream(
  presets: PresetConfig,
  options?: { onRuntimeModels?: (presetId: string, models: readonly ReportedModel[]) => void },
): (presetId: string, request: ModelTurnRequest) => AsyncIterable<ModelStreamChunk> | undefined {
  return (presetId: string, request: ModelTurnRequest): AsyncIterable<ModelStreamChunk> | undefined => {
    // 运行时清单上报
    if (options?.onRuntimeModels !== undefined) {
      void loadCatalog().then(models => {
        const reported: readonly ReportedModel[] = models.map(m => ({
          id: m.id,
          name: m.name,
          ...(m.description === undefined ? {} : { description: m.description }),
          ...(m.contextWindow === undefined ? {} : { contextWindow: m.contextWindow }),
          ...(m.efforts === undefined ? {} : { efforts: m.efforts }),
        }))
        options.onRuntimeModels!(presetId, reported)
      }).catch(() => {})
    }

    return (async function* () {
      // 1. 加载凭据
      let credential = await loadCredential()
      if (credential === undefined) {
        throw new Error('Grok 未登录，请先在 Grok CLI 中登录')
      }

      // 2. 检查过期，必要时刷新
      if (credential.expiresAt !== undefined && Date.now() >= credential.expiresAt - 60000) {
        try {
          credential = await refreshCredential(credential)
        } catch {
          // 刷新失败继续用旧 token，可能还能用
        }
      }

      // 3. 构造请求体
      const body = buildResponsesBody({
        model: request.model,
        messages: (request.messages ?? []) as readonly { role: string; content: unknown; toolCallId?: string; tool_call_id?: string }[],
        system: typeof request.system === 'string' ? request.system : undefined,
        tools: request.tools,
        reasoningEffort: typeof request.reasoningEffort === 'string' ? request.reasoningEffort : undefined,
        maxTokens: typeof request.maxTokens === 'number' ? request.maxTokens : undefined,
      })

      // 4. 发送请求
      const res = await fetch(GROK_RESPONSES_URL, {
        method: 'POST',
        headers: buildHeaders(credential.accessToken),
        body: JSON.stringify(body),
        signal: request.signal as AbortSignal | undefined,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Grok API 错误 (${res.status}): ${text || res.statusText}`)
      }

      // 5. 解析流
      const source = res.body as unknown as AsyncIterable<Uint8Array>
      let blockIndex = -1
      let currentBlockType: 'text' | 'reasoning' | 'tool-call' | undefined

      try {
        for await (const event of parseResponsesStream(source)) {
          if (event.type === 'text') {
            if (currentBlockType !== 'text') {
              blockIndex++
              currentBlockType = 'text'
              yield { type: 'block-start', index: blockIndex, blockType: 'text' }
            }
            yield { type: 'text-delta', index: blockIndex, text: event.text }
          } else if (event.type === 'reasoning') {
            if (currentBlockType !== 'reasoning') {
              blockIndex++
              currentBlockType = 'reasoning'
              yield { type: 'block-start', index: blockIndex, blockType: 'reasoning' }
            }
            yield { type: 'reasoning-delta', index: blockIndex, text: event.text }
          } else if (event.type === 'tool_call') {
            // 工具调用：先 block-start，再 tool-call-delta，再 block-end
            blockIndex++
            currentBlockType = 'tool-call'
            yield { type: 'block-start', index: blockIndex, blockType: 'tool-call' }
            yield { type: 'tool-call-delta', index: blockIndex, id: event.id, name: event.name, argumentsDelta: event.arguments }
            yield { type: 'block-end', index: blockIndex, block: { type: 'tool-call', id: event.id, name: event.name, arguments: event.arguments } }
            currentBlockType = undefined
          } else if (event.type === 'finish') {
            yield { type: 'finish', reason: { kind: event.reason } }
            return
          } else if (event.type === 'error') {
            throw new Error(`Grok 流错误: ${event.message}`)
          }
        }
      } catch (err) {
        if (err instanceof GrokStreamError) {
          throw err
        }
        throw new Error(`Grok 流解析失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
  }
}
