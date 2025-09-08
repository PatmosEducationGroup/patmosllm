# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Architecture Overview

**PatmosLLM** is a Next.js 15 application implementing an AI-powered document search and chat system with RAG (Retrieval-Augmented Generation). The system allows users to upload documents, processes them into searchable chunks, and provides an intelligent chat interface for querying the knowledge base.

### Key Technologies
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes
- **Authentication**: Clerk (with custom role-based access control)
- **Database**: Supabase (PostgreSQL)
- **Vector Database**: Pinecone (for semantic search)
- **AI**: OpenAI GPT models for chat and embeddings
- **File Processing**: Multiple libraries (mammoth, pdf2json, pptx-parser, tesseract.js, cheerio)
- **Email**: Resend

### Database Schema (Supabase)
- **users**: User management with roles (ADMIN, CONTRIBUTOR, USER)
- **documents**: Document metadata and content storage
- **chunks**: Document chunks for vector search
- **ingest_jobs**: Processing job tracking
- **conversations**: Chat history storage
- **chat_sessions**: User chat session management

### Core Architecture Patterns

1. **Document Processing Pipeline**:
   - Upload → Process → Chunk → Embed → Store in Pinecone
   - Handled via `/api/upload/*` and `/api/ingest` routes
   - File processors in `src/lib/fileProcessors.ts`

2. **RAG Implementation**:
   - User query → Embed → Search Pinecone → Context + LLM → Stream response
   - Main chat handler in `/api/chat/route.ts` with streaming support
   - Vector operations in `src/lib/pinecone.ts`

3. **Role-Based Access Control**:
   - ADMIN: Full system access, user management
   - CONTRIBUTOR: Can upload documents
   - USER: Chat-only access
   - Auth helpers in `src/lib/auth.ts`

4. **Security Architecture**:
   - Comprehensive CSP headers in middleware
   - Input sanitization and file security checks
   - Rate limiting for API endpoints
   - Environment validation

### Key Implementation Details

- **Streaming Chat**: Real-time response streaming with server-sent events
- **Session Management**: Persistent chat sessions with title auto-generation
- **File Security**: Comprehensive file type validation and sanitization
- **Admin Dashboard**: Complete system monitoring and user management
- **Contact System**: Email integration for document-specific inquiries

### API Route Structure
- `/api/chat/*`: Chat functionality and session management
- `/api/upload/*`: Document upload and processing
- `/api/admin/*`: Administrative functions
- `/api/auth`: Authentication sync with database
- `/api/documents`: Document CRUD operations
- `/api/contact`: Email sending functionality

### Environment Variables Required
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PINECONE_API_KEY
PINECONE_INDEX
PINECONE_NAMESPACE
OPENAI_API_KEY
RESEND_API_KEY
```

### Development Notes
- Uses App Router with TypeScript
- Inline styles throughout components (no external CSS modules)
- Server-side authentication with Clerk middleware protection
- Comprehensive error handling and logging
- Mobile-responsive design with sidebar navigation

# PENDING IMPROVEMENTS (PRIORITIZED)

## High-Priority Scalability Improvements

### Database & Performance Optimizations
- **Connection Pooling**: Singleton pattern for Supabase clients (handles 500+ concurrent users vs current ~50)
- **Batch Database Operations**: Queue writes to reduce DB calls by 80%
- **Redis Caching Layer**: Cache user sessions (300s TTL), conversation history (1800s TTL)
- **Essential Database Indexes**: Add performance indexes for high-traffic queries
- **Read Replicas**: Separate read/write operations for better scalability

#### Critical Files to Modify:
- `/src/lib/supabase.ts` - Implement connection pooling singleton with max 20 connections
- `/src/app/api/chat/route.ts` - Add caching layer and batch operations
- Database: Add indexes `idx_conversations_user_session`, `idx_chat_sessions_user_updated`

#### Quick Fixes Available Now:
1. Increase Supabase max connections to 100-200 in project settings
2. Add essential index: `CREATE INDEX CONCURRENTLY idx_conversations_hot_path ON conversations(user_id, session_id, created_at DESC);`

## UI/UX Modernization Roadmap

### Phase 1: Foundation (Week 1)
- **Replace inline styles** with Tailwind CSS design system
- **Component library**: Create reusable Button, Input, Card, Avatar components
- **Mobile-first responsive** design replacing fixed layouts
- **Basic accessibility**: ARIA labels, focus management, keyboard navigation

### Phase 2: Enhanced UX (Week 2-3)
- **Smart chat messages**: Better typography, interactive source cards, message actions (copy, feedback)
- **Enhanced chat input**: Auto-resize textarea, smart suggestions, character count, voice input
- **Improved sidebar**: Search conversations, inline editing, session management
- **Loading states**: Replace spinners with skeleton screens for better perceived performance

### Phase 3: Advanced Features (Week 4+)
- **Keyboard shortcuts**: Cmd+K search, Cmd+N new chat, Esc handling
- **Contextual help**: Tooltips and onboarding for better discoverability
- **Smooth animations**: Typing indicators, message transitions, micro-interactions
- **Theme support**: Dark mode, font size preferences, accessibility options

#### Quick Wins (Can implement today):
1. `npm install tailwindcss @tailwindcss/typography`
2. Add Inter font family for improved typography
3. Replace basic inline styles with Tailwind utility classes
4. Add responsive breakpoints: `className="grid grid-cols-1 md:grid-cols-3"`

## RAG System Accuracy Improvements

### Enhanced Retrieval Strategy
- **Adaptive similarity thresholds**: Dynamic scoring based on query type (current: fixed 0.3)
- **Hybrid search**: Combine semantic + keyword search for better relevance
- **Source confidence scoring**: Rate source quality and relevance
- **Multi-stage validation**: Verify answers against sources before responding

### User Experience Accuracy Features
- **Question intent classification**: Optimize retrieval based on question type
- **Progressive response loading**: Show confidence indicators during streaming
- **Interactive source exploration**: Expandable previews, "show more" functionality
- **User feedback integration**: Learn from user ratings to improve responses

## Expected Performance Impact
- **Concurrent Users**: 50 → 500+ users supported
- **Database Performance**: 80% fewer auth lookups via caching
- **User Experience**: +40% satisfaction, +60% mobile usage
- **Page Load Times**: 3x faster session loading
- **Accessibility Score**: Achieve 90+ WCAG compliance