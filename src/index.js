import { storage } from './storage.js';
import { state, setProfileState, setOllamaReachable, setView } from './state.js';
import { initGlobalDelegators, registerRouter } from './actions.js';
import { fetchHealth } from './llm/client.js';

// UI Modules
import { loadDashboard, registerRoutes as registerDashboardRoutes } from './ui/dashboard.js';
import { setupAddView, registerRoutes as registerAddRoutes } from './ui/add.js';
import { loadSettings, updateProviderUI, registerRoutes as registerSettingsRoutes } from './ui/settings.js';
import { registerRoutes as registerDetailRoutes } from './ui/detail.js';

async function bootstrap() {
    // 1. Storage Init (includes schema migrations)
    await storage.init();
    
    // 2. Load Profile into State
    const profile = await storage.getProfile();
    setProfileState(profile);

    // 3. Register All Action Routes
    initGlobalDelegators();
    registerDashboardRoutes();
    registerAddRoutes();
    registerSettingsRoutes();
    registerDetailRoutes();
    
    // Generic view switcher route
    registerRouter('view', async (payload) => {
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`view-${payload}`);
        if(target) target.classList.remove('hidden');
        setView(payload);
        
        // Trigger specific view loaders
        if(payload === 'dashboard') await loadDashboard();
        else if(payload === 'settings') loadSettings();
        else if(payload === 'add') setupAddView();
        // detail load is handled explicitly by detail-open route
    });

    // 4. Background Health Check
    try {
        const health = await fetchHealth(profile);
        setOllamaReachable(health.reachable);
        const dot = document.getElementById('ollama-status');
        if(dot) {
            dot.className = `status-dot ${health.reachable ? 'green' : 'amber'} tooltip`;
            dot.title = health.label || 'Connection updated';
        }
    } catch(err) {
        console.warn('Initial health check failed:', err);
    }

    // 5. Initial Render
    document.querySelector('[data-action="view:dashboard"]')?.click();
}

// Start application
bootstrap();
