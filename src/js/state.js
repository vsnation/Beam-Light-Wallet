/**
 * BEAM Wallet - State Management Module
 * Global application state with reactive updates
 */

import { ASSET_CONFIG } from './config.js';
import { apiCall } from './api.js';
import { parseMetadata } from './utils.js';

// Application state
const state = {
    // Wallet data
    wallet: {
        isConnected: false,
        isLocked: true,
        name: null,
        assets: [],
        utxos: [],
        transactions: [],
        addresses: []
    },

    // DEX data
    dex: {
        pools: [],
        fromAsset: null,
        toAsset: null,
        quote: null
    },

    // UI state
    ui: {
        currentPage: 'dashboard',
        isLoading: false,
        debugVisible: false
    },

    // Settings
    settings: {
        nodeMode: 'public',
        currentNode: 'eu-node01.mainnet.beam.mw:8100',
        hiddenAssets: new Set(JSON.parse(localStorage.getItem('hiddenAssets') || '[]')),
        showHiddenAssets: false
    }
};

// State change listeners
const listeners = new Map();

/**
 * Get current state (read-only)
 */
export function getState() {
    return state;
}

/**
 * Update state and notify listeners
 */
export function setState(path, value) {
    const keys = path.split('.');
    let current = state;

    for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
    }

    const lastKey = keys[keys.length - 1];
    const oldValue = current[lastKey];
    current[lastKey] = value;

    // Notify listeners
    notifyListeners(path, value, oldValue);
}

/**
 * Subscribe to state changes
 */
export function subscribe(path, callback) {
    if (!listeners.has(path)) {
        listeners.set(path, new Set());
    }
    listeners.get(path).add(callback);

    // Return unsubscribe function
    return () => listeners.get(path).delete(callback);
}

/**
 * Notify all listeners for a path
 */
function notifyListeners(path, value, oldValue) {
    // Notify exact path listeners
    if (listeners.has(path)) {
        listeners.get(path).forEach(cb => cb(value, oldValue));
    }

    // Notify parent path listeners
    const parts = path.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
        const parentPath = parts.slice(0, i).join('.');
        if (listeners.has(parentPath)) {
            listeners.get(parentPath).forEach(cb => cb(getState()[parts[0]], null));
        }
    }
}

/**
 * Load wallet data from API
 */
export async function loadWalletData() {
    try {
        setState('ui.isLoading', true);

        const status = await apiCall('wallet_status');
        setState('wallet.isConnected', true);
        setState('wallet.isLocked', false);

        // Build assets array from status
        const assets = [];

        // Add BEAM first
        assets.push({
            id: 0,
            balance: status.available || 0,
            locked: (status.receiving || 0) + (status.sending || 0) + (status.maturing || 0),
            receiving: status.receiving || 0,
            sending: status.sending || 0,
            maturing: status.maturing || 0
        });

        // Add other assets from totals
        if (status.totals) {
            status.totals.forEach(asset => {
                if (asset.asset_id !== 0) {
                    assets.push({
                        id: asset.asset_id,
                        balance: asset.available || 0,
                        locked: (asset.receiving || 0) + (asset.sending || 0) + (asset.maturing || 0),
                        receiving: asset.receiving || 0,
                        sending: asset.sending || 0,
                        maturing: asset.maturing || 0
                    });
                }
            });
        }

        setState('wallet.assets', assets);

        // Load UTXOs
        try {
            const utxoResult = await apiCall('get_utxo', { count: 100 });
            setState('wallet.utxos', utxoResult || []);
        } catch (e) {
            console.warn('Failed to load UTXOs:', e.message);
        }

        return status;
    } catch (e) {
        if (e.message.includes('locked')) {
            setState('wallet.isLocked', true);
        }
        throw e;
    } finally {
        setState('ui.isLoading', false);
    }
}

/**
 * Load transactions from API
 */
export async function loadTransactions(count = 100) {
    try {
        const result = await apiCall('tx_list', { count });
        const txs = Array.isArray(result) ? result : (result.tx_list || result || []);
        setState('wallet.transactions', txs);
        return txs;
    } catch (e) {
        console.error('Failed to load transactions:', e.message);
        return [];
    }
}

/**
 * Load addresses from API
 */
export async function loadAddresses() {
    try {
        const result = await apiCall('addr_list', { own: true });
        setState('wallet.addresses', result || []);
        return result || [];
    } catch (e) {
        console.error('Failed to load addresses:', e.message);
        return [];
    }
}

/**
 * Load DEX pools
 */
export async function loadDexPools() {
    try {
        const DEX_CID = '729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf';
        const result = await apiCall('invoke_contract', {
            args: `action=pools_view,cid=${DEX_CID}`
        });

        let pools = [];
        if (result?.output) {
            try {
                const parsed = JSON.parse(result.output);
                pools = parsed.res || parsed.pools || [];
            } catch (e) {
                console.warn('Failed to parse pools:', e);
            }
        }

        setState('dex.pools', pools);
        return pools;
    } catch (e) {
        console.error('Failed to load DEX pools:', e.message);
        return [];
    }
}

/**
 * Get asset info by ID
 */
export function getAssetInfo(aid) {
    const config = ASSET_CONFIG[aid];
    if (config) return { aid, ...config };

    // Check wallet assets
    const asset = state.wallet.assets.find(a => a.id === aid);
    if (asset?.metadata) {
        const meta = parseMetadata(asset.metadata);
        return {
            aid,
            name: meta.N || meta.name || `Asset #${aid}`,
            symbol: meta.UN || meta.symbol || `CA${aid}`,
            decimals: 8
        };
    }

    return {
        aid,
        name: `Asset #${aid}`,
        symbol: `CA${aid}`,
        decimals: 8
    };
}

/**
 * Toggle asset visibility
 */
export function toggleAssetHidden(assetId) {
    const hidden = state.settings.hiddenAssets;
    if (hidden.has(assetId)) {
        hidden.delete(assetId);
    } else {
        hidden.add(assetId);
    }
    localStorage.setItem('hiddenAssets', JSON.stringify([...hidden]));
    notifyListeners('settings.hiddenAssets', hidden, null);
}

/**
 * Reset state to initial values
 */
export function resetState() {
    setState('wallet.isConnected', false);
    setState('wallet.isLocked', true);
    setState('wallet.name', null);
    setState('wallet.assets', []);
    setState('wallet.utxos', []);
    setState('wallet.transactions', []);
    setState('wallet.addresses', []);
    setState('dex.pools', []);
    setState('dex.quote', null);
}

// Export state object for direct access (use carefully)
export { state };
