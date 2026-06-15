<script>
    import { view, profile, theme, projects, assignments, tasks, authStore } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { fetchHealth, analyzeAssignment } from '$lib/llm/client';
    import { providerReachable } from '$lib/stores';
    import { supabase } from '$lib/supabase';
    import { SUBSCRIPTION_LIMITS, SUBSCRIPTION_LABELS } from '$lib/constants';
    import { canAccessFeature } from '$lib/billing';
    import { teamService } from '$lib/teams';
    import ConfirmModal from '../../components/ConfirmModal.svelte';
    import UpgradeBanner from '../../components/UpgradeBanner.svelte';

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
        ollamaModel: '',
        useProxy: false
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

    // Team invite state
    let teamInvites = [];
    let teamLoading = false;

    // Calendar feed state
    let calendarFeedUrl = '';
    let calendarGenerating = false;
    let calendarCopied = false;
    let calendarError = '';
    let calendarShowInstructions = false;

    // AI Insights state
    $: accuracyInsights = (() => {
        const completed = [...$assignments, ...$tasks].filter(i => i.status === 'done' && i.estimatedHours > 0 && i.actualHours > 0);
        if (completed.length < 3) return null;

        let totalVariance = 0;
        let byType = {};

        for (const item of completed) {
            const variance = ((item.actualHours - item.estimatedHours) / item.estimatedHours) * 100;
            totalVariance += variance;
            const type = item.type || item.entityType || 'task';
            if (!byType[type]) byType[type] = { total: 0, count: 0, variance: 0 };
            byType[type].total += item.actualHours;
            byType[type].count++;
            byType[type].variance += variance;
        }

        const avgVariance = totalVariance / completed.length;
        const typeInsights = Object.entries(byType)
            .filter(([, v]) => v.count >= 2)
            .map(([type, v]) => ({
                type,
                count: v.count,
                avgVariance: (v.variance / v.count).toFixed(0)
            }))
            .sort((a, b) => Math.abs(b.avgVariance) - Math.abs(a.avgVariance));

        return {
            totalTasks: completed.length,
            avgVariance: avgVariance.toFixed(0),
            typeInsights
        };
    })();

    $: canAccessProMode = p.subscription === 'pro' || p.subscription === 'team';
    $: canUseProxy = canAccessFeature(p.subscription || 'free', 'aiProxy');
    $: canUseSharedProjects = canAccessFeature(p.subscription || 'free', 'sharedProjects');
    $: monthlyUsageRemainingText = (() => {
        if (!p.subscription) return '';
        const limits = SUBSCRIPTION_LIMITS[p.subscription] || SUBSCRIPTION_LIMITS.free;
        if (limits.aiMonthlyLimit === -1) return 'Unlimited';
        return `${limits.aiMonthlyLimit} analyses/month`;
    })();

    async function loadTeamInvites() {
        if ($authStore.isGuest) return;
        teamLoading = true;
        try {
            teamInvites = await teamService.getMyPendingInvites();
        } catch (err) {
            console.warn('Failed to load team invites:', err);
        }
        teamLoading = false;
    }

    async function acceptTeamInvite(inviteId) {
        try {
            const teamId = await teamService.acceptInvite(inviteId);
            p.teamId = teamId;
            await storage.setProfile(p);
            profile.set(p);
            teamInvites = teamInvites.filter(i => i.id !== inviteId);
        } catch (err) {
            console.error('Failed to accept invite:', err);
        }
    }

    async function declineTeamInvite(inviteId) {
        try {
            await teamService.declineInvite(inviteId);
            teamInvites = teamInvites.filter(i => i.id !== inviteId);
        } catch (err) {
            console.error('Failed to decline invite:', err);
        }
    }

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

    async function testProxy() {
        testColor = 'var(--text-main)';
        testResult = 'Testing proxy...';
        
        try {
            const proxyUrl = import.meta.env.VITE_AI_PROXY_URL;
            if (!proxyUrl) throw new Error('VITE_AI_PROXY_URL not configured');
            
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error('Not authenticated');
            
            const res = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                    system: 'Reply with exactly: "proxy_ok"',
                    user: 'Say proxy_ok',
                    provider: 'groq',
                    feature: 'health_check',
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || `Proxy error: ${res.status}`);
            }

            const data = await res.json();
            if (data.content) {
                testColor = 'var(--success, green)';
                testResult = 'Clerify AI proxy connected';
            } else {
                testColor = 'var(--danger, red)';
                testResult = 'Proxy returned empty response';
            }
        } catch(err) {
            testColor = 'var(--danger, red)';
            testResult = err.message || 'Proxy test failed';
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

    // ── Calendar Feed ──
    async function generateCalendarFeed() {
        if ($authStore.isGuest) {
            calendarError = 'Sign in to enable calendar sync.';
            return;
        }

        calendarGenerating = true;
        calendarError = '';

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error('Not authenticated');

            const { data, error } = await supabase.rpc('get_or_create_calendar_token');
            if (error) throw error;

            p.calendarFeedToken = data;
            profile.set(p);

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            calendarFeedUrl = `${supabaseUrl}/functions/v1/calendar-feed/${data}`;
        } catch (err) {
            calendarError = err.message || 'Failed to generate calendar feed';
        }

        calendarGenerating = false;
    }

    async function regenerateCalendarFeed() {
        if ($authStore.isGuest) return;

        calendarGenerating = true;
        calendarError = '';

        try {
            const { data, error } = await supabase.rpc('regenerate_calendar_token');
            if (error) throw error;

            p.calendarFeedToken = data;
            profile.set(p);

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            calendarFeedUrl = `${supabaseUrl}/functions/v1/calendar-feed/${data}`;
        } catch (err) {
            calendarError = err.message || 'Failed to regenerate calendar feed';
        }

        calendarGenerating = false;
    }

    async function copyCalendarFeedUrl() {
        if (!calendarFeedUrl) return;
        try {
            await navigator.clipboard.writeText(calendarFeedUrl);
            calendarCopied = true;
            setTimeout(() => { calendarCopied = false; }, 2000);
        } catch {
            calendarError = 'Copy failed. Select and copy manually.';
        }
    }

    $: if (p.calendarFeedToken && !calendarFeedUrl) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        calendarFeedUrl = `${supabaseUrl}/functions/v1/calendar-feed/${p.calendarFeedToken}`;
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
    
    {#if canUseProxy}
        <div class="form-group">
            <label class="form-label">AI Mode</label>
            <div class="flex flex-col gap-2 mt-2">
                <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                    <input type="radio" value={true} bind:group={p.useProxy}> Use Clerify AI (included in plan)
                </label>
                <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                    <input type="radio" value={false} bind:group={p.useProxy}> Use my own API key (BYOK)
                </label>
            </div>
            <p class="text-xs text-muted mt-2">
                {#if p.useProxy}
                    Clerify AI routes through our servers — no API key needed. {monthlyUsageRemainingText}.
                {:else}
                    Your API key is stored encrypted and used directly from your browser.
                {/if}
            </p>
        </div>
    {:else}
        <div class="proxy-locked mb-3">
            <div class="flex items-center gap-2 mb-2">
                <span class="text-sm" style="font-weight:500;">🔒 Clerify AI Proxy</span>
                <span class="badge badge-pro">Student+</span>
            </div>
            <p class="text-xs text-muted mb-2">Sign in and upgrade to use Clerify AI — no API key required.</p>
            {#if $authStore.isGuest}
                <button class="btn btn-sm btn-primary" on:click={() => view.set('auth')}>Sign Up Free</button>
            {:else}
                <button class="btn btn-sm btn-primary" on:click={() => view.set('pricing')}>Upgrade to unlock</button>
            {/if}
        </div>
        <div class="form-group mb-0">
            <label class="form-label" style="color:var(--text-main);">Using: Your own API key (BYOK)</label>
        </div>
    {/if}

    {#if !p.useProxy || !canUseProxy}
        <div class="byok-config" class:mt-3={canUseProxy}>
            {#if canUseProxy}
                <div style="border-top:1px solid var(--border-color); padding-top:0.75rem; margin-top:0.5rem;"></div>
            {/if}
            <div class="form-group">
                <label class="form-label" for="set-provider">Provider</label>
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
        </div>
    {/if}

    <div class="flex items-center gap-4 mt-4 pt-4" style="border-top:1px solid var(--border-color)">
        <button class="btn btn-primary" on:click={p.useProxy && canUseProxy ? testProxy : testProvider}>Test Connection</button>
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
    <div class="card-title mb-4">Smart Planning</div>
    <div class="form-group mb-0">
        <label class="form-label" for="set-hours">Available Hours Per Day</label>
        <input id="set-hours" type="number" class="input" bind:value={p.availableHoursPerDay} min="1" max="16" step="1" style="width: 100px;">
        <p class="text-xs text-muted mt-2">Used for deadline risk alerts and weekly plan generation. Default: 6 hours.</p>
    </div>
</div>

{#if accuracyInsights}
    <div class="card mb-4 animate-fade">
        <div class="card-title mb-4">AI Insights</div>
        <p class="text-sm text-muted mb-3">Based on your last {accuracyInsights.totalTasks} completed tasks with time tracking.</p>
        
        <div class="insight-highlight mb-3">
            {#if parseFloat(accuracyInsights.avgVariance) > 0}
                You underestimate time by <strong>{accuracyInsights.avgVariance}%</strong> on average.
            {:else if parseFloat(accuracyInsights.avgVariance) < 0}
                You overestimate time by <strong>{Math.abs(accuracyInsights.avgVariance)}%</strong> on average.
            {:else}
                Your time estimates are remarkably accurate!
            {/if}
        </div>

        {#if accuracyInsights.typeInsights.length > 0}
            <div class="text-sm" style="font-weight: 500; margin-bottom: 0.5rem;">By task type:</div>
            {#each accuracyInsights.typeInsights as insight}
                <div class="insight-row">
                    <span class="text-sm">{insight.type}</span>
                    <span class="text-xs" style="color: {parseFloat(insight.avgVariance) > 0 ? 'var(--danger)' : parseFloat(insight.avgVariance) < 0 ? 'var(--success)' : 'var(--text-muted)'}">
                        {parseFloat(insight.avgVariance) > 0 ? 'underestimates' : parseFloat(insight.avgVariance) < 0 ? 'overestimates' : 'on target'}
                        by {Math.abs(insight.avgVariance)}% ({insight.count} tasks)
                    </span>
                </div>
            {/each}
        {/if}
    </div>
{/if}

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

<div class="card mb-4 animate-fade">
    <div class="card-title mb-4">Calendar Sync</div>
    {#if $authStore.isGuest}
        <p class="text-sm text-muted mb-3">Sign in and upgrade to sync tasks to your calendar app.</p>
        <button class="btn btn-primary" on:click={() => view.set('auth')}>Sign Up Free</button>
    {:else if p.subscription === 'free'}
        <UpgradeBanner message="Upgrade to sync tasks with your calendar app." requiredTier="student" />
    {:else}
        {#if calendarFeedUrl}
            <div class="calendar-feed-url-row mb-3">
                <code class="calendar-feed-url" title={calendarFeedUrl}>{calendarFeedUrl}</code>
                <button class="btn btn-sm" on:click={copyCalendarFeedUrl}>
                    {calendarCopied ? '✓ Copied' : 'Copy'}
                </button>
            </div>
        {:else}
            <p class="text-sm text-muted mb-3">Generate a calendar feed URL to sync your tasks with Google Calendar, Apple Calendar, or Outlook.</p>
            <button class="btn btn-primary" on:click={generateCalendarFeed} disabled={calendarGenerating}>
                {calendarGenerating ? 'Generating...' : 'Generate Calendar Feed'}
            </button>
        {/if}

        {#if calendarError}
            <p class="text-sm mt-2" style="color: var(--danger);">{calendarError}</p>
        {/if}

        {#if calendarFeedUrl}
            <div class="mt-4 pt-4" style="border-top:1px solid var(--border-color)">
                <button class="text-link text-sm" on:click={() => calendarShowInstructions = !calendarShowInstructions}>
                    {calendarShowInstructions ? 'Hide' : 'Show'} Setup Instructions
                </button>

                {#if calendarShowInstructions}
                    <div class="mt-3 calendar-instructions">
                        <div class="calendar-instruction-group">
                            <strong class="text-sm">Google Calendar</strong>
                            <ol class="text-xs text-muted">
                                <li>Open <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener">Google Calendar Settings</a></li>
                                <li>Click <strong>Import & export</strong> → <strong>Subscribe to calendar</strong> (left sidebar)</li>
                                <li>Paste the feed URL and click <strong>Add calendar</strong></li>
                            </ol>
                        </div>
                        <div class="calendar-instruction-group">
                            <strong class="text-sm">Apple Calendar (macOS / iOS)</strong>
                            <ol class="text-xs text-muted">
                                <li>Open Calendar app → <strong>File</strong> → <strong>New Calendar Subscription</strong> (macOS) or <strong>Settings</strong> → <strong>Calendars</strong> → <strong>Add Calendar</strong> → <strong>Subscribe to Calendar</strong> (iOS)</li>
                                <li>Paste the feed URL</li>
                                <li>Set auto-refresh to <strong>Every hour</strong> and click OK</li>
                            </ol>
                        </div>
                        <div class="calendar-instruction-group">
                            <strong class="text-sm">Outlook</strong>
                            <ol class="text-xs text-muted">
                                <li>Open Outlook → <strong>Calendar</strong> view</li>
                                <li>Click <strong>Add calendar</strong> → <strong>Subscribe from web</strong></li>
                                <li>Paste the feed URL and click <strong>Import</strong></li>
                            </ol>
                        </div>
                    </div>
                {/if}

                <div class="mt-3 flex gap-3">
                    <button class="btn btn-sm" on:click={regenerateCalendarFeed} disabled={calendarGenerating}>
                        Regenerate Feed URL
                    </button>
                    <span class="text-xs text-muted" style="align-self:center">Invalidates the old URL</span>
                </div>
            </div>
        {/if}
    {/if}
</div>

{#if p.subscription === 'team'}
    <div class="card mb-4 animate-fade">
        <div class="card-title mb-4">Team Management</div>
        <p class="text-sm text-muted mb-3">Manage your team, invite members, and configure shared projects.</p>
        <button class="btn btn-primary" on:click={() => view.set('team-settings')}>Manage Team</button>
    </div>
{/if}

{#if !$authStore.isGuest && !teamLoading && teamInvites.length > 0}
    <div class="card mb-4 animate-fade" style="border-color: var(--primary)">
        <div class="card-title mb-3">Team Invitations</div>
        {#each teamInvites as invite}
            <div class="team-invite-row">
                <div>
                    <p class="text-sm" style="font-weight:500">{invite.teamName}</p>
                    <p class="text-xs text-muted">Invited as {invite.role}</p>
                </div>
                <div class="flex gap-2">
                    <button class="btn btn-sm btn-primary" on:click={() => acceptTeamInvite(invite.id)}>Accept</button>
                    <button class="btn btn-sm" on:click={() => declineTeamInvite(invite.id)}>Decline</button>
                </div>
            </div>
        {/each}
    </div>
{/if}

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
    .proxy-locked {
        padding: 0.75rem 1rem;
        background: var(--bg-card);
        border: 1px dashed var(--border-color);
        border-radius: 8px;
    }
    .team-invite-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.625rem 0;
        border-bottom: 1px solid var(--border-color);
    }
    .team-invite-row:last-child {
        border-bottom: none;
    }
    .badge {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.625rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .badge-pro {
        background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.15), rgba(var(--primary-rgb), 0.08));
        color: var(--primary);
    }
    .btn-sm {
        padding: 0.25rem 0.75rem;
        font-size: 0.75rem;
    }
    .calendar-feed-url-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: var(--surface-color, #f9f9fb);
        border: 1px solid var(--border-color);
        border-radius: var(--radius, 8px);
        padding: 0.5rem 0.75rem;
    }
    .calendar-feed-url {
        flex: 1;
        font-size: 0.7rem;
        word-break: break-all;
        color: var(--text-muted);
        font-family: monospace;
        line-height: 1.4;
    }
    .calendar-instructions {
        background: var(--surface-color, #f9f9fb);
        border: 1px solid var(--border-color);
        border-radius: var(--radius, 8px);
        padding: 1rem;
    }
    .calendar-instruction-group {
        margin-bottom: 0.75rem;
    }
    .calendar-instruction-group:last-child {
        margin-bottom: 0;
    }
    .calendar-instruction-group ol {
        margin: 0.25rem 0 0 1.25rem;
        padding: 0;
        line-height: 1.6;
    }
    .calendar-instruction-group li {
        margin-bottom: 0.25rem;
    }
</style>
