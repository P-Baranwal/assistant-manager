// Groq allows direct browser requests (CORS-enabled).
// Free tier: 30 RPM, 1,000 RPD on most models.
// Get your key at: https://console.groq.com

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000; // 3s base, doubles each attempt

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function validate(profile) {
    if (!profile.apiKey) return { ok: false, message: "Missing API Key" };
    if (!profile.apiKey.startsWith('gsk_')) return { ok: false, message: "Groq keys must start with 'gsk_'" };
    return { ok: true, message: "OK" };
}

export async function healthCheck(profile) {
    const v = validate(profile);
    if (!v.ok) return { reachable: false, label: v.message };
    return { reachable: true, label: "Groq API key valid format" };
}

export async function analyze({ system, user, profile }) {
    const model = profile.ollamaModel || 'llama-3.3-70b-versatile';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${profile.apiKey}`
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user }
                ]
            })
        });

        if (res.status === 429) {
            if (attempt === MAX_RETRIES) {
                throw new Error(`Groq rate limit hit. Try again in a moment (free tier: 30 req/min).`);
            }
            const delay = RETRY_DELAY_MS * Math.pow(2, attempt); // 3s, 6s, 12s
            console.warn(`[Groq] 429 rate limited. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await sleep(delay);
            continue;
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Groq error: ${err.error?.message || res.status}`);
        }

        const data = await res.json();
        return data.choices[0].message.content;
    }
}