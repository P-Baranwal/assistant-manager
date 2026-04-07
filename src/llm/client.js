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

    let systemMsg = `You are an expert assignment analyzer. You output structured metadata only contextually based on the user's profile and priority criteria. You strictly do NOT complete assignments or output markdown.
User Skills: ${profile.skills || "Unknown"}
Priority Criteria: ${profile.priorityPreset}. ${profile.customPriorityRule}
Difficulty scale: 1-3 manageable, 4-6 focused effort, 7-9 challenging, 10 beyond current ceiling.
${JSON_SCHEMA_PROMPT}`;

    let userMsg = `Parse the following assignment text into the JSON format requested. Text: """\n${rawContent}\n"""`;
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
