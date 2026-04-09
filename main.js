// LEGACY ENTRYPOINT - DO NOT DELETE UNTIL ES MODULE REFACTOR IS FULLY VALIDATED
// @ts-nocheck
// --- 1. STORAGE POLYFILL & ABSTRACTION ---
if (!window.storage) {
    window.storage = {
        async get(key) { 
            const v = localStorage.getItem(key); 
            return v ? JSON.parse(v) : null; 
        },
        async set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
        async delete(key) { localStorage.removeItem(key); }
    };
}

const API = {
    async getProfile() {
        try {
            return await window.storage.get('profile') || {
                skills: "", priorityPreset: "Balanced", customPriorityRule: "",
                provider: "ollama",
                ollamaUrl: "http://localhost:11434", ollamaModel: "qwen2.5:14b",
                apiKey: ""
            };
        } catch(e) { console.error("Storage error:", e); return {}; }
    },
    async setProfile(p) { await window.storage.set('profile', p); },
    async getIndex() { return (await window.storage.get('assignments:index')) || []; },
    async getAssignment(id) { return await window.storage.get(`assignments:${id}`); },
    async saveAssignment(task) {
        await window.storage.set(`assignments:${task.id}`, task);
        let idx = await this.getIndex();
        if (!idx.includes(task.id)) {
            idx.push(task.id);
            await window.storage.set('assignments:index', idx);
        }
    },
    async deleteAssignment(id) {
        if (window.storage.delete) {
            await window.storage.delete(`assignments:${id}`);
        }
        let idx = await this.getIndex();
        idx = idx.filter(x => x !== id);
        await window.storage.set('assignments:index', idx);
    }
};

// --- 2. GLOBAL STATE ---
const state = {
    view: 'dashboard',
    assignments: [],
    profile: null,
    ollamaReachable: false,
    activeDraft: null,
    activeDetailId: null
};

// --- 3. UTILITIES & LOGIC ---
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
const q = (sel) => document.querySelector(sel);
const setHtml = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; };
function showSpinner(text="Loading...") {
    q('#spinner-text').textContent = text;
    q('#global-spinner').classList.remove('hidden');
}
function hideSpinner() { q('#global-spinner').classList.add('hidden'); }

function showConfirm(title, msg, onConfirm) {
    q('#confirm-title').textContent = title;
    q('#confirm-msg').textContent = msg;
    q('#confirm-modal').classList.remove('hidden');
    const yesFn = () => { close(); onConfirm(); };
    const noFn = () => { close(); };
    const close = () => {
        q('#confirm-modal').classList.add('hidden');
        q('#confirm-yes').removeEventListener('click', yesFn);
        q('#confirm-no').removeEventListener('click', noFn);
    };
    q('#confirm-yes').addEventListener('click', yesFn);
    q('#confirm-no').addEventListener('click', noFn);
}

// Color maps
const typeColors = {
    'Essay': {bg: 'var(--bg-essay)', text: 'var(--text-essay)'},
    'Coding': {bg: 'var(--bg-coding)', text: 'var(--text-coding)'},
    'Math': {bg: 'var(--bg-math)', text: 'var(--text-math)'},
    'Research': {bg: 'var(--bg-research)', text: 'var(--text-research)'},
    'Other': {bg: 'var(--bg-other)', text: 'var(--text-other)'}
};
const getDiffColor = (d) => d <= 3 ? 'var(--diff-low)' : d <= 6 ? 'var(--diff-med)' : 'var(--diff-high)';

// Date math
function calculateUrgency(dateStr) {
    if(!dateStr) return null;
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const now = new Date();
    now.setHours(0,0,0,0);
    const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));
    if(diffDays < 0) return 'Overdue';
    if(diffDays === 0) return 'Due Today';
    if(diffDays === 1) return 'Due Tomorrow';
    if(diffDays <= 7 && diffDays > 1) return 'This Week';
    return null;
}

