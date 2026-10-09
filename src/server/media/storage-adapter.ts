export type MediaStorageProvider = 'postgres' | 's3' | 'vercel-blob'

export type PutMediaObjectInput = {
  filename: string
  altText?: string | null
  mimeType: string
  size: number
  buffer: Buffer
  productId?: string | null
}

export type PutMediaObjectResult = {
  id: string
  provider: MediaStorageProvider
  url: string
  filename: string
  altText: string | null
  mimeType: string
  size: number | null
  createdAt: Date
  linkedProducts: number
}

export type GetMediaObjectResult = {
  body?: Buffer
  stream?: ReadableStream<Uint8Array>
  redirectUrl?: string
  mimeType: string
  filename: string
  size?: number | null
  cacheControl: string
}

export type MediaStorageAdapter = {
  provider: MediaStorageProvider
  put(input: PutMediaObjectInput): Promise<PutMediaObjectResult>
  get(assetId: string, signal?: AbortSignal): Promise<GetMediaObjectResult | null>
  delete(assetId: string): Promise<void>
  getPublicUrl(assetId: string): string
}

export const PUBLIC_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable'
