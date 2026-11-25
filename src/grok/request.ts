/**
 * 把 DSH ModelTurnRequest 转成 Grok /responses 请求体。
 *
 * 映射规则：
 * - system prompt → instructions
 * - messages → input（OpenAI Responses 格式）
 * - tools → tools（function calling）
 * - reasoning effort → reasoning: { effort }
 */

export function buildResponsesBody(input: {
  model: string
  messages: readonly { role: string; content: unknown; toolCallId?: string; tool_call_id?: string }[]
  system?: string
  tools?: readonly { name: string; description?: string; parameters?: Record<string, unknown> }[]
  reasoningEffort?: string
  maxTokens?: number
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    stream: true,
    store: false,
    input: input.messages
      .filter(m => m.role !== 'system')
      .map(m => {
        // Tool result messages → function_call_output items
        if (m.role === 'tool') {
          const raw = m as Record<string, unknown>
          const toolCallId = raw['toolCallId'] ?? raw['tool_call_id']
          const output = typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
              ? (m.content as unknown[]).map(p => {
                  if (typeof p === 'string') return p
                  if (typeof p === 'object' && p !== null) {
                    const pp = p as Record<string, unknown>
                    if (typeof pp['text'] === 'string') return pp['text']
                  }
                  return ''
                }).join('')
              : String(m.content ?? '')
          return [{
            type: 'function_call_output' as const,
            call_id: typeof toolCallId === 'string' ? toolCallId : '',
            output,
          }]
        }
        // Preserve assistant tool calls for stateless replay.
        if (m.role === 'assistant' && Array.isArray(m.content) && m.content.some(p => p?.type === 'tool-call')) {
          return m.content.flatMap((part): Record<string, unknown>[] => {
            if (part?.type === 'tool-call') {
              return [{ type: 'function_call', call_id: part.id, name: part.name, arguments: part.arguments }]
            }
            if (part?.type === 'text') {
              return [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: part.text }] }]
            }
            return []
          })
        }
        // Regular messages
        let text: string
        if (typeof m.content === 'string') {
          text = m.content
        } else if (Array.isArray(m.content)) {
          text = (m.content as unknown[]).map(part => {
            if (typeof part === 'string') return part
            if (typeof part === 'object' && part !== null) {
              const p = part as Record<string, unknown>
              const textVal = p['text']
              if (typeof textVal === 'string') return textVal
              if (Array.isArray(textVal)) {
                return (textVal as unknown[]).map(t => typeof t === 'string' ? t : '').join('')
              }
              if (Array.isArray(p['content'])) {
                return (p['content'] as unknown[]).map(c => {
                  if (typeof c === 'string') return c
                  if (typeof c === 'object' && c !== null) {
                    return String((c as Record<string, unknown>)['text'] ?? '')
                  }
                  return ''
                }).join('')
              }
            }
            return ''
          }).join('')
        } else {
          text = String(m.content ?? '')
        }
        return [{
          type: 'message' as const,
          role: m.role,
          content: [{
            type: m.role === 'assistant' ? 'output_text' as const : 'input_text' as const,
            text,
          }],
        }]
      })
      .flat(),
  }
  if (input.system !== undefined) {
    body.instructions = input.system
  }
  if (input.reasoningEffort !== undefined) {
    body.reasoning = { effort: input.reasoningEffort }
  }
  if (input.tools !== undefined && input.tools.length > 0) {
    body.tools = input.tools
      .filter(t => t != null)
      .map(t => {
        const params = normalizeSchema(t.parameters, t.name)
        return { type: 'function', name: t.name, description: t.description, parameters: params, strict: false }
      })
  }
  if (input.maxTokens !== undefined) {
    body.max_output_tokens = input.maxTokens
  }
  return body
}

/**
 * 规范化 JSON Schema 以满足 OpenAI Responses API 要求。
 */
function normalizeSchema(schema: Record<string, unknown> | undefined, toolName: string): Record<string, unknown> {
  if (schema === undefined || schema === null) {
    return { type: 'object', properties: {} }
  }
  const forbidden = ['oneOf', 'anyOf', 'allOf', 'enum', 'const', 'not']
  const keyword = forbidden.find(key => Object.hasOwn(schema, key))
  if (keyword !== undefined || (schema.type !== undefined && schema.type !== 'object')) {
    throw Object.assign(new Error(
      `Grok tool "${toolName}" requires an object parameter schema without top-level ${keyword ?? `type ${JSON.stringify(schema.type)}`}`,
    ), { code: 'unsupported-tool-schema' })
  }
  const properties = { ...(schema.properties as Record<string, unknown> | undefined) }
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (typeof key === 'string' && !Object.hasOwn(properties, key)) {
        Object.defineProperty(properties, key, { value: {}, enumerable: true, configurable: true, writable: true })
      }
    }
  }
  return { ...schema, type: 'object', properties }
}
