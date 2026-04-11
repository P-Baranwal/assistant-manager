export async function extractPdfText(file) {
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
