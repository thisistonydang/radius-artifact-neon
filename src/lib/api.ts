import { getAuthToken } from './auth'
import type { Fact, Note } from './types'

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
    if (!token) throw new ApiError('Sign in required.', 401)
    headers.set('authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new ApiError(data.error ?? `Request failed with status ${response.status}.`, response.status)
  return data
}

export const api = {
  facts: () => request<{ facts: Fact[] }>('/api/facts'),
  publicChat: (question: string) =>
    request<{ answer: string }>('/api/chat/public', { method: 'POST', body: JSON.stringify({ question }) }),
  notes: () => request<{ notes: Note[] }>('/api/me/notes', {}, true),
  createNote: (title: string, body: string) =>
    request<{ note: Note }>(
      '/api/me/notes',
      { method: 'POST', body: JSON.stringify({ title, body }) },
      true,
    ),
  updateNote: (id: string, title: string, body: string) =>
    request<{ note: Note }>(
      `/api/me/notes/${id}`,
      { method: 'PUT', body: JSON.stringify({ title, body }) },
      true,
    ),
  deleteNote: (id: string) => request<{ ok: true }>(`/api/me/notes/${id}`, { method: 'DELETE' }, true),
  privateChat: (question: string) =>
    request<{ answer: string }>(
      '/api/me/chat',
      { method: 'POST', body: JSON.stringify({ question }) },
      true,
    ),
  async uploadAttachment(noteId: string, file: File) {
    const upload = await request<{ uploadUrl: string; storageKey: string; fileName: string }>(
      `/api/me/notes/${noteId}/attachments/presign`,
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
      `/api/me/notes/${noteId}/attachments/complete`,
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
  attachmentUrl: (id: string) =>
    request<{ url: string }>(`/api/me/attachments/${id}/url`, {}, true),
  deleteAttachment: (id: string) =>
    request<{ ok: true }>(`/api/me/attachments/${id}`, { method: 'DELETE' }, true),
}
