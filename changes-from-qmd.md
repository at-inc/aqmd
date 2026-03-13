# AQMD Changes from QMD Upstream

This file tracks divergent changes from [QMD](https://github.com/tobi/qmd) upstream. Used during upstream merges to know what to preserve.

---

## Aside API Proxy for Embedding & Reranking

All embedding and reranking is routed through Aside's proxy API (`browser-api.aside.at`). No API keys required — the server handles upstream Gemini/ZeroEntropy authentication. Local GGUF models for embedding/reranking are never loaded.

**Files:**
- `src/aside-api-client.ts` (NEW) — Single-file API client; exports `isRemoteEmbeddingEnabled`, `isRemoteRerankEnabled`, `remoteEmbed`, `remoteEmbedBatch`, `remoteRerank`
- `src/llm.ts` (+25 lines) — 1 import line + 6 guard blocks that delegate to aside-api-client before local model code
- `test/llm.test.ts` (+4 lines) — `vi.mock` to disable remote in unit tests

**Constraints:**
- `isRemoteEmbeddingEnabled()` / `isRemoteRerankEnabled()` always return `true`
- Tokenization uses char approximation (4 chars ≈ 1 token) — no local embedding model loaded
- `ASIDE_API_URL` env var overrides API base URL (default: `https://browser-api.aside.at`)
- `GOOGLE_GENERATIVE_AI_API_KEY` and `ZEROENTROPY_API_KEY` are unused

**Merge notes:**
- `src/aside-api-client.ts` is new — no conflicts
- `src/llm.ts` guards live at the top of `embed()`, `embedBatch()`, `rerank()`, `tokenize()`, `countTokens()`, `detokenize()` — watch for upstream signature changes to these methods

---

## Deterministic Query Routing (No Expansion LLM)

Plain queries normalize to `lex:{query}` + `vec:{query}` without invoking a generation model. This removes the `qmd-query-expansion-1.7B` dependency from the default search path.

**Files:**
- `src/store.ts` — `expandQuery()`, `hybridQuery()`, `vectorSearchQuery()` return deterministic lex+vec pair
- `src/cli/qmd.ts` — `parseStructuredQuery()` maps plain input to lex+vec; `status`/`pull` don't reference generation model
- `src/index.ts` — SDK `expandQuery()` aligned to lex+vec decomposition
- `docs/SYNTAX.md` — Query grammar docs reflect AQMD behavior

**Constraints:**
- `expand:` prefix is accepted but maps to the same deterministic pair
- No generation model is downloaded or loaded in the default `query` path

**Merge notes:**
- Upstream changes to `expandQuery()` or `parseStructuredQuery()` must be re-evaluated — reapply deterministic routing if upstream reintroduces LLM expansion

---

## Vendored macOS SQLite Runtime

AQMD ships a vendored `libsqlite3.dylib` so macOS users don't need Homebrew SQLite.

**Files:**
- `src/db.ts` — Vendored dylib discovery + `Database.setCustomSQLite()` wiring
- `bin/qmd` — `DYLD_LIBRARY_PATH` / `DYLD_FALLBACK_LIBRARY_PATH` bootstrap
- `vendor/macos/libsqlite3.dylib` — Vendored copy of Homebrew SQLite
- `package.json` — `vendor/` in published files

**Merge notes:**
- `src/db.ts` divergence is near module initialization — localized
- `bin/qmd` divergence is in the macOS env bootstrap block before runtime selection
- If upstream adopts a different macOS SQLite fix, remove this vendored asset

---

## Upstream Merge History

### QMD v2.0.1 (2026-03-12)

Upstream range: `55f1646..ae3604c` (10 commits). Absorbed `qmd skill install`, launcher symlink fix, Qwen3-Embedding filename case fix. Conflicts in `CHANGELOG.md`, `bin/qmd`, `package.json` resolved.

### QMD v2.0.0 (2026-03-11)

Upstream range: `40610c3..55f1646` (47 commits, v1.1.1–v2.0.0). Absorbed SDK/library mode, CLI/MCP restructure, unified search API, LLM session management, CI mode guard, rerank optimizations. Conflicts in `src/llm.ts` (CI guard + remote delegation), `package.json` (name), `README.md` (models table) resolved.
