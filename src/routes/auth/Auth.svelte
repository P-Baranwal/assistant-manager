<script>
    import { supabase } from '$lib/supabase';
    import { authStore, view } from '$lib/stores';
    import { storage } from '$lib/storage';

    let isSignUp = false;
    let isResetPassword = false;
    
    let email = '';
    let password = '';
    let confirmPassword = '';
    let displayName = '';
    
    let loading = false;
    let message = '';
    let messageType = ''; // 'error' or 'success'

    // Handles sign in/sign up form submit
    async function handleSubmit() {
        loading = true;
        message = '';
        
        try {
            if (isResetPassword) {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + '?reset=true',
                });
                if (error) throw error;
                message = 'Password reset instructions have been sent to your email.';
                messageType = 'success';
            } else if (isSignUp) {
                if (password !== confirmPassword) {
                    throw new Error("Passwords do not match.");
                }
                
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            display_name: displayName || email.split('@')[0]
                        }
                    }
                });
                
                if (error) throw error;
                
                if (data.session) {
                    message = 'Sign up successful! Syncing local data...';
                    messageType = 'success';
                    // Trigger migration of local data to Cloud
                    const stats = await storage.migrateLocalToCloud();
                    const totalMigrated = stats.assignmentsCount + stats.tasksCount + stats.projectsCount;
                    if (totalMigrated > 0) {
                        message = `Welcome! Your ${totalMigrated} items have been successfully saved to your cloud account.`;
                    }
                    setTimeout(() => {
                        view.set('dashboard');
                    }, 2500);
                } else {
                    message = 'Sign up successful! Please check your email to confirm your account.';
                    messageType = 'success';
                }
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                
                if (error) throw error;
                
                message = 'Welcome back! Loading cloud profile...';
                messageType = 'success';
                
                setTimeout(() => {
                    view.set('dashboard');
                }, 1000);
            }
        } catch (err) {
            message = err.message || 'An error occurred during authentication.';
            messageType = 'error';
        } finally {
            loading = false;
        }
    }

    // Handles social login
    async function handleOAuth(provider) {
        loading = true;
        message = '';
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
        } catch (err) {
            message = err.message || `Failed to sign in with ${provider}.`;
            messageType = 'error';
            loading = false;
        }
    }
</script>

