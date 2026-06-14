import * as ollama from './providers/ollama.js';
import * as anthropic from './providers/anthropic.js';
import * as openai from './providers/openai.js';
import * as gemini from './providers/gemini.js';
import * as groq from './providers/groq.js';
import * as proxy from './providers/proxy.js';
import { JSON_SCHEMA_PROMPT, normalizeAnalysisResult } from './contract.js';

const providers = {
    ollama,
    anthropic,
    openai,
    gemini,
    groq
};

function getPlugin(profile) {
    if (profile.useProxy) return proxy;
    const providerName = profile.provider || 'ollama';
    const plugin = providers[providerName];
    if (!plugin) throw new Error(`Unknown provider: ${providerName}`);
    return plugin;
}

export async function fetchHealth(profile) {
    const plugin = getPlugin(profile);
    return await plugin.healthCheck(profile);
}

export async function analyzeAssignment(rawContent, profile, boostReason=null, existingContext=null) {
    const plugin = getPlugin(profile);

    // Always assert health/validity briefly before execution
    const v = plugin.validate(profile);
    if (!v.ok) throw new Error(`Provider configuration invalid: ${v.message}`);

    const CURRENT_DATE = new Date().toISOString().split('T')[0];

    let systemMsg = `
You are an assignment metadata extractor. Your job is to analyze assignment text and 
output calibrated, realistic metadata — NOT to complete the assignment.

## Context
Today's date: ${CURRENT_DATE}
User skills: ${profile.skills || "Not specified"}
Priority strategy: ${profile.priorityPreset}
Custom rule: ${profile.customPriorityRule || "None"}

## Time Estimation Rules (most important)
Estimate hours as a COMPETENT student at the user's skill level would realistically 
spend — not a perfect student, not a panicking one.

Use these anchors to calibrate:
- A 500-word reflection: 1–1.5 hrs
- A 5-page research essay (with sources): 6–10 hrs  
- A LeetCode-medium style coding problem: 1–2 hrs
- A 20-function CRUD web app from scratch: 10–20 hrs
- A 10-question problem set (familiar topic): 1–2 hrs
- A 10-question problem set (unfamiliar topic): 3–5 hrs
- Reading + annotating 30 pages: 1.5–2.5 hrs

Adjust the estimate based on user skills:
- If the user is strong in the relevant skill → reduce by up to 30%
- If the user is weak in the relevant skill → increase by up to 40%
- If skills are unknown → use the midpoint anchor

NEVER estimate more than 40 hours for a single assignment unless it is explicitly 
described as a multi-week capstone or thesis. Most assignments are 1–8 hours.

Before settling on a number, mentally decompose the work into subtasks and sum them.
That decomposition should also inform your checklist.

Checklist items MUST correspond closely to the breakdown used for time estimation.

## Difficulty Scale
Score relative to the user's current skill level — not absolute complexity:
- 1–3: Familiar territory, mostly mechanical work
- 4–6: Requires focused effort or learning 1–2 new things  
- 7–9: Significant stretch, multiple unfamiliar concepts
- 10: Genuinely beyond their current ceiling (rare — use sparingly)

Infer relevant skill from assignment domain (e.g., coding → programming skill, essay → writing skill)

If skills are unknown, score against an average undergraduate.

## Priority Score (0–100)
Compute from:
- Days until deadline (higher urgency = higher score)
- Difficulty relative to user's skills
- Estimated hours (larger time investment = boost priority earlier)
- User's priority strategy: "${profile.priorityPreset}"
- Custom rule: "${profile.customPriorityRule || "none"}"

Urgency bands:
- Overdue or due today → +40 base
- Due in 1–2 days → +30 base
- Due in 3–7 days → +15 base  
- Due in 8–14 days → +5 base
- Due 15+ days away → 0 base

## Output Rules
- Output ONLY valid JSON matching the schema below
- Do NOT add markdown fences, explanation, or prose outside the JSON
- If deadline cannot be extracted, set deadline to null
- Checklist items must be concrete and actionable (not vague like "study the material")

${JSON_SCHEMA_PROMPT}
`.trim();

    let userMsg = `
Analyze this assignment. Think through the subtasks mentally first to ground your 
time estimate, then output the JSON.

Assignment text:
"""
${rawContent}
"""
`.trim();
    if (boostReason && existingContext) {
        userMsg = `I am applying a boost to this previously analyzed assignment. The boost reason is: "${boostReason}". Existing data: ${JSON.stringify(existingContext)}. Recalculate priorityScore to reflect this boost, and update priorityReasoning. Return the complete updated JSON schema.`;
    }

    const rawResponseText = await plugin.analyze({
        system: systemMsg,
        user: userMsg,
        profile: profile,
        feature: boostReason ? 're_analyze' : 'priority_score'
    });

    return normalizeAnalysisResult(rawResponseText);
}

