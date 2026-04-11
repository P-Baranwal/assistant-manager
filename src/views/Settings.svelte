<script>
    import { view, profile, theme } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { fetchHealth } from '$lib/llm/client';
    import { providerReachable } from '$lib/stores';

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
        await storage.setProfile(p);
        profile.set(p);
        
        // Background health check string updates
        try {
            const h = await fetchHealth(p);
            providerReachable.set(h.reachable);
        } catch(e) {}
        
        view.set('dashboard');
    }
</script>

<div class="flex justify-between items-center mb-4">
    <h2>Settings</h2>
    <button class="btn" on:click={() => view.set('dashboard')}>Cancel</button>
</div>

<div class="card mb-4 animate-fade">
    <div class="card-title mb-4">Theme Preferences</div>
    <div class="form-group mb-0">
        <label class="form-label" for="theme-select">UI Theme</label>
        <select id="theme-select" class="input" bind:value={$theme} on:change={() => localStorage.setItem('theme', $theme)}>
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
</div>

<button class="btn btn-primary w-full justify-center mb-8" on:click={saveSettings} style="padding: 0.75rem;">
    Save Profiles & Preferences
</button>

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
</style>
