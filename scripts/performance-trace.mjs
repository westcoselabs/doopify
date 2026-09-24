// Counts SQL without logging query text, parameters, or credentials.
import pg from 'pg'
import { appendFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
const query = pg.Client.prototype.query
pg.Client.prototype.query = function (...args) {
  const started = performance.now()
  const finish = () => appendFileSync('.next/performance-queries.ndjson', JSON.stringify({ at: Date.now(), ms: performance.now() - started }) + '\n')
  const callbackIndex = args.findIndex((value) => typeof value === 'function')
  if (callbackIndex >= 0) {
    const callback = args[callbackIndex]
    args[callbackIndex] = (...values) => { finish(); return callback(...values) }
    return query.apply(this, args)
  }
  const result = query.apply(this, args)
  return result && typeof result.then === 'function' ? result.finally(finish) : result
}
