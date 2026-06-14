<script>
    import { showInstallBanner, showIOSInstructions } from '$lib/stores.js';
    import { promptInstall, dismissInstall, dismissIOSInstructions } from '$lib/pwa.js';
    
    let installing = false;
    
    async function handleInstall() {
        installing = true;
        try {
            await promptInstall();
        } finally {
            installing = false;
        }
    }
</script>

{#if $showInstallBanner}
    <div class="install-banner">
        <div class="install-content">
            <svg class="install-icon" viewBox="0 0 24 24" width="20" height="20">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            <div class="install-text">
                <span class="install-title">Install Clerify</span>
                <span class="install-subtitle">Add to your home screen for quick access</span>
            </div>
        </div>
        <div class="install-actions">
            <button class="btn btn-ghost btn-sm" on:click={dismissInstall}>Not now</button>
            <button class="btn btn-primary btn-sm" on:click={handleInstall} disabled={installing}>
                {installing ? 'Installing...' : 'Install'}
            </button>
        </div>
    </div>
{:else if $showIOSInstructions}
    <div class="install-banner ios-banner">
        <div class="install-content">
            <svg class="install-icon" viewBox="0 0 24 24" width="20" height="20">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            <div class="install-text">
                <span class="install-title">Install Clerify</span>
                <span class="install-subtitle">Tap Share → Add to Home Screen</span>
            </div>
        </div>
        <div class="install-actions">
            <button class="btn btn-ghost btn-sm" on:click={dismissIOSInstructions}>Got it</button>
        </div>
    </div>
{/if}

<style>
    .install-banner {
        position: fixed;
        bottom: 1rem;
        left: 50%;
        transform: translateX(-50%);
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 0.875rem 1rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1.5rem;
        max-width: calc(100vw - 2rem);
        z-index: 1000;
        animation: slideUp 0.3s ease-out;
    }
    
    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(100%);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    
    .install-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    
    .install-icon {
        color: var(--primary);
        flex-shrink: 0;
    }
    
    .install-text {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
    }
    
    .install-title {
        font-weight: 600;
        font-size: 0.875rem;
        color: var(--text-main);
    }
    
    .install-subtitle {
        font-size: 0.75rem;
        color: var(--text-muted);
    }
    
    .install-actions {
        display: flex;
        gap: 0.5rem;
        flex-shrink: 0;
    }
    
    .btn-sm {
        padding: 0.375rem 0.75rem;
        font-size: 0.8125rem;
    }
    
    @media (max-width: 480px) {
        .install-banner {
            flex-direction: column;
            align-items: stretch;
            gap: 0.75rem;
        }
        
        .install-actions {
            justify-content: flex-end;
        }
    }
</style>