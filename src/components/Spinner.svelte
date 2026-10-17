<script>
    export let show = false;
    export let text = "Processing...";
</script>

{#if show}
<div class="overlay">
    <div class="spinner-stack">
        <div class="spinner"></div>
        <h3 class="spinner-text">{text}</h3>
    </div>
</div>
{/if}

<style>
    .spinner-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }
    .spinner-text {
        color: #fff;
        font-weight: 500;
        font-size: var(--fs-lg);
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
    }
</style>
