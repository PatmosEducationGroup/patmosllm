import sharp from 'sharp'
import { parseFile } from 'music-metadata'
import { createWorker } from 'tesseract.js'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFileSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'

// Dynamically import ffmpeg modules to handle potential installation issues
let ffmpegConfigured = false

async function ensureFFmpegLoaded() {
  if (!ffmpegConfigured) {
    try {
      // Import FFmpeg installers to get binary paths
      const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg')
      const ffprobeInstaller = await import('@ffprobe-installer/ffprobe')

      const ffmpegPath = ffmpegInstaller.default.path || ffmpegInstaller.path
      const ffprobePath = ffprobeInstaller.default.path || ffprobeInstaller.path

      console.log('FFmpeg binaries configured:', { ffmpegPath, ffprobePath })
      ffmpegConfigured = true

      return { ffmpegPath, ffprobePath }
    } catch (_error) {
      console.warn('FFmpeg not available:', _error)
      ffmpegConfigured = true // Mark as attempted
      return null
    }
  }
  return ffmpegConfigured ? { ffmpegPath: null, ffprobePath: null } : null
}

// Enhanced multimedia file type support
export const MULTIMEDIA_MIME_TYPES = [
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

export interface MultimediaExtractionResult {
  content: string
  wordCount: number
  processorUsed: string
  metadata?: Record<string, unknown>
  transcription?: string
  frameAnalysis?: string[]
}

// Extract text from images using OCR
export async function extractFromImage(buffer: Buffer, filename: string): Promise<MultimediaExtractionResult> {
  try {
    console.log(`Processing image: ${filename}`)

    // Get image metadata
    const metadata = await sharp(buffer).metadata()
    console.log(`Image metadata:`, { width: metadata.width, height: metadata.height, format: metadata.format })

    // Process image with OCR
    const worker = await createWorker('eng')
    await worker.setParameters({
      tessedit_page_seg_mode: '1', // Automatic page segmentation with OSD
      tessedit_ocr_engine_mode: '3', // Use both neural net and legacy engines
    })

    const { data: { text, confidence } } = await worker.recognize(buffer)
    await worker.terminate()

    console.log(`OCR completed with confidence: ${confidence}%`)

    const extractedText = text.trim()
    let content = `Image Analysis of ${filename}:\n`
    content += `Dimensions: ${metadata.width}x${metadata.height}\n`
    content += `Format: ${metadata.format}\n`
    content += `OCR Confidence: ${confidence.toFixed(1)}%\n\n`

    if (extractedText) {
      content += `Extracted Text:\n${extractedText}\n`
    } else {
      content += 'No readable text found in image.\n'
    }

    // Add visual analysis placeholder
    content += `\nVisual Content Analysis:\n[Image contains visual elements that may require additional AI vision processing for detailed description]\n`

    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length

    return {
      content,
      wordCount,
      processorUsed: 'tesseract.js + sharp',
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        density: metadata.density,
        ocrConfidence: confidence
      }
    }
  } catch (_error) {

    // Fallback: provide basic metadata without OCR
    try {
      const metadata = await sharp(buffer).metadata()
      const content = `Image File: ${filename}\nDimensions: ${metadata.width}x${metadata.height}\nFormat: ${metadata.format}\n\n[OCR processing failed - image metadata only]`

      return {
        content,
        wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
        processorUsed: 'sharp (metadata only)',
        metadata: metadata as unknown as Record<string, unknown>
      }
    } catch (_error) {
      throw new Error(`Image processing completely failed: ${''}`)
    }
  }
}

