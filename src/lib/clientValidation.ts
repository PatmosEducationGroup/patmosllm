// Client-side file validation (no Node.js dependencies)
// This is a subset of the server-side validation for use in React components

// Supported file extensions
export const SUPPORTED_EXTENSIONS = [
  // Documents
  '.txt', '.md', '.pdf', '.docx', '.ppt', '.pptx',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg',
  // Audio
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma',
  // Video
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.3gp'
]

// Supported MIME types
export const SUPPORTED_MIME_TYPES = [
  // Traditional document types
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',

  // Audio
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/flac',
  'audio/ogg',
  'audio/m4a',
  'audio/aac',
  'audio/wma',

  // Video
  'video/mp4',
  'video/avi',
  'video/mov',
  'video/quicktime', // .mov files on macOS
  'video/wmv',
  'video/flv',
  'video/webm',
  'video/mkv',
  'video/3gp'
]

// Map file extensions to MIME types for fallback detection
const EXTENSION_TO_MIME: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/m4a',
  '.aac': 'audio/aac',
  '.wma': 'audio/wma',
  '.mp4': 'video/mp4',
  '.avi': 'video/avi',
  '.mov': 'video/mov',
  '.wmv': 'video/wmv',
  '.flv': 'video/flv',
  '.webm': 'video/webm',
  '.mkv': 'video/mkv',
  '.3gp': 'video/3gp'
}

export const MAX_FILE_SIZE = 150 * 1024 * 1024 // 150MB for multimedia content

// Get file extension from filename
function getFileExtension(filename: string): string {
  return filename.toLowerCase().substring(filename.lastIndexOf('.'))
}

// Client-side file validation
export function validateFile(file: File): { valid: boolean; error?: string } {
  const fileExtension = getFileExtension(file.name)
  const mimeType = file.type || EXTENSION_TO_MIME[fileExtension]

  // Check if file is supported by either MIME type or extension
  const isSupportedMimeType = SUPPORTED_MIME_TYPES.includes(mimeType)
  const isSupportedExtension = SUPPORTED_EXTENSIONS.includes(fileExtension)

  if (!isSupportedMimeType && !isSupportedExtension) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.name} (${file.type || 'unknown MIME type'}). Supported types: TXT, MD, PDF, DOCX, PPTX, Images (JPG, PNG, etc.), Audio (MP3, WAV, etc.), Video (MP4, AVI, etc.)`
    }
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max size: 150MB`
    }
  }

  return { valid: true }
}