import { q, setHtml, showSpinner, hideSpinner, showConfirm } from '../utils/dom.js';
import { storage } from '../storage.js';
import { state, setActiveDetailId } from '../state.js';
import { analyzeAssignment } from '../llm/client.js';
import { registerRouter } from '../actions.js';
import { uuid } from '../utils/id.js';

// Shared styling maps (will eventually move to dashboard but used here for Detail coloring)
const typeColors = {
    'Essay': {bg: 'var(--bg-essay)', text: 'var(--text-essay)'},
    'Coding': {bg: 'var(--bg-coding)', text: 'var(--text-coding)'},
    'Math': {bg: 'var(--bg-math)', text: 'var(--text-math)'},
    'Research': {bg: 'var(--bg-research)', text: 'var(--text-research)'},
    'Other': {bg: 'var(--bg-other)', text: 'var(--text-other)'}
};
export const getDiffColor = (d) => d <= 3 ? 'var(--diff-low)' : d <= 6 ? 'var(--diff-med)' : 'var(--diff-high)';

export async function loadDetail(id) {
    setActiveDetailId(id);
    const t = await storage.getAssignment(id);
    if(!t) return;
    
    const diffColor = getDiffColor(t.difficulty);
    const isBoosted = t.boost?.active;
    
    let checkHtml = t.checklist.map((c, i) => `
    <label class="checklist-item" data-id="${c.id}" data-idx="${i}">
        <input type="checkbox" ${c.done ? 'checked' : ''} data-action="detail-check:${i}">
        <span class="checklist-text">${c.text}</span>
    </label>`).join('');

    const html = `
        <div class="flex justify-between items-center mb-4">
            <button class="btn" data-action="view:dashboard">← Back</button>
            <div class="flex gap-2">
                ${t.status !== 'done' ? `<button class="btn btn-primary" data-action="detail-done">Mark Done</button>` : ''}
                <button class="btn btn-danger" data-action="detail-delete">Delete</button>
            </div>
        </div>
        
        <div class="card">
            <div class="flex justify-between items-start">
                <h2 style="margin:0">${t.title}</h2>
                <span class="tag" style="background:${typeColors[t.type]?.bg||''};color:${typeColors[t.type]?.text||''}">${t.type}</span>
            </div>
            <div class="flex items-center gap-2 mt-2">
                <label class="text-sm">Deadline:</label>
                <input type="date" class="input" id="detail-date" value="${t.deadline||''}" style="width:auto; padding:0.25rem 0.5rem;" data-action="detail-date-change">
            </div>
            
            <div class="detail-meta-grid">
                <div class="detail-card">
                    <strong>Difficulty: <span style="color:${diffColor}">${t.difficulty}</span>/10</strong>
                    <p class="text-sm text-muted mt-1">${t.difficultyReasoning}</p>
                </div>
                <div class="detail-card">
                    <strong>Est. Hours: ${t.estimatedHours}</strong>
                    <p class="text-sm text-muted mt-1">${t.timeReasoning}</p>
                </div>
                <div class="detail-card" style="${isBoosted?'border-color:var(--primary)':''}">
                    <strong>Priority: ${isBoosted ? t.boost.boostedPriorityScore : t.priorityScore}</strong>
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
                <button class="btn btn-danger" data-action="detail-unboost">Remove Boost</button>
                ` : (t.status !== 'done' ? `
                <div class="flex gap-2">
                    <input type="text" class="input" id="boost-reason" placeholder="Why should this be prioritized?">
                    <button class="btn btn-primary" data-action="detail-boost">Apply Boost</button>
                </div>
                ` : '')}
            </div>
            ` : ''}
            ${t.status !== 'done' ? `
            <div class="mt-4 flex justify-end">
                <button class="btn" data-action="detail-reanalyze">Re-Analyze (AI)</button>
            </div>
            ` : ''}
            <div id="detail-error-box" class="hidden text-sm mt-4" style="color: var(--danger); padding: 0.5rem; background: #fee2e2; border-radius:4px;"></div>
        </div>
    `;
    setHtml('view-detail', html);
}

