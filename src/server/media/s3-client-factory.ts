import { Client } from 'minio'
import * as http from 'node:http'
import * as https from 'node:https'

export function createS3Client(config: { region: string; accessKeyId: string; secretAccessKey: string; endpoint?: string }, requestTimeoutMs = 30_000) {
  const endpoint = config.endpoint ? new URL(config.endpoint.includes('://') ? config.endpoint : `https://${config.endpoint}`) : null
  const native = endpoint?.protocol === 'http:' ? http : https
  // Minio uses Node's request transport. Abort the real socket, including a
  // stalled response body; racing a timer against the SDK would leave I/O alive.
  const request: typeof http.request = (input: string | URL | http.RequestOptions, optionsOrCallback?: http.RequestOptions | ((response: http.IncomingMessage) => void), callback?: (response: http.IncomingMessage) => void) => {
    const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : {}
    const onResponse = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback
    const signal = AbortSignal.timeout(requestTimeoutMs)
    return typeof input === 'string' || input instanceof URL
      ? native.request(input, { ...options, signal }, onResponse)
      : native.request({ ...input, signal }, onResponse)
  }
  return new Client({
    endPoint: endpoint?.hostname ?? 's3.amazonaws.com',
    useSSL: endpoint ? endpoint.protocol === 'https:' : true,
    port: endpoint?.port ? Number(endpoint.port) : undefined,
    region: config.region,
    accessKey: config.accessKeyId,
    secretKey: config.secretAccessKey,
    pathStyle: Boolean(endpoint),
    transport: { request },
    retryOptions: { disableRetry: true },
  })
}
