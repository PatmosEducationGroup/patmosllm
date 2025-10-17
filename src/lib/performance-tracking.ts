/**
 * Performance Tracking & Instrumentation
 *
 * Utilities for measuring and logging performance metrics with FTL/TTLT tracking,
 * warm/cold cache separation, and shadow run support.
 */

export interface ChatPerformanceTimings {
  start: number;
  cacheCheck: number;
  cacheHit: boolean;
  search: number;
  rerank: number;
  metadata: number;
  promptBuild: number;
  firstToken: number;      // FTL (First Token Latency)
  streamComplete: number;  // Total time
  sourceHydrate: number;
}

export interface PerformanceMetrics {
  userId: string;
  sessionId: string;

  // Timing breakdown
  timings: ChatPerformanceTimings;
  totalTime: number;

  // First Token Latency (FTL) - most important for perceived speed
  ftl: number;

  // Time To Last Token (TTLT) - total generation time
  ttlt: number;

  // Token counts
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;

  // Optimization flags
  usedSummaryBuffer: boolean;
  cacheHit: boolean;

  // Feature flags active
  flags: {
    chatHistory2: boolean;
    ctx7: boolean;
    k17: boolean;
    summaryBuffer: boolean;
  };
}

export interface ShadowRunMetrics {
  userId: string;
  sessionId: string;
  query: string;
  overlap: number;
  citationDelta: number;
  shadowConfig: {
    k: number;
    chunks: number;
  };
  optimizedConfig: {
    k: number;
    chunks: number;
  };
  message: string;
}

interface Chunk {
  id: string;
  [key: string]: unknown;
}

/**
 * Calculate chunk overlap between two sets
 */
export function calculateChunkOverlap(shadowChunks: Chunk[], mainChunks: Chunk[]): number {
  const shadowIds = new Set(shadowChunks.map(c => c.id));
  const overlapCount = mainChunks.filter(c => shadowIds.has(c.id)).length;

  // Return overlap as percentage
  return Math.round((overlapCount / mainChunks.length) * 100);
}

/**
 * Create initial performance timings object
 */
export function createPerformanceTimings(): ChatPerformanceTimings {
  return {
    start: Date.now(),
    cacheCheck: 0,
    cacheHit: false,
    search: 0,
    rerank: 0,
    metadata: 0,
    promptBuild: 0,
    firstToken: 0,
    streamComplete: 0,
    sourceHydrate: 0
  };
}

/**
 * Build performance metrics object from timings
 */
export function buildPerformanceMetrics(
  timings: ChatPerformanceTimings,
  userId: string,
  sessionId: string,
  promptTokens: number,
  completionTokens: number,
  flags: {
    chatHistory2: boolean;
    ctx7: boolean;
    k17: boolean;
    summaryBuffer: boolean;
  },
  usedSummaryBuffer: boolean
): PerformanceMetrics {
  return {
    userId,
    sessionId,
    timings,
    totalTime: timings.streamComplete,
    ftl: timings.firstToken,
    ttlt: timings.streamComplete - timings.firstToken,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    usedSummaryBuffer,
    cacheHit: timings.cacheHit,
    flags
  };
}

/**
 * Determine if a shadow run should be executed (1-2% sampling)
 */
export function shouldRunShadowTest(sampleRate: number = 0.02): boolean {
  return Math.random() < sampleRate;
}
