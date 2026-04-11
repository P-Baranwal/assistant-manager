export function validate(profile) {
    if (!profile.apiKey) return { ok: false, message: "Missing API Key" };
    if (!profile.apiKey.startsWith('sk-ant-')) return { ok: false, message: "Anthropic keys must start with 'sk-ant-'" };
    return { ok: true, message: "OK" };
}

export async function healthCheck(profile) {
    const v = validate(profile);
    if (!v.ok) return { reachable: false, label: v.message };
    // Network check could go here if we wanted to ping anthropic, but keeping it minimal/fast for now.
    return { reachable: true, label: "Anthropic API key valid format" };
}

export async function analyze({ system, user, profile }) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': profile.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: profile.ollamaModel || 'claude-3-5-sonnet-20240620',
            max_tokens: 1024,
            system: system,
            messages: [{ role: "user", content: user }]
        })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Anthropic error: ${err.error?.message || res.status}`);
    }
    const data = await res.json();
    return data.content[0].text;
}
