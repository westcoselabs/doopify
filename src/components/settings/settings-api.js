export async function settingsRequest(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    const details = Object.entries(body?.details?.fieldErrors || {}).flatMap(([field, messages]) => Array.isArray(messages) ? messages.map(message => field + ': ' + message) : []);
    const error = new Error([body?.error || "The request could not be completed.", ...details].join(' '));
    error.details = body?.details;
    throw error;
  }
  return body.data;
}

export function jsonRequest(method, value) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  };
}
