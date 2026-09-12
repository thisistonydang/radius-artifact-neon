<script lang="ts">
  import { onMount } from 'svelte'
  import ChatPanel from './lib/ChatPanel.svelte'
  import { api } from './lib/api'
  import { authClient } from './lib/auth'
  import { fromStarters, loadLocalTodos, saveLocalTodos } from './lib/local-todos'
  import { applyTheme, type ThemeMode } from './lib/theme'
  import type { AuthUser, CloudTodo, LocalTodo, StarterAttachment, StarterTodo } from './lib/types'

  const MAX_TODOS = 10

  let todos: LocalTodo[] = []
  let starters: StarterTodo[] = []
  let cloudTodos: CloudTodo[] = []
  let loading = true
  let error = ''
  let message = ''
  let newTitle = ''
  let editingId: string | null = null
  let editTitle = ''
  let cloudDirty = true
  let saving = false
  let fileBusy = ''

  let themeMode: ThemeMode = 'system'
  let authLoading = true
  let authOpen = false
  let authMode: 'signin' | 'signup' = 'signin'
  let authReason = 'Sign in to save your todos across devices.'
  let authError = ''
  let authBusy = false
  let pendingAction: 'signin' | 'save' | 'attach' | null = null
  let email = ''
  let password = ''
  let user: AuthUser | null = null

  $: cloudByClientId = new Map(cloudTodos.map((todo) => [todo.clientId, todo]))
  $: completedCount = todos.filter((todo) => todo.completed).length

  onMount(async () => {
    themeMode = (localStorage.getItem('theme') as ThemeMode | null) ?? 'system'
    const local = loadLocalTodos(localStorage)
    if (local) todos = local
    await Promise.all([loadStarters(local), refreshSession()])
    loading = false
  })

  async function loadStarters(local: LocalTodo[] | null) {
    try {
      starters = (await api.starterTodos()).todos
      if (!local) updateTodos(fromStarters(starters), false)
    } catch (caught) {
      if (!local) error = caught instanceof Error ? caught.message : 'Could not load the starter list.'
    }
  }

  function updateTodos(next: LocalTodo[], dirty = true) {
    todos = next.slice(0, MAX_TODOS)
    saveLocalTodos(localStorage, todos)
    if (dirty) cloudDirty = true
    message = ''
  }

  function addTodo() {
    const title = newTitle.trim()
    if (!title || todos.length >= MAX_TODOS) return
    updateTodos([...todos, { clientId: crypto.randomUUID(), title, completed: false }])
    newTitle = ''
  }

  function toggleTodo(clientId: string) {
    updateTodos(todos.map((todo) => (todo.clientId === clientId ? { ...todo, completed: !todo.completed } : todo)))
  }

  function startEditing(todo: LocalTodo) {
    editingId = todo.clientId
    editTitle = todo.title
  }

  function finishEditing() {
    const title = editTitle.trim()
    if (editingId && title) {
      updateTodos(todos.map((todo) => (todo.clientId === editingId ? { ...todo, title } : todo)))
    }
    editingId = null
    editTitle = ''
  }

  function removeTodo(clientId: string) {
    updateTodos(todos.filter((todo) => todo.clientId !== clientId))
  }

  function resetTodos() {
    if (!confirm('Reset this device to the four starter todos?')) return
    updateTodos(fromStarters(starters))
  }

  function starterAttachment(todo: LocalTodo): StarterAttachment | null {
    if (!todo.starterSlug) return null
    return starters.find((starter) => starter.slug === todo.starterSlug)?.attachment ?? null
  }

  async function refreshSession() {
    authLoading = true
    if (!authClient) {
      authLoading = false
      return
    }
    try {
      const result = await authClient.getSession()
      const sessionUser = result.data?.user
      user = sessionUser ? { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name } : null
      if (user) await loadCloudTodos()
    } catch {
      user = null
    } finally {
      authLoading = false
    }
  }

  async function loadCloudTodos() {
    try {
      cloudTodos = (await api.cloudTodos()).todos
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Could not load your saved todos.'
    }
  }

  function requestAuth(action: 'signin' | 'save' | 'attach') {
    pendingAction = action
    authReason =
      action === 'attach'
        ? 'Sign in to save this todo and attach a file.'
        : action === 'save'
          ? 'Sign in to save your todos across devices.'
          : 'Sign in to load or save your todos across devices.'
    authOpen = true
    authError = ''
  }

  async function submitAuth() {
    if (!authClient || authBusy) return
    authBusy = true
    authError = ''
    try {
      const result =
        authMode === 'signup'
          ? await authClient.signUp.email({ name: email.split('@')[0] || 'Todo maker', email, password })
          : await authClient.signIn.email({ email, password })
      if (result.error) throw new Error(result.error.message ?? 'Authentication failed.')
      await refreshSession()
      authOpen = false
      password = ''
      if (pendingAction === 'save' || pendingAction === 'attach') await saveOnline()
      if (pendingAction === 'attach') message = 'Your list is saved. Select “attach file” again to choose a file.'
      if (pendingAction === 'signin') {
        message = cloudTodos.length ? 'Signed in. Load your online list or save this device’s list.' : 'Signed in. Save this list when you are ready.'
      }
      pendingAction = null
    } catch (caught) {
      authError = caught instanceof Error ? caught.message : 'Authentication failed.'
    } finally {
      authBusy = false
    }
  }

  async function signOut() {
    if (!authClient) return
    await authClient.signOut()
    user = null
    cloudTodos = []
    cloudDirty = true
    message = 'Signed out. Your local list is still on this device.'
  }

  async function saveOnline() {
    if (!user) {
      requestAuth('save')
      return
    }
    saving = true
    error = ''
    try {
      cloudTodos = (await api.saveTodos(todos)).todos
      cloudDirty = false
      message = 'Saved online with Neon Postgres.'
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Could not save your todos online.'
    } finally {
      saving = false
    }
  }

  async function loadOnline() {
    if (!user) return
    await loadCloudTodos()
    if (!cloudTodos.length) {
      message = 'There is no online list yet. Save this list first.'
      return
    }
    if (cloudDirty && !confirm('Replace the list on this device with your online list?')) return
    updateTodos(
      cloudTodos.map((todo) => ({ clientId: todo.clientId, title: todo.title, completed: todo.completed })),
      false,
    )
    cloudDirty = false
    message = 'Loaded your online list.'
  }

  function normalizedFile(file: File) {
    if (file.type) return file
    const extension = file.name.split('.').pop()?.toLowerCase()
    const contentType = extension === 'md' ? 'text/markdown' : extension === 'txt' ? 'text/plain' : ''
    return contentType ? new File([file], file.name, { type: contentType }) : file
  }

  async function beginAttachment(todo: LocalTodo) {
    if (!user) {
      requestAuth('attach')
      return
    }
    if (!cloudByClientId.has(todo.clientId) || cloudDirty) {
      await saveOnline()
      message = 'Your list is saved. Select “attach file” again to choose a file.'
      return
    }
    document.getElementById(`file-${todo.clientId}`)?.click()
  }

  async function uploadFile(todo: LocalTodo, event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const original = input.files?.[0]
    const cloudTodo = cloudByClientId.get(todo.clientId)
    if (!original || !cloudTodo) return
    const file = normalizedFile(original)
    fileBusy = todo.clientId
    error = ''
    try {
      await api.uploadAttachment(cloudTodo.id, file)
      await loadCloudTodos()
      message = 'Attachment saved in Neon Object Storage.'
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Could not upload the attachment.'
    } finally {
      fileBusy = ''
      input.value = ''
    }
  }

  async function openAttachment(id: string) {
    try {
      const { url } = await api.attachmentUrl(id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Could not open the attachment.'
    }
  }

  async function removeAttachment(id: string) {
    if (!confirm('Delete this attachment?')) return
    try {
      await api.deleteAttachment(id)
      await loadCloudTodos()
      message = 'Attachment deleted.'
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Could not delete the attachment.'
    }
  }

  function cycleTheme() {
    const order: ThemeMode[] = ['system', 'light', 'dark']
    themeMode = order[(order.indexOf(themeMode) + 1) % order.length]
    applyTheme(themeMode)
  }
</script>

<svelte:head>
  <title>A simple todo list · Radius + Neon</title>
</svelte:head>

<header class="site-header">
  <a class="brand" href="#top">todo list</a>
  <div class="header-actions">
    <button class="theme-toggle" type="button" on:click={cycleTheme} aria-label={`Theme: ${themeMode}`}>
      {themeMode === 'dark' ? '☾' : themeMode === 'light' ? '☀' : '◐'} <span>{themeMode}</span>
    </button>
    {#if user}
      <button class="bracket-button" type="button" on:click={signOut}>[ sign out ]</button>
    {:else}
      <button class="bracket-button" type="button" on:click={() => requestAuth('signin')}>[ sign in ]</button>
    {/if}
  </div>
</header>

<main id="top">
  <section class="hero">
    <h1>This is a Radius artifact with a Neon backend.</h1>
    <p class="hero-copy">
      <a href="https://radius.earendil.com/" target="_blank" rel="noreferrer">Radius</a> serves this
      frontend. <a href="https://neon.com/" target="_blank" rel="noreferrer">Neon</a> handles the
      backend: Neon Functions serve the API endpoints, Lakebase Postgres stores saved todos, Object
      Storage holds file attachments, Neon Auth protects accounts, and AI Gateway answers questions.
    </p>
  </section>

  <section class="todo-section" aria-labelledby="todo-title">
    <div class="todo-heading">
      <div>
        <h2 id="todo-title">A simple todo list</h2>
        <p>Try everything without an account. Your changes are saved in this browser.</p>
      </div>
      <div class="save-status">
        <span>{user && !cloudDirty ? 'Saved online' : 'Saved on this device'}</span>
        {#if user}<strong>{user.email}</strong>{/if}
      </div>
    </div>

    <div class="todo-app">
      <div class="todo-toolbar">
        <span>{completedCount} of {todos.length} complete</span>
        <div>
          {#if user}<button type="button" on:click={loadOnline}>load online</button>{/if}
          <button type="button" on:click={resetTodos}>reset</button>
          <button class="bracket-button primary" type="button" on:click={saveOnline} disabled={saving}>
            {saving ? '[ saving… ]' : '[ save online ]'}
          </button>
        </div>
      </div>

      <form class="add-todo" on:submit|preventDefault={addTodo}>
        <label class="sr-only" for="new-todo">New todo</label>
        <input id="new-todo" bind:value={newTitle} maxlength="200" placeholder="Add a todo..." />
        <button class="bracket-button" type="submit" disabled={!newTitle.trim() || todos.length >= MAX_TODOS}>[ add ]</button>
      </form>

      {#if error}<p class="message error" role="alert">{error}</p>{/if}
      {#if message}<p class="message" aria-live="polite">{message}</p>{/if}

      {#if loading}
        <div class="empty-state"><span class="loader"></span> Loading starter todos…</div>
      {:else if todos.length === 0}
        <div class="empty-state">Nothing to do. Suspiciously efficient.</div>
      {:else}
        <ul class="todo-list">
          {#each todos as todo (todo.clientId)}
            {@const sampleAttachment = starterAttachment(todo)}
            {@const cloudTodo = cloudByClientId.get(todo.clientId)}
            <li class:completed={todo.completed}>
              <input
                class="todo-check"
                type="checkbox"
                checked={todo.completed}
                on:change={() => toggleTodo(todo.clientId)}
                aria-label={`Mark ${todo.title} ${todo.completed ? 'open' : 'complete'}`}
              />
              <div class="todo-content">
                {#if editingId === todo.clientId}
                  <form class="edit-todo" on:submit|preventDefault={finishEditing}>
                    <input bind:value={editTitle} maxlength="200" aria-label="Edit todo" />
                    <button type="submit">save</button>
                    <button type="button" on:click={() => (editingId = null)}>cancel</button>
                  </form>
                {:else}
                  <p>{todo.title}</p>
                {/if}

                <div class="todo-attachments">
                  {#if sampleAttachment}
                    <a href={sampleAttachment.url} target="_blank" rel="noreferrer">↳ {sampleAttachment.fileName}</a>
                  {/if}
                  {#each cloudTodo?.attachments ?? [] as attachment}
                    <span>
                      <button type="button" on:click={() => openAttachment(attachment.id)}>↳ {attachment.fileName}</button>
                      <button class="remove-attachment" type="button" on:click={() => removeAttachment(attachment.id)}>remove</button>
                    </span>
                  {/each}
                </div>

                <div class="todo-actions">
                  <button type="button" on:click={() => startEditing(todo)}>edit</button>
                  <button type="button" on:click={() => beginAttachment(todo)} disabled={fileBusy === todo.clientId}>
                    {fileBusy === todo.clientId ? 'uploading…' : 'attach file'}
                  </button>
                  <button type="button" on:click={() => removeTodo(todo.clientId)}>delete</button>
                </div>
                <input
                  id={`file-${todo.clientId}`}
                  class="file-input"
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,.md,.txt,image/png,image/jpeg,application/pdf,text/markdown,text/plain"
                  on:change={(event) => uploadFile(todo, event)}
                />
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      {#if todos.length >= MAX_TODOS}<p class="limit-note">This demo allows up to {MAX_TODOS} todos.</p>{/if}
    </div>

    <ChatPanel {todos} />
    <p class="privacy-note">
      Todos stay in this browser unless you select “save online.” The current list is sent to Neon only
      when you ask the AI a question.
    </p>
  </section>
</main>

{#if authOpen}
  <div class="auth-backdrop" role="presentation" on:click={(event) => event.currentTarget === event.target && (authOpen = false)}>
    <div class="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button class="auth-close" type="button" on:click={() => (authOpen = false)} aria-label="Close">×</button>
      <p class="eyebrow">NEON AUTH</p>
      <h2 id="auth-title">{authMode === 'signup' ? 'Create an account' : 'Sign in'}</h2>
      <p>{authReason}</p>
      {#if !authClient}
        <p class="message error">Authentication is not configured for this environment.</p>
      {:else}
        <form on:submit|preventDefault={submitAuth}>
          <label><span>EMAIL</span><input type="email" bind:value={email} autocomplete="email" required /></label>
          <label>
            <span>PASSWORD</span>
            <input
              type="password"
              bind:value={password}
              autocomplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              minlength="8"
              required
            />
          </label>
          <button class="bracket-button primary" type="submit" disabled={authBusy || authLoading}>
            {authBusy ? '[ working… ]' : authMode === 'signup' ? '[ create account ]' : '[ sign in ]'}
          </button>
        </form>
        {#if authError}<p class="message error" role="alert">{authError}</p>{/if}
        <button
          class="text-button"
          type="button"
          on:click={() => {
            authMode = authMode === 'signup' ? 'signin' : 'signup'
            authError = ''
          }}
        >
          {authMode === 'signup' ? 'Already have an account? Sign in.' : 'Need an account? Create one.'}
        </button>
      {/if}
    </div>
  </div>
{/if}

<footer>
  <p>
    Built with <a href="https://pi.dev/" target="_blank" rel="noreferrer">Pi</a>,
    <a href="https://radius.earendil.com/" target="_blank" rel="noreferrer">Radius</a>, and
    <a href="https://neon.com/" target="_blank" rel="noreferrer">Neon</a>.
  </p>
</footer>
