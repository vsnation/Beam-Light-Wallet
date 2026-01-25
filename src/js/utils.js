/**
 * BEAM Wallet - Utilities Module
 * Helper functions for formatting, parsing, and common operations
 */

import { GROTH } from './config.js';

/**
 * Format groth amount to display string
 * @param {number} groth - Amount in groth
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted amount
 */
export function formatAmount(groth, decimals = 8) {
    if (!groth && groth !== 0) return '0';
    const value = groth / GROTH;
    if (value === 0) return '0';
    return value.toFixed(decimals).replace(/,/g, '.').replace(/\.?0+$/, '');
}

/**
 * Format number for input fields (always uses dot)
 */
export function formatForInput(num, decimals = 6) {
    if (!num && num !== 0) return '';
    return num.toFixed(decimals).replace(/,/g, '.').replace(/\.?0+$/, '');
}

/**
 * Parse display amount to groth
 * @param {string} amount - Display amount
 * @returns {number} Amount in groth
 */
export function parseAmount(amount) {
    const num = parseFloat(amount.replace(',', '.'));
    if (isNaN(num)) return 0;
    return Math.round(num * GROTH);
}

/**
 * Parse BEAM metadata string format
 * STD:SCH_VER=1;N=Name;SN=Short;UN=Symbol...
 */
export function parseMetadata(metaStr) {
    const result = {};
    if (!metaStr || typeof metaStr !== 'string') return result;

    let str = metaStr.replace(/^STD:/, '');
    str.split(';').forEach(pair => {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
            result[key.trim()] = valueParts.join('=').trim();
        }
    });

    return result;
}

/**
 * Shorten address for display
 */
export function shortenAddress(address, chars = 8) {
    if (!address || address.length <= chars * 2 + 3) return address;
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format timestamp to relative time
 */
export function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp * 1000;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
        return new Date(timestamp * 1000).toLocaleDateString();
    } else if (days > 0) {
        return `${days}d ago`;
    } else if (hours > 0) {
        return `${hours}h ago`;
    } else if (minutes > 0) {
        return `${minutes}m ago`;
    } else {
        return 'Just now';
    }
}

/**
 * Format date for display
 */
export function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text, buttonEl = null) {
    try {
        await navigator.clipboard.writeText(text);

        if (buttonEl) {
            const originalText = buttonEl.innerHTML;
            buttonEl.innerHTML = '✓ Copied';
            buttonEl.style.color = 'var(--success)';
            setTimeout(() => {
                buttonEl.innerHTML = originalText;
                buttonEl.style.color = '';
            }, 2000);
        }

        return true;
    } catch (e) {
        console.error('Failed to copy:', e);
        return false;
    }
}

/**
 * Debounce function calls
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function calls
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Validate wallet name
 */
export function validateWalletName(name) {
    if (!name || name.length < 1) return 'Wallet name is required';
    if (name.length > 32) return 'Wallet name too long';
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 'Only letters, numbers, underscore and hyphen allowed';
    return null;
}

/**
 * Validate password
 */
export function validatePassword(password) {
    if (!password || password.length < 6) return 'Password must be at least 6 characters';
    return null;
}

/**
 * Validate seed phrase (12 words)
 */
export function validateSeedPhrase(phrase) {
    if (!phrase || typeof phrase !== 'string') return 'Seed phrase is required';
    const words = phrase.trim().split(/\s+/);
    if (words.length !== 12) return 'Seed phrase must be exactly 12 words';
    return null;
}

/**
 * Generate random ID
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Wait for specified milliseconds
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe JSON parse
 */
export function safeJsonParse(str, fallback = null) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

/**
 * Get CSS variable value
 */
export function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Set CSS variable value
 */
export function setCssVar(name, value) {
    document.documentElement.style.setProperty(name, value);
}
