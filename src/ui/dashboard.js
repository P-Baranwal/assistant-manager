import { q, setHtml } from '../utils/dom.js';
import { calculateUrgency } from '../utils/date.js';
import { storage } from '../storage.js';
import { registerRouter } from '../actions.js';
import { getDiffColor } from './detail.js';

// Shared type styles
const typeColors = {
    'Essay': {bg: 'var(--bg-essay)', text: 'var(--text-essay)'},
    'Coding': {bg: 'var(--bg-coding)', text: 'var(--text-coding)'},
    'Math': {bg: 'var(--bg-math)', text: 'var(--text-math)'},
    'Research': {bg: 'var(--bg-research)', text: 'var(--text-research)'},
    'Other': {bg: 'var(--bg-other)', text: 'var(--text-other)'}
};

export async function loadDashboard() {
    const index = await storage.getIndex();
    const itemPromises = index.map(id => storage.getAssignment(id));
    const all = (await Promise.all(itemPromises)).filter(Boolean);
    
    // Sort
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
    
    const setT = (id, txt) => { const el = q(id); if(el) el.textContent = txt; };
    setT('#stat-total', active.length);
    setT('#stat-due', dueCount);
    setT('#stat-overdue', overdueCount);
    setT('#stat-done', completed.length);
    setT('#completed-count', `(${completed.length})`);

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
            <div class="card" data-action="detail-open:${t.id}" style="animation-delay: ${i*0.05}s; cursor: pointer;">
                <div class="card-header">
                    <div>
                        <div class="text-xs text-muted mb-1">#${i+1} &middot; Score: ${score} ${t.boost?.active ? '<svg class="svg-icon" viewBox="0 0 24 24" style="vertical-align: text-bottom; fill: var(--primary); width:14px;"><path d="M13.13 22.19L11.5 18.36C13.07 17.78 14.54 17 15.9 16.09L13.13 22.19ZM5.64 12.5L1.81 10.87L7.91 8.1C7 9.46 6.22 10.93 5.64 12.5ZM21.61 2.39C21.61 2.39 16.66 .269 9 5.36C5.79 7.5 3.39 10.71 2 14.53L5.53 16.06L7.33 18.15L8.2 21.05C8.84 21.32 9.54 21.46 10.25 21.46C11.53 21.46 12.75 21 13.75 20.25CL21.5 13C22 10.5 22 8.5 21.61 2.39Z"/></svg> (Boosted)' : ''}</div>
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
        doneHtml += `<div class="card" data-action="detail-open:${t.id}" style="opacity: 0.7; scale: 0.98; cursor: pointer;">
            <div class="card-header"><h3 class="card-title text-muted" style="text-decoration:line-through">${t.title}</h3></div>
        </div>`;
    });
    setHtml('completed-assignments', doneHtml);
}

export function registerRoutes() {
    registerRouter('toggle-completed', async () => {
        q('#completed-assignments')?.classList.toggle('hidden');
    });
}
