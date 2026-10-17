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
<div class="overlay">
    <div class="modal confirm-modal" role="dialog" aria-modal="true">
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
    .confirm-modal {
        max-width: 24rem;
    }
</style>
