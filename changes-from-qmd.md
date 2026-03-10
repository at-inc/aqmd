# AQMD Changes from QMD Upstream

This file tracks all divergent changes from the [QMD](https://github.com/tobi/qmd) upstream to minimize merge conflicts.

## Remote Embedding & Reranking Providers

**Date:** 2026-03-06
**Files changed:**
- `src/remote-providers.ts` (NEW) — Remote API clients for Gemini embedding and ZeroEntropy reranking
- `src/llm.ts` (MODIFIED) — Added import and delegation hooks in `embed()`, `embedBatch()`, `rerank()`, `tokenize()`, `countTokens()`, `detokenize()`
- `.gitignore` (MODIFIED) — Added `.env` and `!changes-from-qmd.md`

**What changed:**
- Replaced local `node-llama-cpp` embedding (embeddinggemma-300M) with remote Gemini `embedding-001` API
- Replaced local `node-llama-cpp` reranking (qwen3-reranker-0.6b) with remote ZeroEntropy `zerank-2` API
- Query expansion still uses local model (qmd-query-expansion-1.7B)
- Remote providers activate when environment variables are set; falls back to local models when unset

**Environment variables required:**
- `GOOGLE_GENERATIVE_AI_API_KEY` — Activates remote Gemini embedding (768 dimensions, taskType-aware)
- `ZEROENTROPY_API_KEY` — Activates remote ZeroEntropy reranking

**Merge notes:**
- `src/remote-providers.ts` is a new file — no merge conflicts expected
- `src/llm.ts` changes are minimal (import + 3-line delegation blocks at top of 5 methods) — conflicts possible but easy to resolve
- All AQMD-specific code is marked with `// AQMD:` comments for easy identification
- `.gitignore` changes are additive only

---

## Upstream Merge: QMD v2.0.0

**Date:** 2026-03-11
**Upstream range:** `40610c3..55f1646` (47 commits, tags v1.1.1 through v2.0.0)

**Major upstream changes absorbed:**
- **SDK/library mode** (`src/index.ts` NEW) — Programmatic access via `import { search } from "qmd"`
- **CLI/MCP restructure** — `src/qmd.ts` → `src/cli/qmd.ts`, `src/formatter.ts` → `src/cli/formatter.ts`, `src/mcp.ts` → `src/mcp/server.ts`
- **Unified search API** — `search()` with `ExpandedQuery` type, `intent` parameter for query disambiguation
- **LLM session management** — `withLLMSession()`, `ILLMSession`, ref-counted lifecycle with abort signals
- **CI mode guard** — `this._ciMode` blocks LLM calls in CI environments
- **Configurable expand context size** — `QMD_EXPAND_CONTEXT_SIZE` env var
- **Custom embedding model** — `QMD_EMBED_MODEL` env var for multilingual support (Qwen3-Embedding)
- **Collection ignore patterns** — `.qmdignore` support
- **Rerank optimizations** — Parallelism cap, deduplication, content-based caching, 2048-token context truncation
- **New bin wrapper** — `bin/qmd` shell script replaces direct `dist/qmd.js` bin entry
- **Many community PRs** — Windows sqlite-vec fix, emoji filename handling, TTY progress guard, HTTP multi-session, empty collection deactivation

**Conflicts resolved:**
- `src/llm.ts` — Two conflicts in `embedBatch()` and `rerank()`: upstream added CI guard, we had remote delegation. Resolved by keeping both (AQMD remote check first, then CI guard).
- `package.json` — Name/version conflict: kept `aqmd` name, adopted upstream v2.0.0 version and all structural changes (exports, main, types, bin).
- `README.md` — GGUF models table: merged our "Remote Alternative" column with upstream's "Custom Embedding Model" section.

**AQMD hooks preserved (all still functional):**
- `src/llm.ts` import of `./remote-providers.js` ✓
- `embed()` → `remoteEmbed()` delegation ✓
- `embedBatch()` → `remoteEmbedBatch()` delegation (before CI guard) ✓
- `rerank()` → `remoteRerank()` delegation (before CI guard) ✓
- `tokenize()` → char approximation for remote embedding ✓
- `countTokens()` → char approximation for remote embedding ✓
- `detokenize()` → empty string for remote embedding ✓

**Test results:** 620 passed, 72 skipped (LLM integration tests, expected in CI)
