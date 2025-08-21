// Database types matching our Supabase schema

export type UserRole = 'ADMIN' | 'USER'

export type IngestStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface User {
  id: string
  clerk_id: string
  email: string
  name?: string
  role: UserRole
  invited_by?: string
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  title: string
  author?: string
  storage_path: string
  mime_type?: string
  file_size?: number
  content?: string
  word_count?: number
  page_count?: number
  uploaded_by?: string
  created_at: string
  processed_at?: string
}

export interface Chunk {
  id: string
  document_id: string
  content: string
  chunk_index: number
  token_count?: number
  metadata: Record<string, unknown>
  created_at: string
}

export interface IngestJob {
  id: string
  document_id: string
  status: IngestStatus
  error_message?: string
  chunks_created: number
  started_at?: string
  completed_at?: string
  created_at: string
}

export interface Conversation {
  id: string
  user_id: string
  question: string
  answer?: string
  sources?: Array<{
    title: string
    author?: string
    chunk_id: string
  }>
  created_at: string
}

// Upload and processing types
export interface UploadResult {
  success: boolean
  document?: Document
  error?: string
}

export interface ProcessingResult {
  success: boolean
  chunks_created?: number
  error?: string
}

export interface ChatResponse {
  answer: string
  sources: Array<{
    title: string
    author?: string
    chunk_id: string
  }>
}