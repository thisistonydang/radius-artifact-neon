<script lang="ts">
  import { onMount } from 'svelte'
  import ChatPanel from './lib/ChatPanel.svelte'
  import FactCard from './lib/FactCard.svelte'
  import { api } from './lib/api'
  import { authClient } from './lib/auth'
  import { applyTheme, type ThemeMode } from './lib/theme'
  import type { AuthUser, Fact, Note } from './lib/types'

  let facts: Fact[] = []
  let factsLoading = true
  let factsError = ''
  let search = ''
  let category = 'all'
  let workspace: 'public' | 'private' = 'public'
  let themeMode: ThemeMode = 'system'

  let authLoading = true
  let authMode: 'signin' | 'signup' = 'signin'
  let authError = ''
  let authBusy = false
  let email = ''
  let password = ''
  let user: AuthUser | null = null

  let notes: Note[] = []
  let notesLoading = false
  let noteError = ''
  let selectedNoteId: string | null = null
  let noteTitle = ''
  let noteBody = ''
  let noteBusy = false
  let fileBusy = ''

  $: categories = ['all', ...new Set(facts.map((fact) => fact.category))]
  $: filteredFacts = facts.filter((fact) => {
    const matchesCategory = category === 'all' || fact.category === category
    const query = search.trim().toLowerCase()
    const matchesSearch =
      !query ||
      [fact.name, fact.category, fact.summary, fact.funFact].some((value) =>
        value.toLowerCase().includes(query),
      )
    return matchesCategory && matchesSearch
  })

  onMount(async () => {
    themeMode = (localStorage.getItem('theme') as ThemeMode | null) ?? 'system'
    await Promise.all([loadFacts(), refreshSession()])
  })

  async function loadFacts() {
    factsLoading = true
    factsError = ''
    try {
      facts = (await api.facts()).facts
    } catch (caught) {
      factsError = caught instanceof Error ? caught.message : 'Could not load the public facts.'
    } finally {
      factsLoading = false
    }
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
      user = sessionUser
        ? { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name }
        : null
      if (user) await loadNotes()
    } catch {
      user = null
    } finally {
      authLoading = false
    }
  }

  function cycleTheme() {
    const order: ThemeMode[] = ['system', 'light', 'dark']
    themeMode = order[(order.indexOf(themeMode) + 1) % order.length]
    applyTheme(themeMode)
  }

  async function submitAuth() {
    if (!authClient || authBusy) return
    authBusy = true
    authError = ''
    try {
      const result =
        authMode === 'signup'
          ? await authClient.signUp.email({
              name: email.split('@')[0] || 'Web developer',
              email,
              password,
            })
          : await authClient.signIn.email({ email, password })
      if (result.error) throw new Error(result.error.message ?? 'Authentication failed.')
      await refreshSession()
      password = ''
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
    notes = []
    resetEditor()
  }

  async function loadNotes() {
    notesLoading = true
    noteError = ''
    try {
      notes = (await api.notes()).notes
    } catch (caught) {
      noteError = caught instanceof Error ? caught.message : 'Could not load your notes.'
    } finally {
      notesLoading = false
    }
  }

  function editNote(note: Note) {
    selectedNoteId = note.id
    noteTitle = note.title
    noteBody = note.body
    document.getElementById('note-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function resetEditor() {
    selectedNoteId = null
    noteTitle = ''
    noteBody = ''
  }

  async function saveNote() {
    if (noteBusy) return
    noteBusy = true
    noteError = ''
    try {
      if (selectedNoteId) await api.updateNote(selectedNoteId, noteTitle, noteBody)
      else await api.createNote(noteTitle, noteBody)
      resetEditor()
      await loadNotes()
    } catch (caught) {
      noteError = caught instanceof Error ? caught.message : 'Could not save the note.'
    } finally {
      noteBusy = false
    }
  }

  async function removeNote(note: Note) {
    if (!confirm(`Delete “${note.title}” and its attachments?`)) return
    try {
      await api.deleteNote(note.id)
      if (selectedNoteId === note.id) resetEditor()
      await loadNotes()
    } catch (caught) {
      noteError = caught instanceof Error ? caught.message : 'Could not delete the note.'
    }
  }

  function normalizedFile(file: File) {
    if (file.type) return file
    const extension = file.name.split('.').pop()?.toLowerCase()
    const contentType = extension === 'md' ? 'text/markdown' : extension === 'txt' ? 'text/plain' : ''
    return contentType ? new File([file], file.name, { type: contentType }) : file
  }

  async function uploadFile(note: Note, event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const original = input.files?.[0]
    if (!original) return
    const file = normalizedFile(original)
    fileBusy = note.id
    noteError = ''
    try {
      await api.uploadAttachment(note.id, file)
      await loadNotes()
    } catch (caught) {
      noteError = caught instanceof Error ? caught.message : 'Could not upload the attachment.'
    } finally {
      fileBusy = ''
      input.value = ''
    }
  }

  async function openAttachment(id: string) {
    try {
      const { url } = await api.attachmentUrl(id)
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noreferrer'
      link.click()
    } catch (caught) {
      noteError = caught instanceof Error ? caught.message : 'Could not open the attachment.'
    }
  }

  async function removeAttachment(id: string) {
    if (!confirm('Delete this attachment?')) return
    try {
      await api.deleteAttachment(id)
      await loadNotes()
    } catch (caught) {
      noteError = caught instanceof Error ? caught.message : 'Could not delete the attachment.'
    }
  }
</script>

<svelte:head>
  <title>web dev fun facts · Radius + Neon</title>
</svelte:head>

<header class="site-header">
  <a class="brand" href="#top" aria-label="web dev fun facts home">
    <span class="brand-mark">π</span>
    <span>web dev fun facts</span>
  </a>
  <nav aria-label="Primary navigation">
    <button class:active={workspace === 'public'} type="button" on:click={() => (workspace = 'public')}>
      public facts
    </button>
    <button class:active={workspace === 'private'} type="button" on:click={() => (workspace = 'private')}>
      my notes
    </button>
  </nav>
  <div class="header-actions">
    <button class="theme-toggle" type="button" on:click={cycleTheme} aria-label={`Theme: ${themeMode}`}>
      {themeMode === 'dark' ? '☾' : themeMode === 'light' ? '☀' : '◐'}
      <span>{themeMode}</span>
    </button>
    {#if user}
      <button class="bracket-button" type="button" on:click={signOut}>[ sign out ]</button>
    {:else}
      <button class="bracket-button" type="button" on:click={() => (workspace = 'private')}>[ sign in ]</button>
    {/if}
  </div>
</header>

<main id="top">
  <section class="hero">
    <p class="eyebrow">LIVE FULL-STACK EXAMPLE</p>
    <h1>This is a Radius artifact with a Neon backend.</h1>
    <p class="hero-copy">
      Radius serves this Svelte frontend. Neon stores the notes and logos, runs the API, authenticates
      private workspaces, and answers questions with AI.
    </p>
    <div class="architecture" aria-label="Application architecture">
      <div><span>RADIUS</span><strong>static artifact</strong></div>
      <b aria-hidden="true">→</b>
      <div><span>NEON FUNCTION</span><strong>Hono API</strong></div>
      <b aria-hidden="true">→</b>
      <div><span>LAKEBASE</span><strong>Postgres</strong></div>
      <div><span>NEON</span><strong>Object Storage</strong></div>
      <div><span>NEON</span><strong>Auth + AI Gateway</strong></div>
    </div>
  </section>

  {#if workspace === 'public'}
    <section class="workspace-intro">
      <div>
        <p class="eyebrow">PUBLIC, NO SIGN-IN REQUIRED</p>
        <h2>Explore the web, one fact at a time.</h2>
        <p>
          Every card below is a row in Lakebase Postgres. Its logo is an attachment in Neon Object
          Storage. Ask the agent to connect ideas across the collection.
        </p>
      </div>
      <div class="service-list" aria-label="Services used by public facts">
        <span><i></i> Postgres</span><span><i></i> Object Storage</span><span><i></i> AI Gateway</span>
      </div>
    </section>

    <div class="content-grid">
      <section class="facts-section" aria-labelledby="facts-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">LAKEBASE POSTGRES + OBJECT STORAGE</p>
            <h2 id="facts-title">Web dev fun facts</h2>
          </div>
          <span class="count">{filteredFacts.length} / {facts.length}</span>
        </div>

        <div class="filters">
          <label>
            <span>SEARCH</span>
            <input bind:value={search} type="search" placeholder="Try Svelte, Python, hosting..." />
          </label>
          <label>
            <span>CATEGORY</span>
            <select bind:value={category}>
              {#each categories as value}
                <option value={value}>{value}</option>
              {/each}
            </select>
          </label>
        </div>

        {#if factsLoading}
          <div class="empty-state"><span class="loader"></span> Loading facts from Neon…</div>
        {:else if factsError}
          <div class="empty-state error" role="alert">
            <p>{factsError}</p>
            <button class="bracket-button" type="button" on:click={loadFacts}>[ retry ]</button>
          </div>
        {:else if filteredFacts.length === 0}
          <div class="empty-state">No facts match those filters.</div>
        {:else}
          <div class="fact-list">
            {#each filteredFacts as fact (fact.id)}
              <FactCard {fact} />
            {/each}
          </div>
        {/if}
      </section>

      <aside><ChatPanel mode="public" /></aside>
    </div>
  {:else}
    <section class="private-workspace">
      <div class="workspace-intro">
        <div>
          <p class="eyebrow">OPTIONAL PRIVATE WORKSPACE</p>
          <h2>Your notes, protected by Neon Auth.</h2>
          <p>
            Sign in only if you want to create notes. The Function verifies your Neon Auth token and
            scopes every database and storage request to your user ID.
          </p>
        </div>
        {#if user}
          <div class="identity"><span>SIGNED IN AS</span><strong>{user.email}</strong></div>
        {/if}
      </div>

      {#if authLoading}
        <div class="empty-state"><span class="loader"></span> Checking your session…</div>
      {:else if !authClient}
        <div class="empty-state">
          <h3>Auth is ready for deployment configuration.</h3>
          <p>Set <code>PUBLIC_NEON_AUTH_URL</code> when building the published artifact.</p>
        </div>
      {:else if !user}
        <section class="auth-panel" aria-labelledby="auth-title">
          <p class="eyebrow">NEON AUTH</p>
          <h2 id="auth-title">{authMode === 'signup' ? 'Create a private workspace' : 'Return to your workspace'}</h2>
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
            <button class="bracket-button primary" type="submit" disabled={authBusy}>
              {authBusy ? '[ working… ]' : authMode === 'signup' ? '[ create workspace ]' : '[ sign in ]'}
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
            {authMode === 'signup' ? 'Already registered? Sign in.' : 'New here? Create a workspace.'}
          </button>
          <p class="privacy-note">Demo only. Do not save sensitive or confidential information.</p>
        </section>
      {:else}
        <div class="personal-grid">
          <section class="notes-panel" aria-labelledby="my-notes-title">
            <div class="section-heading">
              <div><p class="eyebrow">POSTGRES + OBJECT STORAGE</p><h2 id="my-notes-title">My notes</h2></div>
              <button class="bracket-button" type="button" on:click={resetEditor}>[ new note ]</button>
            </div>

            <form id="note-editor" class="note-editor" on:submit|preventDefault={saveNote}>
              <label><span>TITLE</span><input bind:value={noteTitle} maxlength="120" required /></label>
              <label><span>NOTE</span><textarea bind:value={noteBody} maxlength="5000" rows="5" required></textarea></label>
              <div class="editor-actions">
                <button class="bracket-button primary" type="submit" disabled={noteBusy}>
                  {noteBusy ? '[ saving… ]' : selectedNoteId ? '[ update note ]' : '[ save note ]'}
                </button>
                {#if selectedNoteId}
                  <button class="bracket-button" type="button" on:click={resetEditor}>[ cancel ]</button>
                {/if}
              </div>
            </form>

            {#if noteError}<p class="message error" role="alert">{noteError}</p>{/if}
            {#if notesLoading}
              <div class="empty-state"><span class="loader"></span> Loading private notes…</div>
            {:else if notes.length === 0}
              <div class="empty-state">Create your first note to test the private Neon backend.</div>
            {:else}
              <div class="private-note-list">
                {#each notes as note (note.id)}
                  <article class="private-note">
                    <div class="private-note__heading">
                      <div><p class="eyebrow">PRIVATE NOTE</p><h3>{note.title}</h3></div>
                      <div>
                        <button type="button" on:click={() => editNote(note)}>edit</button>
                        <button type="button" on:click={() => removeNote(note)}>delete</button>
                      </div>
                    </div>
                    <p>{note.body}</p>
                    {#if note.attachments.length}
                      <ul class="attachment-list">
                        {#each note.attachments as attachment}
                          <li>
                            <button type="button" on:click={() => openAttachment(attachment.id)}>↳ {attachment.fileName}</button>
                            <span>{Math.ceil(attachment.byteSize / 1024)} KB</span>
                            <button class="danger" type="button" on:click={() => removeAttachment(attachment.id)}>remove</button>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                    <label class="file-button">
                      <span>{fileBusy === note.id ? '[ uploading… ]' : '[ attach file ]'}</span>
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.pdf,.md,.txt,image/png,image/jpeg,application/pdf,text/markdown,text/plain"
                        disabled={fileBusy === note.id || note.attachments.length >= 3}
                        on:change={(event) => uploadFile(note, event)}
                      />
                    </label>
                  </article>
                {/each}
              </div>
            {/if}
          </section>
          <aside><ChatPanel mode="private" /></aside>
        </div>
      {/if}
    </section>
  {/if}

  <section class="explainer" aria-labelledby="explainer-title">
    <p class="eyebrow">HOW THIS DEMO WORKS</p>
    <h2 id="explainer-title">A static frontend. A complete backend.</h2>
    <div class="explainer-grid">
      <article><span>01</span><h3>Radius artifact</h3><p>Publishes the compiled Svelte files and gives this frontend a shareable URL.</p></article>
      <article><span>02</span><h3>Lakebase Postgres</h3><p>Stores public facts and each signed-in user’s private notes as relational data.</p></article>
      <article><span>03</span><h3>Object Storage</h3><p>Stores logos and user attachments in a private, S3-compatible bucket.</p></article>
      <article><span>04</span><h3>Neon Function</h3><p>Provides the Hono API, verifies identity, queries Postgres, and signs file URLs.</p></article>
      <article><span>05</span><h3>Neon Auth</h3><p>Adds optional accounts without blocking visitors from exploring the public demo.</p></article>
      <article><span>06</span><h3>AI Gateway</h3><p>Lets the agent answer from the notes through one branch-scoped model endpoint.</p></article>
    </div>
  </section>
</main>

<footer>
  <p>Built to show how a Radius artifact can use Neon as its backend.</p>
  <div><a href="https://pi.dev/" target="_blank" rel="noreferrer">pi.dev</a><a href="https://neon.com/" target="_blank" rel="noreferrer">neon.com</a></div>
</footer>
