import { describe, expect, it } from 'vitest'
import { fromStarters, loadLocalTodos, LOCAL_TODOS_KEY, saveLocalTodos } from './local-todos.js'
import type { StarterTodo } from './types.js'

const starter: StarterTodo = {
  id: '3a7ed150-47ce-4cfc-8f2a-970849c8b516',
  slug: 'duck',
  title: 'Ask the duck',
  completed: false,
  position: 0,
  attachment: null,
}

describe('local todo workspace', () => {
  it('creates local todos from starter data', () => {
    expect(fromStarters([starter])).toEqual([
      { clientId: starter.id, starterSlug: 'duck', title: 'Ask the duck', completed: false },
    ])
  })

  it('round trips valid state', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    saveLocalTodos(storage, fromStarters([starter]))
    expect(values.has(LOCAL_TODOS_KEY)).toBe(true)
    expect(loadLocalTodos(storage)).toHaveLength(1)
  })

  it('rejects malformed state', () => {
    const storage = { getItem: () => '{"version":1,"todos":[{"title":42}]}' }
    expect(loadLocalTodos(storage)).toBeNull()
  })
})
