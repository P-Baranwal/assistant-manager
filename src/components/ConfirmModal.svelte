<script>
    export let show = false;
    export let title = "Confirm Action";
    export let message = "Are you sure?";
    export let onConfirm = () => {};
    export let onCancel = () => {};
    
    function cancel() {
        show = false;
        onCancel();
    }
    
    function confirm() {
        show = false;
        onConfirm();
    }
</script>

{#if show}
<div class="overlay transition-fade">
    <div class="modal w-full max-w-sm">
        <h3>{title}</h3>
        <p class="text-muted mt-2 mb-4">{message}</p>
        <div class="flex gap-2 justify-end">
            <button class="btn" on:click={cancel}>Cancel</button>
            <button class="btn btn-danger" on:click={confirm}>Confirm</button>
        </div>
    </div>
</div>
{/if}

<style>
    .transition-fade {
        animation: fadeInScale 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    @keyframes fadeInScale {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
    .w-full { width: 100%; }
    .max-w-sm { max-width: 24rem; }
</style>
