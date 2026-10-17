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
        bottom: var(--space-4);
        left: 50%;
        transform: translateX(-50%);
        background: var(--surface-raised);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: var(--space-3) var(--space-4);
        box-shadow: var(--shadow-lg);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-6);
        max-width: calc(100vw - var(--space-8));
        z-index: 1000;
        animation: slideUp 0.3s var(--ease) backwards;
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
        gap: var(--space-3);
        min-width: 0;
    }
    
    .install-icon {
        color: var(--primary);
        flex-shrink: 0;
    }
    
    .install-text {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
    }
    
    .install-title {
        font-weight: 600;
        font-size: var(--fs-base);
        color: var(--text-main);
    }
    
    .install-subtitle {
        font-size: var(--fs-xs);
        color: var(--text-muted);
    }
    
    .install-actions {
        display: flex;
        gap: var(--space-2);
        flex-shrink: 0;
    }
    
    @media (max-width: 480px) {
        .install-banner {
            flex-direction: column;
            align-items: stretch;
            gap: var(--space-3);
        }
        
        .install-actions {
            justify-content: flex-end;
        }
    }
</style>
