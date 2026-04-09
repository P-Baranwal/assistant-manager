import { q, showSpinner, hideSpinner } from '../utils/dom.js';
import { uuid } from '../utils/id.js';
import { state, setActiveDraft, setView } from '../state.js';
import { storage } from '../storage.js';
import { registerRouter } from '../actions.js';
import { analyzeAssignment } from '../llm/client.js';

// We need a way to switch views centrally. We'll register "view:dashboard" separately in index.js,
// but for internal explicit jumps we can just dispatch manually. Let's just create a generic event or use DOM.
function switchViewDOM(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`view-${viewName}`);
    if(target) target.classList.remove('hidden');
    setView(viewName);
}

export function setupAddView() {
    setActiveDraft(null);
    q('#add-entry-state').classList.remove('hidden');
    q('#add-preview-state').classList.add('hidden');
    q('#preview-error-box').classList.add('hidden');
    
    ['add-paste-text','add-manual-title','add-manual-desc','add-manual-date',
     'add-upload-course','add-upload-date','add-upload-weight','add-upload-notes']
        .forEach(id => { const el = q('#'+id); if(el) el.value = ''; });
    
    const uploadType = q('#add-upload-type');
    if (uploadType) uploadType.selectedIndex = 0;
    
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
    document.querySelector(`[data-action="tab:${tabId}"]`)?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(el=>el.classList.add('hidden'));
    document.getElementById(`tab-content-${tabId}`)?.classList.remove('hidden');
}

// PDF Extractor Fallback
async function extractPdfText(file) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = async function() {
            if (typeof window.pdfjsLib === 'undefined') {
                try {
                    await new Promise((res, rej) => {
                        const s = document.createElement('script');
                        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
                        s.onload = res; s.onerror = rej;
                        document.head.appendChild(s);
                    });
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                } catch(e) {
                    return reject("Need internet to load PDF parser script.");
                }
            }
            try {
                const loadingTask = window.pdfjsLib.getDocument({data: new Uint8Array(fr.result)});
                const pdf = await loadingTask.promise;
                let text = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const cont = await page.getTextContent();
                    text += cont.items.map(item => item.str).join(' ') + '\n';
                }
                resolve(text.substring(0, 5000));
            } catch(e) {
                reject("Failed to parse PDF contents.");
            }
        };
        fr.onerror = reject;
        fr.readAsArrayBuffer(file);
    });
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
        if(!rawText && manualForm.title) manualMode = true;
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
            resultContext = await analyzeAssignment(rawText, state.profile);
        } catch(e) {
            q('#preview-error-box').textContent = "LLM Parsing Failed. Edit skeleton below.";
            q('#preview-error-box').classList.remove('hidden');
            resultContext = {
                title: manualForm.title || "Unknown Task",
                type: 'Other',
                deadline: manualForm.date || null,
                difficulty: 5, difficultyReasoning: "Fallback based on failure",
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

    const draft = {
        ...resultContext,
        rawContent: rawText,
        checklist: resultContext.checklist.map(t => ({id: uuid(), text: typeof t === 'string' ? t : t.text, done: false}))
    };
    setActiveDraft(draft);
    renderPreview();
}

function renderPreview() {
    q('#add-entry-state').classList.add('hidden');
    q('#add-preview-state').classList.remove('hidden');
    
    const d = state.activeDraft;
    if(!d) return;
    
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
    await storage.saveAssignment(newObj);
    hideSpinner();
    
    // Quick dispatch back to dashboard via a custom event route call (will be handled centrally)
    document.querySelector('[data-action="view:dashboard"]')?.click();
}

export function registerRoutes() {
    registerRouter('add-upload-trigger', async () => q('#add-upload-file').click());
    registerRouter('tab', async (payload) => switchAddTab(payload));
    registerRouter('analyze', async (payload) => processAddAction(payload));
    registerRouter('preview-save', async () => savePreview());
    registerRouter('preview-cancel', async () => document.querySelector('[data-action="view:dashboard"]')?.click());
    
    // Handle inline file change natively
    const fileInput = q('#add-upload-file');
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;
            q('#upload-zone-inner').classList.add('hidden');
            q('#upload-zone-selected').classList.remove('hidden');
            q('#upload-file-name').textContent = file.name;
            q('#upload-analyze-btn').disabled = false;
        });
    }
    
    const clearFile = q('#upload-file-clear');
    if (clearFile) {
        clearFile.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            fileInput.value = '';
            q('#upload-zone-inner').classList.remove('hidden');
            q('#upload-zone-selected').classList.add('hidden');
            q('#upload-analyze-btn').disabled = true;
        });
    }
}