export function registerRoutes() {
    registerRouter('detail-open', async (payload) => {
        await loadDetail(payload);
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        q('#view-detail').classList.remove('hidden');
    });

    registerRouter('detail-date-change', async (payload, target) => {
        const tid = state.activeDetailId;
        const t = await storage.getAssignment(tid);
        if (t) {
            t.deadline = target.value || null;
            await storage.saveAssignment(t);
        }
    });

    registerRouter('detail-check', async (payload, target) => {
        const tid = state.activeDetailId;
        const t = await storage.getAssignment(tid);
        if (t) {
            const idx = parseInt(payload);
            t.checklist[idx].done = target.checked;
            await storage.saveAssignment(t);
            // update counter inline
            const pVal = q('.p-val', q('#view-detail'));
            if(pVal) pVal.textContent = t.checklist.filter(x=>x.done).length + '/' + t.checklist.length;
        }
    });

    registerRouter('detail-done', async () => {
        showConfirm("Mark Done", "Are you sure you want to mark this complete?", async () => {
            const t = await storage.getAssignment(state.activeDetailId);
            t.status = 'done';
            await storage.saveAssignment(t);
            document.querySelector('[data-action="view:dashboard"]')?.click();
        });
    });

    registerRouter('detail-delete', async () => {
        showConfirm("Delete Assignment", "This cannot be undone.", async () => {
            await storage.deleteAssignment(state.activeDetailId);
            document.querySelector('[data-action="view:dashboard"]')?.click();
        });
    });

    registerRouter('detail-boost', async () => {
        const rzn = q('#boost-reason')?.value.trim();
        if(!rzn) return;
        const tid = state.activeDetailId;
        const t = await storage.getAssignment(tid);
        
        showSpinner("AI is boosting...");
        try {
            q('#detail-error-box')?.classList.add('hidden');
            const rec = await analyzeAssignment(t.rawContent, state.profile, rzn, t);
            t.boost = { active: true, reason: rzn, boostedPriorityScore: rec.priorityScore };
            t.priorityReasoning = rec.priorityReasoning;
            await storage.saveAssignment(t);
        } catch(err) {
            const ebox = q('#detail-error-box');
            if(ebox){ ebox.textContent=err.message; ebox.classList.remove('hidden'); }
        }
        hideSpinner();
        await loadDetail(tid);
    });

    registerRouter('detail-unboost', async () => {
        const tid = state.activeDetailId;
        const t = await storage.getAssignment(tid);
        t.boost = { active: false, reason: null, boostedPriorityScore: null };
        await storage.saveAssignment(t);
        
        showSpinner("Recalculating baseline...");
        try {
            const rec = await analyzeAssignment(t.rawContent, state.profile);
            t.priorityScore = rec.priorityScore;
            t.priorityReasoning = rec.priorityReasoning;
            await storage.saveAssignment(t);
        } catch(err) {} 
        hideSpinner();
        await loadDetail(tid);
    });

    registerRouter('detail-reanalyze', async () => {
        const tid = state.activeDetailId;
        const t = await storage.getAssignment(tid);
        showSpinner("Re-analyzing via AI...");
        try {
            q('#detail-error-box')?.classList.add('hidden');
            const rec = await analyzeAssignment(t.rawContent, state.profile);
            t.difficulty = rec.difficulty;
            t.difficultyReasoning = rec.difficultyReasoning;
            t.priorityScore = rec.priorityScore;
            t.priorityReasoning = rec.priorityReasoning;
            t.estimatedHours = rec.estimatedHours;
            t.timeReasoning = rec.timeReasoning;
            t.analyzedAt = new Date().toISOString();
            
            t.checklist = rec.checklist.map(recItem => {
                const text = typeof recItem === 'string' ? recItem : recItem.text;
                return { id: uuid(), text: text, done: false };
            });
            await storage.saveAssignment(t);
        } catch(err) {
            const ebox = q('#detail-error-box');
            if(ebox){ ebox.textContent=err.message; ebox.classList.remove('hidden'); }
        }
        hideSpinner();
        await loadDetail(tid);
    });
}
