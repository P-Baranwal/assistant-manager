<script>
    import { view, profile, assignments } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { analyzeAssignment } from '$lib/llm/client';
    import { extractPdfText } from '$lib/parsers/pdf';
    import { uuid } from '$lib/utils/id';
    import Spinner from '../components/Spinner.svelte';

    let currentTab = 'paste';
    
    // Form States
    let pasteText = '';
    let pasteNotes = '';
    
    let mForm = { title: '', desc: '', type: 'Other', date: '', notes: '' };
    
    let uploadFile = null;
    let uploadCourse = '';
    let uploadType = '';
    let uploadDate = '';
    let uploadWeight = '';
    let uploadNotes = '';
    let fileInputRef;

    // View States
    let draft = null;
    let errorMsg = '';
    let processing = false;
    let spinnerText = 'Processing...';

    const handleFileChange = () => {
        if (fileInputRef?.files?.length > 0) {
            uploadFile = fileInputRef.files[0];
        }
    };
    
    const clearFile = () => {
        uploadFile = null;
        if (fileInputRef) fileInputRef.value = '';
    };

    async function analyze() {
        errorMsg = '';
        let rawText = '';
        let manualMode = false;
        
        if (currentTab === 'paste') {
            if (!pasteText.trim()) return;
            rawText = pasteText.trim();
            if (pasteNotes.trim()) rawText += `\n\n--- ADDITIONAL CONTEXT PROVIDED BY USER ---\nAdditional Notes: ${pasteNotes.trim()}`;
        } else if (currentTab === 'manual') {
            if (!mForm.title.trim()) return;
            rawText = mForm.desc.trim();
            if (mForm.notes.trim()) rawText += `\n\n--- ADDITIONAL CONTEXT PROVIDED BY USER ---\nAdditional Notes: ${mForm.notes.trim()}`;
            if (!rawText.trim()) manualMode = true; 
        } else if (currentTab === 'upload') {
            if (!uploadFile) return;
            spinnerText = "Extracting PDF...";
            processing = true;
            try {
                rawText = await extractPdfText(uploadFile);
            } catch (e) {
                processing = false;
                alert(e);
                return;
            }
            
            let ctx = '\n\n--- ADDITIONAL CONTEXT PROVIDED BY USER ---';
            let hasCtx = false;
            if (uploadCourse) { ctx += `\nCourse/Subject: ${uploadCourse}`; hasCtx = true; }
            if (uploadType) { ctx += `\nAssignment Type: ${uploadType}`; hasCtx = true; }
            if (uploadDate) { ctx += `\nDeadline: ${uploadDate}`; hasCtx = true; }
            if (uploadWeight) { ctx += `\nWeightage/Points: ${uploadWeight}`; hasCtx = true; }
            if (uploadNotes) { ctx += `\nAdditional Notes: ${uploadNotes}`; hasCtx = true; }
            if (hasCtx) rawText += ctx;
        }

        let resultContext = null;
        if (!manualMode) {
            spinnerText = "Analyzing Assignment...";
            processing = true;
            try {
                resultContext = await analyzeAssignment(rawText, $profile);
            } catch (e) {
                errorMsg = "LLM Parsing Failed. Edit skeleton below.";
                resultContext = {
                    title: mForm.title || "Unknown Task",
                    type: mForm.type || 'Other',
                    deadline: mForm.date || null,
                    difficulty: 5, difficultyReasoning: "Fallback based on failure",
                    estimatedHours: 1, estimatedHoursReasoning: "Fallback",
                    priorityScore: 50, priorityReasoning: "Fallback",
                    checklist: []
                };
            }
            processing = false;
        } else {
            resultContext = {
                title: mForm.title, type: mForm.type, deadline: mForm.date || null,
                difficulty: 5, difficultyReasoning: "Manual entry default",
                estimatedHours: 1, estimatedHoursReasoning: "Manual entry default",
                priorityScore: 50, priorityReasoning: "Manual entry default",
                checklist: []
            };
        }
        
        draft = {
            ...resultContext,
            rawContent: rawText,
            checklist: resultContext.checklist.map(t => ({ id: uuid(), text: t.text || t, done: false })),
            // Bound proxy string for textarea
            checklistText: resultContext.checklist.map(t => t.text || t).join('\n')
        };
    }

    async function savePreview() {
        if (!draft) return;
        
        // Parse textarea lines back into checklist array, retaining old IDs if match
        const lines = draft.checklistText.split('\n').map(l => l.trim()).filter(Boolean);
        const newChecklist = lines.map(line => {
            const exist = draft.checklist.find(c => c.text === line);
            return exist ? exist : { id: uuid(), text: line, done: false };
        });

        const newObj = {
            ...draft,
            id: uuid(),
            title: draft.title || 'Untitled',
            type: draft.type,
            deadline: draft.deadline || null,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            analyzedAt: new Date().toISOString(),
            boost: { active: false, reason: null, boostedPriorityScore: null },
            checklist: newChecklist
        };
        
        delete newObj.checklistText; // Clear dummy
        
        spinnerText = "Saving...";
        processing = true;
        await storage.saveAssignment(newObj);
        
        const allIds = await storage.getIndex();
        const all = (await Promise.all(allIds.map(id => storage.getAssignment(id)))).filter(Boolean);
        assignments.set(all);
        
        processing = false;
        view.set('dashboard');
    }
