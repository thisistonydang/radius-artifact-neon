import { describe, expect, it } from 'vitest'
import { starterAttachmentSeeds, starterTodos } from './todos.js'

describe('starter todos', () => {
  it('keeps the initial list small', () => {
    expect(starterTodos.length).toBeGreaterThanOrEqual(3)
    expect(starterTodos.length).toBeLessThanOrEqual(5)
  })

  it('uses unique slugs and positions', () => {
    expect(new Set(starterTodos.map((todo) => todo.slug)).size).toBe(starterTodos.length)
    expect(new Set(starterTodos.map((todo) => todo.position)).size).toBe(starterTodos.length)
  })

  it('starts with at least one completed item', () => {
    expect(starterTodos.some((todo) => todo.completed)).toBe(true)
  })

  it('gives every starter todo one attachment', () => {
    expect(starterAttachmentSeeds).toHaveLength(starterTodos.length)
    expect(new Set(starterAttachmentSeeds.map((attachment) => attachment.todoSlug))).toEqual(
      new Set(starterTodos.map((todo) => todo.slug)),
    )
    expect(new Set(starterAttachmentSeeds.map((attachment) => attachment.storageKey)).size).toBe(
      starterAttachmentSeeds.length,
    )
    expect(starterAttachmentSeeds.every((attachment) => attachment.body.trim().length > 0)).toBe(true)
  })
})
