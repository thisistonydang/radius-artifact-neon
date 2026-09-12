import { describe, expect, it } from 'vitest'
import { normalizePostgresUrl } from './connection.js'

describe('normalizePostgresUrl', () => {
  it('uses explicit certificate verification for pg', () => {
    const result = normalizePostgresUrl('postgresql://example.test/db?sslmode=require')
    expect(new URL(result).searchParams.get('sslmode')).toBe('verify-full')
  })

  it('preserves an explicit disabled SSL mode', () => {
    const result = normalizePostgresUrl('postgresql://localhost/db?sslmode=disable')
    expect(new URL(result).searchParams.get('sslmode')).toBe('disable')
  })
})
