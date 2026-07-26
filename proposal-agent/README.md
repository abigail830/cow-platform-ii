# Proposal Agent

OKF **consumer** for the [smart-proposal-knowledge](../smart-proposal-knowledge/) bundle — streaming CLI (LiteLLM → Azure OpenAI / Claude / OpenAI).

Knowledge lives in the sibling bundle; this directory is the **runtime agent** only.

## Layout

```text
OKF/
├── smart-proposal-knowledge/   ← OKF bundle (source of truth)
└── proposal-agent/             ← this agent (consumer)
    ├── stream_cli.py
    ├── okf_bundle.py
    └── .env
```

## 快速开始

```bash
cd proposal-agent
cp .env.example .env
# 编辑 .env — 填入 Azure 或 Anthropic key

uv run stream_cli.py "sg-incorp 的 sections 有哪些？first_invoice 怎么开？"
uv run stream_cli.py --template ph-incorp "Total 列用哪个 computation？"
```

默认 bundle 路径：`../smart-proposal-knowledge`。可覆盖：

```bash
uv run stream_cli.py --bundle /path/to/bundle "..."
```

### Azure OpenAI

```env
AZURE_API_KEY=...
AZURE_API_BASE=https://<resource>.openai.azure.com/
AZURE_API_VERSION=2024-08-01-preview
AZURE_DEPLOYMENT_NAME=<your-deployment>
```

### Claude

```env
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

## 架构

```text
smart-proposal-knowledge/          ← OKF bundle
  examples/index.md
  templates/{id}.md
  blocks/ + layouts/ + computations/
        │
        ▼
proposal-agent/stream_cli.py     ← LLM + tools
        │
        ▼ (未来)
ProposalState → Word export
```

**Agent read order**（[linking-policy](../.cursor/skills/smart-proposal-knowledge/references/linking-policy.md)）：

1. `examples/index.md` 或 `template_id`
2. `templates/{id}.md` frontmatter
3. 按需 `blocks/`、`computations/`、`layouts/`

## Tools

| Tool | 作用 |
|------|------|
| `okf_read` | 读单个 concept |
| `okf_search` | 关键词搜索 |
| `okf_list_concepts` | 列目录下 concepts |
| `okf_template_sections` | 解析 template `sections[]` |

## 相关仓库工具

```bash
uv run ../.agents/skills/validate/scripts/okf_validate.py ../smart-proposal-knowledge --strict
uv run ../.agents/skills/visualize/scripts/okf_visualize.py ../smart-proposal-knowledge -o ../smart-proposal-knowledge/viz.html
```

## 参考

- [Google knowledge-catalog OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) — reference_agent (producer) + visualize (consumer)
- [OKF starter MCP](https://github.com/supachai-j/open-knowledge-format-starter) — 规模化 MCP 参考
