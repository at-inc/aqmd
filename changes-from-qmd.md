# AQMD Changes from QMD Upstream

This file tracks all divergent changes from the [QMD](https://github.com/tobi/qmd) upstream to minimize merge conflicts.

## Upstream Merge: QMD v2.0.1

**Date:** 2026-03-12
**Upstream range:** `55f1646..ae3604c` (10 commits, tag v2.0.1)

**Major upstream changes absorbed:**
- **`qmd skill install`** (`src/cli/qmd.ts`, `src/embedded-skills.ts` NEW) — Installs packaged QMD skill into `.agents/skills/qmd` with optional `--global` and Claude symlink support
- **Launcher symlink fix** (`bin/qmd`) — Resolves symlinked global launcher path for `npm i -g` installs
- **BUN_INSTALL false positive fix** (`bin/qmd`) — Removes `$BUN_INSTALL` env check from runtime detection; only lock files determine bun vs node
- **Qwen3-Embedding filename case fix** (`src/llm.ts`) — Corrected HuggingFace GGUF filename case (case-sensitive on HF)

**Conflicts resolved:**
- `CHANGELOG.md` — Kept AQMD unreleased entries above upstream v2.0.1 section
- `bin/qmd` — Kept AQMD vendored SQLite block, adopted upstream's `$BUN_INSTALL` removal and symlink resolution. Removed duplicate `DIR=` line that conflicted with upstream's improved symlink-aware path resolution
- `package.json` — Kept `aqmd` name, adopted upstream v2.0.1 version

**AQMD hooks preserved (all still functional):**
- `bin/qmd` vendored macOS SQLite env bootstrap ✓
- `src/llm.ts` import of `./aside-api-client.js` + all remote delegation guards ✓
- `src/store.ts` deterministic `lex + vec` query routing ✓
- `src/cli/qmd.ts` AQMD query parsing (no LLM expansion) ✓

---

## CRITICAL: Temporary Vendored macOS SQLite Runtime

**Date:** 2026-03-12
**Files changed:**
- `src/db.ts` (MODIFIED) — Added vendored macOS SQLite path resolution, `DYLD_*` environment bootstrapping, and Bun `Database.setCustomSQLite()` wiring before first database use
- `bin/qmd` (MODIFIED) — Exports vendored macOS SQLite library path and prepends the vendored directory to `DYLD_LIBRARY_PATH` / `DYLD_FALLBACK_LIBRARY_PATH`
- `package.json` (MODIFIED) — Includes `vendor/` in published package files so the vendored dylib ships with npm/bun installs
- `vendor/macos/libsqlite3.dylib` (NEW) — Temporary vendored copy of Homebrew SQLite dylib from `/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib`
- `CHANGELOG.md` (MODIFIED) — Added unreleased note for the temporary vendored macOS SQLite runtime

**What changed:**
- AQMD now ships a temporary vendored macOS `libsqlite3.dylib` with the package
- On macOS, the runtime resolves the vendored dylib automatically and exposes it via `AQMD_VENDORED_SQLITE_PATH`
- Bun uses the vendored dylib via `Database.setCustomSQLite()` before the first `new Database()` call
- The CLI wrapper also prepends the vendored dylib directory to `DYLD_LIBRARY_PATH` and `DYLD_FALLBACK_LIBRARY_PATH` for macOS launches

**Why this is critical:**
- This is an AQMD-only packaging/runtime divergence from upstream QMD
- It changes macOS SQLite loading behavior to avoid asking end users to install Homebrew SQLite separately
- Future upstream merges touching `src/db.ts`, `bin/qmd`, or package publishing rules must preserve or deliberately replace this vendored runtime behavior

**Merge notes:**
- `src/db.ts` divergence is localized to vendored macOS SQLite discovery and runtime setup helpers near module initialization
- `bin/qmd` divergence is localized to the macOS env bootstrap block before runtime selection
- `package.json` divergence is additive only (`vendor/` publish include)
- `vendor/macos/libsqlite3.dylib` is intentionally temporary; if upstream adopts another macOS fix, remove or replace this asset deliberately

---

## CRITICAL: Deterministic Plain Query Routing (No Expansion LLM)

**Date:** 2026-03-12
**Files changed:**
- `src/store.ts` (MODIFIED) — Replaced plain-query expansion with deterministic `lex + vec` routing and versioned cache behavior
- `src/cli/qmd.ts` (MODIFIED) — Plain CLI queries now parse to implicit `lex:` + `vec:` searches; removed generation model from `status`/`pull`
- `src/index.ts` (MODIFIED) — SDK docs and `expandQuery()` behavior aligned to AQMD default `lex + vec` decomposition
- `README.md` (MODIFIED) — Documented deterministic query routing and removal of query-expansion model from AQMD defaults
- `docs/SYNTAX.md` (MODIFIED) — Query grammar/docs updated for implicit `lex + vec`
- `CHANGELOG.md` (MODIFIED) — Added unreleased note for AQMD behavior change

**What changed:**
- Plain query input no longer invokes the local query-expansion LLM in AQMD
- Implicit queries now normalize to exactly two searches: `lex: {query}` and `vec: {query}`
- `expand:` remains accepted as a compatibility alias, but now maps to the same deterministic pair
- AQMD `qmd pull` and `qmd status` no longer treat a generation model as part of the default query path

**Why this is critical:**
- This changes AQMD search semantics versus upstream QMD in a user-visible way
- It removes a large local model dependency from the default `query` path
- Any future upstream merge touching query parsing, `expandQuery()`, or CLI model reporting must preserve this AQMD behavior

**Merge notes:**
- `src/store.ts` divergence is localized to `expandQuery()`, `hybridQuery()`, and `vectorSearchQuery()`; reapply AQMD deterministic routing if upstream reintroduces LLM expansion
- `src/cli/qmd.ts` divergence is localized to `parseStructuredQuery()`, help text, `status`, and `pull`
- `docs/SYNTAX.md` and `README.md` intentionally differ from upstream to describe AQMD behavior, not QMD behavior

---

## Remote Embedding & Reranking via Aside API Proxy

**Date:** 2026-03-12 (updated from 2026-03-06)
**Files changed:**
- `src/aside-api-client.ts` (NEW) — Single-file Aside API client for embedding and reranking; exports the same symbols that upstream `remote-providers.ts` did
- `src/remote-providers.ts` (DELETED) — Replaced by `aside-api-client.ts`; no longer exists
- `src/llm.ts` (MODIFIED, 1-line diff) — Import path changed from `./remote-providers.js` to `./aside-api-client.js`
- `test/llm.test.ts` (MODIFIED) — Added `vi.mock` for aside-api-client to keep unit tests exercising local-model code paths
- `.gitignore` (MODIFIED) — Added `.env` and `!changes-from-qmd.md`

**What changed:**
- All embedding and reranking goes through Aside's proxy API (`browser-api.aside.at/memory/*`)
- **No API keys required** — Aside server handles upstream Gemini / ZeroEntropy authentication
- `isRemoteEmbeddingEnabled()` and `isRemoteRerankEnabled()` always return `true`
- Local node-llama-cpp embedding/reranking models are never loaded (bypassed by remote guard in `llm.ts`)
- Query expansion still uses local model (qmd-query-expansion-1.7B)
- Uses Aside API schema: `taskType` enum, `title` for RETRIEVAL_DOCUMENT quality boost, `outputDimensionality: 768`
- Optional `ASIDE_API_URL` env var overrides the default base URL

**Environment variables:**
- `ASIDE_API_URL` (optional) — Override API base URL (default: `https://browser-api.aside.at`)
- `GOOGLE_GENERATIVE_AI_API_KEY` — No longer required (removed dependency)
- `ZEROENTROPY_API_KEY` — No longer required (removed dependency)

**Merge notes:**
- `src/aside-api-client.ts` is a new file — no merge conflicts expected
- `src/remote-providers.ts` was AQMD-only; if upstream adds this file, it won't conflict
- `src/llm.ts` divergence is 1 import line + 6 guard blocks (25 lines total); guard blocks are identical to previous AQMD state so only the import line is new conflict surface
- `test/llm.test.ts` has a `vi.mock` block at the top; upstream test additions merge cleanly below

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
