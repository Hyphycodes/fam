import 'server-only'

/**
 * A reaction or comment hangs on exactly one subject: a media item or a
 * collection (an event on the board). One tiny helper keeps the two routes —
 * `/api/media/[id]/...` and `/api/collections/[id]/...` — sharing all their
 * logic and differing only in which column they filter and insert.
 */
export type SubjectKind = 'media' | 'collection'

export function subjectColumn(kind: SubjectKind): 'media_id' | 'collection_id' {
  return kind === 'media' ? 'media_id' : 'collection_id'
}
