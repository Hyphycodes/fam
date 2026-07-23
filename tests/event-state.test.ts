import assert from 'node:assert/strict'
import test from 'node:test'
import { canTransition, isEventStatus, isForwardTransition } from '../lib/eventState.ts'

test('forward path is planned → upcoming → live → completed, with a direct planned → completed', () => {
  assert.ok(isForwardTransition('planned', 'upcoming'))
  assert.ok(isForwardTransition('upcoming', 'live'))
  assert.ok(isForwardTransition('live', 'completed'))
  assert.ok(isForwardTransition('planned', 'completed')) // the only forward path any UI drives now
})

test('you cannot skip states forward', () => {
  assert.ok(!isForwardTransition('planned', 'live')) // must pass through upcoming
  assert.ok(isForwardTransition('upcoming', 'completed')) // but any state may complete
  assert.ok(!isForwardTransition('completed', 'planned')) // completed is terminal (forward)
})

test('reverse transitions are an owner-only correction', () => {
  assert.ok(!canTransition('completed', 'planned', { isOwner: false }))
  assert.ok(canTransition('completed', 'planned', { isOwner: true }))
})

test('forward transitions are open to any member', () => {
  assert.ok(canTransition('planned', 'completed', { isOwner: false }))
  assert.ok(canTransition('planned', 'upcoming', { isOwner: false }))
})

test('a no-op (same state) is never a valid transition', () => {
  assert.ok(!canTransition('planned', 'planned', { isOwner: true }))
  assert.ok(!canTransition('completed', 'completed', { isOwner: true }))
})

test('isEventStatus guards the lifecycle enum', () => {
  assert.ok(isEventStatus('planned'))
  assert.ok(isEventStatus('completed'))
  assert.ok(!isEventStatus('archived'))
  assert.ok(!isEventStatus(null))
  assert.ok(!isEventStatus(''))
})
