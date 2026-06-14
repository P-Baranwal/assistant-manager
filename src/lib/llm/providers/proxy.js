import { supabase } from '../../supabase.js';

const PROXY_URL = import.meta.env.VITE_AI_PROXY_URL;

export function validate(_profile) {
    if (!PROXY_URL) return { ok: false, message: 'AI proxy URL not configured (VITE_AI_PROXY_URL)' };
    return { ok: true, message: 'OK' };
}

export async function healthCheck(profile) {
    const v = validate(profile);
    if (!v.ok) return { reachable: false, label: v.message };
    return { reachable: true, label: 'Clerify AI proxy available' };
}

export async function analyze({ system, user, profile, feature }) {
    if (!PROXY_URL) throw new Error('AI proxy URL not configured (VITE_AI_PROXY_URL)');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated — please sign in to use Clerify AI.');

    const res = await fetch(`${PROXY_URL}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
            system,
            user,
            provider: profile.provider || 'groq',
            model: profile.ollamaModel || undefined,
            feature: feature || 'ai_proxy',
        }),
    });

    const data = await res.json();

    if (!res.ok) {
        const err = new Error(data.error || `Proxy error: ${res.status}`);
        err.code = data.code;
        err.status = res.status;
        err.resetDate = data.resetDate;
        err.used = data.used;
        err.limit = data.limit;
        throw err;
    }

    return data.content;
}
