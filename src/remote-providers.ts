/**
 * remote-providers.ts - Remote API providers for embedding and reranking
 *
 * AQMD divergence from QMD: replaces local node-llama-cpp embedding/reranking
 * with remote API calls to Gemini (embedding) and ZeroEntropy (reranking).
 *
 * Environment variables:
 *   GOOGLE_GENERATIVE_AI_API_KEY - Required for remote embedding via Gemini embedding-001
 *   ZEROENTROPY_API_KEY          - Required for remote reranking via ZeroEntropy zerank-2
 */

import type { EmbeddingResult, EmbedOptions, RerankResult, RerankDocument, RerankDocumentResult } from "./llm.js";

// =============================================================================
// Configuration
// =============================================================================

const GEMINI_EMBED_MODEL = "gemini-embedding-001";
const GEMINI_EMBED_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}`;
const GEMINI_BATCH_LIMIT = 100;
const GEMINI_EMBED_DIMENSIONS = 768;

const ZEROENTROPY_RERANK_ENDPOINT = "https://api.zeroentropy.dev/v1/models/rerank";
const ZEROENTROPY_MODEL = "zerank-2";

// Retry config
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

// =============================================================================
// Detection
// =============================================================================

export function isRemoteEmbeddingEnabled(): boolean {
  return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

export function isRemoteRerankEnabled(): boolean {
  return !!process.env.ZEROENTROPY_API_KEY;
}

// =============================================================================
// Retry helper
// =============================================================================

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.ok) return response;

      // Rate limit — backoff and retry
      if (response.status === 429 && attempt < maxRetries) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      // Other HTTP error — throw with body
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status} from ${new URL(url).pathname}: ${errorBody.slice(0, 500)}`
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
    }
  }
  throw lastError || new Error("fetchWithRetry exhausted retries");
}

// =============================================================================
// Gemini Embedding
// =============================================================================

/**
 * Embed a single text using Gemini embedding-001 REST API.
 *
 * Uses taskType based on the isQuery option:
 * - RETRIEVAL_QUERY for search queries
 * - RETRIEVAL_DOCUMENT for documents being indexed
 */
export async function remoteEmbed(
  text: string,
  options?: EmbedOptions,
): Promise<EmbeddingResult | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY environment variable is required for remote embedding");
  }

  const taskType = options?.isQuery ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";

  try {
    const response = await fetchWithRetry(
      `${GEMINI_EMBED_ENDPOINT}:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: GEMINI_EMBED_DIMENSIONS,
        }),
      },
    );

    const data = await response.json() as {
      embedding?: { values?: number[] };
    };

    if (!data.embedding?.values) {
      console.error("Gemini embedding response missing values:", JSON.stringify(data).slice(0, 200));
      return null;
    }

    return {
      embedding: data.embedding.values,
      model: GEMINI_EMBED_MODEL,
    };
  } catch (error) {
    console.error("Gemini embedding error:", error);
    return null;
  }
}

/**
 * Batch embed multiple texts using Gemini batchEmbedContents REST API.
 *
 * Automatically chunks into batches of 100 (Gemini's limit).
 * All texts are embedded as RETRIEVAL_DOCUMENT.
 */
export async function remoteEmbedBatch(
  texts: string[],
): Promise<(EmbeddingResult | null)[]> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY environment variable is required for remote embedding");
  }

  if (texts.length === 0) return [];

  const allResults: (EmbeddingResult | null)[] = [];

  // Process in batches of GEMINI_BATCH_LIMIT
  for (let i = 0; i < texts.length; i += GEMINI_BATCH_LIMIT) {
    const batch = texts.slice(i, i + GEMINI_BATCH_LIMIT);

    const requests = batch.map(text => ({
      model: `models/${GEMINI_EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT" as const,
      outputDimensionality: GEMINI_EMBED_DIMENSIONS,
    }));

    try {
      const response = await fetchWithRetry(
        `${GEMINI_EMBED_ENDPOINT}:batchEmbedContents?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        },
      );

      const data = await response.json() as {
        embeddings?: { values?: number[] }[];
      };

      if (!data.embeddings || data.embeddings.length !== batch.length) {
        console.error(
          `Gemini batch: expected ${batch.length} embeddings, got ${data.embeddings?.length ?? 0}`,
        );
        // Fill with nulls for missing
        for (let j = 0; j < batch.length; j++) {
          const emb = data.embeddings?.[j];
          if (emb?.values) {
            allResults.push({ embedding: emb.values, model: GEMINI_EMBED_MODEL });
          } else {
            allResults.push(null);
          }
        }
        continue;
      }

      for (const emb of data.embeddings) {
        if (emb.values) {
          allResults.push({ embedding: emb.values, model: GEMINI_EMBED_MODEL });
        } else {
          allResults.push(null);
        }
      }
    } catch (error) {
      console.error("Gemini batch embedding error:", error);
      // Fill entire batch with nulls on failure
      for (let j = 0; j < batch.length; j++) {
        allResults.push(null);
      }
    }
  }

  return allResults;
}

// =============================================================================
// ZeroEntropy Reranking
// =============================================================================

/**
 * Rerank documents using ZeroEntropy zerank-2 REST API.
 *
 * Takes query + documents (with file metadata), returns scored results
 * in the same RerankResult format as the local reranker.
 */
export async function remoteRerank(
  query: string,
  documents: RerankDocument[],
): Promise<RerankResult> {
  const apiKey = process.env.ZEROENTROPY_API_KEY;
  if (!apiKey) {
    throw new Error("ZEROENTROPY_API_KEY environment variable is required for remote reranking");
  }

  if (documents.length === 0) {
    return { results: [], model: ZEROENTROPY_MODEL };
  }

  // ZeroEntropy takes an array of document strings
  const docTexts = documents.map(d => d.text);

  try {
    const response = await fetchWithRetry(
      ZEROENTROPY_RERANK_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: ZEROENTROPY_MODEL,
          query,
          documents: docTexts,
        }),
      },
    );

    const data = await response.json() as {
      results?: { index: number; relevance_score: number }[];
    };

    if (!data.results) {
      console.error("ZeroEntropy rerank response missing results:", JSON.stringify(data).slice(0, 200));
      // Return all documents with score 0
      return {
        results: documents.map((doc, i) => ({ file: doc.file, score: 0, index: i })),
        model: ZEROENTROPY_MODEL,
      };
    }

    // Map ZeroEntropy response back to RerankDocumentResult format
    // ZeroEntropy returns results sorted by relevance; index maps to original position
    const results: RerankDocumentResult[] = data.results.map(r => ({
      file: documents[r.index]!.file,
      score: r.relevance_score,
      index: r.index,
    }));

    // ZeroEntropy may return only top_n results (default: all).
    // If any documents are missing from results, add them with score 0.
    if (results.length < documents.length) {
      const returnedIndices = new Set(results.map(r => r.index));
      for (let i = 0; i < documents.length; i++) {
        if (!returnedIndices.has(i)) {
          results.push({ file: documents[i]!.file, score: 0, index: i });
        }
      }
    }

    return { results, model: ZEROENTROPY_MODEL };
  } catch (error) {
    console.error("ZeroEntropy reranking error:", error);
    // Fallback: return all documents with score 0
    return {
      results: documents.map((doc, i) => ({ file: doc.file, score: 0, index: i })),
      model: ZEROENTROPY_MODEL,
    };
  }
}