export async function generateWeeklyPlan(profile, activeItems) {
    const plugin = getPlugin(profile);
    const v = plugin.validate(profile);
    if (!v.ok) throw new Error(`Provider invalid: ${v.message}`);

    const CURRENT_DATE = new Date().toISOString().split('T')[0];
    const AVAILABLE_HOURS = profile.availableHoursPerDay || 6;

    const itemsSummary = activeItems.map(t => {
        const effectiveScore = t.boost?.active ? t.boost.boostedPriorityScore : t.priorityScore;
        return `- "${t.title}" (type: ${t.type || t.entityType || 'task'}, deadline: ${t.deadline || 'none'}, est: ${t.estimatedHours}h, priority: ${effectiveScore}, status: ${t.status})`;
    }).join('\n');

    const system = `
You are a productive work-planning assistant. Given a list of active tasks/assignments with deadlines,
generate a realistic day-by-day plan for the current week.

Today is ${CURRENT_DATE}. The user has approximately ${AVAILABLE_HOURS} hours available per workday.

## Rules
- Distribute work realistically — do NOT overload any single day.
- Respect deadlines: tasks due sooner get scheduled first.
- Break large tasks (>3h) across multiple days when the deadline allows.
- Consider priority scores — higher priority items get prime time slots (morning).
- Include brief labels like "Morning", "Afternoon", or "Evening" for each block.
- If tasks exceed the available hours, note which ones may need rescheduling.

## Output
Output ONLY a raw JSON array — no markdown, no fences, no preamble.
Each day must match this shape:
[
  {
    "day": "Monday",
    "date": "YYYY-MM-DD",
    "blocks": [
      { "task": "Task title", "hours": 2, "slot": "Morning" }
    ],
    "totalHours": 5,
    "note": "Optional note about the day's load"
  }
]

Include only weekdays Mon–Fri. Skip today if it's past available hours.
`.trim();

    const user = `Active tasks:\n${itemsSummary || '(No active tasks)'}`;

    const raw = await plugin.analyze({ system, user, profile, feature: 'weekly_plan' });

    let parsed;
    try {
        const clean = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
        const arr = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] || clean);
        if (!Array.isArray(arr)) throw new Error();
        parsed = arr.map(day => ({
            day: day.day || 'Unknown',
            date: day.date || null,
            blocks: Array.isArray(day.blocks) ? day.blocks.map(b => ({
                task: b.task || 'Untitled',
                hours: Math.max(0.25, parseFloat(b.hours) || 1),
                slot: b.slot || 'Anytime'
            })) : [],
            totalHours: parseFloat(day.totalHours) || 0,
            note: day.note || ''
        }));
    } catch {
        throw new Error('Failed to parse weekly plan from AI response.');
    }

    return parsed;
}

export async function extractTaskFromText(text, profile) {
    const plugin = getPlugin(profile);
    const v = plugin.validate(profile);
    if (!v.ok) throw new Error(`Provider invalid: ${v.message}`);

    const CURRENT_DATE = new Date().toISOString().split('T')[0];

    const system = `
You are a task extraction assistant. Parse the user's natural language input and extract
structured task data.

Today's date: ${CURRENT_DATE}

Output ONLY a raw JSON object — no markdown, no fences, no preamble.
{
  "title": "string",
  "type": "Essay | Coding | Math | Research | Other",
  "deadline": "YYYY-MM-DD or null",
  "estimatedHours": number,
  "weight": "string or null (e.g. '20% of grade')",
  "notes": "string or null (extra context)"
}

Rules:
- Infer a concise, descriptive title from the text.
- If no deadline is mentioned, set deadline to null.
- If no time estimate, set estimatedHours to null.
- Be smart about parsing: "due Friday" means this coming Friday, "3 hours" means estimatedHours: 3.
- If the input is too vague to extract meaningful data, return { "error": "true", "reason": "..." }.
`.trim();

    const user = text;

    const raw = await plugin.analyze({ system, user, profile, feature: 'nl_extract' });

    let parsed;
    try {
        const clean = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0] || clean);
        if (parsed.error) throw new Error(parsed.reason || 'Could not extract task from text.');
        if (!parsed.title) parsed.title = 'Untitled Task';
        if (!['Essay', 'Coding', 'Math', 'Research', 'Other'].includes(parsed.type)) parsed.type = 'Other';
    } catch (e) {
        if (e.message.includes('Could not extract')) throw e;
        throw new Error('Failed to parse task from text.');
    }

    return parsed;
}

export async function generateWBS(brief, profile) {
    const plugin = getPlugin(profile);

    const v = plugin.validate(profile);
    if (!v.ok) throw new Error(`Provider invalid: ${v.message}`);

    const system = `
You are a professional project planner. Given a client brief or feature request,
decompose the work into concrete, actionable sub-tasks.

Output ONLY a raw JSON array — no markdown, no fences, no preamble.
Each item must match this shape exactly:
[
  {
    "title": "string",
    "estimatedHours": number,
    "impactScore": integer (1-10)
  }
]

Rules:
- 3 to 8 sub-tasks maximum
- Titles must be specific and actionable (not "Research" — use "Research X API authentication options")
- estimatedHours: realistic for a competent professional (not a beginner, not a hero)
- impactScore: how much this sub-task moves the needle on the overall deliverable (1=minor, 10=critical path)
- Today's date: ${new Date().toISOString().split('T')[0]}
`.trim();

    const user = `Client brief / feature request:\n"""\n${brief}\n"""`;

    const raw = await plugin.analyze({ system, user, profile, feature: 'wbs_generate' });

    // Parse and validate
    let parsed;
    try {
        const clean = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
        const arr = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] || clean);
        if (!Array.isArray(arr)) throw new Error();
        parsed = arr.map(item => ({
            title: item.title || 'Untitled Task',
            estimatedHours: Math.max(0.25, parseFloat(item.estimatedHours) || 1),
            impactScore: Math.max(1, Math.min(10, parseInt(item.impactScore) || 5))
        }));
    } catch {
        throw new Error('Failed to parse WBS from AI response.');
    }

    return parsed;
}
