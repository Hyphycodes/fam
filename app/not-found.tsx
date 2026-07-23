import { ArchiveState } from '@/components/ArchiveState'

export default function NotFound() {
  return (
    <ArchiveState
      eyebrow="Not found"
      title="That item isn’t available."
      message="It may have been deleted, or the link may be incomplete."
      action={{ href: '/', label: 'Go home' }}
    />
  )
}
