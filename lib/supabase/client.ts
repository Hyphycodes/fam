'use client'

import { createBrowserClient } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from '@/lib/env'

let cached: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  cached ??= createBrowserClient(supabaseUrl(), supabaseAnonKey())
  return cached
}