// --- 4. LLM API INTEGRATION ---
async function fetchOllamaHealth() {
    const p = state.profile;
    const provider = p.provider || 'ollama';
    let reachable = false;
    let label = '';
    try {
        if (provider === 'ollama') {
            const url = (p.ollamaUrl || 'http://localhost:11434').replace(/\/$/, "");
            const c = new AbortController();
            setTimeout(() => c.abort(), 2000);
            const res = await fetch(`${url}/api/tags`, { signal: c.signal });
            reachable = res.ok;
            label = reachable ? 'Ollama reachable' : 'Ollama offline / unreachable';
        } else if (provider === 'anthropic') {
            reachable = !!(p.apiKey && p.apiKey.startsWith('sk-ant-'));
            label = reachable ? 'Anthropic API key set' : 'Anthropic API key missing or invalid';
        } else if (provider === 'openai') {
            reachable = !!(p.apiKey && p.apiKey.startsWith('sk-'));
            label = reachable ? 'OpenAI API key set' : 'OpenAI API key missing or invalid';
        }
    } catch(e) {
        reachable = false;
        label = 'Connection check failed';
    }
    state.ollamaReachable = reachable;
    const dot = q('#ollama-status');
    dot.className = `status-dot ${reachable ? 'green' : 'amber'} tooltip`;
    dot.title = label;
}

const JSON_SCHEMA_PROMPT = `
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

async function llmAnalyze(rawContent, boostReason=null, existingContext=null) {
    await fetchOllamaHealth();
    if(!state.ollamaReachable) throw new Error("AI provider is unreachable or not configured.");
    const p = state.profile;
    const provider = p.provider || 'ollama';

    let systemMsg = `You are an expert assignment analyzer. You output structured metadata only contextually based on the user's profile and priority criteria. You strictly do NOT complete assignments or output markdown.
User Skills: ${p.skills || "Unknown"}
Priority Criteria: ${p.priorityPreset}. ${p.customPriorityRule}
Difficulty scale: 1-3 manageable, 4-6 focused effort, 7-9 challenging, 10 beyond current ceiling.
${JSON_SCHEMA_PROMPT}`;

    let userMsg = `Parse the following assignment text into the JSON format requested. Text: """\n${rawContent}\n"""`;
    if (boostReason && existingContext) {
        userMsg = `I am applying a boost to this previously analyzed assignment. The boost reason is: "${boostReason}". Existing data: ${JSON.stringify(existingContext)}. Recalculate priorityScore to reflect this boost, and update priorityReasoning. Return the complete updated JSON schema.`;
    }

    let responseText = '';

    if (provider === 'ollama') {
        const url = (p.ollamaUrl || 'http://localhost:11434').replace(/\/$/, "");
        const res = await fetch(`${url}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: p.ollamaModel,
                stream: false,
                messages: [
                    { role: "system", content: systemMsg },
                    { role: "user", content: userMsg }
                ],
                options: { temperature: 0.2 }
            })
        });
        if (!res.ok) throw new Error(`Ollama error: HTTP ${res.status}`);
        const data = await res.json();
        responseText = data.message.content;

    } else if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': p.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: p.ollamaModel || 'claude-sonnet-4-20250514',
                max_tokens: 1024,
                system: systemMsg,
                messages: [{ role: "user", content: userMsg }]
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Anthropic error: ${err.error?.message || res.status}`);
        }
        const data = await res.json();
        responseText = data.content[0].text;

    } else if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${p.apiKey}`
            },
            body: JSON.stringify({
                model: p.ollamaModel || 'gpt-4o',
                temperature: 0.2,
                messages: [
                    { role: "system", content: systemMsg },
                    { role: "user", content: userMsg }
                ]
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`OpenAI error: ${err.error?.message || res.status}`);
        }
        const data = await res.json();
        responseText = data.choices[0].message.content;

    } else {
        throw new Error(`Unknown provider: ${provider}`);
    }

    return parseLLMResponse(responseText);
}

function parseLLMResponse(text) {
    let jStr = text;
    // Clean markdown fences if model disobeys
    const match = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (match) jStr = match[1];
    else {
        const brackets = text.match(/\{[\s\S]*\}/);
        if(brackets) jStr = brackets[0];
    }
    try {
        const parsed = JSON.parse(jStr);
        // Validate required
        if(!parsed.title) parsed.title = "Untitled";
        if(!['Essay','Coding','Math','Research','Other'].includes(parsed.type)) parsed.type = "Other";
        if(!parsed.checklist || !Array.isArray(parsed.checklist)) parsed.checklist = [];
        parsed.difficulty = Math.max(1, Math.min(10, parseInt(parsed.difficulty) || 5));
        parsed.priorityScore = Math.max(0, Math.min(100, parseInt(parsed.priorityScore) || 50));
        parsed.estimatedHours = Math.max(0, parseFloat(parsed.estimatedHours) || 1);
        return parsed;
    } catch(e) {
        throw new Error("Failed to parse JSON from AI response.");
    }
}

