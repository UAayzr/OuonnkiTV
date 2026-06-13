import { describe, expect, it } from 'vitest'
import { isRecoverableMotionError } from './routeTransitionRecovery'

describe('isRecoverableMotionError', () => {
  it('matches NotFoundError thrown by removeChild commit failures', () => {
    const err = new Error("Failed to execute 'removeChild' on 'Node'")
    err.name = 'NotFoundError'
    expect(isRecoverableMotionError(err)).toBe(true)
  })

  it('matches messages mentioning removeChild even without a NotFoundError name', () => {
    expect(
      isRecoverableMotionError(new Error("Failed to execute 'removeChild' on 'Node'")),
    ).toBe(true)
  })

  it('matches the localized "is not a child of this node" wording', () => {
    expect(
      isRecoverableMotionError(new Error('The node to be removed is not a child of this node.')),
    ).toBe(true)
  })

  it('matches plain NotFoundError-named errors with arbitrary messages', () => {
    const err = new Error('oops')
    err.name = 'NotFoundError'
    expect(isRecoverableMotionError(err)).toBe(true)
  })

  it('does not match unrelated runtime errors', () => {
    expect(isRecoverableMotionError(new TypeError('Cannot read properties of undefined'))).toBe(
      false,
    )
    expect(isRecoverableMotionError(new Error('Network request failed'))).toBe(false)
  })

  it('handles non-Error throwables defensively', () => {
    expect(isRecoverableMotionError(null)).toBe(false)
    expect(isRecoverableMotionError(undefined)).toBe(false)
    expect(isRecoverableMotionError('NotFoundError: removeChild failed')).toBe(true)
    expect(isRecoverableMotionError('something else entirely')).toBe(false)
  })
})