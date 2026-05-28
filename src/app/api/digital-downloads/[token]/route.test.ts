import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveDigitalDownloadByToken: vi.fn(),
}))

vi.mock('@/server/services/digital-download-access.service', () => ({
  resolveDigitalDownloadByToken: mocks.resolveDigitalDownloadByToken,
}))

import { GET } from './route'

describe('GET /api/digital-downloads/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns attachment response with no-store headers for valid grants', async () => {
    mocks.resolveDigitalDownloadByToken.mockResolvedValue({
      ok: true,
      result: 'ALLOWED',
      grantId: 'grant_1',
      file: {
        fileName: 'Guide "2026".pdf',
        contentType: 'application/pdf',
        byteSize: 8,
        bytes: Buffer.from('pdf-data', 'utf8'),
      },
    })

    const response = await GET(new Request('http://localhost/api/digital-downloads/raw-token'), {
      params: Promise.resolve({ token: 'raw-token' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength('pdf-data')))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="Guide 2026.pdf"')
    expect(Buffer.from(await response.arrayBuffer()).toString('utf8')).toBe('pdf-data')
  })

  it('returns safe invalid token response', async () => {
    mocks.resolveDigitalDownloadByToken.mockResolvedValue({
      ok: false,
      result: 'INVALID_TOKEN',
    })

    const response = await GET(new Request('http://localhost/api/digital-downloads/bad-token'), {
      params: Promise.resolve({ token: 'bad-token' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload).toEqual({
      success: false,
      error: 'Download link is invalid or unavailable.',
    })
    expect(JSON.stringify(payload)).not.toContain('storageKey')
    expect(JSON.stringify(payload)).not.toContain('https://')
  })

  it('returns explicit status codes for expired/revoked/exhausted tokens', async () => {
    mocks.resolveDigitalDownloadByToken
      .mockResolvedValueOnce({ ok: false, result: 'DENIED_EXPIRED', grantId: 'grant_1' })
      .mockResolvedValueOnce({ ok: false, result: 'DENIED_REVOKED', grantId: 'grant_1' })
      .mockResolvedValueOnce({ ok: false, result: 'DENIED_EXHAUSTED', grantId: 'grant_1' })

    const expired = await GET(new Request('http://localhost/api/digital-downloads/expired-token'), {
      params: Promise.resolve({ token: 'expired-token' }),
    })
    const revoked = await GET(new Request('http://localhost/api/digital-downloads/revoked-token'), {
      params: Promise.resolve({ token: 'revoked-token' }),
    })
    const exhausted = await GET(new Request('http://localhost/api/digital-downloads/exhausted-token'), {
      params: Promise.resolve({ token: 'exhausted-token' }),
    })

    expect(expired.status).toBe(410)
    expect(await expired.json()).toEqual({
      success: false,
      error: 'Download link has expired.',
    })
    expect(revoked.status).toBe(410)
    expect(await revoked.json()).toEqual({
      success: false,
      error: 'Download link is no longer available.',
    })
    expect(exhausted.status).toBe(410)
    expect(await exhausted.json()).toEqual({
      success: false,
      error: 'Download limit reached for this file.',
    })
  })

  it('returns safe unavailable response for denied-other failures', async () => {
    mocks.resolveDigitalDownloadByToken.mockResolvedValue({
      ok: false,
      result: 'DENIED_OTHER',
      grantId: 'grant_1',
    })

    const response = await GET(new Request('http://localhost/api/digital-downloads/unavailable-token'), {
      params: Promise.resolve({ token: 'unavailable-token' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload).toEqual({
      success: false,
      error: 'Download is unavailable.',
    })
  })

  it('returns safe server response when resolver throws', async () => {
    mocks.resolveDigitalDownloadByToken.mockRejectedValue(new Error('s3://bucket/private/file.pdf'))

    const response = await GET(new Request('http://localhost/api/digital-downloads/fail-token'), {
      params: Promise.resolve({ token: 'fail-token' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({
      success: false,
      error: 'Download is unavailable.',
    })
    expect(JSON.stringify(payload)).not.toContain('s3://')
    expect(JSON.stringify(payload)).not.toContain('storageKey')
  })
})
