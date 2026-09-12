export type Fact = {
  id: string
  slug: string
  name: string
  category: string
  summary: string
  funFact: string
  sourceUrl: string
  logoUrl: string | null
  attachmentName: string | null
}

export type Attachment = {
  id: string
  noteId: string
  fileName: string
  contentType: string
  byteSize: number
  createdAt: string
}

export type Note = {
  id: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
  attachments: Attachment[]
}

export type AuthUser = {
  id: string
  email: string
  name?: string
}
