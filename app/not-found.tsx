import { ArchiveState } from '@/components/ArchiveState'

export default function NotFound() {
  return (
    <ArchiveState
      eyebrow="A missing frame"
      title="That memory isn’t here."
      message="It may have been moved, or the link may be incomplete. The rest of the family archive is right where you left it."
      action={{ href: '/', label: 'Return to the archive' }}
    />
  )
}
