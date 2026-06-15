import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// ── iCal helpers (RFC 5545) ──────────────────────────────────────

function escapeIcalText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  const maxLen = 75;
  if (line.length <= maxLen) return line;
  let result = line.substring(0, maxLen);
  let pos = maxLen;
  while (pos < line.length) {
    result += "\r\n " + line.substring(pos, pos + maxLen - 1);
    pos += maxLen - 1;
  }
  return result;
}

function generateUID(): string {
  return crypto.randomUUID();
}

function formatIcalDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD — convert to iCal DATE format YYYYMMDD
  return dateStr.replace(/-/g, "");
}

function generateVEVENT(item: {
  title: string;
  deadline: string;
  type?: string;
  estimatedHours?: number;
  priorityScore?: number;
  entityType: string;
  id: string;
}): string {
  const now = new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${generateUID()}@clerify.app`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${formatIcalDate(item.deadline)}`,
    `DTEND;VALUE=DATE:${formatIcalDate(item.deadline)}`,
    `SUMMARY:${escapeIcalText(item.title)}`,
  ];

  // Build description
  const descParts: string[] = [];
  if (item.type) descParts.push(`Type: ${item.type}`);
  if (item.estimatedHours) descParts.push(`Est. Hours: ${item.estimatedHours}h`);
  if (item.priorityScore) descParts.push(`Priority: ${item.priorityScore}/100`);
  descParts.push(`Status: Active`);
  if (descParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcalText(descParts.join("\\n"))}`);
  }

  // Add deep link URL
  const appUrl = Deno.env.get("APP_URL") || "https://clerify.app";
  lines.push(`URL:${appUrl}/#/detail/${item.entityType}/${item.id}`);

  // Add alarm reminder 1 day before
  lines.push("BEGIN:VALARM");
  lines.push("TRIGGER:-P1D");
  lines.push("ACTION:DISPLAY");
  lines.push(`DESCRIPTION:Reminder: ${escapeIcalText(item.title)} is due tomorrow`);
  lines.push("END:VALARM");

  lines.push("END:VEVENT");
  return lines.map(foldLine).join("\r\n");
}

function generateICS(events: string[]): string {
  const calLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Clerify//Calendar Sync//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Clerify Tasks",
    "X-WR-TIMEZONE:UTC",
    ...events,
    "END:VCALENDAR",
  ];
  return calLines.join("\r\n");
}

// ── Main handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // Extract token from URL path: /calendar-feed/{token}
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // URL will be like: /functions/v1/calendar-feed/{token}
    const token = pathParts[pathParts.length - 1];

    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
      return new Response(
        "Invalid calendar feed URL",
        { status: 400, headers: { ...corsHeaders, "Content-Type": "text/plain" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Look up user by calendar feed token
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("calendar_feed_token", token)
      .single();

    if (profileError || !profile) {
      return new Response(
        "Invalid or expired calendar feed token",
        { status: 404, headers: { ...corsHeaders, "Content-Type": "text/plain" } }
      );
    }

    const userId = profile.id;

    // 2. Fetch active assignments (not done)
    const { data: assignments } = await supabase
      .from("assignments")
      .select("id, title, type, deadline, priority_score, estimated_hours, status")
      .eq("user_id", userId)
      .neq("status", "done")
      .not("deadline", "is", null);

    // 3. Fetch active tasks (not done) — includes shared project tasks via RLS
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, deadline, priority_score, estimated_hours, status")
      .eq("user_id", userId)
      .neq("status", "done")
      .not("deadline", "is", null);

    // 4. Also include tasks from shared projects where user has access
    const { data: sharedTasks } = await supabase
      .from("tasks")
      .select("id, title, deadline, priority_score, estimated_hours, status")
      .neq("status", "done")
      .not("deadline", "is", null)
      .not("user_id", "eq", userId);

    // Merge and deduplicate (by id)
    const allTasksMap = new Map<string, any>();
    for (const t of [...(assignments || []), ...(tasks || []), ...(sharedTasks || [])]) {
      allTasksMap.set(t.id, t);
    }

    const allItems = [...allTasksMap.values()];

    if (allItems.length === 0) {
      // Return valid but empty calendar
      const ics = generateICS([]);
      return new Response(ics, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/calendar; charset=utf-8",
          "Cache-Control": "max-age=3600, s-maxage=3600",
          "Content-Disposition": 'attachment; filename="clerify-tasks.ics"',
        },
      });
    }

    // 5. Generate VEVENT for each item
    const events = allItems.map((item) =>
      generateVEVENT({
        title: item.title,
        deadline: item.deadline,
        type: item.type || undefined,
        estimatedHours: item.estimated_hours || undefined,
        priorityScore: item.priority_score || undefined,
        entityType: item.user_id === userId ? (item.type ? "assignment" : "task") : "task",
        id: item.id,
      })
    );

    const ics = generateICS(events);

    return new Response(ics, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "max-age=3600, s-maxage=3600",
        "Content-Disposition": 'attachment; filename="clerify-tasks.ics"',
      },
    });
  } catch (err) {
    console.error("Calendar feed error:", err);
    return new Response(
      "Internal server error",
      { status: 500, headers: { ...corsHeaders, "Content-Type": "text/plain" } }
    );
  }
});
