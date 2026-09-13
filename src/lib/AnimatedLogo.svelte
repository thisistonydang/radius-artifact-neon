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
    <svg class="hero-logo-lockup" viewBox="105 15 425 175" aria-hidden="true">
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

<style>
  .hero-logo-button {
    position: relative;
    display: block;
    width: min(420px, 100%);
    margin: 0 auto clamp(2.2rem, 5vw, 3.5rem);
    padding: 0 0 1.2rem;
    overflow: hidden;
    border: 0;
    color: var(--text);
    background: transparent;
  }

  .hero-logo-button.animating {
    cursor: default;
  }

  .hero-logo-button:not(.animating) {
    cursor: pointer;
  }

  .hero-logo-lockup {
    display: block;
    width: 100%;
    height: auto;
  }

  .hero-logo-replay {
    position: absolute;
    right: 0;
    bottom: 0;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.58rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition: opacity 160ms ease;
  }

  .hero-logo-button.animating .hero-logo-replay {
    opacity: 0;
  }

  .radius-mark,
  .plus-block rect {
    fill: currentColor;
  }

  .neon-mark {
    fill: #37c38f;
  }

  .landing-line {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 2;
  }

  @media (prefers-reduced-motion: no-preference) {
    .logo-fragment,
    .plus-block {
      will-change: transform;
      animation: logo-drop 1.4s cubic-bezier(0.22, 0.61, 0.36, 1) both;
    }

    .radius-fragment-1 { --drop-x: -18px; animation-delay: 100ms; }
    .radius-fragment-2 { --drop-x: 12px; animation-delay: 450ms; }
    .radius-fragment-3 { --drop-x: -9px; animation-delay: 800ms; }
    .radius-fragment-4 { --drop-x: 16px; animation-delay: 1.15s; }

    .plus-block-1 { --drop-x: 7px; animation-delay: 100ms; }
    .plus-block-2 { --drop-x: -10px; animation-delay: 360ms; }
    .plus-block-3 { --drop-x: 5px; animation-delay: 630ms; }
    .plus-block-4 { --drop-x: 12px; animation-delay: 890ms; }
    .plus-block-5 { --drop-x: -6px; animation-delay: 1.15s; }

    .neon-fragment-1 { --drop-x: 18px; animation-delay: 100ms; }
    .neon-fragment-2 { --drop-x: -12px; animation-delay: 310ms; }
    .neon-fragment-3 { --drop-x: 9px; animation-delay: 520ms; }
    .neon-fragment-4 { --drop-x: -16px; animation-delay: 730ms; }
    .neon-fragment-5 { --drop-x: 14px; animation-delay: 940ms; }
    .neon-fragment-6 { --drop-x: -8px; animation-delay: 1.15s; }

    .assembled-exact {
      opacity: 0;
      animation: reveal-exact 1ms linear 2.56s forwards;
    }

    .landing-line {
      stroke: var(--accent);
      stroke-dasharray: 540;
      stroke-dashoffset: 540;
      animation: line-clear 600ms ease-out 2.7s forwards;
    }
  }

  @keyframes logo-drop {
    from {
      opacity: 1;
      transform: translate3d(var(--drop-x, 0), -190px, 0);
    }
    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @keyframes reveal-exact {
    to { opacity: 1; }
  }

  @keyframes line-clear {
    0% {
      stroke-dashoffset: 540;
      stroke-width: 2;
    }
    65% {
      stroke-dashoffset: 0;
      stroke-width: 5;
    }
    100% {
      stroke-dashoffset: 0;
      stroke: var(--line-strong);
      stroke-width: 2;
    }
  }
</style>
