# @goodjin2/dsh-grok

DSH 插件：Grok 模型行 — 直接调用 Grok 的 OpenAI 兼容 `/responses` 端点，复用本地 Grok CLI 的 OAuth 凭据。

DSH 自己的循环负责工具/审批/编排；这一行只回答「向模型要下一句话」。
请求由本仓直接发到 Grok 的 `/responses` 端点，用本地 Grok CLI 的 OAuth 凭据认证。

## 安装

在 DSH profile 的 `package.json` 中添加：

```sh
dsh plugin --profile <你的 profile> add github:goodjin/dsh-grok
```

或者安装 npm 上发布的包（效果相同）：

```sh
dsh plugin --profile <你的 profile> add @goodjin2/dsh-grok
```

然后运行 `pnpm install` 并把 `cordis.patch.yml` 里的 insert 段合并到 profile 的 `cordis.patch.yml`。

## 前提条件

- 本地已安装并登录 Grok CLI（`grok login`）。
- 凭据文件：`~/.grok/auth.json`（由 Grok CLI 自动管理）。

## 功能

- **直接 HTTP 调用**：直接调用 Grok 的 `/responses` 端点（OpenAI Responses API 兼容）。
- **OAuth 凭据复用**：从 `~/.grok/auth.json` 读取凭据，支持 OIDC token 刷新。
- **流式响应**：支持文本流、推理流、工具调用。
- **模型支持**：grok-4.7（默认）、grok-4.7-fast、grok-4.6、grok-4.5。
- **推理强度**：支持 xhigh / high / medium / low 四档。

## 架构

- **模型行**：Grok 是**模型**，不是外部 agent。DSH 自己的循环已经会读文件、跑命令、请求批准、取消、写会话了。
- **这一行只回答「向模型要下一句话」**：解出 Grok 凭据、把这一轮的历史与工具发出去、把回来的文本/推理/工具调用交回循环。
- **不走 ACP**：与 dsh-codex 同款，直接 HTTP 调用，不需要 ACP 子进程。

## 实现细节

- **端点**：`POST https://cli-chat-proxy.grok.com/v1/responses`
- **请求头**：
  ```
  Authorization: Bearer <auth.json 里的 key>
  Content-Type: application/json
  Accept: text/event-stream
  x-grok-client-version: 1.0.92
  x-grok-client-mode: agent
  ```
- **请求体**：标准 OpenAI Responses API 格式（`instructions`=system, `input`=messages, `tools`=function calling）。
- **响应流**：SSE 事件（`response.output_text.delta`、`response.reasoning_summary_text.delta`、`response.function_call_arguments.delta`）。

## 与 dsh-codex 的对比

| 特性 | dsh-codex | dsh-grok |
| --- | --- | --- |
| 端点 | OpenAI `/responses` | Grok `/responses` |
| 凭据 | `~/.codex/auth.json` | `~/.grok/auth.json` |
| 协议 | OpenAI Responses API | OpenAI Responses API（兼容） |
| 模型 | GPT-6.x 系列 | Grok 4.x 系列 |
| 推理强度 | low/medium/high/xhigh/max | xhigh/high/medium/low |

## 许可证

MIT
