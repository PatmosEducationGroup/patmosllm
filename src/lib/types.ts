// Database types matching our Supabase schema

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'CONTRIBUTOR' | 'USER'

export type IngestStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface User {
  id: string
  auth_user_id: string // Supabase Auth user ID (single source of truth)
  email: string
  name?: string
  role: UserRole
  invited_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string // For GDPR soft deletion
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
  source_type?: string
  source_url?: string
  amazon_url?: string
  resource_url?: string
  download_enabled?: boolean
  contact_person?: string
  contact_email?: string
  metadata?: Record<string, unknown>
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