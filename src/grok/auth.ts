/**
 * Grok OAuth 凭据管理。
 *
 * 从 ~/.grok/auth.json 读取凭据，支持 OIDC refresh。
 * auth.json 结构：顶层是 client_id dict，里面有 key（access_token）、refresh_token、
 * expires_at、oidc_issuer、oidc_client_id。
 */

import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Grok OAuth 凭据。 */
export type GrokCredential = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  oidcIssuer?: string
  oidcClientId?: string
}

type AuthJson = Record<string, {
  key?: string
  refresh_token?: string
  expires_at?: string
  oidc_issuer?: string
  oidc_client_id?: string
}>

/**
 * 从 ~/.grok/auth.json 读取 Grok 凭据。
 * @param options - 可选配置，如自定义 home 目录
 * @returns 凭据对象，如果文件缺失或格式错误返回 undefined
 */
export async function loadCredential(options?: { home?: string }): Promise<GrokCredential | undefined> {
  const home = options?.home ?? homedir()
  const authPath = join(home, '.grok', 'auth.json')
  let raw: string
  try {
    raw = await readFile(authPath, 'utf8')
  } catch {
    return undefined
  }
  let parsed: AuthJson
  try {
    parsed = JSON.parse(raw) as AuthJson
  } catch {
    return undefined
  }
  // 取第一个 client_id 的凭据
  const clientData = Object.values(parsed)[0]
  if (!clientData?.key) return undefined
  return {
    accessToken: clientData.key,
    refreshToken: clientData.refresh_token,
    expiresAt: clientData.expires_at ? new Date(clientData.expires_at).getTime() : undefined,
    oidcIssuer: clientData.oidc_issuer,
    oidcClientId: clientData.oidc_client_id,
  }
}

/**
 * 通过 OIDC refresh_token 刷新 Grok token。
 * @param credential - 当前凭据
 * @param options - 可选配置
 * @returns 新的凭据对象
 */
export async function refreshCredential(
  credential: GrokCredential,
  options?: { home?: string; fetchImpl?: typeof fetch },
): Promise<GrokCredential> {
  if (!credential.refreshToken || !credential.oidcIssuer || !credential.oidcClientId) {
    throw new Error('Grok 登录已过期，请重新登录')
  }
  const fetchImpl = options?.fetchImpl ?? fetch
  const res = await fetchImpl(`${credential.oidcIssuer}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: credential.oidcClientId,
      grant_type: 'refresh_token',
      refresh_token: credential.refreshToken,
    }),
  })
  if (!res.ok) {
    throw new Error(`Grok token 刷新失败 (${res.status})`)
  }
  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  const newCred: GrokCredential = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credential.refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    oidcIssuer: credential.oidcIssuer,
    oidcClientId: credential.oidcClientId,
  }
  // 写回 auth.json
  const home = options?.home ?? homedir()
  const authPath = join(home, '.grok', 'auth.json')
  let raw: string
  try {
    raw = await readFile(authPath, 'utf8')
  } catch {
    raw = '{}'
  }
  let parsed: AuthJson
  try {
    parsed = JSON.parse(raw) as AuthJson
  } catch {
    parsed = {}
  }
  const firstKey = Object.keys(parsed)[0] ?? 'default'
  parsed[firstKey] = {
    ...parsed[firstKey],
    key: newCred.accessToken,
    refresh_token: newCred.refreshToken,
    expires_at: newCred.expiresAt ? new Date(newCred.expiresAt).toISOString() : undefined,
    oidc_issuer: newCred.oidcIssuer,
    oidc_client_id: newCred.oidcClientId,
  }
  await mkdir(join(home, '.grok'), { recursive: true, mode: 0o700 })
  await writeFile(authPath, JSON.stringify(parsed, null, 2), { mode: 0o600 })
  await chmod(authPath, 0o600)
  return newCred
}
