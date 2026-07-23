'use client'

/**
 * A plain `<a download>` to a Content-Disposition: attachment URL lands in
 * iOS's Files app (or a "save to Drive" prompt if that's installed) — Safari
 * never offers "Save to Photos" for something it treats as a generic file
 * download. The only thing that opens the native share sheet with a "Save
 * Image"/"Save Video" option is the Web Share API given an actual image/video
 * File, so that's the primary path here; a plain link download is the
 * fallback for browsers that can't share files (most desktop browsers).
 */

const MAX_SHARE_BYTES = 300 * 1024 * 1024

export function DownloadButton({
  url,
  filename,
  mimeType,
  byteSize,
  className,
  children,
}: {
  url: string
  filename: string | null
  mimeType: string | null
  byteSize: number | null
  className?: string
  children: React.ReactNode
}) {
  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    const canShareFiles =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function'
    if (!canShareFiles || (byteSize != null && byteSize > MAX_SHARE_BYTES)) return

    event.preventDefault()
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const file = new File([blob], filename || 'download', { type: mimeType || blob.type })
      if (!navigator.canShare({ files: [file] })) throw new Error('canShare declined this file')
      await navigator.share({ files: [file] })
      return
    } catch (error) {
      // AbortError just means the person closed the share sheet — not a failure.
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('[reel] share-to-save failed, falling back to a plain download', error)
    }

    const link = document.createElement('a')
    link.href = url
    link.download = filename || ''
    link.click()
  }

  return (
    <a href={url} onClick={handleClick} className={className}>
      {children}
    </a>
  )
}
