# @goodjin2/dsh-codex

DSH 插件：Codex 模型行 — 直接 HTTP 调用 Codex `/responses` 端点，复用本地 Codex CLI 的 OAuth 凭据。

恢复基线与验证记录见 [2026-11-14 恢复记录](docs/RESTORATION-2026-11-14.md)。

## 安装

```sh
dsh plugin --profile <你的 profile> add github:goodjin/dsh-codex
```

也可以直接装 npm 上的包（效果相同，同样免构建步骤）：

```sh
dsh plugin --profile <你的 profile> add @goodjin2/dsh-codex
```

也可以下载 [v0.1.0 发布页](https://github.com/goodjin/dsh-codex/releases/tag/v0.1.0) 的 tarball 安装：

```sh
dsh plugin --profile <你的 profile> add ./dsh-codex-0.1.0.tgz
```

或手工安装：在 DSH profile 的 `package.json` 中添加

```json
{
  "dependencies": {
    "@goodjin2/dsh-codex": "github:goodjin/dsh-codex"
  }
}
```

然后运行 `pnpm install` 并把 `insert` 段合并到 profile 的 `cordis.patch.yml`。

## 前提条件

- 本地已安装 Codex CLI 并完成登录（`codex login`）
- `~/.codex/auth.json` 存在且包含有效凭据

## 功能

- 将 Codex 模型（GPT-6.x、GPT-5.6 系列）作为 DSH 模型行
- 自动 OAuth 凭据读取与刷新
- 从 `~/.codex/models_cache.json` 读取模型目录（带静态回退）
- 输入框下方显示官方额度胶囊（用量窗口与积分）
- 推理强度折叠（`base[effort]` → 一条 + 强度轴）

## 开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build        # 宿主产物 lib/host + 浏览器产物 lib/client.js
```

仓库随附编译产物（`lib/host/**` 与 `lib/client.js`）：git 与 npm 安装都不在用户机器上跑构建脚本，
因此改完源码要跑 `npm run build` 并提交产物；`npm run check` 会检查产物是否与源码一致。

## 架构

- `src/codex/` — 凭据管理、目录、请求构建、流解析、额度读取
- `src/modelkit/` — 模型行机器（适配、类型、路由、运行时账本、强度折叠）
- `src/client/` — 浏览器侧设置段与额度胶囊

## 流式错误诊断

错误提示与会话 `assistant/attempt` 保留异常名称、消息、底层 `cause` 错误码，以及响应提供的 request ID；区分响应流读取失败、解析失败、缺少结束帧和请求取消。相同的脱敏摘要以 `[codex]` 前缀写入宿主 stderr。诊断最多保留五层原因链、2000 字符，不序列化请求/响应对象或记录认证凭据。

## 官方额度胶囊

选择 `acp:acp-codex-global`（Codex Direct）时，输入框下方显示官方返回的用量窗口和积分；账号设置页也显示同一份数据。显示的是**已用百分比**，窗口长度按返回值标注。胶囊正文只显示周期与已用百分比；悬停可见来源、套餐、更新时间、重置时间，以及旧快照的“待刷新”状态。

宿主只读请求 `https://chatgpt.com/backend-api/wham/usage`，复用当前本机 Codex 登录凭据；同账号至少间隔 60 秒刷新，并合并并发读取。浏览器可见时每 30 秒向同源 `/acp-codex/quota` 取快照，离开组件会停止轮询。

未提供明确周期的次窗口不展示；缺失字段不会填 0。接口失败保留旧快照并标记“待刷新”，不推算用量归零。缓存仅在内存中，宿主重启后重新取数。不会执行推理来查询额度。

字段依据：[官方用量接口客户端](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client/rate_limit_resets.rs)、[官方响应头解析](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/rate_limits.rs)。

### 官方请求重试

Codex 将明确的连接中断（如 `UND_ERR_SOCKET`、`ECONNRESET`）及流提前结束报告为宿主标准 `TRANSPORT`，网络超时报告为 `TIMEOUT`；原始异常与底层错误码仍保留在错误详情中。由 DSH 基础 bundle 的 `dsh-llm-retry` 执行默认有限重试（最多 5 次，指数退避）。插件内部不另建请求重试循环。

## 许可证

MIT
