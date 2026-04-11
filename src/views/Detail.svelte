<script>
    import { view, activeDetailId, profile, assignments, tasks } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { analyzeAssignment } from '$lib/llm/client';
    import { uuid } from '$lib/utils/id';
    import Spinner from '../components/Spinner.svelte';
    import ConfirmModal from '../components/ConfirmModal.svelte';
    
    let detail = null;
    let loading = true;
    let processing = false;
    let spinnerText = '';
    let errorMsg = '';
    let confirmConfig = { show: false, title: '', message: '', onConfirm: null };
    
    // Derived values
    $: isBoosted = detail?.boost?.active;
    $: boostReasonInput = '';

    const typeColors = {
        'Essay': {bg: 'var(--bg-essay)', text: 'var(--text-essay)'},
        'Coding': {bg: 'var(--bg-coding)', text: 'var(--text-coding)'},
        'Math': {bg: 'var(--bg-math)', text: 'var(--text-math)'},
        'Research': {bg: 'var(--bg-research)', text: 'var(--text-research)'},
        'Other': {bg: 'var(--bg-other)', text: 'var(--text-other)'}
    };
    
    const getDiffColor = (d) => d <= 3 ? 'var(--diff-low)' : d <= 6 ? 'var(--diff-med)' : 'var(--diff-high)';

    $: if ($activeDetailId) {
        loadDetail($activeDetailId.id, $activeDetailId.type);
    }
    
    async function loadDetail(id, type) {
        loading = true;
        let res;
        if (type === 'task') {
            res = await storage.getTask(id);
        } else {
            res = await storage.getAssignment(id);
        }
        if (res) detail = res;
        loading = false;
    }

    async function commitUpdate() {
        if (!detail) return;
        if (detail.entityType === 'task') {
            await storage.saveTask(detail);
            await refreshTasks();
        } else {
            await storage.saveAssignment(detail);
            await refreshAssignments();
        }
    }

    async function refreshAssignments() {
        const allIds = await storage.getIndex();
        const all = (await Promise.all(allIds.map(id => storage.getAssignment(id)))).filter(Boolean);
        assignments.set(all);
    }

    async function refreshTasks() {
        const tIndex = await storage.getTaskIndex();
        const tPromises = tIndex.map(id => storage.getTask(id));
        const allTasks = (await Promise.all(tPromises)).filter(Boolean);
        tasks.set(allTasks);
    }

    async function handleCheckToggle() {
        await commitUpdate();
    }

    async function handleDateChange() {
        await commitUpdate();
    }

    function markDone() {
        confirmConfig = {
            show: true,
            title: "Mark Done",
            message: "Are you sure you want to mark this complete?",
            onConfirm: async () => {
                detail.status = 'done';
                await commitUpdate();
                view.set('dashboard');
                confirmConfig.show = false;
            }
        };
    }

    function deleteItem() {
        confirmConfig = {
            show: true,
            title: "Delete " + (detail.entityType === 'task' ? 'Task' : 'Assignment'),
            message: "This cannot be undone.",
            onConfirm: async () => {
                if (detail.entityType === 'task') {
                    await storage.deleteTask(detail.id);
                    await refreshTasks();
                } else {
                    await storage.deleteAssignment(detail.id);
                    await refreshAssignments();
                }
                view.set('dashboard');
                confirmConfig.show = false;
            }
        };
    }

    async function applyBoost() {
        if (!boostReasonInput.trim()) return;
        
        spinnerText = "AI is boosting...";
        processing = true;
        errorMsg = '';
        try {
            const rawContent = detail.entityType === 'task' 
                ? `Title: ${detail.title}\nDescription: ${detail.description}`
                : detail.rawContent;

            const rec = await analyzeAssignment(rawContent, $profile, boostReasonInput, detail);
            detail.boost = { active: true, reason: boostReasonInput, boostedPriorityScore: rec.priorityScore };
            detail.priorityReasoning = rec.priorityReasoning;
            await commitUpdate();
            boostReasonInput = '';
        } catch(err) {
            errorMsg = err.message;
        }
        processing = false;
    }

    async function removeBoost() {
        detail.boost = { active: false, reason: null, boostedPriorityScore: null };
        await commitUpdate();
        
        spinnerText = "Recalculating baseline...";
        processing = true;
        try {
            const rawContent = detail.entityType === 'task' 
                ? `Title: ${detail.title}\nDescription: ${detail.description}`
                : detail.rawContent;
            const rec = await analyzeAssignment(rawContent, $profile);
            detail.priorityScore = rec.priorityScore;
            detail.priorityReasoning = rec.priorityReasoning;
            await commitUpdate();
        } catch(err) {} 
        processing = false;
    }

    async function reAnalyze() {
        spinnerText = "Re-analyzing via AI...";
        processing = true;
        errorMsg = '';
        try {
            const rec = await analyzeAssignment(detail.rawContent, $profile);
            detail.difficulty = rec.difficulty;
            detail.difficultyReasoning = rec.difficultyReasoning;
            detail.priorityScore = rec.priorityScore;
            detail.priorityReasoning = rec.priorityReasoning;
            detail.estimatedHours = rec.estimatedHours;
            detail.estimatedHoursReasoning = rec.estimatedHoursReasoning;
            detail.analyzedAt = new Date().toISOString();
            
            detail.checklist = rec.checklist.map(rItem => {
                const text = typeof rItem === 'string' ? rItem : rItem.text;
                return { id: uuid(), text: text, done: false };
            });
            await commitUpdate();
        } catch(err) {
            errorMsg = err.message;
        }
        processing = false;
    }
