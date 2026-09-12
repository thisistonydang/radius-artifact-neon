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
  chat: (question: string, todos: LocalTodo[]) =>
    request<{ answer: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question,
        todos: todos.map(({ title, completed }) => ({ title, completed })),
      }),
    }),
  cloudTodos: () => request<{ todos: CloudTodo[] }>('/api/me/todos', {}, true),
  saveTodos: (todos: LocalTodo[]) =>
    request<{ todos: CloudTodo[] }>(
      '/api/me/todos',
      {
        method: 'PUT',
        body: JSON.stringify({ todos: todos.map(({ clientId, title, completed }) => ({ clientId, title, completed })) }),
      },
      true,
    ),
  async uploadAttachment(todoId: string, file: File) {
    const upload = await request<{ uploadUrl: string; storageKey: string; fileName: string }>(
      `/api/me/todos/${todoId}/attachments/presign`,
      {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, contentType: file.type, byteSize: file.size }),
      },
      true,
    )
    const uploaded = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    })
    if (!uploaded.ok) throw new ApiError('The file upload failed.', uploaded.status)
    return request(
      `/api/me/todos/${todoId}/attachments/complete`,
      {
        method: 'POST',
        body: JSON.stringify({
          storageKey: upload.storageKey,
          fileName: upload.fileName,
          contentType: file.type,
          byteSize: file.size,
        }),
      },
      true,
    )
  },
  attachmentUrl: (id: string) => request<{ url: string }>(`/api/me/attachments/${id}/url`, {}, true),
  deleteAttachment: (id: string) =>
    request<{ ok: true }>(`/api/me/attachments/${id}`, { method: 'DELETE' }, true),
}
