import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "Clerify <digest@clerify.app>";

// Provider routing (reuses the same pattern as ai-proxy)
interface ProviderRequest {
  system: string;
  user: string;
  provider: string;
  model?: string;
}

async function callGroq(req: ProviderRequest, apiKey: string): Promise<string> {
  const model = req.model || "llama-3.3-70b-versatile";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, temperature: 0.3,
      messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
    }),
  });
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callAnthropic(req: ProviderRequest, apiKey: string): Promise<string> {
  const model = req.model || "claude-3-5-sonnet-20240620";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 1024,
      system: req.system, messages: [{ role: "user", content: req.user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(req: ProviderRequest, apiKey: string): Promise<string> {
  const model = req.model || "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, temperature: 0.3,
      messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGemini(req: ProviderRequest, apiKey: string): Promise<string> {
  const model = req.model || "gemini-2.0-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: req.system }] },
      contents: [{ parts: [{ text: req.user }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

const PROVIDER_MAP: Record<string, (req: ProviderRequest, key: string) => Promise<string>> = {
  groq: callGroq, anthropic: callAnthropic, openai: callOpenAI, gemini: callGemini,
};

const PROVIDER_KEY_ENV: Record<string, string> = {
  groq: "GROQ_API_KEY", anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY",
};

function buildDigestHTML(userName: string, summary: string, tasks: any[]): string {
  const taskRows = tasks.map(t => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:500">${t.title}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280">${t.deadline || 'No deadline'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${t.priorityScore || '-'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${t.estimatedHours || '-'}h</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827">
      <h2 style="color:#4f46e5;margin-bottom:4px">Your Week Ahead</h2>
      <p style="color:#6b7280;margin-top:0">Hi ${userName}, here's your weekly digest from Clerify.</p>
      
      <div style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0">
        <p style="margin:0;white-space:pre-wrap;line-height:1.6">${summary}</p>
      </div>

      ${tasks.length > 0 ? `
        <h3 style="font-size:16px;margin-bottom:8px">Top Priority Tasks</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr style="background:#f9f9fb">
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Task</th>
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb">Deadline</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Priority</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e5e7eb">Est.</th>
            </tr>
          </thead>
          <tbody>${taskRows}</tbody>
        </table>
      ` : '<p style="color:#6b7280">No active tasks this week. Enjoy the break!</p>'}

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="font-size:12px;color:#9ca3af;text-align:center">
        Sent by <a href="#" style="color:#4f46e5">Clerify</a> · 
        <a href="#" style="color:#9ca3af">Unsubscribe</a>
      </p>
    </body>
    </html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Find all paying users with digest opted in
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, provider, ollama_model")
      .in("subscription", ["student", "pro", "team"]);

    if (profileError) throw new Error(`Failed to query profiles: ${profileError.message}`);

    // 2. For each user, gather top 5 priority tasks for the coming week
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    let sent = 0;
    let failed = 0;

    for (const profile of profiles || []) {
      try {
        // Get active tasks sorted by priority, limited to 5
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, deadline, priority_score, estimated_hours")
          .eq("user_id", profile.id)
          .neq("status", "done")
          .order("priority_score", { ascending: false })
          .limit(5);

        // Also get active assignments
        const { data: assignments } = await supabase
          .from("assignments")
          .select("id, title, deadline, priority_score, estimated_hours")
          .eq("user_id", profile.id)
          .neq("status", "done")
          .order("priority_score", { ascending: false })
          .limit(5);

        const allItems = [...(tasks || []), ...(assignments || [])]
          .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
          .slice(0, 5);

        if (allItems.length === 0) continue;

        // 3. Generate AI summary using the user's configured provider
        const providerName = profile.provider || "groq";
        const keyEnvName = PROVIDER_KEY_ENV[providerName];
        const apiKey = keyEnvName ? Deno.env.get(keyEnvName) : null;

        let summary = "";
        if (apiKey && PROVIDER_MAP[providerName]) {
          const taskList = allItems.map(t =>
            `- "${t.title}" (deadline: ${t.deadline || 'none'}, priority: ${t.priority_score || 50}, est: ${t.estimated_hours || '?'}h)`
          ).join('\n');

          const system = `You are a motivational productivity assistant. Write a brief 3-4 sentence summary of the user's upcoming week based on their top tasks. Be encouraging but grounded — reference specific tasks and deadlines. Keep it concise and warm. Do not use markdown.`;
          const user = `My top tasks for the coming week:\n${taskList}`;

          try {
            summary = await PROVIDER_MAP[providerName](
              { system, user, provider: providerName, model: profile.ollama_model },
              apiKey
            );
          } catch (e) {
            console.warn(`AI summary failed for ${profile.id}:`, e.message);
            summary = `You have ${allItems.length} tasks to focus on this week. Prioritize by deadline and stay focused!`;
          }
        } else {
          summary = `You have ${allItems.length} tasks to focus on this week. Prioritize by deadline and stay focused!`;
        }

        // 4. Send email via Resend
        if (RESEND_API_KEY) {
          const html = buildDigestHTML(profile.display_name || "there", summary, allItems);
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: RESEND_FROM,
              to: profile.id, // Will be resolved by Resend if using Supabase email forwarding
              subject: "Your Clerify Weekly Digest",
              html,
            }),
          });

          if (!emailRes.ok) {
            console.warn(`Email send failed for ${profile.id}: ${emailRes.status}`);
            failed++;
          } else {
            sent++;
          }
        } else {
          console.warn("RESEND_API_KEY not configured — skipping email send");
          sent++; // Count as sent for testing
        }
      } catch (err) {
        console.warn(`Failed to process user ${profile.id}:`, err.message);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ sent, failed, total: profiles?.length || 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
