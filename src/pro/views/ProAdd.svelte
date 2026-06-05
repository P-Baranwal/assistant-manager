<script>
    import { view, profile, projects, tasks } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { generateWBS } from '$lib/llm/client';
    import { uuid } from '$lib/utils/id';
    import Spinner from '../../components/Spinner.svelte';

    // Project selection
    let selectedProjectId = $profile?.defaultProjectId || '';
    let newProjectTitle = '';
    let creatingNew = false;

    // Brief
    let briefText = '';

    // WBS Preview
    let previewTasks = null;
    let processing = false;
    let spinnerText = 'Processing...';
    let errorMsg = '';

    async function generateBreakdown() {
        if (!briefText.trim()) return;
        errorMsg = '';
        spinnerText = 'Generating Work Breakdown...';
        processing = true;

        try {
            const result = await generateWBS(briefText.trim(), $profile);
            previewTasks = result.map(t => ({
                ...t,
                _id: uuid() // temp id for keying
            }));
        } catch (e) {
            errorMsg = e.message || 'Failed to generate WBS.';
        }
        processing = false;
    }

    function deleteRow(idx) {
        previewTasks = previewTasks.filter((_, i) => i !== idx);
    }

    function addRow() {
        previewTasks = [...previewTasks, {
            _id: uuid(),
            title: '',
            estimatedHours: 1,
            impactScore: 5
        }];
    }

    async function saveAll() {
        if (!previewTasks || previewTasks.length === 0) return;
        errorMsg = '';
        spinnerText = 'Saving...';
        processing = true;

        try {
            // Handle project creation if needed
            let projectId = selectedProjectId;
            if (creatingNew && newProjectTitle.trim()) {
                const newProject = {
                    id: uuid(),
                    title: newProjectTitle.trim(),
                    clientContext: briefText.trim(),
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                await storage.saveProject(newProject);
                projectId = newProject.id;
                selectedProjectId = newProject.id;
                creatingNew = false;
                newProjectTitle = '';

                // Refresh projects store
                const pIndex = await storage.getProjectIndex();
                const pPromises = pIndex.map(id => storage.getProject(id));
                const allProjects = (await Promise.all(pPromises)).filter(Boolean);
                projects.set(allProjects);
            }

            const savedTasks = [];
            const failedTasks = [];

            // Save each task
            for (const pt of previewTasks) {
                if (!pt.title.trim()) continue;
                try {
                    const task = {
                        id: pt.id || uuid(),
                        entityType: 'task',
                        title: pt.title.trim(),
                        description: pt.description || '',
                        status: 'todo',
                        projectId: projectId || null,
                        estimatedHours: pt.estimatedHours,
                        impactScore: pt.impactScore,
                        actualHours: pt.actualHours || 0,
                        blockerNote: pt.blockerNote || null,
                        deadline: pt.deadline || null,
                        createdAt: pt.createdAt || new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    await storage.saveTask(task);
                    pt.id = task.id;
                    pt.createdAt = task.createdAt;
                    pt.saved = true;
                    savedTasks.push(pt);
                } catch (e) {
                    pt.saved = false;
                    failedTasks.push(pt);
                    console.error("Failed to save task", pt, e);
                }
            }

            // Refresh tasks store
            const tIndex = await storage.getTaskIndex();
            const tPromises = tIndex.map(id => storage.getTask(id));
            const allTasks = (await Promise.all(tPromises)).filter(Boolean);
            tasks.set(allTasks);

            if (failedTasks.length > 0) {
                previewTasks = failedTasks;
                errorMsg = `Saved ${savedTasks.length} tasks, but ${failedTasks.length} tasks failed to save. You can review and retry saving the failed tasks.`;
                processing = false;
            } else {
                processing = false;
                view.set('dashboard');
            }
        } catch (e) {
            errorMsg = e.message || 'Failed to save tasks.';
            processing = false;
        }
    }
</script>

<div class="flex justify-between items-center mb-4">
    <h2>New Project / Work Breakdown</h2>
    <button class="btn" on:click={() => view.set('dashboard')}>Cancel</button>
</div>

{#if !previewTasks}
    <div class="animate-fade">
        <!-- Project Selection -->
        <div class="card mb-4">
            <div class="card-title mb-4">Project</div>
            <div class="form-group mb-2">
                <label class="form-label">
                    <input type="radio" bind:group={creatingNew} value={false}> Select Existing Project
                </label>
            </div>
            {#if !creatingNew}
                <div class="form-group">
                    <select class="input" bind:value={selectedProjectId}>
                        <option value="">No Project (Inbox)</option>
                        {#each $projects as proj}
                            <option value={proj.id}>{proj.title}</option>
                        {/each}
                    </select>
                </div>
            {/if}
            <div class="form-group mb-2">
                <label class="form-label">
                    <input type="radio" bind:group={creatingNew} value={true}> + Create New Project
                </label>
            </div>
            {#if creatingNew}
                <div class="form-group">
                    <input type="text" class="input" bind:value={newProjectTitle} placeholder="New project name...">
                </div>
            {/if}
        </div>

        <!-- Client Brief -->
        <div class="card mb-4">
            <div class="card-title mb-4">Client Brief / Feature Request</div>
            <div class="form-group mb-0">
                <textarea class="textarea" bind:value={briefText} placeholder="Paste the full brief, feature request, or project description here..." style="min-height:160px"></textarea>
            </div>
        </div>

        <button class="btn btn-primary w-full justify-center" style="padding:0.75rem"
                on:click={generateBreakdown}
                disabled={!briefText.trim()}>
            Generate Work Breakdown (AI)
        </button>

        {#if errorMsg}
            <div class="text-sm mt-4 p-2 rounded" style="color: var(--danger); background: #fee2e2;">{errorMsg}</div>
        {/if}
    </div>
{:else}
    <div class="animate-fade">
        <div class="card" style="border-color: var(--primary);">
            <div class="text-sm text-muted mb-2">Preview & Edit — {previewTasks.length} sub-tasks</div>

            <table class="wbs-table">
                <thead>
                    <tr>
                        <th style="width:50%">Task Title</th>
                        <th style="width:20%">Est. Hours</th>
                        <th style="width:20%">Impact (1-10)</th>
                        <th style="width:10%"></th>
                    </tr>
                </thead>
                <tbody>
                    {#each previewTasks as task, i (task._id)}
                        <tr>
                            <td><input type="text" class="input" bind:value={task.title} style="padding:0.375rem"></td>
                            <td><input type="number" class="input" bind:value={task.estimatedHours} min="0.25" step="0.25" style="padding:0.375rem"></td>
                            <td><input type="number" class="input" bind:value={task.impactScore} min="1" max="10" style="padding:0.375rem"></td>
                            <td>
                                <button class="btn btn-danger" style="padding:0.25rem 0.5rem; font-size:0.75rem" on:click={() => deleteRow(i)}>✕</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>

            <div class="flex gap-2 mt-4">
                <button class="btn" on:click={addRow}>+ Add Row</button>
            </div>

            {#if errorMsg}
                <div class="text-sm mt-4 p-2 rounded" style="color: var(--danger); background: #fee2e2;">{errorMsg}</div>
            {/if}

            <div class="flex gap-2 justify-end mt-4">
                <button class="btn" on:click={() => previewTasks = null}>Discard</button>
                <button class="btn btn-primary" on:click={saveAll}>Save All Tasks</button>
            </div>
        </div>
    </div>
{/if}

<Spinner bind:show={processing} text={spinnerText} />

<style>
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .w-full { width: 100%; }
    .wbs-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 0.5rem;
    }
    .wbs-table th, .wbs-table td {
        padding: 0.5rem;
        border: 1px solid var(--border-color);
        text-align: left;
    }
    .wbs-table th {
        background: var(--bg-color);
        font-weight: 600;
        font-size: 0.8125rem;
    }
</style>