// Offline PDF Extractor Fallback
async function extractPdfText(file) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = async function() {
            if (typeof pdfjsLib === 'undefined') {
                try {
                    await new Promise((res, rej) => {
                        const s = document.createElement('script');
                        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
                        s.onload = res; s.onerror = rej;
                        document.head.appendChild(s);
                    });
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                } catch(e) {
                    return reject("Need internet to load PDF parser script.");
                }
            }
            try {
                const loadingTask = pdfjsLib.getDocument({data: new Uint8Array(fr.result)});
                const pdf = await loadingTask.promise;
                let text = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const cont = await page.getTextContent();
                    text += cont.items.map(item => item.str).join(' ') + '\n';
                }
                resolve(text.substring(0, 5000)); // Limit size to prevent context overflow
            } catch(e) {
                reject("Failed to parse PDF contents.");
            }
        };
        fr.onerror = reject;
        fr.readAsArrayBuffer(file);
    });
}

// --- 5. RENDER LOGIC ---
function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`view-${viewName}`);
    if(target) target.classList.remove('hidden');
    state.view = viewName;
    
    if(viewName === 'dashboard') loadDashboard();
    else if(viewName === 'settings') loadSettings();
    else if(viewName === 'add') setupAddView();
    else if(viewName === 'detail') { /* Handled externally */ }
}

async function loadDashboard() {
    const index = await API.getIndex();
    const itemPromises = index.map(id => API.getAssignment(id));
    const all = (await Promise.all(itemPromises)).filter(Boolean);
    
    // Sort active
    const mapScore = t => t.boost?.active ? t.boost.boostedPriorityScore : t.priorityScore;
    const active = all.filter(t => t.status !== 'done').sort((a,b) => mapScore(b) - mapScore(a));
    const completed = all.filter(t => t.status === 'done').sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Stats
    let dueCount = 0, overdueCount = 0;
    active.forEach(t => {
        const urg = calculateUrgency(t.deadline);
        if(urg==='Overdue') overdueCount++;
        if(urg==='Due Today' || urg==='Due Tomorrow' || urg==='This Week') dueCount++;
    });
    q('#stat-total').textContent = active.length;
    q('#stat-due').textContent = dueCount;
    q('#stat-overdue').textContent = overdueCount;
    q('#stat-done').textContent = completed.length;
    q('#completed-count').textContent = `(${completed.length})`;

    // Render Active
    if(active.length === 0) {
        setHtml('active-assignments', `
            <div class="empty-state">
                <svg class="svg-icon" style="width:48px;height:48px;margin:0 auto 1rem;" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4H6v-2h4V7h2v4h4v2h-4v4z"/></svg>
                <h3>No active assignments</h3>
                <p class="mt-2 text-sm">Add your first assignment to get started.</p>
                <button class="btn btn-primary mt-4" data-action="view:add">Add Assignment</button>
            </div>`);
    } else {
        let html = '';
        active.forEach((t, i) => {
            const diffColor = getDiffColor(t.difficulty);
            const tagStyle = typeColors[t.type] || typeColors['Other'];
            const doneCount = t.checklist.filter(c=>c.done).length;
            const totalCount = t.checklist.length;
            const pct = totalCount ? (doneCount/totalCount)*100 : 0;
            const urgDesc = calculateUrgency(t.deadline);
            const urg = urgDesc === 'This Week' ? null : urgDesc;
            const score = mapScore(t) || 0;
            
            html += `
            <div class="card" data-action="detail-open:${t.id}" style="animation-delay: ${i*0.05}s">
                <div class="card-header">
                    <div>
                        <div class="text-xs text-muted mb-1">#${i+1} &middot; Score: ${score} ${t.boost?.active ? '<svg class="svg-icon" viewBox="0 0 24 24" style="vertical-align: text-bottom; fill: var(--primary)"><path d="M13.13 22.19L11.5 18.36C13.07 17.78 14.54 17 15.9 16.09L13.13 22.19ZM5.64 12.5L1.81 10.87L7.91 8.1C7 9.46 6.22 10.93 5.64 12.5ZM21.61 2.39C21.61 2.39 16.66 .269 9 5.36C5.79 7.5 3.39 10.71 2 14.53L5.53 16.06L7.33 18.15L8.2 21.05C8.84 21.32 9.54 21.46 10.25 21.46C11.53 21.46 12.75 21 13.75 20.25CL21.5 13C22 10.5 22 8.5 21.61 2.39Z"/></svg> (Boosted)' : ''}</div>
                        <h3 class="card-title">${t.title}</h3>
                    </div>
                    <div class="score-pill" style="background:${diffColor}">${t.difficulty||'?'}</div>
                </div>
                <div class="card-meta">
                    <span class="tag" style="background:${tagStyle.bg};color:${tagStyle.text}">${t.type}</span>
                    ${urg ? `<span class="tag ${urg==='Overdue'?'tag-danger':'tag-warning'}">${urg}</span>` : ''}
                    <span class="text-xs text-muted ml-auto">${t.estimatedHours ? t.estimatedHours+'h est.' : ''}</span>
                </div>
                ${totalCount > 0 ? `
                <div class="checklist-progress bg">
                    <div class="checklist-progress-bg">
                        <div class="checklist-progress-fill" style="width:${pct}%"></div>
                    </div>
                    <div class="text-xs text-muted mt-1">${doneCount}/${totalCount} tasks completed</div>
                </div>` : ''}
            </div>`;
        });
        setHtml('active-assignments', html);
    }

    // Render Completed
    let doneHtml = '';
    completed.forEach(t => {
        doneHtml += `<div class="card" data-action="detail-open:${t.id}" style="opacity: 0.7; scale: 0.98;">
            <div class="card-header"><h3 class="card-title text-muted" style="text-decoration:line-through">${t.title}</h3></div>
        </div>`;
    });
    setHtml('completed-assignments', doneHtml);
}

