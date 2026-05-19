export function normalizeCheckoutEmail(input: {
  stateEmail?: string | null
  formEmail?: FormDataEntryValue | null
}) {
  const stateValue = String(input.stateEmail || '').trim()
  if (stateValue) {
    return stateValue
  }

  if (typeof input.formEmail === 'string') {
    return input.formEmail.trim()
  }

  return ''
}

export function isCheckoutEmailValid(email: string) {
  const value = String(email || '').trim()
  if (!value) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
