import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The server-side read client.
 *
 * Because a passcode member has no Supabase auth session (and therefore no
 * `auth.uid()` for RLS to key on), server-rendered reads run through the
 * service role — always behind a `requireViewer()` check that has already
 * confirmed the caller belongs here. This is the same "validate first, then use
 * the service role" pattern the public event drop-off links already rely on.
 *
 * It's a thin alias so the intent reads clearly at call sites and there's one
 * obvious place to revisit if the access model changes.
 */
export function readDb() {
  return createAdminClient()
}
