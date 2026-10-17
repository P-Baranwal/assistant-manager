<script>
    import { undoStack } from '$lib/undoStack';

    let processing = false;

    async function handleUndo() {
        processing = true;
        await undoStack.undo();
        processing = false;
    }
</script>

{#if $undoStack}
    <div class="undo-toast" role="alert">
        <span class="undo-label">{$undoStack.label}</span>
        <button class="undo-btn" on:click={handleUndo} disabled={processing}>
            {processing ? 'Undoing...' : 'Undo'}
        </button>
        <button class="undo-dismiss" on:click={() => undoStack.dismiss()} aria-label="Dismiss">✕</button>
    </div>
{/if}

<style>
    .undo-toast {
        position: fixed;
        bottom: 1.5rem;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1.25rem;
        background: var(--surface-raised);
        color: var(--text-main);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        animation: slideUp 0.3s var(--ease);
        max-width: 90vw;
    }

    @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    .undo-label {
        font-size: var(--fs-base);
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 300px;
    }

    .undo-btn {
        background: var(--primary);
        color: var(--text-on-primary);
        border: none;
        border-radius: var(--radius-sm);
        padding: 0.375rem 0.875rem;
        font-size: var(--fs-sm);
        font-weight: 600;
        cursor: pointer;
        transition: var(--transition-fast);
        white-space: nowrap;
    }
    .undo-btn:hover:not(:disabled) {
        background: var(--primary-hover);
    }
    .undo-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .undo-dismiss {
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: var(--fs-base);
        padding: 0.25rem;
        line-height: 1;
        transition: color var(--transition-fast);
    }
    .undo-dismiss:hover {
        color: var(--text-main);
    }
</style>
