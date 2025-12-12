// Chat-related type definitions
// Extracted from page.tsx and route.ts for reusability

// =================================================================
// UI Types (from page.tsx)
// =================================================================

export interface Source {
  title: string
  author?: string
  chunk_id: string
  document_id: string
  has_file: boolean
  file_size?: number
  amazon_url?: string
  resource_url?: string
  download_enabled: boolean
  contact_person?: string
  contact_email?: string
}

export interface DocumentDownload {
  format: 'pdf' | 'pptx' | 'xlsx'
  filename: string
  downloadUrl: string
  size: number
  expiresAt: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  documentDownload?: DocumentDownload
  isStreaming?: boolean
}

export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export interface Conversation {
  id: string
  question: string
  answer: string
  sources?: Source[]
  created_at: string
}

// =================================================================
// API Types (from route.ts)
// =================================================================

export type QueryIntent =
  | 'retrieve_from_docs'
  | 'basic_factual'
  | 'synthesize_from_docs'
  | 'transform_prior_artifact'
  | 'generate_document'

export type DocumentFormat = 'pdf' | 'pptx' | 'xlsx' | null

export interface IntentResult {
  intent: QueryIntent
  documentFormat?: DocumentFormat
}

export interface CachedChatResponse {
  answer: string
  sources: Array<{ title: string; author?: string; chunk_id: string }>
  timestamp: number
}

// =================================================================
// Form Types (from page.tsx)
// =================================================================

export interface ContactInfo {
  documentTitle: string
  contactPerson?: string
  contactEmail?: string
}

export interface ContactForm {
  name: string
  email: string
  message: string
}

export interface FeedbackForm {
  rating: number
  comment: string
  category: 'bug' | 'feature' | 'improvement' | 'other'
}

// =================================================================
// Search Result Types
// =================================================================

export interface SearchChunk {
  id: string
  content: string
  documentId: string
  documentTitle: string
  documentAuthor?: string
  score: number
}

export interface SearchResult {
  results: SearchChunk[]
  searchStrategy: string
  confidence: number
  suggestions?: string[]
}

// =================================================================
// Streaming Types
// =================================================================

export interface StreamSourcesEvent {
  type: 'sources'
  sources: Source[]
  chunksFound: number
  documentsUsed?: number
  cached?: boolean
}

export interface StreamChunkEvent {
  type: 'chunk'
  content: string
}

export interface StreamCompleteEvent {
  type: 'complete'
  fullResponse: string
}

export interface StreamDocumentEvent {
  type: 'document'
  format: DocumentFormat
  filename: string
  downloadUrl: string
  size: number
  expiresAt: string
}

export interface StreamErrorEvent {
  type: 'error' | 'document_error'
  error: string
}

export type StreamEvent =
  | StreamSourcesEvent
  | StreamChunkEvent
  | StreamCompleteEvent
  | StreamDocumentEvent
  | StreamErrorEvent
