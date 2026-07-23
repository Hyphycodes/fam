export const metadata = { title: 'Offline' }

export default function OfflinePage() {
  return (
    <main className="lamplight relative flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-sm">
        <h1 className="font-display text-title leading-tight text-balance">
          No signal right now.
        </h1>
        <p className="mt-4 leading-relaxed text-paper-soft">
          Previously loaded pages may still be available. New items require a connection.
        </p>
        {/* A real navigation, not a client-side one: the point is to retry the
            network from scratch once signal is back. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="btn btn-ghost mt-8">
          Try again
        </a>
      </div>
    </main>
  )
}
