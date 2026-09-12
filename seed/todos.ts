export type StarterTodo = {
  slug: string
  title: string
  completed: boolean
  position: number
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

export const rubberDuckGuide = `# Rubber Duck Review Guide

1. Explain the change out loud.
2. Ask the duck whether the tests pass.
3. Wait patiently for approval.
`
