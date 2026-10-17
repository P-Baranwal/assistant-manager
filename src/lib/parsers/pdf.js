import { supabase } from '../supabase.js';
import { LOCAL_ONLY } from '../runtime.js';

const SARVAM_VISION_CHAR_CAP = 10000;

export async function extractPdfText(file) {
    if (!LOCAL_ONLY) {
        try {
            const text = await extractWithSarvamVision(file);
            if (text) return text;
        } catch (e) {
            console.warn('Sarvam Vision PDF extraction failed, falling back to local parser:', e);
        }
    }
    return extractWithPdfJs(file);
}

async function extractWithSarvamVision(file) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/doc-ai`;
    const form = new FormData();
    form.append('file', file);
    form.append('language', 'en-IN');

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Document AI error: ${res.status}`);

    const text = (data.content || '').trim();
    if (!text) throw new Error('Document AI returned no text');
    return text.substring(0, SARVAM_VISION_CHAR_CAP);
}

async function extractWithPdfJs(file) {
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
