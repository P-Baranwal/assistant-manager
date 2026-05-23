<script>
    import { onMount } from 'svelte';
    import { storage } from '$lib/storage';
    import { fetchHealth } from '$lib/llm/client';
    import { view, profile, providerReachable, assignments, tasks, projects, theme } from '$lib/stores';

    // Student views
    import StudentHeader from './student/components/StudentHeader.svelte';
    import Spinner from './components/Spinner.svelte';
    import ConfirmModal from './components/ConfirmModal.svelte';
    import Dashboard from './student/views/Dashboard.svelte';
    import Add from './student/views/Add.svelte';
    import Detail from './student/views/Detail.svelte';
    import Settings from './student/views/Settings.svelte';
    import TaskManager from './student/views/TaskManager.svelte';
    import Calendar from './student/views/Calendar.svelte';

    // Pro views
    import ProHeader from './pro/components/ProHeader.svelte';
    import ProDashboard from './pro/views/ProDashboard.svelte';
    import ProAdd from './pro/views/ProAdd.svelte';
    import ProDetail from './pro/views/ProDetail.svelte';

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

        // 4. Load Projects
        const pIndex = await storage.getProjectIndex();
        const pPromises = pIndex.map(id => storage.getProject(id));
        const allProjects = (await Promise.all(pPromises)).filter(Boolean);
        projects.set(allProjects);

        isInitializing = false;

        // 5. Background Health Check
        try {
            const health = await fetchHealth(p);
            providerReachable.set(health.reachable);
        } catch(err) {
            console.warn('Initial health check failed:', err);
        }
        
        // 6. Initial Theme sync
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
{:else if $profile?.tier === 'professional'}
    <ProHeader />
    <main class="view fade-in">
        {#if $view === 'dashboard'}
            <ProDashboard />
        {:else if $view === 'add'}
            <ProAdd />
        {:else if $view === 'detail'}
            <ProDetail />
        {:else if $view === 'settings'}
            <Settings />
        {/if}
    </main>
{:else}
    <StudentHeader />
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
        {:else if $view === 'calendar'}
            <Calendar />
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