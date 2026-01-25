/**
 * BEAM Wallet - API Module
 * Handles all communication with wallet-api
 */

import { API_URL, DEX_CID, MAX_DEBUG_LOGS } from './config.js';

// Debug logging system
const debugLogs = [];

export function debugLog(type, method, data, error = null) {
    const entry = {
        timestamp: new Date().toISOString(),
        type,
        method,
        data: type === 'request' && method === 'invoke_contract'
            ? { args: data.args, create_tx: data.create_tx }
            : data,
        error
    };
    debugLogs.unshift(entry);
    if (debugLogs.length > MAX_DEBUG_LOGS) debugLogs.pop();

    const style = error ? 'color:red' : (type === 'response' ? 'color:green' : 'color:blue');
    console.log(`%c[${type.toUpperCase()}] ${method}`, style, entry.data);

    if (document.getElementById('debug-log-list')) {
        renderDebugLogs();
    }
}

export function getDebugLogs() {
    return debugLogs;
}

export function clearDebugLogs() {
    debugLogs.length = 0;
    renderDebugLogs();
}

export function renderDebugLogs() {
    const container = document.getElementById('debug-log-list');
    if (!container) return;

    container.innerHTML = debugLogs.map(log => {
        const cls = log.error ? 'error' : (log.type === 'response' ? 'success' : 'info');
        const dataStr = typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data;
        return `
            <div class="debug-log-entry ${cls}" style="margin-bottom:8px;padding:8px;background:var(--void-lighter);border-radius:4px;font-size:11px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="color:var(--text-muted);">${log.timestamp.split('T')[1].split('.')[0]}</span>
                    <span style="font-weight:600;color:var(--${cls === 'error' ? 'error' : cls === 'success' ? 'success' : 'beam-cyan'});">${log.type.toUpperCase()}</span>
                </div>
                <div style="font-weight:500;margin-bottom:4px;">${log.method}</div>
                <pre style="margin:0;overflow-x:auto;max-height:100px;font-size:10px;color:var(--text-secondary);">${dataStr}</pre>
                ${log.error ? `<div style="color:var(--error);margin-top:4px;">${log.error}</div>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Make an API call to wallet-api
 * @param {string} method - JSON-RPC method name
 * @param {object} params - Method parameters
 * @returns {Promise<any>} - API response
 */
export async function apiCall(method, params = {}) {
    try {
        // Automatically add DEX shader for invoke_contract calls
        if (method === 'invoke_contract' && params.args && params.args.includes(DEX_CID)) {
            if (typeof window.DEX_SHADER !== 'undefined' && !params.contract) {
                params.contract = window.DEX_SHADER;
            }
        }

        debugLog('request', method, params);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
        });

        if (!response.ok) {
            const errMsg = `HTTP ${response.status}: ${response.statusText}`;
            debugLog('error', method, params, errMsg);
            throw new Error(errMsg);
        }

        const data = await response.json();
        debugLog('response', method, data);

        if (data.error) {
            const code = data.error.code;
            const msg = data.error.message || 'API Error';

            if (code === -32600 || msg.includes('locked')) {
                throw new Error('Wallet is locked. Please unlock it first.');
            }
            throw new Error(msg);
        }

        if (data.result !== undefined) {
            return data.result;
        }

        const { jsonrpc, id, error, ...rest } = data;
        return Object.keys(rest).length > 0 ? rest : data;
    } catch (e) {
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
            throw new Error('Cannot connect to wallet API. Make sure wallet-api is running.');
        }
        console.error('API call failed:', method, e.message);
        throw e;
    }
}

/**
 * Check server status (serve.py management endpoints)
 */
export async function checkServerStatus() {
    try {
        const response = await fetch('/api/status');
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        return null;
    }
}

/**
 * Get list of available wallets
 */
export async function getWalletList() {
    try {
        const response = await fetch('/api/wallets');
        if (!response.ok) return [];
        const data = await response.json();
        return data.wallets || [];
    } catch (e) {
        return [];
    }
}

/**
 * Unlock a wallet
 */
export async function unlockWallet(walletName, password) {
    const response = await fetch('/api/wallet/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletName, password })
    });
    return await response.json();
}

/**
 * Lock the current wallet
 */
export async function lockWallet() {
    const response = await fetch('/api/wallet/lock', { method: 'POST' });
    return await response.json();
}

/**
 * Create a new wallet
 */
export async function createWallet(walletName, password) {
    const response = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletName, password })
    });
    return await response.json();
}

/**
 * Restore wallet from seed phrase
 */
export async function restoreWallet(walletName, password, seedPhrase) {
    const response = await fetch('/api/wallet/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletName, password, seed_phrase: seedPhrase })
    });
    return await response.json();
}

/**
 * Switch node mode (public/local)
 */
export async function switchNodeMode(mode, password, walletName = null) {
    const body = { mode, password };
    if (walletName) body.wallet = walletName;

    const response = await fetch('/api/node/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return await response.json();
}
