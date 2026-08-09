/* eslint-disable no-undef */
// Shared Paddle API utilities for Supabase Edge Functions (Deno runtime)

export async function paddleFetch(endpoint, options = {}, apiKey) {
    const url = endpoint.startsWith("http")
        ? endpoint
        : `https://api.paddle.com/${endpoint}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...(options.headers || {}),
        },
    });

    if (!res.ok) {
        let detail = "";
        try { const body = await res.json(); detail = JSON.stringify(body); } catch { /* ignore */ }
        throw new Error(`Paddle API error ${res.status}: ${detail || res.statusText}`);
    }

    return res.json();
}

export async function verifyPaddleWebhook(body, signatureHeader, secret) {
    if (!signatureHeader) throw new Error("Missing Paddle-Signature header");

    const parts = {};
    for (const pair of signatureHeader.split(";")) {
        const trimmed = pair.trim();
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        parts[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
    }

    const { ts, h1 } = parts;
    if (!ts || !h1) throw new Error("Invalid Paddle-Signature format");

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
    );

    const signedPayload = `${ts}:${body}`;
    const expectedSig = new Uint8Array(
        h1.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );

    const verified = await crypto.subtle.verify(
        "HMAC",
        key,
        expectedSig,
        encoder.encode(signedPayload)
    );

    return verified;
}
