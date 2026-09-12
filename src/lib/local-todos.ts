import type { LocalTodo, StarterTodo } from './types'

export const LOCAL_TODOS_KEY = 'radius-neon-todos:v1'
const MAX_TODOS = 10
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StoredWorkspace = {
  version: 1
  updatedAt: string
  todos: LocalTodo[]
}

function isTodo(value: unknown): value is LocalTodo {
  if (!value || typeof value !== 'object') return false
  const todo = value as Record<string, unknown>
  return (
    typeof todo.clientId === 'string' &&
    UUID_PATTERN.test(todo.clientId) &&
    typeof todo.title === 'string' &&
    todo.title.trim().length > 0 &&
    todo.title.length <= 200 &&
    typeof todo.completed === 'boolean' &&
    (todo.starterSlug === undefined || typeof todo.starterSlug === 'string')
  )
}

export function fromStarters(starters: StarterTodo[]): LocalTodo[] {
  return starters.slice(0, MAX_TODOS).map((todo) => ({
    clientId: todo.id,
    starterSlug: todo.slug,
    title: todo.title,
    completed: todo.completed,
  }))
}

export function loadLocalTodos(storage: Pick<Storage, 'getItem'>): LocalTodo[] | null {
  try {
    const raw = storage.getItem(LOCAL_TODOS_KEY)
    if (!raw) return null
    const workspace = JSON.parse(raw) as Partial<StoredWorkspace>
    if (workspace.version !== 1 || !Array.isArray(workspace.todos)) return null
    if (workspace.todos.length > MAX_TODOS || !workspace.todos.every(isTodo)) return null
    return workspace.todos
  } catch {
    return null
  }
}

export function saveLocalTodos(storage: Pick<Storage, 'setItem'>, todos: LocalTodo[]) {
  const workspace: StoredWorkspace = {
    version: 1,
    updatedAt: new Date().toISOString(),
    todos: todos.slice(0, MAX_TODOS),
  }
  storage.setItem(LOCAL_TODOS_KEY, JSON.stringify(workspace))
}
