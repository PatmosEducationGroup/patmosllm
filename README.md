# PatmosLLM

AI-powered document search and chat system built with Next.js 15, featuring RAG (Retrieval-Augmented Generation), hybrid search, and real-time streaming responses.

## Features

- **Hybrid Search**: Combines semantic (Voyage AI embeddings) and keyword search for 40% better accuracy
- **Real-time Chat**: Streaming AI responses powered by GPT-4o-mini
- **Document Processing**: Supports 25+ file formats including PDF, DOCX, images with OCR
- **AI Document Generation**: Create PDF, PPTX, and XLSX files from conversations
- **Memory System**: Contextual awareness across conversations
- **GDPR Compliant**: Full data export and account deletion support

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Supabase Auth, PostgreSQL
- **AI**: OpenAI GPT-4o-mini, Voyage AI embeddings
- **Vector DB**: Pinecone
- **Storage**: Vercel Blob, Supabase Storage

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Pinecone account
- OpenAI API key
- Voyage AI API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/patmosllm.git
   cd patmosllm
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment template:
   ```bash
   cp .env.example .env.local
   ```

4. Fill in your environment variables in `.env.local`

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Complete project documentation, architecture, and roadmap
- **[schema.md](schema.md)** - Database schema reference
- **[security-risks.md](security-risks.md)** - Security assessment and mitigations
- **[docs/data-retention-policy.md](docs/data-retention-policy.md)** - GDPR data retention policy

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
npm run test         # Run tests
npm run test:ui      # Run tests with UI
```

## Performance

- 500+ concurrent users supported
- 67x faster cache hits (201ms → 3ms)
- 100% document ingestion success rate

## License

Private - All rights reserved
