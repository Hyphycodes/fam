import { NextResponse } from 'next/server'
import { safeNext } from '@/lib/safe-redirect'
import { createClient } from '@/lib/supabase/server'

/**
 * Where the magic link lands. Trades the one-time code for a session cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const destination = safeNext(url.searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing-code', url.origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // The commonest cause by far is a link that's been sitting in an inbox for
    // a day, or one already opened once.
    const reason = /expired|invalid/i.test(error.message) ? 'expired' : 'failed'
    return NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin))
  }

  return NextResponse.redirect(new URL(destination, url.origin))
}
