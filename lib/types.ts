import type { CapturePrecision, CaptureSource } from '@/lib/format'

export type Role = 'owner' | 'family'
export type MemberRole = 'owner' | 'member'
export type MediaType = 'photo' | 'video'
export type MediaStatus = 'processing' | 'ready' | 'error'
/** How a media focal point was set: center (unknown), face detection, or a person. */
export type FocalSource = 'default' | 'face' | 'user'
export type CollectionKind = 'album' | 'event'
/** The full arc; only planned + completed ship now (upcoming/live are prompt 09). */
export type EventStatus = 'planned' | 'upcoming' | 'live' | 'completed'

/**
 * A community member. The passcode-era identity, decoupled from auth.users.
 * `avatar_url` is resolved from `avatar_path` in the public avatars bucket.
 */
export interface Member {
  id: string
  first_name: string
  last_initial: string | null
  display_name: string
  login_key: string
  avatar_path: string | null
  avatar_url: string | null
  role: MemberRole
  created_at: string
  last_seen_at: string | null
}

/**
 * Whoever is looking at the app right now — a passcode member, or a legacy
 * magic-link account. Everything the chrome needs, from either identity.
 */
export interface Viewer {
  kind: 'member' | 'legacy'
  id: string
  display_name: string
  avatar_url: string | null
  role: MemberRole
  /** Present only for members, for community writes that attribute to member_id. */
  memberId: string | null
}

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
  // Community layer. The physical table is `events`; kind distinguishes a
  // community-board event from a quiet album.
  kind: CollectionKind
  description: string | null
  created_by_member: string | null
  flyer_path: string | null
  // Lifecycle (prompt 04). event_date stays the when-it-happened date; starts_at
  // / ends_at are a plan's intended window (may be null).
  status: EventStatus
  starts_at: string | null
  ends_at: string | null
  location: string | null
  /** Set when this event was merged into another (soft delete); reads hide it. */
  merged_into: string | null
  // Edit provenance (prompt 10d). Null until a field is edited after creation.
  last_edited_at: string | null
  last_edited_by: string | null
  last_edited_by_member: string | null
}

/** A board event with everything the feed needs resolved. */
export interface BoardEvent {
  id: string
  name: string
  event_date: string | null
  description: string | null
  flyer_url: string | null
  cover_url: string | null
  /** The explicitly-chosen cover frame, if any (for the editor's picker). */
  cover_media_id: string | null
  /** Focal point of the cover, when it came from a media frame (else centered). */
  cover_focal_x: number
  cover_focal_y: number
  host_name: string | null
  host_avatar_url: string | null
  media_count: number
  comment_count: number
  created_at: string
  status: EventStatus
  starts_at: string | null
  location: string | null
  merged_into: string | null
  /** Who last edited a field, resolved for display, and when (null = untouched). */
  editor_name: string | null
  last_edited_at: string | null
}

/** The domain name for the events table. An event is a collection with kind='event'. */
export type Collection = EventRow

export type ArtifactType = 'flyer' | 'image_doc' | 'pdf' | 'audio' | 'link'

export interface EventArtifact {
  id: string
  event_id: string
  type: ArtifactType
  storage_key: string | null
  url: string | null
  title: string | null
  caption: string | null
  captured_at: string | null
  sort_order: number
  created_at: string
}

export type SoundtrackProvider = 'apple_music' | 'spotify' | 'other'

export interface SoundtrackView {
  id: string
  event_id: string
  provider: SoundtrackProvider
  external_url: string
  title: string | null
  artwork_url: string | null
  track_count: number | null
}

/** An artifact with its content resolved for rendering. */
export interface ArtifactView {
  id: string
  event_id: string
  type: ArtifactType
  title: string | null
  caption: string | null
  captured_at: string | null
  /** Presigned GET for uploaded types, or the external URL for links. */
  href: string | null
  /** For link artifacts: the bare domain, for a favicon and a label. */
  domain: string | null
}

/** A tagged person: a member (with avatar) or a free-text name. */
export interface TaggedPerson {
  id: string
  name: string
  member_id: string | null
  profile_id: string | null
  avatar_url: string | null
}

/** The author of a reaction or comment, resolved for display. */
export interface Author {
  id: string
  display_name: string
  avatar_url: string | null
}

export interface MediaRow {
  id: string
  uploader_id: string | null
  uploader_member: string | null
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
  content_hash: string | null
  location_text: string | null
  crop_metadata: CropMetadata | null
  caption: string | null
  favorite: boolean
  tags: string[]
  taken_at: string
  /** How precise `taken_at` is; governs display. Defaults to 'day' if absent. */
  taken_precision: CapturePrecision
  /** Provenance of `taken_at`. 'upload_fallback' is the review backlog. */
  taken_source: CaptureSource
  /** Focal point 0..1 for object-position when a cover crops this image. */
  focal_x: number
  focal_y: number
  /** How the focal point was set. A 'user' placement is never overwritten. */
  focal_source: FocalSource
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
  member_id: string | null
  created_at: string
}

export type CropAspect = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9' | '9:16'

export interface CropMetadata {
  aspect: CropAspect
  /** Custom output ratio when aspect='free'. */
  freeAspect?: number
  zoom: number
  x: number
  y: number
  rotation: 0 | 90 | 180 | 270
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
  /** The human-legible filename `download_url` should be saved as. */
  download_filename: string | null
  reaction_count: number
  comment_count: number
  voice_note_count: number
  people: TaggedPerson[]
  /** The uploader's avatar, when they're a community member. */
  uploader_avatar_url: string | null
}
