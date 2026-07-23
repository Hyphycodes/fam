import { redirect } from 'next/navigation'

/**
 * Browse became the Timeline. Its discovery role — media-type, person, and
 * jump-to-year — now lives inside `/timeline` as filters and the decades rail.
 * Old links and bookmarks land there instead of 404-ing.
 */
export default function BrowsePage() {
  redirect('/timeline')
}
