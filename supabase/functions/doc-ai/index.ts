import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SARVAM_BASE = "https://api.sarvam.ai";
const TERMINAL = new Set(["completed", "partially_completed", "failed", "rejected"]);
const MAX_POLLS = 20;
const POLL_MS = 3000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

    // 2. Document AI requires a paid plan
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

    if (!["student", "pro", "team"].includes(profile.subscription)) {
      return new Response(
        JSON.stringify({
          error: "Document AI not available on your plan. Upgrade to unlock.",
          code: "DOC_AI_NOT_AVAILABLE",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse the uploaded PDF
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return new Response(
        JSON.stringify({ error: "Missing PDF file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const language = String(form.get("language") || "en-IN");

    // 4. Submit a digitise job (Markdown output, async)
    const submitForm = new FormData();
    submitForm.append("file", file, file.name);
    submitForm.append("language", language);
    submitForm.append("output_format", "md");

    const submitRes = await fetch(`${SARVAM_BASE}/doc-ai/v1/job/digitise`, {
      method: "POST",
      headers: { "api-subscription-key": sarvamKey },
      body: submitForm,
    });
    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({}));
      throw new Error(
        `Sarvam Document AI submit failed: ${err.error?.message || err.detail || submitRes.status}`
      );
    }

    const { job_id } = await submitRes.json();
    if (!job_id) throw new Error("Sarvam Document AI did not return a job id");

    // 5. Poll until a terminal state
    let status = "";
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_MS);
      const statusRes = await fetch(`${SARVAM_BASE}/doc-ai/v1/job/${job_id}/status`, {
        headers: { "api-subscription-key": sarvamKey },
      });
      if (!statusRes.ok) {
        const err = await statusRes.json().catch(() => ({}));
        throw new Error(
          `Sarvam Document AI status failed: ${err.detail || statusRes.status}`
        );
      }
      const st = await statusRes.json();
      status = st.status || "";
      if (TERMINAL.has(status)) break;
    }

    if (status === "failed" || status === "rejected") {
      return new Response(
        JSON.stringify({ error: `Sarvam Document AI job ${status}` }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!TERMINAL.has(status)) {
      return new Response(
        JSON.stringify({ error: "Document AI timed out" }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Fetch Markdown results
    const resultsRes = await fetch(
      `${SARVAM_BASE}/doc-ai/v1/job/${job_id}/results?format=md`,
      { headers: { "api-subscription-key": sarvamKey } }
    );
    if (!resultsRes.ok) {
      const err = await resultsRes.json().catch(() => ({}));
      throw new Error(
        `Sarvam Document AI results failed: ${err.detail || resultsRes.status}`
      );
    }
    const results = await resultsRes.json();
    const content = (results.documents || [])
      .flatMap((doc: any) => doc.pages || [])
      .map((page: any) => page.content || "")
      .join("\n\n")
      .trim();

    // 7. Log usage (best effort)
    try {
      await supabase.rpc("log_ai_usage", {
        p_feature: "doc_ai",
        p_model: "sarvam-vision",
        p_input_tokens: 0,
        p_output_tokens: 0,
      });
    } catch (logErr) {
      console.warn("Failed to log Document AI usage:", logErr);
    }

    return new Response(
      JSON.stringify({ content }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
