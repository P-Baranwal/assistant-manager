<script>
    import { view, profile, theme, projects, assignments, tasks, authStore } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { fetchHealth, analyzeAssignment } from '$lib/llm/client';
    import { providerReachable } from '$lib/stores';
    import { supabase } from '$lib/supabase';
    import { SUBSCRIPTION_LABELS } from '$lib/constants';
    import ConfirmModal from '../../components/ConfirmModal.svelte';

    async function handleSignOut() {
        try {
            await supabase.auth.signOut();
            view.set('dashboard');
        } catch (err) {
            console.error("Sign out error:", err);
        }
    }

    async function openPortal() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
            });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } catch (err) {
            console.error("Portal error:", err);
        }
    }

    const MODEL_HINTS = {
        ollama: 'e.g. qwen2.5:14b, llama3.1:8b, phi4',
        anthropic: 'e.g. claude-3-5-sonnet-20240620, claude-opus-20240229',
        openai: 'e.g. gpt-4o, gpt-4o-mini, gpt-4-turbo',
        gemini: 'e.g. gemini-2.0-flash, gemini-1.5-flash, gemini-2.5-pro',
        groq: 'e.g. llama-3.3-70b-versatile, llama-3.1-8b-instant, gemma2-9b-it'
    };

    let p = $profile || {
        provider: 'ollama',
        skills: '',
        priorityPreset: 'Balanced',
        customPriorityRule: '',
        apiKey: '',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: ''
    };

    let testResult = '';
    let testColor = 'var(--text-main)';

    // Re-score state
    let rescoring = false;
    let rescoreProgress = '';
    let rescoreError = '';

    // Export/Import state
    let importFileInput;
    let importMsg = '';
    let importColor = 'var(--text-main)';
    let confirmConfig = { show: false, title: '', message: '', onConfirm: null };

    $: canAccessProMode = p.subscription === 'pro' || p.subscription === 'team';

    async function testProvider() {
        testColor = 'var(--text-main)';
        testResult = 'Testing...';
        
        try {
            const health = await fetchHealth(p);
            if (health.reachable) {
                testColor = 'var(--success, green)';
                testResult = health.label || 'Success';
            } else {
                testColor = 'var(--danger, red)';
                testResult = health.label || 'Failed';
            }
        } catch(err) {
            testColor = 'var(--danger, red)';
            testResult = err.message || 'Error during test';
        }
    }

    async function saveSettings() {
        // Enforce mode restrictions based on subscription
        if (!canAccessProMode && p.mode === 'professional') {
            p.mode = 'student';
        }
        await storage.setProfile(p);
        profile.set(p);
        
        try {
            const h = await fetchHealth(p);
            providerReachable.set(h.reachable);
        } catch(e) {}
        
        view.set('dashboard');
    }

    // ── Re-score All ──
    async function rescoreAll() {
        rescoring = true;
        rescoreError = '';

        // Save current profile first so AI uses latest skills
        await storage.setProfile(p);
        profile.set(p);

        const allAssignments = [...$assignments].filter(a => a.status !== 'done');
        const total = allAssignments.length;
        let done = 0;
        let failed = 0;

        for (const a of allAssignments) {
            rescoreProgress = `Re-scoring ${done + 1} of ${total}...`;
            try {
                const rawContent = a.rawContent || `Title: ${a.title}`;
                const rec = await analyzeAssignment(rawContent, p);
                a.difficulty = rec.difficulty;
                a.difficultyReasoning = rec.difficultyReasoning;
                a.priorityScore = rec.priorityScore;
                a.priorityReasoning = rec.priorityReasoning;
                a.estimatedHours = rec.estimatedHours;
                a.estimatedHoursReasoning = rec.estimatedHoursReasoning;
                a.analyzedAt = new Date().toISOString();
                await storage.saveAssignment(a);
            } catch (err) {
                failed++;
                console.warn(`Failed to re-score "${a.title}":`, err);
            }
            done++;
        }

        // Refresh stores
        const allIds = await storage.getIndex();
        const all = (await Promise.all(allIds.map(id => storage.getAssignment(id)))).filter(Boolean);
        assignments.set(all);

        rescoreProgress = failed > 0
            ? `Done! ${done - failed}/${total} updated, ${failed} failed.`
            : `Done! All ${total} assignments re-scored.`;
        rescoring = false;
    }

    // ── Export ──
    async function handleExport() {
        try {
            const data = await storage.exportAll();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `assistant-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            importMsg = 'Export downloaded!';
            importColor = 'var(--success, green)';
        } catch (err) {
            importMsg = 'Export failed: ' + err.message;
            importColor = 'var(--danger, red)';
        }
    }

    // ── Import ──
    function handleImportClick() {
        importFileInput?.click();
    }

    async function handleImportFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data._exportVersion) {
                importMsg = 'Invalid file: not a valid export.';
                importColor = 'var(--danger, red)';
                return;
            }

            confirmConfig = {
                show: true,
                title: 'Import Data',
                message: `This will replace all your current data with the contents of "${file.name}". Are you sure?`,
                onConfirm: async () => {
                    confirmConfig.show = false;
                    try {
                        await storage.importAll(data);
                        
                        // Reload all stores
                        const prof = await storage.getProfile();
                        profile.set(prof);
                        p = prof;

                        const aIdx = await storage.getIndex();
                        const allA = (await Promise.all(aIdx.map(id => storage.getAssignment(id)))).filter(Boolean);
                        assignments.set(allA);

                        const tIdx = await storage.getTaskIndex();
                        const allT = (await Promise.all(tIdx.map(id => storage.getTask(id)))).filter(Boolean);
                        tasks.set(allT);

                        const pIdx = await storage.getProjectIndex();
                        const allP = (await Promise.all(pIdx.map(id => storage.getProject(id)))).filter(Boolean);
                        projects.set(allP);

                        importMsg = 'Import successful! All data restored.';
                        importColor = 'var(--success, green)';
                    } catch (err) {
                        importMsg = 'Import failed: ' + err.message;
                        importColor = 'var(--danger, red)';
                    }
                }
            };
        } catch (err) {
            importMsg = 'Could not parse file: ' + err.message;
            importColor = 'var(--danger, red)';
        }

        // Reset file input so the same file can be re-selected
        if (importFileInput) importFileInput.value = '';
    }
</script>

<div class="flex justify-between items-center mb-4">
    <h2>Settings</h2>
    <button class="btn" on:click={() => view.set('dashboard')}>Cancel</button>
</div>

<div class="card mb-4 animate-fade">
    <div class="card-title mb-4">Subscription & Interface</div>
    <div class="form-group mb-4">
        <label class="form-label">Interface Mode</label>
        <div class="flex flex-col gap-2 mt-2">
            <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                <input type="radio" value="student" bind:group={p.mode}> Student Mode (Assignment Focus)
            </label>
            <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                <input type="radio" value="professional" bind:group={p.mode} disabled={!canAccessProMode}> Professional Mode (Project/Kanban Focus)
                {#if !canAccessProMode}
                    <span class="upgrade-hint">
                        <button type="button" class="text-link" on:click={() => view.set('pricing')}>Upgrade to Pro</button> to unlock
                    </span>
                {/if}
            </label>
        </div>
    </div>
    
    {#if p.mode === 'professional'}
        <div class="form-group mb-0 pt-4" style="border-top:1px solid var(--border-color)">
            <label class="form-label" for="default-project">Default Project (for newly created tasks)</label>
            <select id="default-project" class="input" bind:value={p.defaultProjectId}>
                <option value={null}>None (Send to Inbox)</option>
                {#each $projects as proj}
                    <option value={proj.id}>{proj.title}</option>
                {/each}
            </select>
        </div>
    {/if}
</div>

<div class="card mb-4 animate-fade">
    <div class="card-title mb-4">Billing</div>
    {#if $authStore.isGuest}
        <p class="text-sm text-muted mb-3">Sign up to manage your subscription and unlock premium features.</p>
        <button class="btn btn-primary" on:click={() => view.set('auth')}>Sign Up Free</button>
    {:else if p.subscription === 'free'}
        <p class="text-sm mb-3">You're on the <strong>Free</strong> plan. Upgrade for unlimited tasks and AI analyses.</p>
        <button class="btn btn-primary" on:click={() => view.set('pricing')}>View Plans & Upgrade</button>
    {:else}
        <div class="flex flex-col gap-2 mb-3">
            <p class="text-sm">Plan: <strong>{SUBSCRIPTION_LABELS[p.subscription] || p.subscription}</strong></p>
            {#if p.subscriptionStatus === 'active' && p.currentPeriodEnd}
                <p class="text-sm text-muted">Next billing: {new Date(p.currentPeriodEnd).toLocaleDateString()}</p>
            {/if}
            {#if p.subscriptionStatus}
                <p class="text-sm text-muted">Status: {p.subscriptionStatus}</p>
            {/if}
        </div>
        <div class="flex gap-3">
            <button class="btn btn-primary" on:click={openPortal}>Manage Subscription</button>
            <button class="btn" on:click={() => view.set('pricing')}>Change Plan</button>
        </div>
    {/if}
</div>

<div class="card mb-4 animate-fade">
    <div class="card-title mb-4">Theme Preferences</div>
    <div class="form-group mb-0">
        <label class="form-label" for="theme-select">UI Theme</label>
        <select id="theme-select" class="input" bind:value={$theme} on:change={() => storage.setTheme($theme)}>
            <option value="system">System Default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
        </select>
        <p class="text-xs text-muted mt-2">Adjusts the root appearance dynamically.</p>
    </div>
</div>

<div class="card mb-4 animate-fade">
    <div class="card-title mb-4">AI Provider</div>
    <div class="form-group">
        <label class="form-label" for="set-provider">Provider Layer</label>
        <select id="set-provider" class="input" bind:value={p.provider}>
            <option value="ollama">Ollama (Local)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT-4)</option>
            <option value="gemini">Google (Gemini)</option>
            <option value="groq">Groq (Llama, Gemma)</option>
        </select>
    </div>

    {#if p.provider !== 'ollama'}
        <div class="form-group">
            <label class="form-label" for="set-apiKey">API Key</label>
            <input id="set-apiKey" type="password" class="input" bind:value={p.apiKey} placeholder="Enter your API key">
        </div>
    {:else}
        <div class="form-group">
            <label class="form-label" for="set-baseUrl">Base URL</label>
            <input id="set-baseUrl" type="text" class="input" bind:value={p.ollamaUrl} placeholder="http://localhost:11434">
        </div>
    {/if}

    <div class="form-group mb-0">
        <label class="form-label" for="set-model">Model Name <span class="text-xs text-muted" style="font-weight:normal">(Optional override)</span></label>
        <input id="set-model" type="text" class="input" bind:value={p.ollamaModel} placeholder="Leave blank for default">
        <p class="text-xs text-muted mt-2">{MODEL_HINTS[p.provider]}</p>
    </div>

    <div class="flex items-center gap-4 mt-4 pt-4" style="border-top:1px solid var(--border-color)">
        <button class="btn btn-primary" on:click={testProvider}>Test Connection</button>
        <span class="text-sm" style="color: {testColor}; font-weight: 500;">{testResult}</span>
    </div>
</div>

<div class="card mb-4 animate-fade">
    <div class="card-title mb-4">Context Profiling</div>
    <div class="form-group">
        <label class="form-label" for="set-skills">Your Skills (helps AI estimate time properly)</label>
        <textarea id="set-skills" class="textarea" bind:value={p.skills} placeholder="e.g., proficient in Python, weak in Calculus..."></textarea>
    </div>

    <div class="form-group">
        <label class="form-label" for="set-rule">Custom Strategy Directive <span class="text-xs text-muted" style="font-weight:normal">(Optional)</span></label>
        <textarea id="set-rule" class="textarea" bind:value={p.customPriorityRule} placeholder="e.g., Prioritize all CS 201 tasks first regardless of deadline..." style="min-height:80px"></textarea>
    </div>

    {#if p.mode !== 'professional'}
        <div class="form-group mb-0">
            <label class="form-label" for="group-preset">Default Baseline Sorting</label>
            <div id="group-preset" class="flex flex-col gap-2 mt-2">
                <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                    <input type="radio" value="Balanced" bind:group={p.priorityPreset}> Balanced (Deadlines + Effort)
                </label>
                <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                    <input type="radio" value="Deadline First" bind:group={p.priorityPreset}> Panic Mode (Strictly Deadlines)
                </label>
                <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                    <input type="radio" value="Easy First" bind:group={p.priorityPreset}> Momentum (Short/Easy First)
                </label>
                <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                    <input type="radio" value="Hard First" bind:group={p.priorityPreset}> Frog Eating (Hard/Long First)
                </label>
            </div>
        </div>
    {:else}
        <div class="detail-card text-sm mb-4">
            <strong>Sorting Directive</strong>
            <p class="text-muted mt-1">Professional sorting uses dynamic ROI algorithm. Tasks are sorted based on Impact / Effort.</p>
        </div>
    {/if}

    <div class="mt-4 pt-4" style="border-top:1px solid var(--border-color)">
        <div class="flex items-center gap-4">
            <button class="btn" on:click={rescoreAll} disabled={rescoring || $assignments.filter(a => a.status !== 'done').length === 0}>
                {rescoring ? 'Re-scoring...' : '🔄 Re-score All Assignments'}
            </button>
            {#if rescoreProgress}
                <span class="text-sm" style="color: {rescoring ? 'var(--text-muted)' : 'var(--success)'}; font-weight: 500;">
                    {rescoreProgress}
                </span>
            {/if}
        </div>
        <p class="text-xs text-muted mt-2">Re-analyzes all active assignments with the current skills profile and AI provider. Useful after updating your skills.</p>
    </div>
</div>

<div class="card mb-4 animate-fade">
    <div class="card-title mb-4">Data Management</div>
    <p class="text-sm text-muted mb-4">{#if !$authStore.isGuest}Your data is synced to the cloud. Use these tools to create a local backup or restore from one.{:else}All your data is stored locally in the browser. Use these tools to back up or restore your data.{/if}</p>
    
    <div class="flex gap-3 items-center flex-wrap">
        <button class="btn" on:click={handleExport}>
            📤 Export JSON Backup
        </button>
        <button class="btn" on:click={handleImportClick}>
            📥 Import JSON Backup
        </button>
        <input type="file" accept=".json,application/json" bind:this={importFileInput} on:change={handleImportFile} style="display:none" aria-label="Import file">
    </div>
    {#if importMsg}
        <p class="text-sm mt-3" style="color: {importColor}; font-weight: 500;">{importMsg}</p>
    {/if}
</div>

<button class="btn btn-primary w-full justify-center mb-8" on:click={saveSettings} style="padding: 0.75rem;">
    Save Profiles & Preferences
</button>

<ConfirmModal bind:show={confirmConfig.show} title={confirmConfig.title} message={confirmConfig.message} onConfirm={confirmConfig.onConfirm} />

<style>
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .w-full { width: 100%; }
    .mb-0 { margin-bottom: 0; }
    .upgrade-hint {
        font-size: 0.75rem;
        color: var(--muted);
    }
    .text-link {
        background: none;
        border: none;
        color: var(--primary);
        font-size: 0.75rem;
        font-weight: 500;
        cursor: pointer;
        padding: 0;
        text-decoration: underline;
    }
</style>
