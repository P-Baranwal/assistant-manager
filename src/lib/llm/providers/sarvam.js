export function validate(profile) {
    if (!profile.apiKey) return { ok: false, message: "Missing Sarvam API Key" };
    return { ok: true, message: "OK" };
}

export async function healthCheck(profile) {
    const v = validate(profile);
    if (!v.ok) return { reachable: false, label: v.message };
    return { reachable: true, label: "Sarvam API key set" };
}

export async function analyze({ system, user, profile }) {
    const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': profile.apiKey
        },
        body: JSON.stringify({
            model: 'sarvam-105b',
            temperature: 0.2,
            max_tokens: 4096,
            reasoning_effort: null,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ]
        })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Sarvam error: ${err.error?.message || res.status}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
}
