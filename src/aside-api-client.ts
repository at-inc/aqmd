/**
 * aside-api-client.ts — AQMD remote embedding & reranking via Aside API
 *
 * Replaces direct Gemini / ZeroEntropy calls with Aside's proxy API.
 * No API keys required — the server handles upstream auth.
 *
 * Exports the same symbols that llm.ts imports so only the import path
 * needs to change (one-line diff vs upstream QMD).
 *
 * @see https://browser-api.aside.at  (Aside API)
 * @see /Users/vista/projects/bro/apps/api/src/memory/schema.ts  (canonical schema)
 */

import type { EmbeddingResult, EmbedOptions, RerankResult, RerankDocument, RerankDocumentResult } from "./llm.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env.ASIDE_API_URL ?? "https://browser-api.aside.at";

// Matches Aside API schema: embedRequestSchema.outputDimensionality
const EMBED_DIMENSIONS: 768 | 1536 | 2048 = 768;
const EMBED_MODEL = "aside/gemini-embedding-2-preview";
const RERANK_MODEL = "aside/zerank-2";

// Aside API schema: embedRequestSchema.taskType
type TaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

// Gemini batchEmbedContents hard limit
const BATCH_LIMIT = 100;

const MAX_RETRIES = 3;
const BACKOFF_MS = 500;

// ---------------------------------------------------------------------------
// Detection — always enabled (Aside API has no client-side keys)
// ---------------------------------------------------------------------------

export function isRemoteEmbeddingEnabled(): boolean {
  return true;
}

export function isRemoteRerankEnabled(): boolean {
  return true;
}

// ---------------------------------------------------------------------------
// Fetch with retry + exponential backoff
// ---------------------------------------------------------------------------

async function post<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  let lastErr: Error | null = null;

  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 429 && i < MAX_RETRIES) {
        await sleep(BACKOFF_MS * 2 ** i);
        continue;
      }
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (i < MAX_RETRIES) await sleep(BACKOFF_MS * 2 ** i);
    }
  }
  throw lastErr!;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Embed  (Aside schema: embedRequestSchema / embedResponseSchema)
// ---------------------------------------------------------------------------

type EmbedResponse = { embeddings: number[][] };

export async function remoteEmbed(text: string, options?: EmbedOptions): Promise<EmbeddingResult | null> {
  const taskType: TaskType = options?.isQuery ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
  // Aside schema: title improves quality for RETRIEVAL_DOCUMENT
  const title = (!options?.isQuery && options?.title) ? options.title : undefined;

  try {
    const { embeddings } = await post<EmbedResponse>("/memory/embed", {
      contents: [{ parts: [{ text }] }],
      taskType,
      title,
      outputDimensionality: EMBED_DIMENSIONS,
    });
    const vec = embeddings?.[0];
    if (!vec) return null;
    return { embedding: vec, model: EMBED_MODEL };
  } catch (e) {
    console.error("Aside embed error:", e);
    return null;
  }
}

export async function remoteEmbedBatch(texts: string[]): Promise<(EmbeddingResult | null)[]> {
  if (!texts.length) return [];

  const results: (EmbeddingResult | null)[] = [];

  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    const batch = texts.slice(i, i + BATCH_LIMIT);
    try {
      const { embeddings } = await post<EmbedResponse>("/memory/embed", {
        contents: batch.map(t => ({ parts: [{ text: t }] })),
        taskType: "RETRIEVAL_DOCUMENT" satisfies TaskType,
        outputDimensionality: EMBED_DIMENSIONS,
      });
      for (let j = 0; j < batch.length; j++) {
        const vec = embeddings?.[j];
        results.push(vec ? { embedding: vec, model: EMBED_MODEL } : null);
      }
    } catch (e) {
      console.error("Aside embedBatch error:", e);
      for (let j = 0; j < batch.length; j++) results.push(null);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Rerank  (Aside schema: rerankRequestSchema / rerankResponseSchema)
// ---------------------------------------------------------------------------

type RerankResponse = { results: { index: number; relevance_score: number }[] };

const zeroScores = (docs: RerankDocument[]): RerankResult => ({
  results: docs.map((d, i) => ({ file: d.file, score: 0, index: i })),
  model: RERANK_MODEL,
});

export async function remoteRerank(query: string, documents: RerankDocument[]): Promise<RerankResult> {
  if (!documents.length) return { results: [], model: RERANK_MODEL };

  try {
    const { results: raw } = await post<RerankResponse>("/memory/rerank", {
      query,
      documents: documents.map(d => d.text),
    });
    if (!raw) return zeroScores(documents);

    const results: RerankDocumentResult[] = raw.map(r => ({
      file: documents[r.index]!.file,
      score: r.relevance_score,
      index: r.index,
    }));

    // backfill docs the API omitted (e.g. when top_n < total)
    if (results.length < documents.length) {
      const seen = new Set(results.map(r => r.index));
      for (let i = 0; i < documents.length; i++) {
        if (!seen.has(i)) results.push({ file: documents[i]!.file, score: 0, index: i });
      }
    }
    return { results, model: RERANK_MODEL };
  } catch (e) {
    console.error("Aside rerank error:", e);
    return zeroScores(documents);
  }
}