</script>

<div class="flex justify-between items-center mb-4">
    <h2>Add Assignment</h2>
    <button class="btn" on:click={() => view.set('dashboard')}>Cancel</button>
</div>

{#if !draft}
    <div id="add-entry-state" class="animate-fade">
        <div class="tabs" role="tablist">
            {#each ['paste', 'upload', 'manual'] as tab}
                <div class="tab {currentTab === tab ? 'active' : ''}"
                     role="tab" tabindex="0" aria-selected={currentTab === tab}
                     on:click={() => currentTab = tab}
                     on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (currentTab = tab)}>
                    {tab === 'paste' ? 'Paste Text' : tab === 'upload' ? 'Upload PDF' : 'Manual'}
                </div>
            {/each}
        </div>

        {#if currentTab === 'paste'}
            <div class="tab-content">
                <textarea id="paste-input" aria-label="paste content" class="textarea" bind:value={pasteText} placeholder="Paste the full assignment prompt or description here..."></textarea>
                <div class="form-group mt-4 mb-0">
                    <label class="form-label" for="paste-notes">Extra Notes for AI</label>
                    <textarea id="paste-notes" class="textarea" bind:value={pasteNotes} style="min-height:80px" placeholder="Anything else the AI should know — special requirements, grading criteria, etc."></textarea>
                </div>
                <button class="btn btn-primary mt-4" on:click={analyze} disabled={!pasteText.trim()}>Analyze & Preview</button>
            </div>
        {/if}

        {#if currentTab === 'upload'}
            <div class="tab-content">
                <div class="upload-zone card">
                    <input type="file" bind:this={fileInputRef} on:change={handleFileChange} accept="application/pdf" style="display:none" aria-label="upload pdf">
                    {#if !uploadFile}
                        <div class="upload-zone-inner">
                            <svg class="svg-icon" style="width:40px;height:40px;margin-bottom:0.75rem;color:var(--text-muted)" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>
                            <p class="text-sm" style="font-weight:500">Drop a PDF here or</p>
                            <button class="btn btn-primary mt-2" on:click={() => fileInputRef.click()} style="font-size:0.8125rem">
                                Choose PDF File
                            </button>
                            <p class="text-xs text-muted mt-2">Requires internet for PDF parsing library</p>
                        </div>
                    {:else}
                        <div class="upload-zone-selected">
                            <div class="upload-file-badge">
                                <svg class="svg-icon" style="width:20px;height:20px;flex-shrink:0" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>
                                <span class="text-sm" style="font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{uploadFile.name}</span>
                                <button class="btn" on:click={clearFile} style="padding:0.25rem 0.5rem;font-size:0.75rem">✕ Remove</button>
                            </div>
                        </div>
                    {/if}
                </div>

                <div class="upload-context-section mt-4">
                    <div class="upload-context-header mb-2 flex items-center gap-2">
                        <svg class="svg-icon" style="width:18px;height:18px" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        <span style="font-weight:500">Additional Context <span class="text-xs text-muted">(helps AI accuracy)</span></span>
                    </div>
                    <div class="upload-context-grid">
                        <div class="form-group mb-0">
                            <label class="form-label" for="upload-course">Course / Subject</label>
                            <input id="upload-course" type="text" class="input" bind:value={uploadCourse} placeholder="CS 201">
                        </div>
                        <div class="form-group mb-0">
                            <label class="form-label" for="upload-type">Assignment Type</label>
                            <select id="upload-type" class="input" bind:value={uploadType}>
                                <option value="">Auto-detect from PDF</option>
                                <option>Essay</option><option>Coding</option><option>Math</option>
                                <option>Research</option><option>Other</option>
                            </select>
                        </div>
                        <div class="form-group mb-0">
                            <label class="form-label" for="upload-date">Deadline</label>
                            <input id="upload-date" type="date" class="input" bind:value={uploadDate}>
                        </div>
                        <div class="form-group mb-0">
                            <label class="form-label" for="upload-weight">Weightage / Points</label>
                            <input id="upload-weight" type="text" class="input" bind:value={uploadWeight} placeholder="20% of grade">
                        </div>
                    </div>
                    <div class="form-group mt-4 mb-0">
                        <label class="form-label" for="upload-notes">Extra Notes for AI</label>
                        <textarea id="upload-notes" class="textarea" bind:value={uploadNotes} style="min-height:80px" placeholder="Anything else the AI should know..."></textarea>
                    </div>
                </div>

                <button class="btn btn-primary mt-4 w-full justify-center" on:click={analyze} disabled={!uploadFile} style="padding:0.75rem">
                    Analyze PDF & Context
                </button>
            </div>
        {/if}

        {#if currentTab === 'manual'}
            <div class="tab-content">
                <div class="form-group">
                    <label class="form-label" for="m-title">Title</label>
                    <input id="m-title" type="text" class="input" bind:value={mForm.title}>
                </div>
                <div class="form-group">
                    <label class="form-label" for="m-desc">Description (Optional)</label>
                    <textarea id="m-desc" class="textarea" bind:value={mForm.desc}></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label" for="m-notes">Extra Notes for AI</label>
                    <textarea id="m-notes" class="textarea" bind:value={mForm.notes}></textarea>
                </div>
                <div class="flex gap-4">
                    <div class="form-group flex-1">
                        <label class="form-label" for="m-type">Type</label>
                        <select id="m-type" class="input" bind:value={mForm.type}>
                            <option>Essay</option><option>Coding</option><option>Math</option>
                            <option>Research</option><option>Other</option>
                        </select>
                    </div>
                    <div class="form-group flex-1">
                        <label class="form-label" for="m-date">Deadline</label>
                        <input id="m-date" type="date" class="input" bind:value={mForm.date}>
                    </div>
                </div>
                <button class="btn btn-primary mt-2" on:click={analyze} disabled={!mForm.title.trim()}>Process Manually/Analyze</button>
            </div>
        {/if}
    </div>
{:else}
    <div id="add-preview-state" class="animate-fade">
        <div class="card" style="border-color: var(--primary);">
            <div class="text-sm text-muted mb-2">Preview & Edit</div>
            <div class="form-group">
                <label class="form-label" for="draft-title">Title</label>
                <input id="draft-title" type="text" class="input" bind:value={draft.title}>
            </div>
            <div class="flex gap-4">
                <div class="form-group flex-1">
                    <label class="form-label" for="draft-type">Type</label>
                    <select id="draft-type" class="input" bind:value={draft.type}>
                        <option>Essay</option><option>Coding</option><option>Math</option>
                        <option>Research</option><option>Other</option>
                    </select>
                </div>
                <div class="form-group flex-1">
                    <label class="form-label" for="draft-date">Deadline</label>
                    <input id="draft-date" type="date" class="input" bind:value={draft.deadline}>
                </div>
            </div>
            
            <div class="detail-meta-grid" style="margin: 0.5rem 0;">
                <div class="detail-card text-sm">
                    <strong>Difficulty: <span>{draft.difficulty}</span>/10</strong>
                    <p class="text-muted mt-1">{draft.difficultyReasoning}</p>
                </div>
                <div class="detail-card text-sm">
                    <strong>Est. Hours: <span>{draft.estimatedHours}</span>h</strong>
                    <p class="text-muted mt-1">{draft.estimatedHoursReasoning}</p>
                </div>
                <div class="detail-card text-sm">
                    <strong>Priority: <span>{draft.priorityScore}</span></strong>
                    <p class="text-muted mt-1">{draft.priorityReasoning}</p>
                </div>
            </div>

            <div class="form-group mt-4">
                <label class="form-label" for="draft-check">Checklist Items (Edit one per line)</label>
                <textarea id="draft-check" class="textarea" bind:value={draft.checklistText} style="min-height: 150px; font-family: monospace;"></textarea>
            </div>
            
            {#if errorMsg}
                <div class="text-sm mb-4 p-2 rounded" style="color: var(--danger); background: #fee2e2;">{errorMsg}</div>
            {/if}

            <div class="flex gap-2 justify-end">
                <button class="btn" on:click={() => draft = null}>Discard Draft</button>
                <button class="btn btn-primary" on:click={savePreview}>Confirm & Save</button>
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
    .flex-1 { flex: 1; }
    .mb-0 { margin-bottom: 0; }
</style>
