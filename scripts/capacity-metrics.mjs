export const routes = ['/shop', '/shop', '/shop', '/shop', '/shop', '/shop', '/collections/performance-collection-0', '/collections/performance-collection-1', '/shop/performance-product-20', '/admin/settings/shipping']

export function requestTarget(index) {
  // Rotate each ten-request cycle so route parity cannot pin a replica.
  return { route: routes[index % routes.length], replica: (index + Math.floor(index / routes.length)) % 2 }
}

export function percentiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  const at = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null
  return { samples: sorted.length, p50: at(.5), p95: at(.95), p99: at(.99), max: sorted.at(-1) ?? null }
}

function summary(records) {
  return { requests: records.length, failures: records.filter(row => row.failed).length,
    latency: Object.fromEntries(['schedulingMs', 'headersMs', 'bodyMs', 'totalMs', 'bytes'].map(key => [key, percentiles(records.map(row => row[key]))])) }
}

export function summarizeRequests(records) {
  const group = key => Object.fromEntries([...Map.groupBy(records, key)].map(([label, values]) => [label, summary(values)]))
  return { ...summary(records), byRoute: group(row => row.route), byReplica: group(row => row.replica), byWindow: group(row => row.window), byRouteReplica: group(row => `${row.route}@${row.replica}`) }
}

export function intervalUnionMs(intervals) {
  let total = 0, end = -Infinity
  for (const [start, finish] of [...intervals].sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, finish - Math.max(start, end))
    end = Math.max(end, finish)
  }
  return total
}
