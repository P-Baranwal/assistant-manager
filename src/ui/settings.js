import { q } from '../utils/dom.js';
import { storage } from '../storage.js';
import { state, setProfileState, setOllamaReachable } from '../state.js';
import { fetchHealth } from '../llm/client.js';
import { registerRouter } from '../actions.js';

const MODEL_HINTS = {
    ollama: 'e.g. qwen2.5:14b, llama3.1:8b, phi4',
    anthropic: 'e.g. claude-3-5-sonnet-20240620, claude-opus-20240229',
    openai: 'e.g. gpt-4o, gpt-4o-mini, gpt-4-turbo'
};

export function updateProviderUI(provider) {
    const isOllama = provider === 'ollama';
    q('#set-apikey-group')?.classList.toggle('hidden', isOllama);
    q('#set-baseurl-group')?.classList.toggle('hidden', !isOllama);
    const hint = q('#set-model-hint');
    if(hint) hint.textContent = MODEL_HINTS[provider] || '';
}

export function loadSettings() {
    const p = state.profile;
    if(!p) return;
    
    const skills = q('#set-skills');
    if(skills) skills.value = p.skills || '';
    
    const radios = document.getElementsByName('set-preset');
    radios.forEach(r => r.checked = (r.value === p.priorityPreset));
    
    const rule = q('#set-rule');
    if(rule) rule.value = p.customPriorityRule || '';
    
    const provider = p.provider || 'ollama';
    const provSelect = q('#set-provider');
    if(provSelect) provSelect.value = provider;
    
    const key = q('#set-apiKey');
    if(key) key.value = p.apiKey || '';
    
    const bUrl = q('#set-baseUrl');
    if(bUrl) bUrl.value = p.ollamaUrl || 'http://localhost:11434';
    
    const mod = q('#set-model');
    if(mod) mod.value = p.ollamaModel || '';
    
    const tr = q('#set-test-result');
    if(tr) tr.textContent = '';
    
    updateProviderUI(provider);
}

export async function testProvider() {
    const resultEl = q('#set-test-result');
    if(!resultEl) return;
    
    const tmpProfile = {
        provider: q('#set-provider')?.value,
        apiKey: q('#set-apiKey')?.value,
        ollamaUrl: q('#set-baseUrl')?.value,
        ollamaModel: q('#set-model')?.value
    };
    
    resultEl.style.color = "var(--text-main)";
    resultEl.textContent = "Testing...";
    
    try {
        const health = await fetchHealth(tmpProfile);
        if (health.reachable) {
            resultEl.style.color = "var(--success, green)";
            resultEl.textContent = health.label || "Success";
        } else {
            resultEl.style.color = "var(--danger, red)";
            resultEl.textContent = health.label || "Failed";
        }
    } catch(err) {
        resultEl.style.color = "var(--danger, red)";
        resultEl.textContent = err.message || "Error during test";
    }
}

export function registerRoutes() {
    registerRouter('settings:providerChanged', async (payload, target) => {
        updateProviderUI(target.value);
    });

    registerRouter('test-ollama', async () => {
        await testProvider();
    });

    registerRouter('save-settings', async () => {
        const r = document.querySelector('input[name="set-preset"]:checked');
        const p = {
            skills: q('#set-skills')?.value,
            priorityPreset: r ? r.value : 'Balanced',
            customPriorityRule: q('#set-rule')?.value,
            provider: q('#set-provider')?.value,
            apiKey: q('#set-apiKey')?.value,
            ollamaUrl: q('#set-baseUrl')?.value,
            ollamaModel: q('#set-model')?.value
        };
        await storage.setProfile(p);
        setProfileState(p);
        
        // Re-eval health silently for app state
        try {
            const h = await fetchHealth(p);
            setOllamaReachable(h.reachable);
        } catch(e) {}
        
        document.querySelector('[data-action="view:dashboard"]')?.click();
    });
}
