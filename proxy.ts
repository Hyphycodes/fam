import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase session cookie on every request, so a family member
 * who opens the app after a month is still signed in rather than bounced to a
 * login screen.
 *
 * Public paths: the login flow itself, and `/add/<token>` — the shareable
 * "drop your photos from the cookout here" links, which are meant for people
 * without an account.
 */

const PUBLIC_PREFIXES = ['/enter', '/login', '/auth', '/add', '/setup', '/offline', '/manifest.webmanifest', '/sw.js']

function isPublic(pathname: string): boolean {
  /*
   * API routes are never redirected. Two reasons:
   *  - /api/auth/magic-link is called by a signed-out person. Redirecting it
   *    means the very first sign-in link can never be requested, and nobody can
   *    ever get into the app.
   *  - Every other route already answers a signed-out caller with a JSON 401.
   *    An HTML login page is a baffling thing for a fetch() to receive, and the
   *    upload client would parse it as an empty object and fail obscurely.
   */
  if (pathname.startsWith('/api/')) return true

  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Not configured yet — let the setup screen explain itself.
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  let user = null
  try {
    ;({
      data: { user },
    } = await supabase.auth.getUser())
  } catch {
    // Supabase unreachable. Fall through to the entry redirect rather than
    // failing every request in the app with a 500.
  }

  // A passcode member has no Supabase user, only our own session cookie. This is
  // a cheap presence check; the real validation (is the token a live session?)
  // happens at the page/route level in requireViewer(). A forged cookie only
  // gets past the middleware to be turned away there.
  const hasMemberCookie = Boolean(request.cookies.get('fam_session')?.value)

  const { pathname } = request.nextUrl
  if (!user && !hasMemberCookie && !isPublic(pathname)) {
    const enterUrl = request.nextUrl.clone()
    enterUrl.pathname = '/enter'
    // Come back to where they were trying to go once they're in.
    if (pathname !== '/') enterUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(enterUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static files — matching images here
     * would add an auth round trip to every thumbnail.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|woff2?)$).*)',
  ],
}