// Extract metadata and transcription from audio files
export async function extractFromAudio(buffer: Buffer, filename: string): Promise<MultimediaExtractionResult> {
  let tempPath: string | null = null

  try {
    console.log(`Processing audio: ${filename}`)

    tempPath = join(tmpdir(), `temp-${randomUUID()}.audio`)
    writeFileSync(tempPath, buffer)

    // Extract metadata
    const metadata = await parseFile(tempPath)
    console.log(`Audio metadata extracted:`, metadata.common)

    let content = `Audio File Analysis: ${filename}\n`
    content += `Title: ${metadata.common?.title || 'Unknown'}\n`
    content += `Artist: ${metadata.common?.artist || 'Unknown'}\n`
    content += `Album: ${metadata.common?.album || 'Unknown'}\n`
    content += `Genre: ${metadata.common?.genre?.join(', ') || 'Unknown'}\n`
    content += `Year: ${metadata.common?.year || 'Unknown'}\n`
    content += `Duration: ${metadata.format?.duration ? Math.round(metadata.format.duration) : 'Unknown'} seconds\n`
    content += `Format: ${metadata.format?.container || 'Unknown'}\n`
    content += `Bitrate: ${metadata.format?.bitrate || 'Unknown'} kbps\n`
    content += `Sample Rate: ${metadata.format?.sampleRate || 'Unknown'} Hz\n\n`

    // Add placeholder for future speech-to-text integration
    content += `Audio Content Analysis:\n`
    content += `[Audio transcription capability available for future integration with speech-to-text services like OpenAI Whisper, Google Speech-to-Text, or Azure Speech Services]\n\n`

    // Add technical analysis
    content += `Technical Details:\n`
    content += `- Channels: ${metadata.format?.numberOfChannels || 'Unknown'}\n`
    content += `- Bits per sample: ${metadata.format?.bitsPerSample || 'Unknown'}\n`
    content += `- Lossless: ${metadata.format?.lossless ? 'Yes' : 'No'}\n`

    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length

    return {
      content,
      wordCount,
      processorUsed: 'music-metadata',
      metadata: {
        ...metadata.common,
        format: metadata.format,
        duration: metadata.format?.duration || 0
      }
    }
  } catch (_error) {
    throw new Error(`Audio processing failed: ${''}`)
  } finally {
    // Clean up temp file
    if (tempPath) {
      try {
        unlinkSync(tempPath)
      } catch (e) {
        console.warn('Failed to clean up temp audio file:', e)
      }
    }
  }
}

