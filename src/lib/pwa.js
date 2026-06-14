import { isOnline, deferredPrompt, canInstall, showInstallBanner, showIOSInstructions } from './stores.js';

const VISIT_COUNT_KEY = 'app:visitCount';
const INSTALL_DISMISSED_KEY = 'app:installDismissed';
const IOS_INSTRUCTIONS_SHOWN_KEY = 'app:iosInstructionsShown';

export function initPWA() {
    if (typeof window === 'undefined') return;

    // Online/Offline detection
    window.addEventListener('online', () => isOnline.set(true));
    window.addEventListener('offline', () => isOnline.set(false));
    isOnline.set(navigator.onLine);

    // Track visit count for install prompt
    incrementVisitCount();

    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt.set(e);
        canInstall.set(true);

        // Show banner after 3+ visits if not dismissed
        const visitCount = getVisitCount();
        const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY);
        if (visitCount >= 3 && !dismissed) {
            showInstallBanner.set(true);
        }
    });

    // iOS detection - show manual instructions
    if (isIOS() && !isStandalone() && !localStorage.getItem(IOS_INSTRUCTIONS_SHOWN_KEY)) {
        const visitCount = getVisitCount();
        if (visitCount >= 3) {
            showIOSInstructions.set(true);
        }
    }

    // Reset visit count if app is already installed
    if (isStandalone()) {
        localStorage.removeItem(VISIT_COUNT_KEY);
        showInstallBanner.set(false);
        showIOSInstructions.set(false);
    }
}

export async function promptInstall() {
    const prompt = getDeferredPromptValue();
    if (!prompt) return false;

    try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        deferredPrompt.set(null);
        canInstall.set(false);
        showInstallBanner.set(false);
        return outcome === 'accepted';
    } catch (err) {
        console.error('Install prompt failed:', err);
        return false;
    }
}

export function dismissInstall() {
    showInstallBanner.set(false);
    localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
}

export function dismissIOSInstructions() {
    showIOSInstructions.set(false);
    localStorage.setItem(IOS_INSTRUCTIONS_SHOWN_KEY, 'true');
}

function incrementVisitCount() {
    const count = getVisitCount() + 1;
    localStorage.setItem(VISIT_COUNT_KEY, count.toString());
}

function getVisitCount() {
    return parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10);
}

function getDeferredPromptValue() {
    let value;
    deferredPrompt.subscribe(v => value = v)();
    return value;
}

function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
}