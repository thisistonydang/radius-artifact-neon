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
    expect(saveLocalTodos(storage, fromStarters([starter]))).toBe(true)
    expect(values.has(LOCAL_TODOS_KEY)).toBe(true)
    expect(loadLocalTodos(storage)).toHaveLength(1)
  })

  it('does not crash when browser storage is unavailable', () => {
    const storage = { setItem: () => { throw new Error('blocked') } }
    expect(saveLocalTodos(storage, fromStarters([starter]))).toBe(false)
  })

  it('rejects malformed state', () => {
    const storage = { getItem: () => '{"version":1,"todos":[{"title":42}]}' }
    expect(loadLocalTodos(storage)).toBeNull()
  })

  it('rejects duplicate todo IDs that would break keyed rendering', () => {
    const todo = `{"clientId":"${starter.id}","title":"Duplicate","completed":false}`
    const storage = { getItem: () => `{"version":1,"todos":[${todo},${todo}]}` }
    expect(loadLocalTodos(storage)).toBeNull()
  })

  it('rejects local todos that cannot be synced', () => {
    const storage = {
      getItem: () =>
        '{"version":1,"todos":[{"clientId":"not-a-uuid","title":"Looks valid","completed":false}]}',
    }
    expect(loadLocalTodos(storage)).toBeNull()
  })
})
