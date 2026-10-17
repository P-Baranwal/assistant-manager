import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions";

async function callSarvam(
  req: { system: string; user: string; model?: string },
  apiKey: string
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch(SARVAM_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey,
    },
    body: JSON.stringify({
      model: req.model || "sarvam-105b",
      temperature: 0.2,
      max_tokens: 4096,
      reasoning_effort: null,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Sarvam error: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sarvamKey = Deno.env.get("SARVAM_API_KEY");

    if (!sarvamKey) {
      return new Response(
        JSON.stringify({ error: "Sarvam API key not configured on the server." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    const { system, user: userMsg, model, feature } = await req.json();
    if (!system || !userMsg) {
      return new Response(
        JSON.stringify({ error: "Missing system or user message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Load profile for subscription gating
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

    // 4. Check monthly usage (only for limited plans)
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

    // 5. Route to Sarvam
    let result;
    try {
      result = await callSarvam({ system, user: userMsg, model }, sarvamKey);
    } catch (providerErr) {
      return new Response(
        JSON.stringify({ error: providerErr.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Log usage
    try {
      await supabase.rpc("log_ai_usage", {
        p_feature: feature || "ai_proxy",
        p_model: model || "sarvam-105b",
        p_input_tokens: result.inputTokens,
        p_output_tokens: result.outputTokens,
      });
    } catch (logErr) {
      console.warn("Failed to log AI usage:", logErr);
    }

    // 7. Return response
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
