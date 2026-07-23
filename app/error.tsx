'use client'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="lamplight relative grid min-h-dvh place-items-center px-6 py-20">
      <div className="w-full max-w-2xl border-y border-edge py-14 text-center sm:py-20">
        <p className="eyebrow">Error</p>
        <h1 className="mt-5 font-display text-[clamp(3.25rem,10vw,6.5rem)] leading-[0.88] tracking-[-0.035em] text-balance">
          This page did not load.
        </h1>
        <p className="mx-auto mt-7 max-w-lg text-base leading-relaxed text-paper-dim sm:text-lg">
          Try loading it again. No data was changed.
        </p>
        <button type="button" onClick={reset} className="btn btn-primary mt-9">
          Try again
        </button>
      </div>
    </main>
  )
}
