declare module 'pptx-parser' {
  interface Slide {
    text: string[]
    notes?: string[]
  }

  export function parse(buffer: Buffer): Promise<Slide[]>
}