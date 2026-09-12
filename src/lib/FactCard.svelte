<script lang="ts">
  import type { Fact } from './types'

  export let fact: Fact
</script>

<article class="fact-card">
  <div class="fact-card__media">
    {#if fact.logoUrl}
      <img src={fact.logoUrl} alt={`${fact.name} logo`} loading="lazy" />
    {:else}
      <span aria-hidden="true">{fact.name.slice(0, 2).toUpperCase()}</span>
    {/if}
  </div>
  <div class="fact-card__body">
    <p class="eyebrow">{fact.category}</p>
    <h3>{fact.name}</h3>
    <p>{fact.summary}</p>
    <p class="fact-card__fact"><span>FUN FACT</span> {fact.funFact}</p>
    <div class="fact-card__footer">
      {#if fact.attachmentName}
        <span class="attachment">↳ {fact.attachmentName}</span>
      {/if}
      <a href={fact.sourceUrl} target="_blank" rel="noreferrer">[ source ]</a>
    </div>
  </div>
</article>
