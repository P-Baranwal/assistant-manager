<script>
    import { view, tasks, profile } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { uuid } from '$lib/utils/id';
    import { analyzeAssignment } from '$lib/llm/client';
    import Spinner from '../components/Spinner.svelte';

    let title = '';
    let description = '';
    let deadline = '';
    let loading = false;
    let errorText = '';
    let spinnerText = '';

    async function handleSaveBasic() {
        if (!title.trim()) {
            errorText = 'Title is required';
            return;
        }

        const newTask = {
            id: uuid(),
            entityType: 'task',
            title: title.trim(),
            description: description.trim(),
            deadline: deadline || null,
            status: 'active',
            priorityScore: 50,
            priorityReasoning: "Baseline task priority"
        };

        await storage.saveTask(newTask);
        await refreshTasks();
        view.set('dashboard');
    }

    async function handleSaveAI() {
        if (!title.trim()) {
            errorText = 'Title is required for AI to analyze';
            return;
        }

        loading = true;
        spinnerText = 'AI is analyzing task priority...';
        errorText = '';

        try {
            const rawContent = `Title: ${title}\nDescription: ${description}\nDeadline: ${deadline || 'None'}`;
            // Task has simplified analysis, passing standard profile context
            const rec = await analyzeAssignment(rawContent, $profile, "Please estimate purely the priority and deadline scaling for this simplified task.");
            
            const newTask = {
                id: uuid(),
                entityType: 'task',
                title: title.trim(),
                description: description.trim(),
                deadline: rec.deadline || deadline || null,
                status: 'active',
                priorityScore: rec.priorityScore || 50,
                priorityReasoning: rec.priorityReasoning || 'Assessed via AI'
            };

            await storage.saveTask(newTask);
            await refreshTasks();
            view.set('dashboard');
        } catch(err) {
            errorText = err.message || 'AI processing failed.';
        } finally {
            loading = false;
        }
    }

    async function refreshTasks() {
        const tIndex = await storage.getTaskIndex();
        const tPromises = tIndex.map(id => storage.getTask(id));
        const allTasks = (await Promise.all(tPromises)).filter(Boolean);
        tasks.set(allTasks);
    }
</script>

<div class="flex justify-between items-center mb-4">
    <h2>Task Manager</h2>
    <button class="btn" on:click={() => view.set('dashboard')}>Cancel</button>
</div>

<div class="card animate-fade">
    <div class="form-group">
        <label class="form-label" for="task-title">Title</label>
        <input id="task-title" type="text" class="input" bind:value={title} placeholder="What do you need to do?">
    </div>

    <div class="form-group">
        <label class="form-label" for="task-desc">Description (Optional)</label>
        <textarea id="task-desc" class="textarea" bind:value={description} placeholder="Add any details, sub-items, or notes here..."></textarea>
    </div>

    <div class="form-group">
        <label class="form-label" for="task-deadline">Deadline (Optional)</label>
        <input id="task-deadline" type="date" class="input" bind:value={deadline}>
    </div>

    {#if errorText}
        <div class="text-sm mt-4 mb-4" style="color: var(--danger); padding: 0.5rem; background: #fee2e2; border-radius:4px;">
            {errorText}
        </div>
    {/if}

    <div class="flex gap-4 mt-6">
        <button class="btn btn-primary" style="flex:1;" on:click={handleSaveBasic}>
            Save Quickly (Basic)
        </button>
        <button class="btn" style="flex:1; border-color: var(--primary); color: var(--primary);" on:click={handleSaveAI}>
            Save + AI Priority Analysis
        </button>
    </div>
</div>

<Spinner bind:show={loading} text={spinnerText} />

<style>
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
</style>
