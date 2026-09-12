export type StarterAttachment = {
  id: string
  fileName: string
  url: string
}

export type StarterTodo = {
  id: string
  slug: string
  title: string
  completed: boolean
  position: number
  attachment: StarterAttachment | null
}

export type LocalTodo = {
  clientId: string
  starterSlug?: string
  title: string
  completed: boolean
}

export type Attachment = {
  id: string
  todoId: string
  fileName: string
  contentType: string
  byteSize: number
  createdAt: string
}

export type CloudTodo = {
  id: string
  clientId: string
  title: string
  completed: boolean
  position: number
  updatedAt: string
  attachments: Attachment[]
}

export type AuthUser = {
  id: string
  email: string
  name?: string
}
