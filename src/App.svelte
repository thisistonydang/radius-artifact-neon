<script lang="ts">
  import { Monitor, Moon, Sun } from '@lucide/svelte'
  import { onMount, tick } from 'svelte'
  import AnimatedLogo from './lib/AnimatedLogo.svelte'
  import GitHubIcon from './lib/GitHubIcon.svelte'
  import ChatPanel from './lib/ChatPanel.svelte'
  import { api, ApiError } from './lib/api'
  import { authClient } from './lib/auth'
  import { fromStarters, loadLocalTodos, saveLocalTodos } from './lib/local-todos'
  import { applyTheme, loadTheme, type ThemeMode } from './lib/theme'
  import type { AuthUser, CloudTodo, LocalTodo, StarterAttachment, StarterTodo } from './lib/types'

  const MAX_TODOS = 10
  const SKELETON_ROWS = 4

  let todos: LocalTodo[] = []
  let starters: StarterTodo[] = []
  let cloudTodos: CloudTodo[] = []
  let cloudRevision = 0
  let cloudSyncReady = false
  let loading = true
  let error = ''
  let message = ''
  let newTitle = ''
  let editingId: string | null = null
  let editTitle = ''
  let cloudDirty = true
  let saving = false
  let savePromise: Promise<boolean> | null = null
  let changeVersion = 0
  let fileBusy = ''

  let themeMode: ThemeMode = 'system'
  let authLoading = true
  let authOpen = false
  let authMode: 'signin' | 'signup' = 'signin'
  let authReason = 'Sign in to save your todos across devices.'
  let authError = ''
  let authBusy = false
  let pendingAction: 'signin' | 'save' | 'attach' | null = null
  let authPanel: HTMLDivElement
  let emailInput: HTMLInputElement
  let authTrigger: HTMLElement | null = null
  let email = ''
  let password = ''
  let user: AuthUser | null = null

  $: cloudByClientId = new Map(cloudTodos.map((todo) => [todo.clientId, todo]))
  $: completedCount = todos.filter((todo) => todo.completed).length

  onMount(() => {
    themeMode = loadTheme()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const followSystemTheme = () => {
      if (themeMode === 'system') applyTheme('system')
    }
    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => {
      if (user && cloudDirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    media.addEventListener('change', followSystemTheme)
    window.addEventListener('beforeunload', warnAboutUnsavedChanges)

    const local = loadLocalTodos(localStorage)
    if (local) todos = local
    void initialize(local)

    return () => {
      media.removeEventListener('change', followSystemTheme)
      window.removeEventListener('beforeunload', warnAboutUnsavedChanges)
    }
  })

  async function initialize(local: LocalTodo[] | null) {
    await loadStarters(local)
    await refreshSession()
    if (user && (await loadCloudTodos())) applyCloudTodos()
    loading = false
  }

  function describeError(caught: unknown, fallback: string) {
    if (caught instanceof ApiError && caught.status === 401) {
      user = null
      cloudSyncReady = false
    }
    return caught instanceof Error ? caught.message : fallback
  }

  async function loadStarters(local: LocalTodo[] | null) {
    try {
      starters = (await api.starterTodos()).todos
      if (!local) updateTodos(fromStarters(starters), false)
    } catch (caught) {
      if (!local) error = describeError(caught, 'Could not load the starter list.')
    }
  }

  function updateTodos(next: LocalTodo[], dirty = true) {
    todos = next.slice(0, MAX_TODOS)
    const savedLocally = saveLocalTodos(localStorage, todos)
    if (dirty) {
      changeVersion += 1
      cloudDirty = true
      if (user && cloudSyncReady) void saveOnline()
    }
    message = ''
    if (!savedLocally && !user) error = 'This browser could not save your changes on this device.'
    else if (!user || cloudSyncReady) error = ''
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
    if (!confirm('Reset your list to the four starter todos?')) return
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
    } catch {
      user = null
    } finally {
      authLoading = false
    }
  }

  async function loadCloudTodos() {
    try {
      const result = await api.cloudTodos()
      if (result.revision >= cloudRevision) {
        cloudTodos = result.todos
        cloudRevision = result.revision
      }
      cloudSyncReady = true
      error = ''
      return true
    } catch (caught) {
      error = describeError(caught, 'Could not load your saved todos.')
      return false
    }
  }

  function applyCloudTodos() {
    updateTodos(
      cloudTodos.map((todo) => ({
        clientId: todo.clientId,
        starterSlug: starters.find((starter) => starter.id === todo.clientId)?.slug,
        title: todo.title,
        completed: todo.completed,
      })),
      false,
    )
    cloudDirty = false
  }

  function requestAuth(action: 'signin' | 'save' | 'attach') {
    authTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    pendingAction = action
    authReason =
      action === 'attach'
        ? 'Sign in to save this todo and attach a file.'
        : action === 'save'
          ? 'Sign in to save your todos across devices.'
          : 'Sign in to load or save your todos across devices.'
    authOpen = true
    authError = ''
    void tick().then(() => emailInput?.focus())
  }

  function closeAuth() {
    if (authBusy) return
    authOpen = false
    void tick().then(() => authTrigger?.focus())
  }

  function handleAuthKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeAuth()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = Array.from(
      authPanel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'),
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  async function submitAuth() {
    if (!authClient || authBusy) return
    authBusy = true
    authError = ''
    try {
      const signingUp = authMode === 'signup'
      const result = signingUp
        ? await authClient.signUp.email({ name: email.split('@')[0] || 'Todo maker', email, password })
        : await authClient.signIn.email({ email, password })
      if (result.error) throw new Error(result.error.message ?? 'Authentication failed.')
      error = ''
      cloudTodos = []
      cloudRevision = 0
      cloudSyncReady = false
      await refreshSession()
      if (!user) throw new Error('Could not start your account session. Please try again.')
      authOpen = false
      password = ''
      void tick().then(() => authTrigger?.focus())

      if (signingUp) {
        cloudSyncReady = true
        const saved = await saveOnline()
        if (pendingAction === 'attach' && saved) {
          message = 'Your list is saved. Select “attach file” again to choose a file.'
        }
      } else if (await loadCloudTodos()) {
        applyCloudTodos()
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
    if (
      cloudSyncReady &&
      cloudDirty &&
      !(await saveOnline()) &&
      !confirm('Your latest changes could not be saved online. Sign out and reset this device anyway?')
    ) {
      return
    }

    try {
      await authClient.signOut()
    } catch (caught) {
      error = describeError(caught, 'Could not sign out.')
      return
    }

    user = null
    cloudTodos = []
    cloudRevision = 0
    cloudSyncReady = false
    cloudDirty = true
    error = ''
    if (starters.length) updateTodos(fromStarters(starters), false)
    message = 'Signed out. The starter list has been restored.'
  }

  async function saveOnline(): Promise<boolean> {
    if (!user) {
      requestAuth('save')
      return false
    }
    if (!cloudSyncReady) {
      error = 'Could not confirm your online list. Reload before saving changes.'
      return false
    }

    if (savePromise) {
      const succeeded = await savePromise
      if (succeeded && user && cloudDirty) return saveOnline()
      return succeeded && !cloudDirty
    }

    const snapshotVersion = changeVersion
    const snapshotRevision = cloudRevision
    const snapshot = todos.map((todo) => ({ ...todo }))
    saving = true
    error = ''
    const operation = (async () => {
      try {
        const result = await api.saveTodos(snapshot, snapshotRevision)
        cloudTodos = result.todos
        cloudRevision = result.revision
        if (snapshotVersion === changeVersion) cloudDirty = false
        error = ''
        return true
      } catch (caught) {
        error = describeError(caught, 'Could not save your todos online.')
        return false
      }
    })()
    savePromise = operation

    const succeeded = await operation
    if (savePromise === operation) savePromise = null
    saving = false

    if (succeeded && user && cloudDirty) return saveOnline()
    return succeeded && !cloudDirty
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
      if (await saveOnline()) {
        message = 'Your list is saved. Select “attach file” again to choose a file.'
      }
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
      if (await loadCloudTodos()) message = 'Attachment saved in Neon Object Storage.'
    } catch (caught) {
      error = describeError(caught, 'Could not upload the attachment.')
    } finally {
      fileBusy = ''
      input.value = ''
    }
  }

  async function openSignedUrl(loadUrl: () => Promise<{ url: string }>) {
    error = ''
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    try {
      const { url } = await loadUrl()
      if (tab) tab.location.replace(url)
      else window.location.assign(url)
    } catch (caught) {
      tab?.close()
      error = describeError(caught, 'Could not open the attachment.')
    }
  }

  function openStarterAttachment(id: string) {
    return openSignedUrl(() => api.starterAttachmentUrl(id))
  }

  function openAttachment(id: string) {
    return openSignedUrl(() => api.attachmentUrl(id))
  }

  async function removeAttachment(id: string) {
    if (!confirm('Delete this attachment?')) return
    error = ''
    try {
      await api.deleteAttachment(id)
      if (await loadCloudTodos()) message = 'Attachment deleted.'
    } catch (caught) {
      error = describeError(caught, 'Could not delete the attachment.')
    }
  }

  function cycleTheme() {
    const order: ThemeMode[] = ['system', 'light', 'dark']
    themeMode = order[(order.indexOf(themeMode) + 1) % order.length]
    applyTheme(themeMode)
  }
</script>

<svelte:head>
  <title>A full-stack todo list · Radius + Neon</title>
</svelte:head>

<a class="skip-link" href="#todo-app">Skip to todo list</a>

<header class="site-header">
  <div class="header-actions">
    <div class="header-tools">
      <a
        class="github-link"
        href="https://github.com/thisistonydang/radius-artifact-neon"
        target="_blank"
        rel="noreferrer"
        aria-label="View the source code on GitHub"
      >
        <GitHubIcon size={20} />
      </a>
      <button class="theme-toggle" type="button" on:click={cycleTheme} aria-label={`Theme: ${themeMode}`}>
        {#if themeMode === 'dark'}
          <Moon size={16} strokeWidth={1.75} />
        {:else if themeMode === 'light'}
          <Sun size={16} strokeWidth={1.75} />
        {:else}
          <Monitor size={16} strokeWidth={1.75} />
        {/if}
        <span>{themeMode}</span>
      </button>
    </div>
    {#if user}
      <button class="bracket-button" type="button" on:click={signOut} disabled={Boolean(fileBusy)}>[ sign out ]</button>
    {:else}
      <button
        class="bracket-button"
        type="button"
        disabled={loading || authLoading}
        on:click={() => {
          authMode = 'signin'
          requestAuth('signin')
        }}>[ sign in ]</button
      >
    {/if}
  </div>
</header>

<main id="top">
  <section class="hero">
    <AnimatedLogo />
    <h1>This is a <span class="radius-word">Radius</span> artifact with a <span class="neon-word">Neon</span> backend.</h1>
    <p class="hero-copy">
      This site has a full-stack todo app below.
      <a href="https://radius.earendil.com/" target="_blank" rel="noreferrer">Radius</a> serves the
      frontend, and <a href="https://neon.com/" target="_blank" rel="noreferrer">Neon</a> provides its
      backend:
    </p>
    <ul class="backend-list">
      <li><strong>Neon Functions</strong> serve the API that connects the Radius frontend to the Neon backend.</li>
      <li><strong>Lakebase Postgres</strong> stores the todos when an account is created.</li>
      <li><strong>Object Storage</strong> holds files attached to todos.</li>
      <li><strong>Neon Auth</strong> manages optional accounts and protects their data.</li>
      <li><strong>AI Gateway</strong> answers questions about the current todo list.</li>
    </ul>
    <p class="repo-note">
      See the
      <a href="https://github.com/thisistonydang/radius-artifact-neon#readme" target="_blank" rel="noreferrer"
        >repository README</a
      >
      for the full architecture and implementation details.
    </p>
  </section>

  <section id="todo-app" class="todo-section" aria-labelledby="todo-title" tabindex="-1">
    <div class="todo-heading">
      <div>
        <h2 id="todo-title">A full-stack todo list</h2>
        {#if !user}
          <p>
            Changes stay local unless you
            <button
              class="inline-link"
              type="button"
              disabled={loading || authLoading}
              on:click={() => {
                authMode = 'signup'
                requestAuth('save')
              }}>create an account</button
            >.
          </p>
        {/if}
      </div>
      {#if user && saving}
        <div class="save-status"><span>Saving…</span></div>
      {/if}
    </div>

    <div class="todo-app">
      <div class="todo-toolbar">
        <span>{loading ? `0 of ${SKELETON_ROWS} complete` : `${completedCount} of ${todos.length} complete`}</span>
        <div>
          <button type="button" on:click={resetTodos} disabled={loading}>reset</button>
        </div>
      </div>

      <form class="add-todo" on:submit|preventDefault={addTodo}>
        <label class="sr-only" for="new-todo">New todo</label>
        <input id="new-todo" bind:value={newTitle} maxlength="200" placeholder="Add a todo..." disabled={loading} />
        <button class="bracket-button" type="submit" disabled={loading || !newTitle.trim() || todos.length >= MAX_TODOS}
          >[ add ]</button
        >
      </form>

      {#if error}<p class="message error" role="alert">{error}</p>{/if}
      {#if message}<p class="message" aria-live="polite">{message}</p>{/if}

      {#if loading}
        <div class="todo-skeleton" aria-busy="true" aria-label="Loading todos">
          <span class="sr-only">Loading todos…</span>
          <ul class="todo-list skeleton-list" aria-hidden="true">
            {#each Array(SKELETON_ROWS) as _}
              <li>
                <span class="skeleton-check"></span>
                <div class="skeleton-content">
                  <span class="skeleton-line skeleton-title"></span>
                  <span class="skeleton-line skeleton-attachment"></span>
                  <span class="skeleton-line skeleton-actions"></span>
                </div>
              </li>
            {/each}
          </ul>
        </div>
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
                    <button type="button" on:click={() => openStarterAttachment(sampleAttachment.id)}>
                      ↳ {sampleAttachment.fileName}
                    </button>
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
                  <button type="button" on:click={() => beginAttachment(todo)} disabled={Boolean(fileBusy)}>
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
  </section>
</main>

{#if authOpen}
  <div
    class="auth-backdrop"
    role="presentation"
    on:click={(event) => event.currentTarget === event.target && closeAuth()}
    on:keydown={handleAuthKeydown}
  >
    <div class="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title" bind:this={authPanel}>
      <button class="auth-close" type="button" on:click={closeAuth} aria-label="Close">×</button>
      <p class="eyebrow">NEON AUTH</p>
      <h2 id="auth-title">{authMode === 'signup' ? 'Create an account' : 'Sign in'}</h2>
      <p>{authReason}</p>
      {#if !authClient}
        <p class="message error">Authentication is not configured for this environment.</p>
      {:else}
        <form on:submit|preventDefault={submitAuth}>
          <label
            ><span>EMAIL</span
            ><input
              bind:this={emailInput}
              type="email"
              bind:value={email}
              autocomplete="email"
              maxlength="254"
              required
            /></label
          >
          <label>
            <span>PASSWORD</span>
            <input
              type="password"
              bind:value={password}
              autocomplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              minlength="8"
              maxlength="128"
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
  <a
    class="footer-github-link"
    href="https://github.com/thisistonydang/radius-artifact-neon"
    target="_blank"
    rel="noreferrer"
  >
    <GitHubIcon size={14} />
    <span>GitHub</span>
  </a>
</footer>
