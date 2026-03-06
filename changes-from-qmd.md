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
