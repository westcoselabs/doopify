import 'server-only'
import type { Client } from 'minio'
import { createS3Client } from './s3-client-factory'
export { createS3Client } from './s3-client-factory'
import { env } from '@/lib/env'

export function getS3StorageConfig() {
  const { MEDIA_S3_REGION: region, MEDIA_S3_BUCKET: bucket, MEDIA_S3_ACCESS_KEY_ID: accessKeyId, MEDIA_S3_SECRET_ACCESS_KEY: secretAccessKey } = env
  if (!region || !bucket || !accessKeyId || !secretAccessKey) return null
  return { region, bucket, accessKeyId, secretAccessKey, endpoint: env.MEDIA_S3_ENDPOINT, publicBaseUrl: env.MEDIA_PUBLIC_BASE_URL }
}

let privateClient: Client | undefined
export function getPrivateS3Storage() {
  const config = getS3StorageConfig()
  if (!config) throw new Error('Private S3 storage requires MEDIA_S3_REGION, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID, and MEDIA_S3_SECRET_ACCESS_KEY.')
  privateClient ??= createS3Client(config)
  return { bucket: config.bucket, client: privateClient }
}
