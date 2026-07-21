import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { supabaseServiceKey, supabaseUrl } from '@/lib/env'

/**
 * Service-role client. Bypasses RLS entirely — only ever use it behind a check
 * you've already made yourself (a verified session, or a validated event-upload
 * token). Never import this into a client component; `server-only` will fail
 * the build if you try.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
