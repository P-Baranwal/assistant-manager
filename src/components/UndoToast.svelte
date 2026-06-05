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
        background: var(--surface-color, #1e293b);
        color: var(--text-main, #f1f5f9);
        border: 1px solid var(--border-color, #334155);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
        z-index: 10000;
        animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        backdrop-filter: blur(12px);
        max-width: 90vw;
    }

    @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    .undo-label {
        font-size: 0.875rem;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 300px;
    }

    .undo-btn {
        background: var(--primary, #3b82f6);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 0.375rem 0.875rem;
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, transform 0.1s;
        white-space: nowrap;
    }
    .undo-btn:hover:not(:disabled) {
        background: var(--primary-hover, #2563eb);
        transform: scale(1.02);
    }
    .undo-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .undo-dismiss {
        background: none;
        border: none;
        color: var(--text-muted, #94a3b8);
        cursor: pointer;
        font-size: 0.875rem;
        padding: 0.25rem;
        line-height: 1;
        transition: color 0.15s;
    }
    .undo-dismiss:hover {
        color: var(--text-main, #f1f5f9);
    }
</style>
