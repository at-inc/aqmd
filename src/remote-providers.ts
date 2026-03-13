/**
 * remote-providers.ts - Remote API providers for embedding and reranking
 *
 * AQMD divergence from QMD: replaces local node-llama-cpp embedding/reranking
 * with remote API calls via Aside's proxy API (browser-api.aside.at).
 *
 * No API keys required — Aside API handles upstream authentication.
 * All embedding and reranking is always remote; local models are bypassed.
 */

import type { EmbeddingResult, EmbedOptions, RerankResult, RerankDocument } from "./llm.js";
import { asideEmbed, asideEmbedBatch, asideRerank } from "./aside-api-client.js";

// =============================================================================
// Detection — always enabled (Aside API requires no local keys)
// =============================================================================

export function isRemoteEmbeddingEnabled(): boolean {
  return true;
}

export function isRemoteRerankEnabled(): boolean {
  return true;
}

// =============================================================================
// Embedding — delegated to Aside API
// =============================================================================

export async function remoteEmbed(
  text: string,
  options?: EmbedOptions,
): Promise<EmbeddingResult | null> {
  return asideEmbed(text, options);
}

export async function remoteEmbedBatch(
  texts: string[],
): Promise<(EmbeddingResult | null)[]> {
  return asideEmbedBatch(texts);
}

// =============================================================================
// Reranking — delegated to Aside API
// =============================================================================

export async function remoteRerank(
  query: string,
  documents: RerankDocument[],
): Promise<RerankResult> {
  return asideRerank(query, documents);
}

// =============================================================================
// Original direct-API implementations (commented out for upstream reference)
// =============================================================================

/*
// --- Original Configuration ---
// const GEMINI_EMBED_MODEL = "gemini-embedding-001";
// const GEMINI_EMBED_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}`;
// const GEMINI_BATCH_LIMIT = 100;
// const GEMINI_EMBED_DIMENSIONS = 768;
// const ZEROENTROPY_RERANK_ENDPOINT = "https://api.zeroentropy.dev/v1/models/rerank";
// const ZEROENTROPY_MODEL = "zerank-2";
// const MAX_RETRIES = 3;
// const INITIAL_BACKOFF_MS = 500;

// --- Original Detection (env-var gated) ---
// export function isRemoteEmbeddingEnabled(): boolean {
//   return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
// }
// export function isRemoteRerankEnabled(): boolean {
//   return !!process.env.ZEROENTROPY_API_KEY;
// }

// --- Original Gemini Embedding ---
// export async function remoteEmbed(text, options) { ... Gemini embedContent ... }
// export async function remoteEmbedBatch(texts) { ... Gemini batchEmbedContents ... }

// --- Original ZeroEntropy Reranking ---
// export async function remoteRerank(query, documents) { ... ZeroEntropy /v1/models/rerank ... }
*/
