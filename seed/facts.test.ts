import { describe, expect, it } from 'vitest'
import { seedFacts } from './facts.js'

describe('web development facts', () => {
  it('contains a broad catalog', () => {
    expect(seedFacts.length).toBeGreaterThanOrEqual(50)
  })

  it('uses unique slugs', () => {
    expect(new Set(seedFacts.map((fact) => fact.slug)).size).toBe(seedFacts.length)
  })

  it('includes the core demo technologies', () => {
    const names = new Set(seedFacts.map((fact) => fact.name))
    for (const name of ['Pi', 'Radius', 'Neon', 'Svelte', 'React', 'Vue', 'Angular', 'Flask', 'Vercel']) {
      expect(names.has(name), `${name} should be included`).toBe(true)
    }
  })

  it('links every fact to a source', () => {
    for (const fact of seedFacts) expect(new URL(fact.sourceUrl).protocol).toBe('https:')
  })
})