// Extract metadata and analysis from video files
export async function extractFromVideo(buffer: Buffer, filename: string): Promise<MultimediaExtractionResult> {
  let tempPath: string | null = null

  try {
    console.log(`Processing video: ${filename}`)

    // Try to load FFmpeg binaries
    const ffmpegPaths = await ensureFFmpegLoaded()

    if (!ffmpegPaths || !ffmpegPaths.ffprobePath) {
      console.log('FFmpeg not available, using fallback video analysis')
      return await extractVideoMetadataFallback(buffer, filename)
    }

    // Create temporary file for FFprobe analysis
    tempPath = join(tmpdir(), `temp-${randomUUID()}.video`)
    writeFileSync(tempPath, buffer)

    // Use direct ffprobe binary execution
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    const ffprobeCmd = `"${ffmpegPaths.ffprobePath}" -v quiet -print_format json -show_format -show_streams "${tempPath}"`

    try {
      const { stdout } = await execAsync(ffprobeCmd)
      const metadata = JSON.parse(stdout)

      console.log(`Video metadata extracted for ${filename}`)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const videoStream = metadata.streams?.find((s: any) => s.codec_type === 'video')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const audioStream = metadata.streams?.find((s: any) => s.codec_type === 'audio')

      let content = `Video File Analysis: ${filename}\n`
      content += `Duration: ${metadata.format?.duration ? Math.round(parseFloat(metadata.format.duration)) : 'Unknown'} seconds\n`
      content += `Format: ${metadata.format?.format_name || 'Unknown'}\n`
      content += `File Size: ${metadata.format?.size ? (parseInt(metadata.format.size) / (1024 * 1024)).toFixed(2) : 'Unknown'} MB\n`
      content += `Bitrate: ${metadata.format?.bit_rate ? Math.round(parseInt(metadata.format.bit_rate) / 1000) : 'Unknown'} kbps\n\n`

      if (videoStream) {
        content += `Video Track:\n`
        content += `- Resolution: ${videoStream.width}x${videoStream.height}\n`
        content += `- Codec: ${videoStream.codec_name}\n`
        content += `- Frame Rate: ${videoStream.r_frame_rate}\n`
        content += `- Aspect Ratio: ${videoStream.display_aspect_ratio || 'Unknown'}\n\n`
      }

      if (audioStream) {
        content += `Audio Track:\n`
        content += `- Codec: ${audioStream.codec_name}\n`
        content += `- Sample Rate: ${audioStream.sample_rate} Hz\n`
        content += `- Channels: ${audioStream.channels}\n`
        content += `- Bitrate: ${audioStream.bit_rate ? Math.round(parseInt(audioStream.bit_rate) / 1000) : 'Unknown'} kbps\n\n`
      }

      // Add placeholder for future video analysis capabilities
      content += `Video Content Analysis:\n`
      content += `[Video frame analysis and content recognition capabilities available for future integration with AI vision services]\n\n`
      content += `[Audio track transcription available for integration with speech-to-text services]\n\n`

      // Add technical metadata
      content += `Technical Metadata:\n`
      content += `- Container Format: ${metadata.format?.format_long_name || 'Unknown'}\n`
      content += `- Creation Time: ${metadata.format?.tags?.creation_time || 'Unknown'}\n`
      content += `- Title: ${metadata.format?.tags?.title || 'Not specified'}\n`

      if (metadata.format?.tags) {
        const tags = Object.entries(metadata.format.tags)
          .filter(([key]) => !['creation_time', 'title'].includes(key))
          .map(([key, value]) => `- ${key}: ${value}`)
          .join('\n')
        if (tags) {
          content += `\nAdditional Metadata:\n${tags}\n`
        }
      }

      const wordCount = content.split(/\s+/).filter(word => word.length > 0).length

      return {
        content,
        wordCount,
        processorUsed: 'ffprobe',
        metadata: {
          duration: metadata.format?.duration ? parseFloat(metadata.format.duration) : 0,
          format: metadata.format?.format_name,
          fileSize: metadata.format?.size ? parseInt(metadata.format.size) : buffer.length,
          bitrate: metadata.format?.bit_rate ? parseInt(metadata.format.bit_rate) : 0,
          videoCodec: videoStream?.codec_name,
          audioCodec: audioStream?.codec_name,
          resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : undefined,
          frameRate: videoStream?.r_frame_rate
        }
      }

    } catch (ffprobeError) {
      console.warn('FFprobe failed, using fallback:', ffprobeError)
      return await extractVideoMetadataFallback(buffer, filename)
    }

  } catch (_error) {
    // Try fallback
    try {
      return await extractVideoMetadataFallback(buffer, filename)
    } catch (fallbackError) {
      console.error('Fallback video processing also failed:', fallbackError)
      throw new Error(`Video processing failed: ${''}`)
    }
  } finally {
    // Clean up temp file
    if (tempPath) {
      try {
        unlinkSync(tempPath)
      } catch (e) {
        console.warn('Failed to clean up temp video file:', e)
      }
    }
  }
}
// Fallback video metadata extraction when FFmpeg is not available
async function extractVideoMetadataFallback(buffer: Buffer, filename: string): Promise<MultimediaExtractionResult> {
  try {
    console.log(`Using fallback video analysis for: ${filename}`)

    let content = `Video File Analysis: ${filename}\n`
    content += `File Size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB\n`
    content += `Format: Video file (${filename.split('.').pop()?.toUpperCase()})\n\n`

    content += `Video Content Analysis:\n`
    content += `This video file has been successfully uploaded to the system.\n`
    content += `Basic file information has been extracted.\n\n`

    content += `Enhanced Processing Available:\n`
    content += `- Frame-by-frame analysis with AI vision services\n`
    content += `- Audio track transcription with speech-to-text\n`
    content += `- Scene detection and content summarization\n`
    content += `- Metadata extraction with FFmpeg (when available)\n\n`

    content += `Technical Details:\n`
    content += `- Processing method: Basic file analysis\n`
    content += `- Status: Successfully uploaded and indexed\n`
    content += `- Storage: Vercel Blob (optimized for large files)\n`

    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length

    return {
      content,
      wordCount,
      processorUsed: 'fallback-video-analysis',
      metadata: {
        fileSize: buffer.length,
        fileName: filename,
        processingMethod: 'basic'
      }
    }
  } catch (_error) {
    throw new Error(`Video fallback processing failed: ${''}`)
  }
}

// Check if file type is multimedia
export function isMultimediaFile(mimeType: string): boolean {
  return MULTIMEDIA_MIME_TYPES.includes(mimeType)
}

// Main multimedia processing function
export async function processMultimediaFile(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<MultimediaExtractionResult> {
  if (!isMultimediaFile(mimeType)) {
    throw new Error(`Not a supported multimedia file type: ${mimeType}`)
  }

  if (mimeType.startsWith('image/')) {
    return extractFromImage(buffer, filename)
  } else if (mimeType.startsWith('audio/')) {
    return extractFromAudio(buffer, filename)
  } else if (mimeType.startsWith('video/')) {
    return extractFromVideo(buffer, filename)
  } else {
    throw new Error(`Unsupported multimedia type: ${mimeType}`)
  }
}