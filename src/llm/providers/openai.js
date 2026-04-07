export function validate(profile) {
    if (!profile.apiKey) return { ok: false, message: "Missing API Key" };
    if (!profile.apiKey.startsWith('sk-')) return { ok: false, message: "OpenAI keys must start with 'sk-'" };
    return { ok: true, message: "OK" };
}

export async function healthCheck(profile) {
    const v = validate(profile);
    if (!v.ok) return { reachable: false, label: v.message };
    return { reachable: true, label: "OpenAI API key valid format" };
}

export async function analyze({ system, user, profile }) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${profile.apiKey}`
        },
        body: JSON.stringify({
            model: profile.ollamaModel || 'gpt-4o',
            temperature: 0.2,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user }
            ]
        })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`OpenAI error: ${err.error?.message || res.status}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
}
