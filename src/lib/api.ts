import { getAuthToken } from './auth'
import type { CloudTodo, LocalTodo, StarterTodo } from './types'

const baseUrl = (window.APP_CONFIG?.apiUrl ?? 'http://localhost:8787').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (authenticated) {
    const token = await getAuthToken()
    if (!token) throw new ApiError('Your account session is unavailable. Please sign in again.', 401)
    headers.set('authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    const message =
      response.status === 401
        ? 'Your account session is unavailable. Please sign in again.'
        : data.error ?? `Request failed with status ${response.status}.`
    throw new ApiError(message, response.status)
  }
  return data
}

export const api = {
  starterTodos: () => request<{ todos: StarterTodo[] }>('/api/starter-todos'),
  starterAttachmentUrl: (id: string) => request<{ url: string; expiresIn: number }>(`/api/starter-attachments/${id}/url`),
  chat: (question: string, todos: LocalTodo[]) =>
    request<{ answer: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question,
        todos: todos.map(({ title, completed }) => ({ title, completed })),
      }),
    }),
  cloudTodos: () => request<{ todos: CloudTodo[]; revision: number }>('/api/me/todos', {}, true),
  saveTodos: (todos: LocalTodo[], revision: number) =>
    request<{ todos: CloudTodo[]; revision: number }>(
      '/api/me/todos',
      {
        method: 'PUT',
        keepalive: true,
        body: JSON.stringify({
          revision,
          todos: todos.map(({ clientId, title, completed }) => ({ clientId, title, completed })),
        }),
      },
      true,
    ),
  uploadAttachment: (todoId: string, file: File) =>
    request(
      `/api/me/todos/${todoId}/attachments`,
      {
        method: 'POST',
        headers: {
          'content-type': file.type,
          'x-file-name': encodeURIComponent(file.name),
        },
        body: file,
      },
      true,
    ),
  attachmentUrl: (id: string) => request<{ url: string }>(`/api/me/attachments/${id}/url`, {}, true),
  deleteAttachment: (id: string) =>
    request<{ ok: true }>(`/api/me/attachments/${id}`, { method: 'DELETE' }, true),
}
