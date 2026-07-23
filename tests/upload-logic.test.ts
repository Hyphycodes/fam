import assert from 'node:assert/strict'
import test from 'node:test'
import { latestUploadBatch } from '../lib/client/albums.ts'
import {
  boundedOverallProgress,
  fileSignature,
  matchRecoveredFiles,
} from '../lib/client/upload-logic.ts'

test('file signatures distinguish otherwise similar selections', () => {
  const base = {
    name: 'IMG_1001.HEIC',
    size: 4_200_000,
    lastModified: 1_720_000_000_000,
    type: 'image/heic',
  }
  assert.equal(fileSignature(base), fileSignature({ ...base }))
  assert.notEqual(fileSignature(base), fileSignature({ ...base, size: base.size + 1 }))
})

test('recovery matching consumes duplicate signatures once each', () => {
  const identity = {
    name: 'clip.mov',
    size: 10_000,
    lastModified: 1_720_000_000_000,
    type: 'video/quicktime',
  }
  const records = [
    { id: 'one', file: identity },
    { id: 'two', file: identity },
  ]
  const result = matchRecoveredFiles(records, [{ ...identity, selected: 'first' }])

  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0].record.id, 'one')
  assert.deepEqual(
    result.missing.map((record) => record.id),
    ['two'],
  )
})

test('overall progress is real, bounded, and stable for an empty queue', () => {
  assert.equal(boundedOverallProgress([]), 0)
  assert.equal(boundedOverallProgress([{ progress: 0.25 }, { progress: 0.75 }]), 50)
  assert.equal(boundedOverallProgress([{ progress: -1 }, { progress: 2 }]), 50)
})

test('latest album batch stops at the first twenty-minute upload gap', () => {
  const memories = [
    { id: 'newest', created_at: '2026-07-23T12:30:00.000Z' },
    { id: 'same-batch', created_at: '2026-07-23T12:11:00.000Z' },
    { id: 'older-batch', created_at: '2026-07-23T11:40:00.000Z' },
  ]

  assert.deepEqual(
    latestUploadBatch(memories).map((memory) => memory.id),
    ['newest', 'same-batch'],
  )
  assert.deepEqual(latestUploadBatch([]), [])
})
