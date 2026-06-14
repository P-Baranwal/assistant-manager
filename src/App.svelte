<script>
    import { onMount, onDestroy } from 'svelte';
    import { storage } from '$lib/storage';
    import { fetchHealth } from '$lib/llm/client';
    import { view, profile, providerReachable, assignments, tasks, projects, theme, authStore } from '$lib/stores';
    import { supabase } from '$lib/supabase';

    // Student views
    import StudentHeader from './student/components/StudentHeader.svelte';
    import Spinner from './components/Spinner.svelte';
    import ConfirmModal from './components/ConfirmModal.svelte';
    import UndoToast from './components/UndoToast.svelte';
    import InstallBanner from './components/InstallBanner.svelte';
    import Dashboard from './student/views/Dashboard.svelte';
    import Add from './student/views/Add.svelte';
    import Detail from './student/views/Detail.svelte';
    import Settings from './student/views/Settings.svelte';
    import TaskManager from './student/views/TaskManager.svelte';
    import Calendar from './student/views/Calendar.svelte';
    import Auth from './routes/auth/Auth.svelte';
    import Pricing from './routes/billing/Pricing.svelte';

    // Pro views
    import ProHeader from './pro/components/ProHeader.svelte';
    import ProDashboard from './pro/views/ProDashboard.svelte';
    import ProAdd from './pro/views/ProAdd.svelte';
    import ProDetail from './pro/views/ProDetail.svelte';

    let isInitializing = true;
    let globalSpinner = { show: false, text: 'Processing...' };
    let confirmModal = { show: false, title: '', message: '', onConfirm: () => {}, onCancel: () => {} };
    let authSubscription;

    async function loadData() {
        isInitializing = true;
        try {
            // 1. Load Profile
            const p = await storage.getProfile();
            profile.set(p);

            // 2. Load Assignments & Tasks
            const index = await storage.getIndex();
            const itemPromises = index.map(id => storage.getAssignment(id));
            const allAssignments = (await Promise.all(itemPromises)).filter(Boolean);
            assignments.set(allAssignments);

            const tIndex = await storage.getTaskIndex();
            const tPromises = tIndex.map(id => storage.getTask(id));
            const allTasks = (await Promise.all(tPromises)).filter(Boolean);
            tasks.set(allTasks);

            // 3. Load Projects
            const pIndex = await storage.getProjectIndex();
            const pPromises = pIndex.map(id => storage.getProject(id));
            const allProjects = (await Promise.all(pPromises)).filter(Boolean);
            projects.set(allProjects);
        } catch (err) {
            console.error("loadData error:", err);
        } finally {
            isInitializing = false;
        }
    }

    onMount(async () => {
        // 1. Storage Init
        await storage.init();
        
        // 2. Listen to Supabase Auth State
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            authStore.set({
                user: session?.user || null,
                session: session || null,
                isGuest: !session
            });

            // Reload data for either guest mode or user account mode
            await loadData();

            // Sync theme
            const currentTheme = await storage.getTheme();
            theme.set(currentTheme);
            const isDark = currentTheme === 'dark' || (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

            // Background Health Check
            try {
                const p = await storage.getProfile();
                const health = await fetchHealth(p);
                providerReachable.set(health.reachable);
            } catch(err) {
                console.warn('Background health check failed:', err);
            }
        });

        authSubscription = subscription;
    });

    onDestroy(() => {
        if (authSubscription) {
            authSubscription.unsubscribe();
        }
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
{:else if $view === 'auth'}
    <div class="app-layout">
        {#if $profile?.mode === 'professional'}
            <ProHeader />
        {:else}
            <StudentHeader />
        {/if}
        <main class="view fade-in">
            <Auth />
        </main>
    </div>
{:else if $profile?.mode === 'professional'}
    <ProHeader />
    
    {#if $authStore.isGuest && ($assignments.length + $tasks.length) >= 3}
        <div class="sync-banner animate-fade">
            <span>Your data is saved locally on this device. <button on:click={() => view.set('auth')} class="banner-link">Sign up</button> to sync across devices.</span>
        </div>
    {/if}

    <main class="view fade-in">
        {#if $view === 'pricing'}
            <Pricing />
        {:else if $view === 'dashboard'}
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

    {#if $authStore.isGuest && ($assignments.length + $tasks.length) >= 3}
        <div class="sync-banner animate-fade">
            <span>Your data is saved locally on this device. <button on:click={() => view.set('auth')} class="banner-link">Sign up</button> to sync across devices.</span>
        </div>
    {/if}

    <main class="view fade-in">
        {#if $view === 'pricing'}
            <Pricing />
        {:else if $view === 'dashboard'}
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
<UndoToast />
<InstallBanner />

<style>
    .fade-in {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .sync-banner {
        background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.15), rgba(var(--primary-rgb), 0.05));
        border: 1px solid var(--border-color);
        padding: 0.75rem 1rem;
        margin: 1rem auto;
        max-width: 1200px;
        border-radius: 8px;
        text-align: center;
        font-size: 0.875rem;
        color: var(--muted);
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
    }
    .banner-link {
        background: none;
        border: none;
        color: var(--primary);
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        text-decoration: underline;
    }
    .app-layout {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
    }
</style>