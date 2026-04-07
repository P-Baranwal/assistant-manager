/**
 * Selects the first element matching a selector globally or scoped.
 */
export const q = (sel, root=document) => root.querySelector(sel);

/**
 * Selects all elements matching a selector, returning an array.
 */
export const qs = (sel, root=document) => Array.from(root.querySelectorAll(sel));

/**
 * Robustly sets innerHTML of an element by ID or Element instance.
 */
export const setHtml = (idOrEl, html) => { 
    const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
    if(el) el.innerHTML = html; 
};

export function showSpinner(text="Loading...") {
    const el = q('#spinner-text');
    if (el) el.textContent = text;
    q('#global-spinner')?.classList.remove('hidden');
}

export function hideSpinner() { 
    q('#global-spinner')?.classList.add('hidden'); 
}

export function showConfirm(title, msg, onConfirm) {
    const titleEl = q('#confirm-title');
    const msgEl = q('#confirm-msg');
    const modalEl = q('#confirm-modal');
    const yesBtn = q('#confirm-yes');
    const noBtn = q('#confirm-no');
    
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = msg;
    if (modalEl) modalEl.classList.remove('hidden');
    
    // Using simple binding without leaking handlers indefinitely
    const yesFn = () => { close(); if(onConfirm) onConfirm(); };
    const noFn = () => { close(); };
    
    const close = () => {
        if(modalEl) modalEl.classList.add('hidden');
        if(yesBtn) yesBtn.removeEventListener('click', yesFn);
        if(noBtn) noBtn.removeEventListener('click', noFn);
    };
    
    if(yesBtn) yesBtn.addEventListener('click', yesFn);
    if(noBtn) noBtn.addEventListener('click', noFn);
}
