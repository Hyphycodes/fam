export default function Loading() {
  return (
    <main
      className="lamplight relative mx-auto min-h-dvh w-full max-w-5xl px-5 pt-24 pb-32 sm:px-6 sm:pt-32"
      aria-busy="true"
      aria-label="Opening the family archive"
    >
      <div className="h-3 w-36 animate-sweep rounded-full" />
      <div className="mt-6 h-16 w-[min(85%,34rem)] animate-sweep rounded-2xl sm:h-24" />
      <div className="mt-4 h-16 w-[min(65%,26rem)] animate-sweep rounded-2xl sm:h-24" />
      <div className="mt-16 aspect-[16/9] w-full animate-sweep rounded-3xl" />
      <p className="sr-only">Opening the family archive…</p>
    </main>
  )
}
