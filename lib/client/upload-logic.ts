export interface FileIdentity {
  name: string
  size: number
  lastModified: number
  type: string
}

export function fileSignature(file: FileIdentity): string {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`
}

export function boundedOverallProgress(items: { progress: number }[]): number {
  if (items.length === 0) return 0
  const total = items.reduce((sum, item) => sum + Math.min(1, Math.max(0, item.progress)), 0)
  return Math.round((total / items.length) * 100)
}

export function matchRecoveredFiles<T extends FileIdentity, R extends { file: FileIdentity }>(
  records: R[],
  files: T[],
): { matches: { record: R; file: T }[]; missing: R[] } {
  const bySignature = new Map<string, T[]>()
  for (const file of files) {
    const signature = fileSignature(file)
    const group = bySignature.get(signature) ?? []
    group.push(file)
    bySignature.set(signature, group)
  }

  const matches: { record: R; file: T }[] = []
  const missing: R[] = []
  for (const record of records) {
    const group = bySignature.get(fileSignature(record.file))
    const file = group?.shift()
    if (file) matches.push({ record, file })
    else missing.push(record)
  }
  return { matches, missing }
}
