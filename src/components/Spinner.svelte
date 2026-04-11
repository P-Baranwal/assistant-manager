<script>
    export let show = false;
    export let text = "Processing...";
</script>

{#if show}
<div class="overlay transition-fade">
    <div class="flex flex-col items-center gap-4" style="color: white;">
        <div class="spinner"></div>
        <h3>{text}</h3>
    </div>
</div>
{/if}

<style>
    .transition-fade {
        animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
</style>
