# dsh-grok

DSH plugin: Grok 模型行 — 直接调用 Grok 的 OpenAI 兼容 `/responses` 端点，复用本地 Grok CLI 的 OAuth 凭据。

DSH 自己的循环负责工具/审批/编排；这一行只回答「向模型要下一句话」。
