import { err, ok } from '@/lib/api'
import { requireAdminOrAbove } from '@/server/auth/require-auth'
import {
  MAX_DIGITAL_ASSET_UPLOAD_BYTES,
  PrivateDigitalAssetStorageConfigError,
  deriveDigitalAssetTitle,
  hashDigitalAssetBufferSha256,
  resolveValidatedDigitalAssetContentType,
  sanitizeDigitalAssetFileName,
  storePrivateDigitalAssetFile,
} from '@/server/services/digital-asset-upload.service'
import { createDigitalAssetMetadata } from '@/server/services/digital-asset.service'
import { getStoreSettingsLite } from '@/server/services/settings.service'

export const runtime = 'nodejs'

async function requireStoreId() {
  const store = await getStoreSettingsLite()
  if (!store?.id) {
    throw new Error('Store is not configured')
  }
  return store.id
}

export async function POST(req: Request) {
  const auth = await requireAdminOrAbove(req)
  if (!auth.ok) return auth.response

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const uploadedTitle = formData.get('title')

    if (!(file instanceof File)) {
      return err('No file provided')
    }

    if (file.size <= 0) {
      return err('File is empty')
    }

    if (file.size > MAX_DIGITAL_ASSET_UPLOAD_BYTES) {
      return err('File too large. Maximum size is 25 MB.')
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length <= 0) {
      return err('File is empty')
    }

    const validatedContentType = resolveValidatedDigitalAssetContentType(buffer, file.type)
    if (!validatedContentType.ok) {
      return err(validatedContentType.error)
    }

    const storeId = await requireStoreId()
    const safeFileName = sanitizeDigitalAssetFileName(file.name || 'file')
    const safeTitle = deriveDigitalAssetTitle(
      safeFileName,
      typeof uploadedTitle === 'string' ? uploadedTitle : null
    )

    const storage = await storePrivateDigitalAssetFile({
      storeId,
      fileName: safeFileName,
      contentType: validatedContentType.contentType,
      buffer,
    })

    const createdAsset = await createDigitalAssetMetadata(storeId, {
      title: safeTitle,
      fileName: safeFileName,
      contentType: validatedContentType.contentType,
      byteSize: buffer.length,
      storageProvider: storage.storageProvider,
      storageKey: storage.storageKey,
      checksumSha256: hashDigitalAssetBufferSha256(buffer),
    })

    return ok(
      {
        asset: {
          id: createdAsset.id,
          title: createdAsset.title,
          fileName: createdAsset.fileName,
          contentType: createdAsset.contentType,
          byteSize: createdAsset.byteSize,
          createdAt: createdAsset.createdAt,
        },
      },
      201
    )
  } catch (error) {
    if (error instanceof PrivateDigitalAssetStorageConfigError) {
      return err(error.message, 400)
    }

    console.error('[POST /api/digital-assets/upload]', error)
    return err('Failed to upload digital asset', 500)
  }
}
