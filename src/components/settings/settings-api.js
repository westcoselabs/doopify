export async function settingsRequest(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success)
    throw new Error(body?.error || "The request could not be completed.");
  return body.data;
}

export function jsonRequest(method, value) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  };
}