<div class="auth-container animate-fade">
    <div class="auth-card">
        <div class="auth-logo">
            <span class="logo-icon">⚡</span>
            <h2>Clerify</h2>
        </div>
        
        {#if isResetPassword}
            <h3>Reset Password</h3>
            <p class="auth-subtitle">Enter your email to receive a password reset link.</p>
        {:else if isSignUp}
            <h3>Create Account</h3>
            <p class="auth-subtitle">Get started with cloud sync and pro capabilities.</p>
        {:else}
            <h3>Welcome Back</h3>
            <p class="auth-subtitle">Log in to sync your tasks and settings.</p>
        {/if}

        {#if message}
            <div class="alert alert-{messageType}">
                {message}
            </div>
        {/if}

        <form on:submit|preventDefault={handleSubmit} class="auth-form">
            {#if isSignUp && !isResetPassword}
                <div class="form-group">
                    <label class="form-label" for="displayName">Display Name</label>
                    <input 
                        type="text" 
                        id="displayName" 
                        placeholder="John Doe" 
                        class="input"
                        bind:value={displayName}
                        required={isSignUp} />
                </div>
            {/if}

            <div class="form-group">
                <label class="form-label" for="email">Email Address</label>
                <input 
                    type="email" 
                    id="email" 
                    placeholder="you@example.com" 
                    class="input"
                    bind:value={email}
                    required />
            </div>

            {#if !isResetPassword}
                <div class="form-group">
                    <div class="label-row">
                        <label class="form-label" for="password">Password</label>
                        {#if !isSignUp}
                            <button 
                                type="button" 
                                class="text-link" 
                                on:click={() => { isResetPassword = true; message = ''; }}>
                                Forgot Password?
                            </button>
                        {/if}
                    </div>
                    <input 
                        type="password" 
                        id="password" 
                        placeholder="••••••••" 
                        class="input"
                        bind:value={password}
                        required />
                </div>

                {#if isSignUp}
                    <div class="form-group">
                        <label class="form-label" for="confirmPassword">Confirm Password</label>
                        <input 
                            type="password" 
                            id="confirmPassword" 
                            placeholder="••••••••" 
                            class="input"
                            bind:value={confirmPassword}
                            required />
                    </div>
                {/if}
            {/if}

            <button type="submit" class="btn btn-primary btn-block" disabled={loading}>
                {#if loading}
                    <span class="spinner-sm"></span>
                {:else if isResetPassword}
                    Send Reset Link
                {:else if isSignUp}
                    Sign Up
                {:else}
                    Log In
                {/if}
            </button>
        </form>

        {#if !isResetPassword}
            <div class="divider">
                <span>or continue with</span>
            </div>

            <div class="oauth-buttons">
                <button type="button" class="btn btn-outline" on:click={() => handleOAuth('google')} disabled={loading}>
                    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                    </svg>
                    Google
                </button>
                
                <button type="button" class="btn btn-outline" on:click={() => handleOAuth('github')} disabled={loading}>
                    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                    </svg>
                    GitHub
                </button>
            </div>
        {/if}

        <div class="auth-footer">
            {#if isResetPassword}
                <button type="button" class="text-link" on:click={() => { isResetPassword = false; message = ''; }}>
                    Back to Log In
                </button>
            {:else}
                <span>
                    {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                </span>
                <button type="button" class="text-link ml-1" on:click={() => { isSignUp = !isSignUp; message = ''; }}>
                    {isSignUp ? 'Log In' : 'Sign Up'}
                </button>
            {/if}
            
            <p class="free-badge mt-4">Clerify is free to get started — no credit card required</p>
        </div>
    </div>
</div>

<style>
    .auth-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: calc(100vh - 120px);
        padding: 2rem 1rem;
    }
    .auth-card {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 2.5rem;
        width: 100%;
        max-width: 440px;
        box-shadow: var(--shadow-lg);
    }
    .auth-logo {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        justify-content: center;
        margin-bottom: 1.5rem;
    }
    .logo-icon {
        font-size: 1.5rem;
    }
    .auth-logo h2 {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0;
        letter-spacing: -0.025em;
    }
    .auth-card h3 {
        font-size: 1.25rem;
        font-weight: 600;
        text-align: center;
        margin: 0 0 0.5rem 0;
    }
    .auth-subtitle {
        color: var(--muted);
        text-align: center;
        font-size: 0.875rem;
        margin: 0 0 2rem 0;
    }
    .auth-form {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }
    .label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .text-link {
        background: none;
        border: none;
        color: var(--primary);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        padding: 0;
    }
    .text-link:hover {
        text-decoration: underline;
    }
    .divider {
        display: flex;
        align-items: center;
        text-align: center;
        margin: 1.5rem 0;
        color: var(--muted);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .divider::before, .divider::after {
        content: '';
        flex: 1;
        border-bottom: 1px solid var(--border-color);
    }
    .divider span {
        padding: 0 10px;
    }
    .oauth-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
    }
    .btn-block {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 42px;
    }
    .auth-footer {
        margin-top: 1.5rem;
        text-align: center;
        font-size: 0.875rem;
        color: var(--muted);
    }
    .free-badge {
        font-size: 0.75rem;
        color: var(--primary);
        font-weight: 500;
        background: rgba(var(--primary-rgb), 0.1);
        padding: 0.5rem;
        border-radius: 6px;
        display: inline-block;
    }
    .alert {
        padding: 0.75rem 1rem;
        border-radius: 8px;
        font-size: 0.875rem;
        margin-bottom: 1.25rem;
        line-height: 1.4;
    }
    .alert-error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #ef4444;
    }
    .alert-success {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.2);
        color: #10b981;
    }
    .spinner-sm {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: #fff;
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .ml-1 { margin-left: 0.25rem; }
    .mt-4 { margin-top: 1rem; }
</style>
