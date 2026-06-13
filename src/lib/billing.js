import { SUBSCRIPTION_LIMITS } from './constants.js';

export function getLimits(subscription) {
    return SUBSCRIPTION_LIMITS[subscription] || SUBSCRIPTION_LIMITS.free;
}

export function canAccessFeature(subscription, feature) {
    const limits = getLimits(subscription);
    return !!limits[feature];
}

export function canUseMode(subscription, mode) {
    const limits = getLimits(subscription);
    return limits.modes.includes(mode);
}

export function canCreateItem(subscription, currentCount) {
    const limits = getLimits(subscription);
    return limits.maxItems === -1 || currentCount < limits.maxItems;
}

export function canUseAI(subscription, monthlyUsage) {
    const limits = getLimits(subscription);
    return limits.aiMonthlyLimit === -1 || monthlyUsage < limits.aiMonthlyLimit;
}

export function getMonthlyUsageRemaining(subscription, monthlyUsage) {
    const limits = getLimits(subscription);
    if (limits.aiMonthlyLimit === -1) return Infinity;
    return Math.max(0, limits.aiMonthlyLimit - monthlyUsage);
}
