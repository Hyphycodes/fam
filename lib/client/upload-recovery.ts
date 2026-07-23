import type { CropMetadata } from '@/lib/types'
import type { UploadContext, ItemStatus } from '@/lib/client/uploader'
import type { FileIdentity } from '@/lib/client/upload-logic'

const DATABASE = 'reel-upload-recovery'
const STORE = 'uploads'
const VERSION = 1
let writes = Promise.resolve()

export interface UploadRecoveryRecord {
  id: string
  file: FileIdentity
  kind: 'photo' | 'video'
  status: ItemStatus
  progress: number
  contentHash?: string
  crop?: CropMetadata | null
  durationSeconds?: number | null
  mediaId?: string
  uploadUrl?: string
  context: UploadContext
  error?: string
  warning?: string
  updatedAt: number
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

async function withStore(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest | void,
): Promise<void> {
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE, mode)
    run(transaction.objectStore(STORE))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
  db.close()
}

export async function saveRecoveryRecord(record: UploadRecoveryRecord): Promise<void> {
  writes = writes.then(
    () => withStore('readwrite', (store) => store.put(record)),
    () => withStore('readwrite', (store) => store.put(record)),
  )
  await writes
}

export async function removeRecoveryRecord(id: string): Promise<void> {
  writes = writes.then(
    () => withStore('readwrite', (store) => store.delete(id)),
    () => withStore('readwrite', (store) => store.delete(id)),
  )
  await writes
}

export async function loadRecoveryRecords(): Promise<UploadRecoveryRecord[]> {
  const db = await openDatabase()
  if (!db) return []
  const records = await new Promise<UploadRecoveryRecord[]>((resolve) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve((request.result ?? []) as UploadRecoveryRecord[])
    request.onerror = () => resolve([])
  })
  db.close()
  return records.sort((a, b) => a.updatedAt - b.updatedAt)
}
