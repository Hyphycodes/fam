/**
 * A `?next=` value is attacker-supplied. `startsWith('/')` is not enough:
 * `//evil.com` and `/\evil.com` are both protocol-relative and resolve to a
 * different origin entirely, which turns the sign-in flow into an open redirect
 * anyone can put in front of a phishing page.
 */
export function safeNext(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback
  if (!value.startsWith('/')) return fallback
  // Reject protocol-relative and backslash-escaped forms.
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
