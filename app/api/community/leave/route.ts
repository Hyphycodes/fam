import { NextResponse } from 'next/server'
import { handleError } from '@/lib/api'
import { signOutMember } from '@/lib/member'
import { appUrl } from '@/lib/env'

/** Sign the current member out and send them back to the door. */
export async function POST() {
  try {
    await signOutMember()
    return NextResponse.redirect(new URL('/enter', appUrl()), { status: 303 })
  } catch (error) {
    return handleError(error, 'community/leave')
  }
}
