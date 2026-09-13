<script lang="ts">
  import { onMount } from 'svelte'

  const ANIMATION_MS = 3_400
  let run = 0
  let animating = true
  let animationTimer: ReturnType<typeof setTimeout> | undefined
  let lineSound: HTMLAudioElement | undefined

  function finish() {
    clearTimeout(animationTimer)
    animating = false
  }

  function scheduleFinish() {
    clearTimeout(animationTimer)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }
    animationTimer = setTimeout(finish, ANIMATION_MS)
  }

  function playLineSound() {
    if (!lineSound) return
    lineSound.currentTime = 0
    void lineSound.play().catch(() => {
      // Browsers may block sound before the visitor interacts with the page.
    })
  }

  function unlockLineSound() {
    if (!lineSound) return
    lineSound.muted = true
    void lineSound
      .play()
      .then(() => {
        lineSound?.pause()
        if (lineSound) {
          lineSound.currentTime = 0
          lineSound.muted = false
        }
      })
      .catch(() => {
        if (lineSound) lineSound.muted = false
      })
  }

  function replay() {
    if (animating) return
    unlockLineSound()
    animating = true
    run += 1
    scheduleFinish()
  }

  onMount(() => {
    lineSound = new Audio('./mixkit-arcade-bonus-229.mp3')
    lineSound.preload = 'auto'
    lineSound.volume = 0.35
    scheduleFinish()
    return () => {
      clearTimeout(animationTimer)
      lineSound?.pause()
    }
  })
</script>

<button
  class:animating
  class="hero-logo-button"
  type="button"
  aria-label="Replay the Radius and Neon logo animation"
  aria-disabled={animating}
  on:click={replay}
>
  {#key run}
    <svg class="hero-logo-lockup" viewBox="105 15 425 175" visibility="hidden" aria-hidden="true">
      <g class="logo-fragment radius-fragment-1">
        <rect class="radius-mark" x="128" y="80.2" width="25.2" height="75.6" />
      </g>
      <g class="logo-fragment radius-fragment-2">
        <rect class="radius-mark" x="153.2" y="55" width="75.6" height="25.2" />
      </g>
      <g class="logo-fragment radius-fragment-3">
        <path
          class="radius-mark"
          transform="translate(128 55) scale(.18)"
          d="M490 140c0 71.3-21.4 137.7-58 193l-99 99a348 348 0 0 1-193 58V350c116 0 210-94 210-210z"
        />
      </g>
      <g class="logo-fragment radius-fragment-4">
        <path
          class="radius-mark"
          transform="translate(128 55) scale(.18)"
          d="m432 333 128 128-99 99-128-128z"
        />
      </g>
      <path
        class="radius-mark assembled-exact"
        fill-rule="evenodd"
        clip-rule="evenodd"
        transform="translate(128 55) scale(.18)"
        d="M560 140h-70c0 71.3-21.4 137.7-58 193l128 128-99 99-128-128a348 348 0 0 1-193 58v70H0V140h140V0h420zm-420 0v210c116 0 210-94 210-210z"
      />

      <g class="plus-block plus-block-1"><rect x="297" y="64" width="28" height="28" /></g>
      <g class="plus-block plus-block-2"><rect x="269" y="92" width="28" height="28" /></g>
      <g class="plus-block plus-block-3"><rect x="297" y="92" width="28" height="28" /></g>
      <g class="plus-block plus-block-4"><rect x="325" y="92" width="28" height="28" /></g>
      <g class="plus-block plus-block-5"><rect x="297" y="120" width="28" height="28" /></g>

      <g class="logo-fragment neon-fragment-1">
        <rect class="neon-mark" transform="translate(393 55) scale(3.6)" x="0" y="0" width="3.376" height="27.815" />
      </g>
      <g class="logo-fragment neon-fragment-2">
        <rect
          class="neon-mark"
          transform="translate(393 55) scale(3.6)"
          x="3.376"
          y="0"
          width="24.166"
          height="3.382"
        />
      </g>
      <g class="logo-fragment neon-fragment-3">
        <rect
          class="neon-mark"
          transform="translate(393 55) scale(3.6)"
          x="3.376"
          y="24.439"
          width="13.419"
          height="3.376"
        />
      </g>
      <g class="logo-fragment neon-fragment-4">
        <path
          class="neon-mark"
          transform="translate(393 55) scale(3.6)"
          d="M24.167 3.382h3.375V28l-3.375-7.408z"
        />
      </g>
      <g class="logo-fragment neon-fragment-5">
        <path
          class="neon-mark"
          transform="translate(393 55) scale(3.6)"
          d="m13.42 11.084 3.375 7.408v5.947H13.42z"
        />
      </g>
      <g class="logo-fragment neon-fragment-6">
        <path
          class="neon-mark"
          transform="translate(393 55) scale(3.6)"
          d="m13.42 11.084 10.747 9.508L27.542 28 16.795 18.492z"
        />
      </g>
      <path
        class="neon-mark assembled-exact"
        transform="translate(393 55) scale(3.6)"
        d="M27.542.008V28l-10.747-9.508v9.323H0V0zM3.376 24.439H13.42V11.084l10.747 9.508V3.382l-20.79-.005z"
      />

      <path
        class="landing-line"
        d="M108 174h420"
        on:animationstart={playLineSound}
        on:animationend={finish}
      />
    </svg>
  {/key}
  <span class="hero-logo-replay" aria-hidden="true">click to replay</span>
</button>
