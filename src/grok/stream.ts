/**
 * 解析 Grok /responses SSE 流。
 *
 * 读取 `data:` 行，解析 JSON，yield ResponsesEvent 对象。
 * 缓冲 function_call_arguments，在 response.output_item.done 时 emit tool_call 事件。
 */

/** 流解析错误。 */
export class GrokStreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GrokStreamError'
  }
}

/** 从 Grok /responses SSE 流解析出的事件。 */
export type ResponsesEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'finish'; reason: string }
  | { type: 'error'; code: string; message: string }

/**
 * 解析 Grok /responses SSE 流。
 * @param source - 异步可迭代源（字符串或 Uint8Array）
 * @yields ResponsesEvent 对象
 * @throws GrokStreamError 如果流在没有完成帧的情况下结束
 */
export async function* parseResponsesStream(
  source: AsyncIterable<string | Uint8Array>,
): AsyncGenerator<ResponsesEvent> {
  let buffer = ''
  let sawFinish = false
  const toolArgs = new Map<string, { id: string; name: string; args: string }>()

  const decoder = new TextDecoder()

  for await (const chunk of source) {
    const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    buffer += text

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload) continue

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>
      } catch {
        continue
      }

      const type = parsed.type as string | undefined

      if (type === 'response.output_text.delta') {
        yield { type: 'text', text: parsed.delta as string }
      } else if (type === 'response.reasoning_summary_text.delta') {
        yield { type: 'reasoning', text: parsed.delta as string }
      } else if (type === 'response.reasoning_text.delta') {
        yield { type: 'reasoning', text: parsed.delta as string }
      } else if (type === 'response.function_call_arguments.delta') {
        const itemId = parsed.item_id as string
        const entry = toolArgs.get(itemId) ?? { id: itemId, name: '', args: '' }
        entry.args += (parsed.delta as string)
        toolArgs.set(itemId, entry)
      } else if (type === 'response.output_item.done') {
        const item = parsed.item as Record<string, unknown> | undefined
        if (item?.type === 'function_call') {
          const itemId = (item.item_id as string) ?? (item.id as string) ?? ''
          const name = (item.name as string) ?? ''
          const buffered = toolArgs.get(itemId)
          const args = (item.arguments as string) ?? buffered?.args ?? ''
          const callId = (item.call_id as string) ?? itemId
          yield { type: 'tool_call', id: callId, name, arguments: args }
          toolArgs.delete(itemId)
        }
      } else if (type === 'response.completed') {
        sawFinish = true
        const response = parsed.response as Record<string, unknown> | undefined
        const status = (response?.status as string) ?? 'completed'
        yield { type: 'finish', reason: status === 'completed' ? 'stop' : status }
        return
      } else if (type === 'error') {
        const error = parsed.error as Record<string, unknown> | undefined
        yield {
          type: 'error',
          code: (error?.code as string) ?? (parsed.code as string) ?? 'unknown',
          message: (error?.message as string) ?? (parsed.message as string) ?? '未知错误',
        }
        sawFinish = true
        return
      } else if (type === 'response.failed') {
        const error = parsed.error as Record<string, unknown> | undefined
        yield {
          type: 'error',
          code: (error?.code as string) ?? 'response_failed',
          message: (error?.message as string) ?? '响应失败',
        }
        sawFinish = true
        return
      }
    }
  }

  if (!sawFinish) {
    throw new GrokStreamError('Grok 流式响应中断：没有收到结束帧')
  }
}