</script>

{#if loading || !detail}
    <div class="text-center p-8 text-muted">Loading detail...</div>
{:else}
    <div class="animate-fade">
        <div class="flex justify-between items-center mb-4">
            <button class="btn" on:click={() => view.set('dashboard')}>← Back</button>
            <div class="flex gap-2">
                {#if detail.status !== 'done'}
                    <button class="btn btn-primary" on:click={markDone}>Mark Done</button>
                {/if}
                <button class="btn btn-danger" on:click={deleteItem}>Delete</button>
            </div>
        </div>
        
        <div class="card">
            <div class="flex justify-between items-start">
                <h2 style="margin:0">{detail.title}</h2>
                {#if detail.entityType === 'assignment'}
                    <span class="tag" style="background:{typeColors[detail.type]?.bg||''}; color:{typeColors[detail.type]?.text||''}">{detail.type}</span>
                {:else}
                    <span class="tag tag-gray">Task</span>
                {/if}
            </div>
            <div class="flex items-center gap-2 mt-2">
                <label class="text-sm" for="detail-date">Deadline:</label>
                <input id="detail-date" type="date" class="input" bind:value={detail.deadline} on:change={handleDateChange} style="width:auto; padding:0.25rem 0.5rem;">
            </div>
            
            <div class="detail-meta-grid">
                {#if detail.entityType === 'assignment'}
                    <div class="detail-card">
                        <strong>Difficulty: <span style="color:{getDiffColor(detail.difficulty)}">{detail.difficulty}</span>/10</strong>
                        <p class="text-sm text-muted mt-1">{detail.difficultyReasoning}</p>
                    </div>
                    <div class="detail-card">
                        <strong>Est. Hours: {detail.estimatedHours}</strong>
                        <p class="text-sm text-muted mt-1">{detail.estimatedHoursReasoning}</p>
                    </div>
                {/if}
                <div class="detail-card" style="{isBoosted ? 'border-color:var(--primary)' : ''}">
                    <strong>Priority: {isBoosted ? detail.boost.boostedPriorityScore : detail.priorityScore}</strong>
                    <p class="text-sm text-muted mt-1">{isBoosted ? detail.boost.reason : detail.priorityReasoning}</p>
                </div>
            </div>

            {#if detail.entityType === 'task' && detail.description}
                <div class="mb-4">
                    <h3 style="font-size:1rem; margin-bottom:0.5rem">Description</h3>
                    <p class="text-sm" style="white-space: pre-wrap;">{detail.description}</p>
                </div>
            {/if}

            {#if detail.entityType === 'assignment'}
                <hr style="border:0; border-top:1px solid var(--border-color); margin: 1.5rem 0;">
                
                <div class="flex justify-between items-center mb-4">
                    <h3 style="font-size:1.125rem">Checklist</h3>
                    <div class="text-sm text-muted">{detail.checklist.filter(x => x.done).length}/{detail.checklist.length}</div>
                </div>

                <div>
                    {#if detail.checklist.length > 0}
                        {#each detail.checklist as item (item.id)}
                            <label class="checklist-item">
                                <input type="checkbox" bind:checked={item.done} on:change={handleCheckToggle}>
                                <span class="checklist-text">{item.text}</span>
                            </label>
                        {/each}
                    {:else}
                        <p class="text-sm text-muted">No checklist items.</p>
                    {/if}
                </div>
            {/if}
            
            <hr style="border:0; border-top:1px solid var(--border-color); margin: 1.5rem 0;">
            
            {#if detail.status !== 'done' || isBoosted}
                <div style="background:var(--bg-color); padding:1rem; border-radius:var(--radius);">
                    <h3 style="font-size: 1rem; margin-bottom:0.5rem">Boost Priority</h3>
                    {#if isBoosted}
                        <p class="text-sm mb-2 text-muted">Boosted: "{detail.boost.reason}"</p>
                        <button class="btn btn-danger" on:click={removeBoost}>Remove Boost</button>
                    {:else if detail.status !== 'done'}
                        <div class="flex gap-2">
                            <input type="text" class="input" bind:value={boostReasonInput} placeholder="Why should this be prioritized?" aria-label="Boost Reason">
                            <button class="btn btn-primary" on:click={applyBoost} disabled={!boostReasonInput.trim()}>Apply Boost</button>
                        </div>
                    {/if}
                </div>
            {/if}

            {#if detail.status !== 'done' && detail.entityType === 'assignment'}
                <div class="mt-4 flex justify-end">
                    <button class="btn" on:click={reAnalyze}>Re-Analyze (AI)</button>
                </div>
            {/if}

            {#if errorMsg}
                <div class="text-sm mt-4" style="color: var(--danger); padding: 0.5rem; background: #fee2e2; border-radius:4px;">{errorMsg}</div>
            {/if}
        </div>
    </div>
{/if}

<Spinner bind:show={processing} text={spinnerText} />
<ConfirmModal bind:show={confirmConfig.show} title={confirmConfig.title} message={confirmConfig.message} onConfirm={confirmConfig.onConfirm} />

<style>
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
</style>
