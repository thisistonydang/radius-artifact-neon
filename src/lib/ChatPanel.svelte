<script lang="ts">
  import { api } from './api'
  import type { LocalTodo } from './types'

  export let todos: LocalTodo[] = []

  let question = ''
  let answer = ''
  let error = ''
  let loading = false

  $: askHint = !todos.length ? 'Add a todo first.' : question.trim().length < 2 ? 'Type a question first.' : undefined

  const examples = ['What should I do first?', 'Which item is already done?', 'Do I need more snacks?']

  async function ask() {
    if (!question.trim() || loading || todos.length === 0) return
    loading = true
    error = ''
    answer = ''
    try {
      answer = (await api.chat(question, todos)).answer
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'The assistant could not answer.'
    } finally {
      loading = false
    }
  }
</script>

<section class="chat-panel" aria-labelledby="chat-title">
  <h2 id="chat-title">Ask your todos</h2>
  <p>The current list is sent to Neon AI Gateway when you ask a question. It is not saved.</p>

  <div class="prompt-list" aria-label="Example questions">
    {#each examples as example}
      <button type="button" on:click={() => (question = example)} disabled={loading}>{example}</button>
    {/each}
  </div>

  <form on:submit|preventDefault={ask}>
    <label for="todo-question">QUESTION</label>
    <div class="question-row">
      <input
        id="todo-question"
        bind:value={question}
        maxlength="500"
        placeholder="Ask about this list..."
        disabled={loading}
      />
      <button class="bracket-button" type="button" on:click={() => (question = '')} disabled={loading || !question}>
        [ clear ]
      </button>
      <span class="ask-button-wrap" title={loading ? undefined : askHint}>
        <button class="bracket-button primary" type="submit" disabled={loading || question.trim().length < 2 || !todos.length}>
          {loading ? '[ thinking… ]' : '[ ask ]'}
        </button>
      </span>
    </div>
  </form>

  {#if answer}
    <div class="agent-answer" aria-live="polite"><p>{answer}</p></div>
  {/if}
  {#if error}<p class="message error" role="alert">{error}</p>{/if}
</section>
