<script>
    import { view, profile, assignments, tasks, activeDraft } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { extractTaskFromText } from '$lib/llm/client';
    import { uuid } from '$lib/utils/id';
    import Spinner from './Spinner.svelte';

    let inputText = '';
    let processing = false;
    let spinnerText = '';
    let errorMsg = '';
    let preview = null;

    async function handleSubmit() {
        if (!inputText.trim()) return;
        errorMsg = '';
        spinnerText = 'Extracting task...';
        processing = true;
        try {
            const extracted = await extractTaskFromText(inputText.trim(), $profile);
            preview = {
                ...extracted,
                rawContent: inputText.trim()
            };
        } catch (e) {
            errorMsg = e.message || 'Could not extract task from text.';
        }
        processing = false;
    }

    function handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }

    async function savePreview() {
        if (!preview) return;
        const newObj = {
            id: uuid(),
            entityType: 'assignment',
            title: preview.title,
            type: preview.type,
            deadline: preview.deadline || null,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            analyzedAt: new Date().toISOString(),
            difficulty: 5,
            difficultyReasoning: 'Natural language entry',
            estimatedHours: preview.estimatedHours || 1,
            estimatedHoursReasoning: 'Extracted from natural language input',
            priorityScore: 50,
            priorityReasoning: 'Default — will be updated on next analysis',
            boost: { active: false, reason: null, boostedPriorityScore: null },
            checklist: [],
            rawContent: preview.rawContent
        };

        spinnerText = 'Saving...';
        processing = true;
        await storage.saveAssignment(newObj);

        const allIds = await storage.getIndex();
        const all = (await Promise.all(allIds.map(id => storage.getAssignment(id)))).filter(Boolean);
        assignments.set(all);

        processing = false;
        preview = null;
        inputText = '';
    }

    function cancelPreview() {
        preview = null;
    }
</script>

<div class="nl-input-container">
    {#if !preview}
        <div class="nl-input-row">
            <input
                type="text"
                class="nl-input"
                bind:value={inputText}
                on:keydown={handleKeydown}
                placeholder="Add a task... (e.g. 'Coding assignment due Friday, 3 hours, 20% of grade')"
                disabled={processing}
            >
            <button class="btn btn-primary nl-submit-btn" on:click={handleSubmit} disabled={!inputText.trim() || processing} aria-label="Submit task">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
        </div>
    {:else}
        <div class="nl-preview-card animate-fade">
            <div class="nl-preview-header">
                <span class="text-xs text-muted" style="font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">AI Extracted Task</span>
            </div>
            <div class="nl-preview-fields">
                <div class="form-group mb-2">
                    <input type="text" class="input" bind:value={preview.title} placeholder="Task title">
                </div>
                <div class="flex gap-2">
                    <select class="input" bind:value={preview.type} style="width: auto; flex: 0 0 auto;">
                        <option>Essay</option><option>Coding</option><option>Math</option>
                        <option>Research</option><option>Other</option>
                    </select>
                    <input type="date" class="input" bind:value={preview.deadline} style="width: auto;">
                    <input type="number" class="input" bind:value={preview.estimatedHours} placeholder="Hours" min="0.25" step="0.25" style="width: 80px;">
                </div>
                {#if preview.notes}
                    <p class="text-xs text-muted mt-2">{preview.notes}</p>
                {/if}
            </div>
            <div class="nl-preview-actions">
                <button class="btn" on:click={cancelPreview}>Cancel</button>
                <button class="btn btn-primary" on:click={savePreview}>Add Task</button>
            </div>
        </div>
    {/if}

    {#if errorMsg}
        <div class="nl-error text-sm mt-2">{errorMsg}</div>
    {/if}
</div>

<Spinner bind:show={processing} text={spinnerText} />

<style>
    .nl-input-container {
        margin-bottom: 1.25rem;
    }
    .nl-input-row {
        display: flex;
        gap: 0.5rem;
    }
    .nl-input {
        flex: 1;
        padding: 0.75rem 1rem;
        background: var(--surface-color);
        color: var(--text-main);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        font-size: 0.9375rem;
        transition: var(--transition);
    }
    .nl-input:focus {
        border-color: var(--primary);
        box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
    }
    .nl-input::placeholder {
        color: var(--text-light);
    }
    .nl-submit-btn {
        padding: 0.75rem;
        flex-shrink: 0;
    }
    .nl-preview-card {
        background: var(--surface-color);
        border: 1px solid var(--primary);
        border-radius: var(--radius);
        padding: 1rem;
    }
    .nl-preview-header {
        margin-bottom: 0.75rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--border-color);
    }
    .nl-preview-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border-color);
    }
    .nl-error {
        color: var(--danger);
        padding: 0.5rem 0.75rem;
        background: rgba(239, 68, 68, 0.08);
        border-radius: 4px;
    }
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
</style>
