/**
 * Grok 端点定义与请求头构造。
 *
 * 端点：POST https://cli-chat-proxy.grok.com/v1/responses
 * 协议：OpenAI Responses API（SSE 流式）
 * 鉴权：Bearer token from ~/.grok/auth.json
 */

/** Grok API 端点 URL。 */
export const GROK_RESPONSES_URL = 'https://cli-chat-proxy.grok.com/v1/responses'

/** Grok CLI 版本号，需在请求头中携带。 */
const GROK_CLIENT_VERSION = '1.0.92'

/**
 * 构造 Grok API 请求头。
 * @param token - Bearer token from auth.json
 * @returns 完整的请求头对象
 */
export function buildHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'x-grok-client-version': GROK_CLIENT_VERSION,
    'x-grok-client-mode': 'agent',
  }
}
