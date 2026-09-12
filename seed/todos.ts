export type StarterTodo = {
  slug: string
  title: string
  completed: boolean
  position: number
}

export type StarterAttachmentSeed = {
  todoSlug: string
  storageKey: string
  fileName: string
  contentType: 'text/markdown' | 'text/plain'
  body: string
}

export const starterTodos = [
  {
    slug: 'rubber-duck-review',
    title: 'Teach the rubber duck to approve pull requests',
    completed: false,
    position: 0,
  },
  {
    slug: 'coffee-deploy',
    title: 'Deploy before the coffee gets cold',
    completed: false,
    position: 1,
  },
  {
    slug: 'incident-report',
    title: 'Remove “works on my machine” from the incident report',
    completed: true,
    position: 2,
  },
  {
    slug: 'deploy-snacks',
    title: 'Restock the emergency deploy snacks',
    completed: false,
    position: 3,
  },
] satisfies StarterTodo[]

export const starterAttachmentSeeds = [
  {
    todoSlug: 'rubber-duck-review',
    storageKey: 'starter/rubber-duck-review-guide.md',
    fileName: 'rubber-duck-review-guide.md',
    contentType: 'text/markdown',
    body: `# Rubber Duck Review Guide

1. Explain the change out loud.
2. Ask the duck whether the tests pass.
3. Wait patiently for approval.
`,
  },
  {
    todoSlug: 'coffee-deploy',
    storageKey: 'starter/coffee-deploy-countdown.txt',
    fileName: 'coffee-deploy-countdown.txt',
    contentType: 'text/plain',
    body: `COFFEE DEPLOY COUNTDOWN

Hot: run the tests
Warm: deploy carefully
Cold: call it an iced coffee
`,
  },
  {
    todoSlug: 'incident-report',
    storageKey: 'starter/incident-report-edits.md',
    fileName: 'incident-report-edits.md',
    contentType: 'text/markdown',
    body: `# Incident Report Edits

Replace “works on my machine” with:

> The issue could not be reproduced in the local environment.

Much more official.
`,
  },
  {
    todoSlug: 'deploy-snacks',
    storageKey: 'starter/emergency-deploy-snack-inventory.txt',
    fileName: 'emergency-deploy-snack-inventory.txt',
    contentType: 'text/plain',
    body: `EMERGENCY DEPLOY SNACK INVENTORY

[ ] Pretzels
[ ] Chocolate
[ ] Something pretending to be healthy
[ ] Backup chocolate
`,
  },
] satisfies StarterAttachmentSeed[]
