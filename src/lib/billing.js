import { SUBSCRIPTION_LIMITS } from './constants.js';
import { LOCAL_ONLY } from './runtime.js';

export function getLimits(subscription) {
    if (LOCAL_ONLY) {
        return { maxItems: -1, aiMonthlyLimit: -1, modes: ['student', 'professional'], wbsGenerator: true, aiProxy: false, sharedProjects: false };
    }
    return SUBSCRIPTION_LIMITS[subscription] || SUBSCRIPTION_LIMITS.free;
}

export function canAccessFeature(subscription, feature) {
    if (LOCAL_ONLY) return feature !== 'aiProxy' && feature !== 'sharedProjects';
    const limits = getLimits(subscription);
    return !!limits[feature];
}

export function canUseMode(subscription, mode) {
    if (LOCAL_ONLY) return mode === 'student' || mode === 'professional';
    const limits = getLimits(subscription);
    return limits.modes.includes(mode);
}

export function canCreateItem(subscription, currentCount) {
    if (LOCAL_ONLY) return true;
    const limits = getLimits(subscription);
    return limits.maxItems === -1 || currentCount < limits.maxItems;
}

export function canUseAI(subscription, monthlyUsage) {
    if (LOCAL_ONLY) return true;
    const limits = getLimits(subscription);
    return limits.aiMonthlyLimit === -1 || monthlyUsage < limits.aiMonthlyLimit;
}

export function getMonthlyUsageRemaining(subscription, monthlyUsage) {
    if (LOCAL_ONLY) return Infinity;
    const limits = getLimits(subscription);
    if (limits.aiMonthlyLimit === -1) return Infinity;
    return Math.max(0, limits.aiMonthlyLimit - monthlyUsage);
}
