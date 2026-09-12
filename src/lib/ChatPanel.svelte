<script lang="ts">
  import { api } from './api'

  export let mode: 'public' | 'private' = 'public'

  let question = ''
  let answer = ''
  let error = ''
  let loading = false

  $: examples =
    mode === 'public'
      ? ['Which tools use Python?', 'How are React and Svelte different?', 'Which platforms can host a web app?']
      : ['Summarize my notes.', 'What tasks did I write down?', 'Which ideas appear more than once?']

  async function ask() {
    if (!question.trim() || loading) return
    loading = true
    error = ''
    answer = ''
    try {
      const result = mode === 'public' ? await api.publicChat(question) : await api.privateChat(question)
      answer = result.answer
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'The agent could not answer.'
    } finally {
      loading = false
    }
  }
</script>

<section class="chat-panel" aria-labelledby={`${mode}-chat-title`}>
  <div class="panel-heading">
    <div>
      <p class="eyebrow">NEON FUNCTION + AI GATEWAY</p>
      <h2 id={`${mode}-chat-title`}>{mode === 'public' ? 'Ask the facts' : 'Ask my notes'}</h2>
    </div>
    <span class="status"><i></i> connected</span>
  </div>

  <p class="panel-copy">
    {mode === 'public'
      ? 'The agent answers from the public facts stored in Lakebase Postgres.'
      : 'The agent can read only the notes connected to your Neon Auth identity.'}
  </p>

  <div class="prompt-list" aria-label="Example questions">
    {#each examples as example}
      <button type="button" on:click={() => (question = example)}>{example}</button>
    {/each}
  </div>

  <form on:submit|preventDefault={ask}>
    <label for={`${mode}-question`}>YOUR QUESTION</label>
    <textarea
      id={`${mode}-question`}
      bind:value={question}
      maxlength="500"
      rows="3"
      placeholder="Ask something about these notes..."
    ></textarea>
    <button class="bracket-button primary" type="submit" disabled={loading || question.trim().length < 2}>
      {loading ? '[ thinking… ]' : '[ ask ]'}
    </button>
  </form>

  {#if answer}
    <div class="agent-answer" aria-live="polite">
      <p class="eyebrow">MISSION ARCHIVIST</p>
      <p>{answer}</p>
    </div>
  {/if}
  {#if error}
    <p class="message error" role="alert">{error}</p>
  {/if}
</section>