function setupAddView() {
    state.activeDraft = null;
    q('#add-entry-state').classList.remove('hidden');
    q('#add-preview-state').classList.add('hidden');
    q('#preview-error-box').classList.add('hidden');
    const inputs = ['add-paste-text','add-manual-title','add-manual-desc','add-manual-date',
                    'add-upload-course','add-upload-date','add-upload-weight','add-upload-notes'];
    inputs.forEach(id => { if(q('#'+id)) q('#'+id).value = ''; });
    const uploadType = q('#add-upload-type');
    if (uploadType) uploadType.selectedIndex = 0;
    // Reset file picker UI
    const fileInput = q('#add-upload-file');
    if (fileInput) fileInput.value = '';
    q('#upload-zone-inner')?.classList.remove('hidden');
    q('#upload-zone-selected')?.classList.add('hidden');
    const analyzeBtn = q('#upload-analyze-btn');
    if (analyzeBtn) analyzeBtn.disabled = true;
    switchAddTab('paste');
}

function switchAddTab(tabId) {
    document.querySelectorAll('.tab').forEach(el=>el.classList.remove('active'));
    document.querySelector(`[data-action="tab:${tabId}"]`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(el=>el.classList.add('hidden'));
    document.getElementById(`tab-content-${tabId}`).classList.remove('hidden');
}

async function processAddAction(source) {
    let rawText = "";
    let manualMode = false;
    let manualForm = {};

    if(source === 'paste') {
        rawText = q('#add-paste-text').value.trim();
        if(!rawText) return;
    } else if (source === 'manual') {
        manualForm.title = q('#add-manual-title').value.trim();
        manualForm.type = q('#add-manual-type').value;
        manualForm.date = q('#add-manual-date').value;
        rawText = q('#add-manual-desc').value.trim();
        if(!rawText && manualForm.title) {
            manualMode = true; // No text to analyze, skip LLM
        }
    } else if (source === 'upload') {
        const file = q('#add-upload-file').files[0];
        if(!file) return;
        showSpinner("Extracting PDF...");
        try {
            rawText = await extractPdfText(file);
        } catch(e) {
            hideSpinner();
            alert(e);
            return;
        }
        // Append user-provided context to improve AI analysis
        const course = q('#add-upload-course')?.value.trim();
        const uploadType = q('#add-upload-type')?.value;
        const deadline = q('#add-upload-date')?.value;
        const weight = q('#add-upload-weight')?.value.trim();
        const notes = q('#add-upload-notes')?.value.trim();
        let contextBlock = '\n\n--- ADDITIONAL CONTEXT PROVIDED BY USER ---';
        let hasContext = false;
        if (course) { contextBlock += `\nCourse/Subject: ${course}`; hasContext = true; }
        if (uploadType) { contextBlock += `\nAssignment Type: ${uploadType}`; hasContext = true; }
        if (deadline) { contextBlock += `\nDeadline: ${deadline}`; hasContext = true; }
        if (weight) { contextBlock += `\nWeightage/Points: ${weight}`; hasContext = true; }
        if (notes) { contextBlock += `\nAdditional Notes: ${notes}`; hasContext = true; }
        if (hasContext) rawText += contextBlock;
    }

    let resultContext = null;
    q('#preview-error-box').classList.add('hidden');

    if(!manualMode) {
        showSpinner("Analyzing Assignment...");
        try {
            resultContext = await llmAnalyze(rawText);
        } catch(e) {
            q('#preview-error-box').textContent = "LLM Parsing Failed. You can edit the skeleton draft below and save manually.";
            q('#preview-error-box').classList.remove('hidden');
            // Fallback stub
            resultContext = {
                title: manualForm.title || "Unknown Task",
                type: manualForm.type || "Other",
                deadline: manualForm.date || null,
                difficulty: 5, difficultyReasoning: "Fallback",
                estimatedHours: 1, estimatedHoursReasoning: "Fallback",
                priorityScore: 50, priorityReasoning: "Fallback",
                checklist: []
            };
        }
        hideSpinner();
    } else {
            resultContext = {
            title: manualForm.title, type: manualForm.type, deadline: manualForm.date||null,
            difficulty: 5, difficultyReasoning: "Manual entry default",
            estimatedHours: 1, estimatedHoursReasoning: "Manual entry default",
            priorityScore: 50, priorityReasoning: "Manual entry default",
            checklist: []
        };
    }

    state.activeDraft = {
        ...resultContext,
        rawContent: rawText,
        checklist: resultContext.checklist.map(t => ({id: uuid(), text: typeof t === 'string' ? t : t.text, done: false}))
    };

    renderPreview();
}

function renderPreview() {
    q('#add-entry-state').classList.add('hidden');
    q('#add-preview-state').classList.remove('hidden');
    
    const d = state.activeDraft;
    q('#preview-title').value = d.title || '';
    q('#preview-type').value = d.type || 'Other';
    if(d.deadline) q('#preview-date').value = d.deadline;
    
    q('#preview-diff-val').textContent = d.difficulty || '?';
    q('#preview-diff-reason').textContent = d.difficultyReasoning || '';
    q('#preview-time-val').textContent = d.estimatedHours || '?';
    q('#preview-time-reason').textContent = d.estimatedHoursReasoning || '';
    q('#preview-pri-val').textContent = d.priorityScore || '?';
    q('#preview-pri-reason').textContent = d.priorityReasoning || '';
    
    q('#preview-checklist').value = d.checklist.map(c=>c.text).join('\n');
}

async function savePreview() {
    const d = state.activeDraft;
    if(!d) return;
    const newObj = {
        ...d,
        id: uuid(),
        title: q('#preview-title').value || 'Untitled',
        type: q('#preview-type').value,
        deadline: q('#preview-date').value || null,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        analyzedAt: new Date().toISOString(),
        boost: { active: false, reason: null, boostedPriorityScore: null }
    };
    const lines = q('#preview-checklist').value.split('\n').filter(x=>x.trim());
    newObj.checklist = lines.map(line => {
        const exist = d.checklist.find(c => c.text === line.trim());
        return exist ? exist : { id: uuid(), text: line.trim(), done: false };
    });
    
    showSpinner("Saving...");
    await API.saveAssignment(newObj);
    hideSpinner();
    switchView('dashboard');
}

async function loadDetail(id) {
    state.activeDetailId = id;
    const t = await API.getAssignment(id);
    if(!t) return;
    
    const renderBlocks = () => {
        const diffColor = getDiffColor(t.difficulty);
        const isBoosted = t.boost?.active;
        
        let checkHtml = t.checklist.map((c, i) => `
        <label class="checklist-item" data-id="${c.id}" data-idx="${i}">
            <input type="checkbox" ${c.done ? 'checked' : ''} data-action="toggle-check:${i}">
            <span class="checklist-text">${c.text}</span>
        </label>`).join('');

        setHtml('view-detail', `
            <div class="flex justify-between items-center mb-4">
                <button class="btn" data-action="view:dashboard">← Back</button>
                <div class="flex gap-2">
                    ${t.status!=='done' ? `<button class="btn btn-primary" data-action="detail:done">Mark Done</button>` : ''}
                    <button class="btn btn-danger" data-action="detail:delete">Delete</button>
                </div>
            </div>
            
            <div class="card">
                <div class="flex justify-between items-start">
                    <h2 style="margin:0">${t.title}</h2>
                    <span class="tag" style="background:${typeColors[t.type]?.bg||''};color:${typeColors[t.type]?.text||''}">${t.type}</span>
                </div>
                <div class="flex items-center gap-2 mt-2">
                    <label class="text-sm">Deadline:</label>
                    <input type="date" class="input" id="detail-date" value="${t.deadline||''}" style="width:auto; padding:0.25rem 0.5rem;">
                    <button class="btn btn-primary text-xs" data-action="detail:save-date" style="padding:0.25rem 0.5rem">Save Date</button>
                </div>
                
                <div class="detail-meta-grid">
                    <div class="detail-card">
                        <strong>Difficulty: <span style="color:${diffColor}">${t.difficulty}</span>/10</strong>
                        <p class="text-sm text-muted mt-1">${t.difficultyReasoning}</p>
                    </div>
                    <div class="detail-card">
                        <strong>Est. Hours: ${t.estimatedHours}</strong>
                        <p class="text-sm text-muted mt-1">${t.estimatedHoursReasoning}</p>
                    </div>
                    <div class="detail-card" style="${isBoosted?'border-color:var(--primary)':''}">
                        <strong>Priority: ${isBoosted ? t.boost.boostedPriorityScore : t.priorityScore} ${isBoosted?'<svg class="svg-icon" viewBox="0 0 24 24" style="vertical-align: text-bottom; fill: var(--primary)"><path d="M13.13 22.19L11.5 18.36C13.07 17.78 14.54 17 15.9 16.09L13.13 22.19ZM5.64 12.5L1.81 10.87L7.91 8.1C7 9.46 6.22 10.93 5.64 12.5ZM21.61 2.39C21.61 2.39 16.66 .269 9 5.36C5.79 7.5 3.39 10.71 2 14.53L5.53 16.06L7.33 18.15L8.2 21.05C8.84 21.32 9.54 21.46 10.25 21.46C11.53 21.46 12.75 21 13.75 20.25CL21.5 13C22 10.5 22 8.5 21.61 2.39Z"/></svg>':''}</strong>
                        <p class="text-sm text-muted mt-1">${isBoosted ? t.boost.reason : t.priorityReasoning}</p>
                    </div>
                </div>

                <hr style="border:0; border-top:1px solid var(--border-color); margin: 1.5rem 0;">
                
                <div class="flex justify-between items-center mb-4">
                    <h3 style="font-size:1.125rem">Checklist</h3>
                    <div class="text-sm text-muted p-val">${t.checklist.filter(x=>x.done).length}/${t.checklist.length}</div>
                </div>
                <div>${checkHtml || '<p class="text-sm text-muted">No checklist items.</p>'}</div>
                
                <hr style="border:0; border-top:1px solid var(--border-color); margin: 1.5rem 0;">
                
                ${t.status !== 'done' || isBoosted ? `
                <div style="background:var(--bg-color); padding:1rem; border-radius:var(--radius);">
                    <h3 style="font-size: 1rem; margin-bottom:0.5rem">Boost Priority</h3>
                    ${isBoosted ? `
                    <p class="text-sm mb-2 text-muted">Boosted: "${t.boost.reason}"</p>
                    <button class="btn btn-danger" data-action="detail:unboost">Remove Boost</button>
                    ` : (t.status !== 'done' ? `
                    <div class="flex gap-2">
                        <input type="text" class="input" id="boost-reason" placeholder="Why should this be prioritized?">
                        <button class="btn btn-primary" data-action="detail:boost">Apply Boost</button>
                    </div>
                    ` : '')}
                </div>
                ` : ''}
                ${t.status !== 'done' ? `
                <div class="mt-4 flex justify-end">
                    <button class="btn" data-action="detail:reanalyze">Re-Analyze (AI)</button>
                </div>
                ` : ''}
                <div id="detail-error-box" class="hidden text-sm mt-4" style="color: var(--danger); padding: 0.5rem; background: #fee2e2; border-radius:4px;"></div>
            </div>
        `);
    };
    
    renderBlocks();
    switchView('detail');
}

const MODEL_HINTS = {
    ollama: 'e.g. qwen2.5:14b, llama3.1:8b, phi4',
    anthropic: 'e.g. claude-sonnet-4-20250514, claude-opus-4-5',
    openai: 'e.g. gpt-4o, gpt-4o-mini, gpt-4-turbo'
};

function onProviderChange(provider) {
    const isOllama = provider === 'ollama';
    q('#set-apikey-group').classList.toggle('hidden', isOllama);
    q('#set-baseurl-group').classList.toggle('hidden', !isOllama);
    q('#set-model-hint').textContent = MODEL_HINTS[provider] || '';
}

async function loadSettings() {
    const p = state.profile;
    q('#set-skills').value = p.skills || '';
    const radios = document.getElementsByName('set-preset');
    radios.forEach(r => r.checked = (r.value === p.priorityPreset));
    q('#set-rule').value = p.customPriorityRule || '';
    const provider = p.provider || 'ollama';
    q('#set-provider').value = provider;
    q('#set-apiKey').value = p.apiKey || '';
    q('#set-baseUrl').value = p.ollamaUrl || 'http://localhost:11434';
    q('#set-model').value = p.ollamaModel || '';
    q('#set-test-result').textContent = '';
    onProviderChange(provider);
}

// --- 6. EVENT DELEGATION ROUTER ---
document.body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if(!btn) {
        if(e.target.id === 'add-upload-file' && e.type === 'change') {
            // Handled automatically via onchange inline if we bound it, but let's bind
        }
        return;
    }
    const [action, arg] = btn.dataset.action.split(':');
    
    if(action === 'view') switchView(arg);
    if(action === 'detail-open') loadDetail(arg);
    
    if(action === 'toggle-completed') {
        q('#completed-assignments').classList.toggle('hidden');
    }

    // ADD Context
    if(action === 'add-upload-trigger') q('#add-upload-file').click();
    if(action === 'tab') switchAddTab(arg);
    if(action === 'analyze') processAddAction(arg);
    if(action === 'preview-cancel') switchView('dashboard');
    if(action === 'preview-save') savePreview();
    
    // DETAIL Context
    if(action === 'detail') {
        const act = arg;
        const tid = state.activeDetailId;
        const t = await API.getAssignment(tid);

        if(act === 'save-date') {
            t.deadline = q('#detail-date').value || null;
            await API.saveAssignment(t);
        }
        if(act === 'done') {
            showConfirm("Mark Done", "Are you sure you want to mark this complete?", async () => {
                t.status = 'done';
                await API.saveAssignment(t);
                switchView('dashboard');
            });
        }
        if(act === 'delete') {
            showConfirm("Delete Assignment", "This cannot be undone.", async () => {
                await API.deleteAssignment(tid);
                switchView('dashboard');
            });
        }
        if(act === 'boost') {
            const rzn = q('#boost-reason').value.trim();
            if(!rzn) return;
            showSpinner("AI is boosting...");
            try {
                q('#detail-error-box')?.classList.add('hidden');
                const rec = await llmAnalyze(t.rawContent, rzn, t);
                t.boost = { active: true, reason: rzn, boostedPriorityScore: rec.priorityScore };
                t.priorityReasoning = rec.priorityReasoning;
                await API.saveAssignment(t);
            } catch(err) { 
                const errBox = q('#detail-error-box');
                if (errBox) { errBox.textContent = err.message; errBox.classList.remove('hidden'); }
            }
            hideSpinner();
            loadDetail(tid);
        }
        if(act === 'unboost') {
            t.boost = { active: false, reason: null, boostedPriorityScore: null };
            await API.saveAssignment(t);
            showSpinner("Recalculating baseline...");
            try {
                const rec = await llmAnalyze(t.rawContent);
                t.priorityScore = rec.priorityScore;
                t.priorityReasoning = rec.priorityReasoning;
                await API.saveAssignment(t);
            } catch(err) {} 
            hideSpinner();
            loadDetail(tid);
        }
        if(act === 'reanalyze') {
            showSpinner("Re-analyzing via AI...");
            try {
                q('#detail-error-box')?.classList.add('hidden');
                const rec = await llmAnalyze(t.rawContent);
                t.difficulty = rec.difficulty;
                t.difficultyReasoning = rec.difficultyReasoning;
                t.priorityScore = rec.priorityScore;
                t.priorityReasoning = rec.priorityReasoning;
                t.estimatedHours = rec.estimatedHours;
                t.estimatedHoursReasoning = rec.estimatedHoursReasoning;
                t.analyzedAt = new Date().toISOString();
                
                t.checklist = rec.checklist.map(recItem => {
                    const text = typeof recItem === 'string' ? recItem : recItem.text;
                    return { id: uuid(), text: text, done: false };
                });
                
                await API.saveAssignment(t);
            } catch(err) {
                const errBox = q('#detail-error-box');
                if (errBox) { errBox.textContent = err.message; errBox.classList.remove('hidden'); }
            }
            hideSpinner();
            loadDetail(tid);
        }
    }

    // SETTINGS Context
    if(action === 'save-settings') {
        const r = document.querySelector('input[name="set-preset"]:checked');
        const p = {
            skills: q('#set-skills').value,
            priorityPreset: r ? r.value : 'Balanced',
            customPriorityRule: q('#set-rule').value,
            provider: q('#set-provider').value,
            apiKey: q('#set-apiKey').value,
            ollamaUrl: q('#set-baseUrl').value,
            ollamaModel: q('#set-model').value
        };
        await API.setProfile(p);
        state.profile = p;
        fetchOllamaHealth();
        switchView('dashboard');
    }
    if(action === 'test-ollama') {
        const resultEl = q('#set-test-result');
        const provider = q('#set-provider').value;
        resultEl.style.color = "var(--text-main)";
        resultEl.textContent = "Testing...";
        if (provider === 'ollama') {
            const oUrl = q('#set-baseUrl').value.replace(/\/$/, "");
            const c = new AbortController();
            const timeStart = performance.now();
            setTimeout(() => c.abort(), 3000);
            try {
                const r = await fetch(`${oUrl}/api/tags`, { signal: c.signal });
                if(r.ok) {
                    const elapsed = Math.round(performance.now() - timeStart);
                    resultEl.style.color = "var(--success)";
                    resultEl.textContent = `Ollama reachable (${elapsed}ms)`;
                } else throw new Error();
            } catch(e) {
                resultEl.style.color = "var(--danger)";
                resultEl.textContent = `Failed / Unreachable`;
            }
        } else if (provider === 'anthropic') {
            const key = q('#set-apiKey').value;
            if (!key.startsWith('sk-ant-')) {
                resultEl.style.color = "var(--danger)";
                resultEl.textContent = "Key should start with sk-ant-";
            } else {
                resultEl.style.color = "var(--success)";
                resultEl.textContent = "Key format valid — save and analyze to fully verify.";
            }
        } else if (provider === 'openai') {
            const key = q('#set-apiKey').value;
            if (!key.startsWith('sk-')) {
                resultEl.style.color = "var(--danger)";
                resultEl.textContent = "Key should start with sk-";
            } else {
                resultEl.style.color = "var(--success)";
                resultEl.textContent = "Key format valid — save and analyze to fully verify.";
            }
        }
    }
});

