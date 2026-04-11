import { TYPES, DIFFICULTY, PRIORITY } from '../../constants.js';

export const JSON_SCHEMA_PROMPT = `
Output strictly in this JSON schema. Return NO markdown formatting, NO fences, NO preamble, just the raw JSON object.
{
"title": "string",
"type": "Essay | Coding | Math | Research | Other",
"deadline": "YYYY-MM-DD or null",
"difficulty": integer (1-10),
"difficultyReasoning": "one short sentence",
"estimatedHoursReasoning": "subtask decomposition + skill adjustment, e.g. '3 subtasks × ~1hr each, user is comfortable with Python so -20%'",
"estimatedHours": number,
"priorityScore": integer (0-100),
"priorityReasoning": "one short sentence",
"checklist": ["string", "string"]
}`;

/**
 * Normalizes the raw schema shape returned by the LLM.
 * This is distinctly different from the persisted Assignment object.
 */
export function normalizeAnalysisResult(jStr) {
    let rawStr = jStr;
    // Clean markdown fences if model disobeys
    const match = rawStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (match) rawStr = match[1];
    else {
        const brackets = rawStr.match(/\{[\s\S]*\}/);
        if(brackets) rawStr = brackets[0];
    }
    
    try {
        const parsed = JSON.parse(rawStr);
        // Validate against expected contract layout
        if(!parsed.title) parsed.title = "Untitled";
        if(!TYPES.includes(parsed.type)) parsed.type = "Other";
        if(!parsed.checklist || !Array.isArray(parsed.checklist)) parsed.checklist = [];
        
        parsed.difficulty = Math.max(DIFFICULTY.MIN, Math.min(DIFFICULTY.MAX, parseInt(parsed.difficulty) || Math.round(DIFFICULTY.MAX/2)));
        parsed.priorityScore = Math.max(PRIORITY.MIN, Math.min(PRIORITY.MAX, parseInt(parsed.priorityScore) || Math.round(PRIORITY.MAX/2)));
        if(!parsed.estimatedHoursReasoning) parsed.estimatedHoursReasoning = "";
        parsed.estimatedHours = Math.max(0, parseFloat(parsed.estimatedHours) || 1);
        
        return parsed;
    } catch(e) {
        throw new Error("Failed to parse JSON from AI response.");
    }
}
