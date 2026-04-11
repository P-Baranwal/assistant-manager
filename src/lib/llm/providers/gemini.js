export function validate(profile) {
    if (!profile.apiKey) return { ok: false, message: "Missing API Key" };
    if (!profile.apiKey.startsWith('AIza')) return { ok: false, message: "Gemini keys must start with 'AIza'" };
    return { ok: true, message: "OK" };
}

export async function healthCheck(profile) {
    const v = validate(profile);
    if (!v.ok) return { reachable: false, label: v.message };
    return { reachable: true, label: "Gemini API key valid format" };
}

export async function analyze({ system, user, profile }) {
    const model = profile.ollamaModel || 'gemini-2.0-flash';
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${profile.apiKey}`
            },
            body: JSON.stringify({
                model: model,
                temperature: 0.2,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user }
                ]
            })
        }
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Gemini error: ${err.error?.message || res.status}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
}