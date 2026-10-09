import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it } from 'vitest'
import { createS3Client } from './s3-client-factory'

it('aborts an S3 request that never returns instead of leaving the socket running', async () => {
  const server = createServer(() => { /* Deliberately never send response headers. */ })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected loopback port')
  const client = createS3Client({ endpoint: `http://127.0.0.1:${address.port}`, region: 'us-east-1', accessKeyId: 'test-only-access', secretAccessKey: 'test-only-secret' }, 25)
  try {
    await expect(client.statObject('test-bucket', 'object')).rejects.toMatchObject({ name: 'AbortError' })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
