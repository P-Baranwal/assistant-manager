import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Provider routing helpers ──────────────────────────────────────

interface ProviderRequest {
  system: string;
  user: string;
  provider: string;
  model?: string;
}

async function callGroq(req: ProviderRequest, apiKey: string): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const model = req.model || "llama-3.3-70b-versatile";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq error: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

async function callAnthropic(req: ProviderRequest, apiKey: string): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const model = req.model || "claude-3-5-sonnet-20240620";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic error: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  return {
    content: data.content[0].text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

async function callOpenAI(req: ProviderRequest, apiKey: string): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const model = req.model || "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI error: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

async function callGemini(req: ProviderRequest, apiKey: string): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const model = req.model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: req.system }] },
      contents: [{ parts: [{ text: req.user }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini error: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  return {
    content: data.candidates[0].content.parts[0].text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

const PROVIDER_MAP: Record<string, (req: ProviderRequest, key: string) => Promise<{ content: string; inputTokens: number; outputTokens: number }>> = {
  groq: callGroq,
  anthropic: callAnthropic,
  openai: callOpenAI,
  gemini: callGemini,
};

// ── Env var names for per-provider API keys ────────────────────────
const PROVIDER_KEY_ENV: Record<string, string> = {
  groq: "GROQ_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

// ── Main handler ───────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // 1. Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request body
    const { system, user: userMsg, provider, model, feature } = await req.json();
    if (!system || !userMsg) {
      return new Response(
        JSON.stringify({ error: "Missing system or user message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetProvider = provider || "groq";

    // 3. Look up profile for subscription and usage
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("subscription")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Could not load profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Check subscription allows proxy access
    const SUBSCRIPTION_LIMITS: Record<string, { aiMonthlyLimit: number }> = {
      free: { aiMonthlyLimit: 0 },
      student: { aiMonthlyLimit: 100 },
      pro: { aiMonthlyLimit: -1 },
      team: { aiMonthlyLimit: -1 },
    };

    const limits = SUBSCRIPTION_LIMITS[profile.subscription] || SUBSCRIPTION_LIMITS.free;

    if (limits.aiMonthlyLimit === 0) {
      return new Response(
        JSON.stringify({
          error: "AI proxy not available on your plan. Upgrade to unlock.",
          code: "PROXY_NOT_AVAILABLE",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Check monthly usage (only for limited plans)
    if (limits.aiMonthlyLimit > 0) {
      const { count } = await supabase
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

      if (count >= limits.aiMonthlyLimit) {
        const resetDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString();
        return new Response(
          JSON.stringify({
            error: `You've used your ${limits.aiMonthlyLimit} AI analyses this month. Upgrade for more.`,
            code: "USAGE_LIMIT_EXCEEDED",
            resetDate,
            used: count,
            limit: limits.aiMonthlyLimit,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 6. Get provider API key from server-side env
    const keyEnvName = PROVIDER_KEY_ENV[targetProvider];
    if (!keyEnvName) {
      return new Response(
        JSON.stringify({ error: `Unsupported proxy provider: ${targetProvider}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get(keyEnvName);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `Proxy provider ${targetProvider} is not configured on the server.` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Route to provider
    const providerFn = PROVIDER_MAP[targetProvider];
    if (!providerFn) {
      return new Response(
        JSON.stringify({ error: `No handler for provider: ${targetProvider}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result;
    try {
      result = await providerFn({ system, user: userMsg, provider: targetProvider, model }, apiKey);
    } catch (providerErr) {
      return new Response(
        JSON.stringify({ error: providerErr.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Log usage
    try {
      await supabase.rpc("log_ai_usage", {
        p_feature: feature || "ai_proxy",
        p_model: model || targetProvider,
        p_input_tokens: result.inputTokens,
        p_output_tokens: result.outputTokens,
      });
    } catch (logErr) {
      console.warn("Failed to log AI usage:", logErr);
    }

    // 9. Return response
    return new Response(
      JSON.stringify({
        content: result.content,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
