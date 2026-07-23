export interface DatedUpload {
  created_at: string
}

/**
 * Upload rows arrive newest-first. A twenty-minute quiet gap is a practical
 * batch boundary for existing data that predates explicit batch IDs, while
 * still keeping a slower phone upload together.
 */
export function latestUploadBatch<T extends DatedUpload>(memories: T[]): T[] {
  if (memories.length === 0) return []
  const batch = [memories[0]]
  for (let index = 1; index < memories.length; index += 1) {
    const previous = new Date(memories[index - 1].created_at).getTime()
    const current = new Date(memories[index].created_at).getTime()
    if (
      !Number.isFinite(previous) ||
      !Number.isFinite(current) ||
      previous - current > 20 * 60_000
    ) {
      break
    }
    batch.push(memories[index])
  }
  return batch
}
