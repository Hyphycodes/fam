import assert from 'node:assert/strict'
import test from 'node:test'
import { cropGeometry, normalizeCrop } from '../lib/client/crop-geometry.ts'

test('rotation swaps the working dimensions without changing the original', () => {
  const geometry = cropGeometry(4000, 3000, {
    aspect: 'original',
    zoom: 1,
    x: 0,
    y: 0,
    rotation: 90,
  })

  assert.equal(geometry.rotatedWidth, 3000)
  assert.equal(geometry.rotatedHeight, 4000)
  assert.equal(geometry.width / geometry.height, 3 / 4)
})

test('crop input is clamped before deriving a source rectangle', () => {
  const normalized = normalizeCrop({
    aspect: '1:1',
    zoom: 99,
    x: -5,
    y: 5,
    rotation: 0,
  })
  const geometry = cropGeometry(4000, 3000, normalized)

  assert.equal(normalized.zoom, 3)
  assert.equal(normalized.x, -1)
  assert.equal(normalized.y, 1)
  assert.ok(geometry.x >= 0)
  assert.ok(geometry.y >= 0)
  assert.ok(geometry.x + geometry.width <= geometry.rotatedWidth)
  assert.ok(geometry.y + geometry.height <= geometry.rotatedHeight)
})