// Specifically handled input events
document.addEventListener('change', async (e) => {
    if(e.target.id === 'add-upload-file') {
        handleUploadFileSelected();
    }
    if (e.target.hasAttribute('data-action') && e.target.dataset.action.startsWith('toggle-check:')) {
        const arg = e.target.dataset.action.split(':')[1];
        const t = await API.getAssignment(state.activeDetailId);
        t.checklist[parseInt(arg)].done = e.target.checked;
        t.updatedAt = new Date().toISOString();
        await API.saveAssignment(t);
        loadDetail(state.activeDetailId);
    }
});

// --- Upload file selection & drag-drop helpers ---
function handleUploadFileSelected() {
    const fileInput = q('#add-upload-file');
    const file = fileInput?.files[0];
    if (file) {
        q('#upload-zone-inner').classList.add('hidden');
        q('#upload-zone-selected').classList.remove('hidden');
        q('#upload-file-name').textContent = file.name;
        q('#upload-analyze-btn').disabled = false;
    } else {
        q('#upload-zone-inner').classList.remove('hidden');
        q('#upload-zone-selected').classList.add('hidden');
        q('#upload-analyze-btn').disabled = true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Clear file button
    document.addEventListener('click', (e) => {
        if (e.target.id === 'upload-file-clear' || e.target.closest('#upload-file-clear')) {
            const fileInput = q('#add-upload-file');
            if (fileInput) fileInput.value = '';
            q('#upload-zone-inner').classList.remove('hidden');
            q('#upload-zone-selected').classList.add('hidden');
            q('#upload-analyze-btn').disabled = true;
        }
    });

    // Drag-and-drop on upload zone
    const dropZone = q('#upload-drop-zone');
    if (dropZone) {
        ['dragenter','dragover'].forEach(evt => {
            dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        });
        ['dragleave','drop'].forEach(evt => {
            dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); });
        });
        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer?.files;
            if (files?.length && files[0].type === 'application/pdf') {
                const fileInput = q('#add-upload-file');
                const dt = new DataTransfer();
                dt.items.add(files[0]);
                fileInput.files = dt.files;
                handleUploadFileSelected();
            }
        });
    }
});

// --- 7. INITIALIZATION ---
async function init() {
    state.profile = await API.getProfile();
    switchView('dashboard');
    fetchOllamaHealth(); // Load in background so the UI doesn't hang
}
document.addEventListener('DOMContentLoaded', init);