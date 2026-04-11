<script>
    import { onMount } from 'svelte';
    import { storage } from '$lib/storage';
    import { fetchHealth } from '$lib/llm/client';
    import { view, profile, providerReachable, assignments, tasks, theme } from '$lib/stores';

    import Header from './components/Header.svelte';
    import Spinner from './components/Spinner.svelte';
    import ConfirmModal from './components/ConfirmModal.svelte';
    import Dashboard from './views/Dashboard.svelte';
    import Add from './views/Add.svelte';
    import Detail from './views/Detail.svelte';
    import Settings from './views/Settings.svelte';
    import TaskManager from './views/TaskManager.svelte';

    let isInitializing = true;
    let globalSpinner = { show: false, text: 'Processing...' };
    let confirmModal = { show: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} };

    onMount(async () => {
        // 1. Storage Init
        await storage.init();
        
        // 2. Load Profile
        const p = await storage.getProfile();
        profile.set(p);

        // 3. Load Assignments & Tasks
        const index = await storage.getIndex();
        const itemPromises = index.map(id => storage.getAssignment(id));
        const allAssignments = (await Promise.all(itemPromises)).filter(Boolean);
        assignments.set(allAssignments);

        const tIndex = await storage.getTaskIndex();
        const tPromises = tIndex.map(id => storage.getTask(id));
        const allTasks = (await Promise.all(tPromises)).filter(Boolean);
        tasks.set(allTasks);

        isInitializing = false;

        // 4. Background Health Check
        try {
            const health = await fetchHealth(p);
            providerReachable.set(health.reachable);
        } catch(err) {
            console.warn('Initial health check failed:', err);
        }
        
        // 5. Initial Theme sync
        const currentTheme = localStorage.getItem('theme') || 'system';
        const isDark = currentTheme === 'dark' || (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    });

    $: {
        if (!isInitializing && typeof window !== 'undefined') {
            const isDark = $theme === 'dark' || ($theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        }
    }
</script>

{#if isInitializing}
    <div class="flex items-center justify-center p-8 text-muted">
        <div class="spinner" style="border-top-color: var(--primary);"></div>
    </div>
{:else}
    <Header />
    
    <main class="view fade-in">
        {#if $view === 'dashboard'}
            <Dashboard />
        {:else if $view === 'add'}
            <Add />
        {:else if $view === 'detail'}
            <Detail />
        {:else if $view === 'settings'}
            <Settings />
        {:else if $view === 'task-manager'}
            <TaskManager />
        {/if}
    </main>
{/if}

<Spinner bind:show={globalSpinner.show} text={globalSpinner.text} />
<ConfirmModal 
    bind:show={confirmModal.show} 
    title={confirmModal.title} 
    message={confirmModal.message} 
    onConfirm={confirmModal.onConfirm} 
    onCancel={confirmModal.onCancel} />

<style>
    .fade-in {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
</style>