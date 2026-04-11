export function validate(profile) {
    if (!profile.ollamaUrl) return { ok: false, message: "Missing Ollama URL" };
    return { ok: true, message: "OK" };
}

export async function healthCheck(profile) {
    try {
        const url = (profile.ollamaUrl || 'http://localhost:11434').replace(/\/$/, "");
        const c = new AbortController();
        setTimeout(() => c.abort(), 2000); // 2 second timeout
        const res = await fetch(`${url}/api/tags`, { signal: c.signal });
        return { reachable: res.ok, label: res.ok ? 'Ollama reachable' : 'Ollama returned non-200' };
    } catch(e) {
        return { reachable: false, label: 'Ollama offline / unreachable' };
    }
}

export async function analyze({ system, user, profile }) {
    const url = (profile.ollamaUrl || 'http://localhost:11434').replace(/\/$/, "");
    const res = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: profile.ollamaModel,
            stream: false,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user }
            ],
            options: { temperature: 0.2 }
        })
    });
    if (!res.ok) throw new Error(`Ollama error: HTTP ${res.status}`);
    const data = await res.json();
    return data.message.content;
}
