import { describe, expect, it } from 'vitest'
import { starterTodos } from './todos.js'

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
})
