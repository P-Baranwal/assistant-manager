import * as ollama from './providers/ollama.js';
import * as anthropic from './providers/anthropic.js';
import * as openai from './providers/openai.js';
import * as gemini from './providers/gemini.js';
import * as groq from './providers/groq.js';
import { JSON_SCHEMA_PROMPT, normalizeAnalysisResult } from './contract.js';

const providers = {
    ollama,
    anthropic,
    openai,
    gemini,
    groq
};

export async function fetchHealth(profile) {
    const providerName = profile.provider || 'ollama';
    const plugin = providers[providerName];
    if (!plugin) throw new Error(`Unknown provider: ${providerName}`);
    return await plugin.healthCheck(profile);
}

export async function analyzeAssignment(rawContent, profile, boostReason=null, existingContext=null) {
    const providerName = profile.provider || 'ollama';
    const plugin = providers[providerName];
    if (!plugin) throw new Error(`Unknown provider: ${providerName}`);

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
        profile: profile
    });

    return normalizeAnalysisResult(rawResponseText);
}
