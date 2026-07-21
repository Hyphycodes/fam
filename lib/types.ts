export type Role = 'owner' | 'family'
export type MediaType = 'photo' | 'video'
export type MediaStatus = 'processing' | 'ready' | 'error'

export interface Profile {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
  role: Role
  created_at: string
}

export interface EventRow {
  id: string
  name: string
  event_date: string | null
  cover_media_id: string | null
  created_by: string | null
  created_at: string
}

export interface MediaRow {
  id: string
  uploader_id: string | null
  uploader_label: string | null
  type: MediaType
  stream_uid: string | null
  duration_seconds: number | null
  r2_key: string | null
  r2_display_key: string | null
  r2_thumb_key: string | null
  poster_url: string | null
  mime_type: string | null
  original_filename: string | null
  byte_size: number | null
  width: number | null
  height: number | null
  caption: string | null
  favorite: boolean
  tags: string[]
  taken_at: string
  event_id: string | null
  upload_link_id: string | null
  status: MediaStatus
  error_reason: string | null
  created_at: string
  taken_month: number
  taken_day: number
  taken_year: number
}

export interface Person {
  id: string
  name: string
  profile_id: string | null
  created_at: string
}

export interface Reaction {
  id: string
  media_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface Comment {
  id: string
  media_id: string
  user_id: string
  body: string
  created_at: string
}

export interface VoiceNote {
  id: string
  media_id: string
  user_id: string
  r2_key: string
  duration_seconds: number | null
  mime_type: string | null
  created_at: string
}

export interface MusicTrack {
  id: string
  title: string
  r2_key: string
  uploaded_by: string | null
  sort_order: number
  created_at: string
}

export interface EventUploadLink {
  id: string
  event_id: string
  token: string
  label: string | null
  created_by: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

/**
 * A media row with everything the UI needs already resolved: signed URLs, the
 * uploader's name, reaction/comment counts. Built by `lib/media.ts` so a page
 * never has to think about signing.
 */
export interface MediaView extends MediaRow {
  uploader_name: string
  event_name: string | null
  /** Full-size display image (photos) or Stream poster frame (videos). */
  display_url: string | null
  /** Small image for feed/grid contexts. */
  thumb_url: string | null
  /** HLS manifest for videos. */
  hls_url: string | null
  /** Stream iframe player URL for videos. */
  iframe_url: string | null
  /** Signed link to the untouched original. */
  download_url: string | null
  reaction_count: number
  comment_count: number
  voice_note_count: number
  people: { id: string; name: string }[]
}
