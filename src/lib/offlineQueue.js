const DB_NAME = 'clerify-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'pending-mutations';
const QUEUE_KEY = 'mutations';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function getQueue() {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(QUEUE_KEY);
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => db.close();
        });
    } catch (err) {
        console.error('Failed to read offline queue:', err);
        return [];
    }
}

async function saveQueue(queue) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(queue, QUEUE_KEY);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => db.close();
        });
    } catch (err) {
        console.error('Failed to save offline queue:', err);
    }
}

export async function enqueueMutation(mutation) {
    const queue = await getQueue();
    queue.push({
        ...mutation,
        timestamp: Date.now(),
        id: crypto.randomUUID()
    });
    await saveQueue(queue);
    return queue.length;
}

export async function processQueue(adapter) {
    const queue = await getQueue();
    if (queue.length === 0) return { processed: 0, failed: 0 };
    
    let processed = 0;
    let failed = 0;
    const remaining = [];
    
    for (const mutation of queue) {
        try {
            await executeMutation(adapter, mutation);
            processed++;
        } catch (err) {
            console.error('Failed to process mutation:', err, mutation);
            failed++;
            remaining.push(mutation);
        }
    }
    
    await saveQueue(remaining);
    return { processed, failed, remaining: remaining.length };
}

async function executeMutation(adapter, mutation) {
    const { type, key, value } = mutation;
    
    switch (type) {
        case 'set':
            await adapter.set(key, value);
            break;
        case 'delete':
            await adapter.delete(key);
            break;
        default:
            throw new Error(`Unknown mutation type: ${type}`);
    }
}

export async function getPendingCount() {
    const queue = await getQueue();
    return queue.length;
}

export async function clearQueue() {
    await saveQueue([]);
}