/**
 * aside-api-client.ts - Aside API client for embedding and reranking
 *
 * AQMD divergence: replaces direct Gemini/ZeroEntropy API calls with
 * Aside's proxy API at https://browser-api.aside.at/memory/*
 * No API keys required — the server handles authentication.
 *
 * Endpoints:
 *   POST /memory/embed   — Gemini embedding proxy (768 dimensions)
 *   POST /memory/rerank  — ZeroEntropy reranking proxy
 */

import type { EmbeddingResult, EmbedOptions, RerankResult, RerankDocument, RerankDocumentResult } from "./llm.js";

const BASE_URL = process.env.ASIDE_API_URL ?? "https://browser-api.aside.at";
const EMBED_URL = `${BASE_URL}/memory/embed`;
const RERANK_URL = `${BASE_URL}/memory/rerank`;

const EMBED_DIMENSIONS = 768;
const EMBED_MODEL = "aside/gemini-embedding";
const RERANK_MODEL = "aside/zerank-2";
const BATCH_LIMIT = 100;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

// =============================================================================
// Retry helper
// =============================================================================

async function fetchRetry(url: string, init: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  let lastErr: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (res.status === 429 && i < retries) {
        await new Promise(r => setTimeout(r, INITIAL_BACKOFF_MS * 2 ** i));
        continue;
      }
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${url}: ${body.slice(0, 300)}`);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (i < retries) {
        await new Promise(r => setTimeout(r, INITIAL_BACKOFF_MS * 2 ** i));
      }
    }
  }
  throw lastErr!;
}

// =============================================================================
// Embedding
// =============================================================================

export async function asideEmbed(text: string, options?: EmbedOptions): Promise<EmbeddingResult | null> {
  const taskType = options?.isQuery ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
  try {
    const res = await fetchRetry(EMBED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        taskType,
        title: options?.title,
        outputDimensionality: EMBED_DIMENSIONS,
      }),
    });
    const data = (await res.json()) as { embeddings?: number[][] };
    const vec = data.embeddings?.[0];
    if (!vec) {
      console.error("Aside embed: no vector in response");
      return null;
    }
    return { embedding: vec, model: EMBED_MODEL };
  } catch (e) {
    console.error("Aside embed error:", e);
    return null;
  }
}

export async function asideEmbedBatch(texts: string[]): Promise<(EmbeddingResult | null)[]> {
  if (texts.length === 0) return [];

  const all: (EmbeddingResult | null)[] = [];

  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    const batch = texts.slice(i, i + BATCH_LIMIT);
    try {
      const res = await fetchRetry(EMBED_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: batch.map(t => ({ parts: [{ text: t }] })),
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBED_DIMENSIONS,
        }),
      });
      const data = (await res.json()) as { embeddings?: number[][] };
      const vecs = data.embeddings ?? [];
      for (let j = 0; j < batch.length; j++) {
        const v = vecs[j];
        all.push(v ? { embedding: v, model: EMBED_MODEL } : null);
      }
    } catch (e) {
      console.error("Aside embedBatch error:", e);
      for (let j = 0; j < batch.length; j++) all.push(null);
    }
  }
  return all;
}

// =============================================================================
// Reranking
// =============================================================================

export async function asideRerank(query: string, documents: RerankDocument[]): Promise<RerankResult> {
  if (documents.length === 0) return { results: [], model: RERANK_MODEL };

  try {
    const res = await fetchRetry(RERANK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        documents: documents.map(d => d.text),
      }),
    });
    const data = (await res.json()) as { results?: { index: number; relevance_score: number }[] };
    if (!data.results) {
      console.error("Aside rerank: no results in response");
      return { results: documents.map((d, i) => ({ file: d.file, score: 0, index: i })), model: RERANK_MODEL };
    }

    const results: RerankDocumentResult[] = data.results.map(r => ({
      file: documents[r.index]!.file,
      score: r.relevance_score,
      index: r.index,
    }));

    // Fill missing indices with score 0
    if (results.length < documents.length) {
      const seen = new Set(results.map(r => r.index));
      for (let i = 0; i < documents.length; i++) {
        if (!seen.has(i)) results.push({ file: documents[i]!.file, score: 0, index: i });
      }
    }
    return { results, model: RERANK_MODEL };
  } catch (e) {
    console.error("Aside rerank error:", e);
    return { results: documents.map((d, i) => ({ file: d.file, score: 0, index: i })), model: RERANK_MODEL };
  }
}
