// ============================================
// AUTO-SHUTDOWN: Heartbeat & Browser Close
// ============================================
// Send heartbeat every 10 seconds to keep server alive
// Server auto-shuts down if no heartbeat for 60 seconds
let heartbeatInterval = null;

function startHeartbeat() {
    if (heartbeatInterval) return;

    // Send initial heartbeat
    sendHeartbeat();

    // Send heartbeat every 10 seconds
    heartbeatInterval = setInterval(sendHeartbeat, 10000);

    // Also send shutdown signal when page is closed
    window.addEventListener('beforeunload', sendShutdown);
    window.addEventListener('unload', sendShutdown);
}

function sendHeartbeat() {
    fetch('/api/heartbeat').catch(() => {});
}

function sendShutdown() {
    // Use sendBeacon for reliable delivery on page close
    if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/shutdown', '');
    } else {
        // Fallback to sync XHR (may not complete)
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/shutdown', false);
        try { xhr.send(); } catch(e) {}
    }
}

// Start heartbeat when page loads
document.addEventListener('DOMContentLoaded', startHeartbeat);

// ============================================
// Asset data for UI
// ============================================
// Priority token icons from ca_assets_updates.json
// BEAM logo as inline SVG data URI (avoids CORS issues)
// Official BEAM logo SVG
const BEAM_LOGO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 40"><defs><linearGradient id="a" x1=".03%" x2="54.79%" y1="50.23%" y2="50.23%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#FFF"/></linearGradient><linearGradient id="b" x1="99.38%" x2="35.8%" y1="49.83%" y2="49.83%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#FF51FF"/></linearGradient><linearGradient id="c" x1="100.43%" x2="48.94%" y1="50.11%" y2="50.11%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#A18CFF"/></linearGradient><linearGradient id="d" x1="99.91%" x2="41.06%" y1="50.24%" y2="50.24%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#AB38E6"/></linearGradient></defs><g fill="none"><path fill="#0B76FF" d="M28.47 33.21H40.3L28.48 12.58V.08l23.15 39.77H28.47z"/><path fill="#24C1FF" d="M28.47 33.21H16.66l11.8-20.63V.08L5.32 39.86h23.16z"/><path fill="#39FFF2" d="M28.47 17.8v13.33l-7.23.01z"/><path fill="#00E2C2" d="M28.47 17.8v13.33l7.24.01z"/><path fill="url(#a)" d="m.1 12.53 28.37 13.14v1.37L.11 20.82z"/><path fill="url(#b)" d="M56.9 8.7 28.47 25.68v.46L56.9 14.18z"/><path fill="url(#c)" d="m56.9 25.13-28.43 1.91v-.45l28.43-6.93z"/><path fill="url(#d)" d="M56.9 14.18 28.47 26.13v.46l28.43-6.93z"/></g></svg>');

// Asset icons from ca_assets_updates.json - priority tokens with known logos
const ASSET_ICONS = {
    0: BEAM_LOGO,
    4: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/crown.ico',
    7: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/beamx.png',
    9: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/tico.ico',
    47: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/47_nph.svg',
    174: 'https://73ecj7qctz4nrza4bbbqmgriv4gh5uwwf65izu7wjdvrmozhbvbq.arweave.net/_sgk_gKeeNjkHAhDBhoorwx-0tYvuozT9kjrFjsnDUM'
};

// Priority token config with metadata
const ASSET_CONFIG = {
    0: { name: 'BEAM', symbol: 'BEAM', color: '#25c2a0', class: 'beam', icon: ASSET_ICONS[0], decimals: 8 },
    4: { name: 'Crown', symbol: 'CROWN', color: '#ffd700', class: 'warning', icon: ASSET_ICONS[4], decimals: 8 },
    6: { name: 'Rangers Fan Token', symbol: 'RFC', color: '#0066cc', class: 'fomo', icon: null, decimals: 8 },
    7: { name: 'BeamX', symbol: 'BEAMX', color: '#da70d6', class: 'beamx', icon: ASSET_ICONS[7], decimals: 8 },
    9: { name: 'Tico', symbol: 'TICO', color: '#e91e63', class: 'fomo', icon: ASSET_ICONS[9], decimals: 8 },
    47: { name: 'Nephrit', symbol: 'NPH', color: '#3498db', class: 'fomo', icon: ASSET_ICONS[47], decimals: 8 },
    174: { name: 'FOMO', symbol: 'FOMO', color: '#60a5fa', class: 'fomo', icon: ASSET_ICONS[174], decimals: 8 }
};

// Wallet data - will be fetched from API
let walletData = {
    assets: [],
    utxos: [],
    isConnected: false
};

// Hidden assets (stored in localStorage)
let hiddenAssets = new Set(JSON.parse(localStorage.getItem('hiddenAssets') || '[]'));
let showHiddenAssets = false;

// API Configuration
const API_URL = '/api/wallet';
const GROTH = 100000000;

// Sanitize numeric input - convert commas to decimal points
function sanitizeNumericInput(input) {
    if (!input) return;
    const el = typeof input === 'string' ? document.getElementById(input) : input;
    if (!el) return;

    // Replace comma with dot for decimal separator
    const value = el.value.replace(/,/g, '.');
    // Remove any non-numeric characters except dot
    const sanitized = value.replace(/[^\d.]/g, '');
    // Ensure only one decimal point
    const parts = sanitized.split('.');
    if (parts.length > 2) {
        el.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
        el.value = sanitized;
    }
}

// Debug logging system
const debugLogs = [];
const MAX_DEBUG_LOGS = 100;

function debugLog(type, method, data, error = null) {
    const entry = {
        timestamp: new Date().toISOString(),
        type, // 'request', 'response', 'error'
        method,
        data: type === 'request' && method === 'invoke_contract'
            ? { args: data.args, create_tx: data.create_tx } // Don't log shader bytes
            : data,
        error
    };
    debugLogs.unshift(entry);
    if (debugLogs.length > MAX_DEBUG_LOGS) debugLogs.pop();

    // Console output for debugging
    const style = error ? 'color:red' : (type === 'response' ? 'color:green' : 'color:blue');
    console.log(`%c[${type.toUpperCase()}] ${method}`, style, entry.data);

    // Update debug panel if visible
    if (document.getElementById('debug-log-list')) {
        renderDebugLogs();
    }
}

function renderDebugLogs() {
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

function clearDebugLogs() {
    debugLogs.length = 0;
    renderDebugLogs();
}

// API call helper
async function apiCall(method, params = {}) {
    try {
        // Automatically add DEX shader for invoke_contract calls with DEX contract
        if (method === 'invoke_contract' && params.args && params.args.includes(DEX_CID)) {
            if (typeof DEX_SHADER !== 'undefined' && !params.contract) {
                params.contract = DEX_SHADER;
            }
        }

        // Log request
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

        // Log response
        debugLog('response', method, data);

        if (data.error) {
            // Handle specific error codes
            const code = data.error.code;
            const msg = data.error.message || 'API Error';

            if (code === -32600 || msg.includes('locked')) {
                throw new Error('Wallet is locked. Please unlock it first.');
            }
            throw new Error(msg);
        }

        // Some methods return data directly (not wrapped in result)
        // e.g. assets_list returns {assets: [...]} instead of {result: {assets: [...]}}
        if (data.result !== undefined) {
            return data.result;
        }

        // Return the data object (excluding jsonrpc and id)
        const { jsonrpc, id, error, ...rest } = data;
        return Object.keys(rest).length > 0 ? rest : data;
    } catch (e) {
        // Network errors or JSON parse errors
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
            throw new Error('Cannot connect to wallet API. Make sure wallet-api is running.');
        }
        console.error('API call failed:', method, e.message);
        throw e;
    }
}

// Format amount from groth to display
function formatAmount(groth, decimals = 8) {
    if (!groth && groth !== 0) return '0';
    const value = groth / GROTH;
    if (value === 0) return '0';
    // Always use dot as decimal separator, never comma
    return value.toFixed(decimals).replace(/,/g, '.').replace(/\.?0+$/, '');
}

// Helper to format number for input fields (always uses dot)
function formatForInput(num, decimals = 6) {
    if (!num && num !== 0) return '';
    return num.toFixed(decimals).replace(/,/g, '.').replace(/\.?0+$/, '');
}

// Parse BEAM metadata string format: STD:SCH_VER=1;N=Name;SN=Short;UN=Symbol...
function parseMetadata(metaStr) {
    const result = {};
    if (!metaStr || typeof metaStr !== 'string') return result;

    // Remove STD: prefix if present
    let str = metaStr.replace(/^STD:/, '');

    // Split by semicolon and parse key=value pairs
    str.split(';').forEach(pair => {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
            result[key.trim()] = valueParts.join('=').trim();
        }
    });

    return result;
}

// Load wallet data from API
async function loadWalletData() {
    try {
        // Get wallet status
        const status = await apiCall('wallet_status');
        walletData.isConnected = true;

        // Build assets array from status
        walletData.assets = [];

        // Add BEAM first
        walletData.assets.push({
            id: 0,
            balance: status.available || 0,
            locked: (status.locked || 0) + (status.maturing || 0) + (status.receiving || 0) + (status.sending || 0)
        });

        // Add other assets from totals
        if (status.totals) {
            status.totals.forEach(t => {
                if (t.asset_id !== 0) {
                    walletData.assets.push({
                        id: t.asset_id,
                        balance: t.available || 0,
                        locked: (t.locked || 0) + (t.maturing || 0) + (t.receiving || 0) + (t.sending || 0)
                    });
                }
            });
        }

        // Update sync status
        updateSyncStatus(status);

        // Try to get UTXOs
        try {
            const utxos = await apiCall('get_utxo', { count: 100 });
            walletData.utxos = (utxos || []).map(u => ({
                asset: u.asset_id || 0,
                amount: u.amount || 0,
                maturity: u.maturity || 0,
                type: u.type === 0 ? 'Regular' : (u.type === 1 ? 'Change' : 'Coinbase'),
                status: u.status === 1 ? 'available' : 'spent'
            }));
        } catch (e) {
            console.log('UTXOs not available:', e);
            walletData.utxos = [];
        }

        // Load asset metadata cache for getAssetInfo() to work correctly
        try {
            const response = await apiCall('assets_list', { refresh: false });
            const assets = response?.assets || response || [];
            if (assets.length > 0) {
                allAssetsCache = assets.map(a => ({
                    asset_id: a.asset_id,
                    // Use metadata_pairs if available, otherwise keep raw metadata
                    metadata: a.metadata_pairs || (typeof a.metadata === 'string' ? parseMetadata(a.metadata) : (a.metadata || {})),
                    metadata_pairs: a.metadata_pairs,
                    value: a.emission || 0,
                    lock_height: a.lockHeight
                }));
                console.log(`Loaded ${allAssetsCache.length} asset metadata entries`);
            }
        } catch (e) {
            console.log('Assets list not available:', e);
        }

        return true;
    } catch (e) {
        console.error('Failed to load wallet data:', e);
        walletData.isConnected = false;
        return false;
    }
}

// Update sync status display
let lastServerStatus = null;

function updateSyncStatus(status) {
    const networkBadge = document.querySelector('.network-badge span');
    if (networkBadge) {
        const height = status.current_height || 0;
        const synced = status.current_state_hash && height > 0;

        // Check if local node is syncing
        if (lastServerStatus?.node_mode === 'local' && lastServerStatus?.node_running && !lastServerStatus?.node_synced) {
            const progress = lastServerStatus.node_progress || 0;
            networkBadge.textContent = `Syncing ${progress}%`;
            networkBadge.style.color = 'var(--warning)';
        } else {
            networkBadge.textContent = synced ? `Mainnet (${height.toLocaleString()})` : 'Syncing...';
            networkBadge.style.color = '';
        }
    }

    // Show/hide balance warning
    updateBalanceWarning();
}

// Update balance outdated warning
function updateBalanceWarning() {
    let warning = document.getElementById('balance-outdated-warning');
    const shouldShow = lastServerStatus?.node_mode === 'local' &&
                       lastServerStatus?.node_running &&
                       !lastServerStatus?.node_synced;

    if (shouldShow && !warning) {
        warning = document.createElement('div');
        warning.id = 'balance-outdated-warning';
        warning.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <path d="M12 9v4M12 17h.01"/>
            </svg>
            <span>Local node syncing (${lastServerStatus?.node_progress || 0}%) - balances may be outdated</span>
        `;
        warning.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: rgba(245, 158, 11, 0.15);
            border: 1px solid rgba(245, 158, 11, 0.3);
            border-radius: 8px;
            color: var(--warning);
            font-size: 12px;
            margin: 0 20px 16px 20px;
        `;
        // Insert after header
        const header = document.querySelector('.header');
        if (header && header.nextSibling) {
            header.parentNode.insertBefore(warning, header.nextSibling);
        }
    } else if (!shouldShow && warning) {
        warning.remove();
    } else if (shouldShow && warning) {
        // Update progress
        warning.querySelector('span').textContent = `Local node syncing (${lastServerStatus?.node_progress || 0}%) - balances may be outdated`;
    }
}

// Navigation
document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
        const page = item.dataset.page;
        showPage(page);
    });
});

function showPage(pageId) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-page="${pageId}"]`)?.classList.add('active');

    // Update pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });
    const page = document.getElementById('page-' + pageId);
    if (page) {
        page.classList.add('active');
        page.style.display = 'block';
    }

    // Update title
    const titles = {
        dashboard: 'Dashboard',
        assets: 'All Assets',
        transactions: 'Transactions',
        addresses: 'Addresses',
        dex: 'DEX Trading',
        donate: 'Support Development',
        settings: 'Settings'
    };
    document.getElementById('page-title').textContent = titles[pageId] || pageId;

    // Load page-specific data
    if (pageId === 'dashboard') {
        loadWalletData().then(() => {
            renderAssetCards();
            renderBalancesTable();
            renderUtxos();
        });
    } else if (pageId === 'assets') {
        loadAllAssets();
    } else if (pageId === 'transactions') {
        loadTransactions();
    } else if (pageId === 'addresses') {
        loadAddresses();
    } else if (pageId === 'dex') {
        loadDexPools();
        initializeDexDefaults();
    } else if (pageId === 'settings') {
        loadSettings();
    }
}

// Expose showPage to App namespace
if (window.App) {
    window.App.showPage = showPage;
} else {
    window.App = { showPage };
}

// Render asset cards
function renderAssetCards() {
    const container = document.getElementById('asset-cards');

    // Filter to show only assets with balance, or at least BEAM
    let assetsToShow = walletData.assets.filter(a => (a.balance + a.locked) > 0);
    if (assetsToShow.length === 0) {
        assetsToShow = walletData.assets.filter(a => a.id === 0);
    }
    if (assetsToShow.length === 0) {
        assetsToShow = [{ id: 0, balance: 0, locked: 0 }];
    }

    // Sort by balance (descending), with BEAM always first
    assetsToShow.sort((a, b) => {
        if (a.id === 0) return -1;
        if (b.id === 0) return 1;
        return (b.balance + b.locked) - (a.balance + a.locked);
    });

    container.innerHTML = assetsToShow.map(asset => {
        // Use getAssetInfo for proper LP token detection
        const info = getAssetInfo(asset.id);
        const config = ASSET_CONFIG[asset.id] || { name: info.name, symbol: info.symbol, color: info.color, class: '' };
        const isLpToken = info.isLpToken;
        const displayName = isLpToken ? info.name : (config.name || info.name);
        const displaySymbol = isLpToken ? info.symbol : (config.symbol || info.symbol);
        const displayColor = isLpToken ? 'linear-gradient(135deg, #25c2a0, #60a5fa)' : (config.color || info.color);
        const displayIcon = isLpToken ? null : config.icon;

        const balance = formatAmount(asset.balance);
        const [whole, decimal] = balance.includes('.') ? balance.split('.') : [balance, '00000000'];

        return `
            <div class="asset-card asset-card-${config.class || ''}${isLpToken ? ' lp-token-card' : ''}" onclick="selectAsset(${asset.id})">
                <div class="asset-card-header">
                    <div class="asset-icon asset-icon-${config.class || ''}" style="${displayIcon ? '' : `background: ${displayColor}`}">
                        ${displayIcon ? `<img src="${displayIcon}" style="width:28px;height:28px;" onerror="this.style.display='none';this.parentNode.style.background='${displayColor}';this.parentNode.textContent='${displaySymbol.substring(0,2)}'">` : (isLpToken ? 'LP' : displaySymbol.substring(0, 2))}
                    </div>
                    <span class="asset-id">${isLpToken ? '<span style="font-size:9px;padding:1px 4px;background:linear-gradient(135deg, #25c2a0, #60a5fa);border-radius:3px;">LP</span>' : '#' + asset.id}</span>
                </div>
                <div class="asset-balance">
                    ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}<span class="asset-balance-decimal">.${decimal.substring(0,4) || '0000'}</span>
                </div>
                <div class="asset-name">
                    ${displayName}
                    ${asset.locked > 0 ? `<span class="annotation" style="margin-left:8px;">+${formatAmount(asset.locked)} locked</span>` : ''}
                    <button class="asset-dropdown" onclick="event.stopPropagation(); openAssetMenu(${asset.id})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                            <path d="M6 9l6 6 6-6"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Asset dropdown menu
function openAssetMenu(assetId) {
    const config = ASSET_CONFIG[assetId] || { name: `Asset #${assetId}`, symbol: 'CA' };
    // For now, just show toast with options
    showToast(`${config.symbol}: Send, Receive, or Trade`, 'info');
}

// Render balances table
function renderBalancesTable() {
    const tbody = document.getElementById('balances-tbody');

    if (walletData.assets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">No assets found</td></tr>`;
        return;
    }

    // Priority tokens that should always appear first (in order)
    const PRIORITY_ORDER = [0, 174, 7, 4, 47, 9]; // BEAM, FOMO, BeamX, Crown, NPH, Tico

    // Sort by: 1) Priority order first, 2) Then by balance (descending)
    const sortedAssets = [...walletData.assets].sort((a, b) => {
        const aPriority = PRIORITY_ORDER.indexOf(a.id);
        const bPriority = PRIORITY_ORDER.indexOf(b.id);

        // Both are priority tokens - sort by priority order
        if (aPriority !== -1 && bPriority !== -1) {
            return aPriority - bPriority;
        }
        // Only a is priority - a comes first
        if (aPriority !== -1) return -1;
        // Only b is priority - b comes first
        if (bPriority !== -1) return 1;
        // Neither is priority - sort by balance
        return (b.balance + b.locked) - (a.balance + a.locked);
    });

    tbody.innerHTML = sortedAssets.map(asset => {
        // Get full asset info to detect LP tokens
        const info = getAssetInfo(asset.id);
        const config = ASSET_CONFIG[asset.id] || { name: info.name || `Asset #${asset.id}`, symbol: info.symbol || 'CA' + asset.id, color: info.color || `hsl(${(asset.id * 137) % 360}, 50%, 50%)`, class: '' };
        const balance = formatAmount(asset.balance);
        const locked = asset.locked > 0 ? formatAmount(asset.locked) : '-';
        const textColor = ['warning', 'success'].includes(config.class) ? '#000' : '#fff';
        const isLpToken = info.isLpToken;

        // LP Token special display
        const lpBadge = isLpToken ? '<span style="font-size:9px;padding:2px 6px;background:linear-gradient(135deg, #25c2a0, #60a5fa);color:#fff;border-radius:4px;margin-left:6px;vertical-align:middle;">LP</span>' : '';
        const lpTooltip = isLpToken ? `title="Liquidity Provider Token - Represents your share in the ${info.lpPair ? info.name.replace(' LP Token', '') : 'DEX'} pool. Withdraw to get back your tokens + earned fees."` : '';

        // Action button for LP tokens vs regular assets - opens popup modals
        const actionButton = isLpToken
            ? `<button class="action-btn trade-btn" onclick="event.stopPropagation(); openQuickWithdrawLPModal(${asset.id})" style="background:linear-gradient(135deg, #25c2a0, #60a5fa);">Withdraw LP</button>`
            : `<button class="action-btn trade-btn" onclick="event.stopPropagation(); openQuickTradeModal(${asset.id})">Trade</button>`;

        return `
            <tr onclick="selectAsset(${asset.id})" style="cursor:pointer;" ${lpTooltip}>
                <td>
                    <div class="asset-cell">
                        <div class="asset-cell-icon" style="${config.icon ? '' : `background: ${isLpToken ? 'linear-gradient(135deg, #25c2a0, #60a5fa)' : config.color}; color: ${textColor}`}">
                            ${config.icon ? `<img src="${config.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${config.color}';this.parentNode.style.color='${textColor}';this.parentNode.textContent='${config.symbol.substring(0,2)}'">` : (isLpToken ? 'LP' : config.symbol.substring(0, 2))}
                        </div>
                        <div class="asset-cell-info">
                            <span class="asset-cell-name">${info.name || config.name}${lpBadge}</span>
                            <span class="asset-cell-symbol">${info.symbol || config.symbol} <span style="color:var(--text-muted);font-size:10px;">#${asset.id}</span></span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="balance-cell">${balance}</div>
                </td>
                <td>
                    <div class="balance-locked">${locked}</div>
                </td>
                <td>
                    <span class="asset-id-cell">#${asset.id}</span>
                </td>
                <td>
                    <div class="action-cell">
                        <button class="action-btn" onclick="event.stopPropagation(); openSendModal(${asset.id})">Send</button>
                        <button class="action-btn" onclick="event.stopPropagation(); openReceiveModal()">Receive</button>
                        ${actionButton}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Open DEX trade for specific asset
function openTradeForAsset(assetId) {
    console.log('Opening trade for asset:', assetId);

    // Set the clicked asset as TO_ASSET (asset to buy/receive)
    const targetAsset = getAssetInfo(assetId);

    // Find the best FROM asset to swap from
    let fromAssetId = 0; // Default to BEAM

    if (assetId === 0) {
        // Trading TO BEAM - find any pool with BEAM and swap from that asset
        const anyBeamPool = dexPools.find(p => p.aid1 === 0 || p.aid2 === 0);
        if (anyBeamPool) {
            fromAssetId = anyBeamPool.aid1 === 0 ? anyBeamPool.aid2 : anyBeamPool.aid1;
        } else {
            fromAssetId = 174; // Default to FOMO
        }
    } else {
        // Trading TO another asset - prefer BEAM as FROM
        const beamPool = dexPools.find(p =>
            (p.aid1 === 0 && p.aid2 === assetId) ||
            (p.aid1 === assetId && p.aid2 === 0)
        );

        if (beamPool) {
            // Direct BEAM pool exists - swap from BEAM
            fromAssetId = 0;
        } else {
            // No BEAM pool - find any pool with this asset
            const otherPool = dexPools.find(p => p.aid1 === assetId || p.aid2 === assetId);
            if (otherPool) {
                fromAssetId = otherPool.aid1 === assetId ? otherPool.aid2 : otherPool.aid1;
            } else {
                // No pool found - default to BEAM anyway
                fromAssetId = 0;
            }
        }
    }

    // Set swap direction: FROM -> TO
    dexFromAsset = getAssetInfo(fromAssetId);
    dexToAsset = targetAsset;

    console.log('Swap setup:', dexFromAsset.symbol, '->', dexToAsset.symbol);

    // Navigate to DEX page and swap tab
    showPage('dex');
    showDexTab('swap');

    // Force UI update after navigation
    setTimeout(() => {
        updateSwapUI();

        // Pre-fill amount based on FROM balance
        const fromBalance = walletData.assets.find(a => a.id === fromAssetId);
        if (fromBalance && fromBalance.balance > 0) {
            const amount = Math.min(1, parseFloat(formatAmount(fromBalance.balance)) * 0.1);
            document.getElementById('dex-from-amount').value = amount.toFixed(2).replace(/,/g, '.');
        } else {
            document.getElementById('dex-from-amount').value = '0.1';
        }

        // Get quote for the swap
        debounceGetQuote();
    }, 100);
}

// =============================================
// QUICK TRADE MODAL (Trade button from Dashboard/Assets)
// =============================================
let qtFromAsset = null;
let qtToAsset = null;
let qtQuoteData = null;

async function openQuickTradeModal(toAssetId) {
    // Load pools if not loaded yet
    if (!dexPools || dexPools.length === 0) {
        await loadDexPools();
    }

    // Set the asset to trade TO
    qtToAsset = getAssetInfo(toAssetId);

    // Set FROM asset - prefer BEAM, or find a pool partner
    if (toAssetId === 0) {
        // Trading TO BEAM - find a pool partner
        const pool = dexPools.find(p => p.aid1 === 0 || p.aid2 === 0);
        qtFromAsset = pool ? getAssetInfo(pool.aid1 === 0 ? pool.aid2 : pool.aid1) : getAssetInfo(174);
    } else {
        qtFromAsset = getAssetInfo(0); // BEAM
    }

    updateQuickTradeUI();
    openModal('quick-trade-modal');
}

function updateQuickTradeUI() {
    // Update FROM
    const fromIcon = document.getElementById('qt-from-icon');
    fromIcon.style.background = qtFromAsset.icon ? 'transparent' : qtFromAsset.color;
    fromIcon.innerHTML = qtFromAsset.icon
        ? `<img src="${qtFromAsset.icon}" style="width:100%;height:100%;border-radius:50%;">`
        : qtFromAsset.symbol.substring(0, 2);
    document.getElementById('qt-from-symbol').textContent = qtFromAsset.symbol;

    const fromBalance = walletData.assets.find(a => a.id === qtFromAsset.aid);
    document.getElementById('qt-from-balance').textContent = fromBalance ? formatAmount(fromBalance.balance) : '0';

    // Update TO
    const toIcon = document.getElementById('qt-to-icon');
    toIcon.style.background = qtToAsset.icon ? 'transparent' : qtToAsset.color;
    toIcon.innerHTML = qtToAsset.icon
        ? `<img src="${qtToAsset.icon}" style="width:100%;height:100%;border-radius:50%;">`
        : qtToAsset.symbol.substring(0, 2);
    document.getElementById('qt-to-symbol').textContent = qtToAsset.symbol;

    const toBalance = walletData.assets.find(a => a.id === qtToAsset.aid);
    document.getElementById('qt-to-balance').textContent = toBalance ? formatAmount(toBalance.balance) : '0';

    // Clear amount
    document.getElementById('qt-from-amount').value = '';
    document.getElementById('qt-to-amount').textContent = '0.0';
    document.getElementById('qt-rate-info').style.display = 'none';
    document.getElementById('qt-swap-btn').disabled = true;
    document.getElementById('qt-swap-btn').textContent = 'Enter Amount';
}

function quickTradeSwapDirection() {
    [qtFromAsset, qtToAsset] = [qtToAsset, qtFromAsset];
    updateQuickTradeUI();
}

let qtQuoteTimeout = null;
function quickTradeGetQuote() {
    clearTimeout(qtQuoteTimeout);
    const amount = parseFloat(document.getElementById('qt-from-amount').value);

    if (!amount || amount <= 0) {
        document.getElementById('qt-to-amount').textContent = '0.0';
        document.getElementById('qt-rate-info').style.display = 'none';
        document.getElementById('qt-swap-btn').disabled = true;
        document.getElementById('qt-swap-btn').textContent = 'Enter Amount';
        return;
    }

    document.getElementById('qt-swap-btn').textContent = 'Getting Quote...';

    qtQuoteTimeout = setTimeout(async () => {
        try {
            const amountGroth = Math.floor(amount * 1e8);
            const pool = dexPools.find(p =>
                (p.aid1 === qtFromAsset.aid && p.aid2 === qtToAsset.aid) ||
                (p.aid1 === qtToAsset.aid && p.aid2 === qtFromAsset.aid)
            );

            if (!pool) {
                document.getElementById('qt-swap-btn').textContent = 'No Pool Found';
                return;
            }

            // Calculate quote locally using pool data
            const isForward = pool.aid1 === qtFromAsset.aid;
            const reserveIn = isForward ? pool.tok1 : pool.tok2;
            const reserveOut = isForward ? pool.tok2 : pool.tok1;

            const feeRate = pool.kind === 2 ? 0.003 : 0.001;
            const amountInWithFee = amountGroth * (1 - feeRate);
            const amountOut = Math.floor((amountInWithFee * reserveOut) / (reserveIn + amountInWithFee));

            document.getElementById('qt-to-amount').textContent = formatAmount(amountOut);
            document.getElementById('qt-rate').textContent = `1 ${qtFromAsset.symbol} = ${(amountOut / amountGroth).toFixed(6)} ${qtToAsset.symbol}`;
            document.getElementById('qt-fee').textContent = `${(feeRate * 100).toFixed(1)}%`;
            document.getElementById('qt-rate-info').style.display = 'block';

            qtQuoteData = { pool, amountIn: amountGroth, amountOut, isForward };

            document.getElementById('qt-swap-btn').disabled = false;
            document.getElementById('qt-swap-btn').textContent = `Swap ${qtFromAsset.symbol} for ${qtToAsset.symbol}`;
        } catch (e) {
            document.getElementById('qt-swap-btn').textContent = 'Quote Failed';
        }
    }, 500);
}

let qtTradeInProgress = false;

async function executeQuickTrade() {
    if (!qtQuoteData || qtTradeInProgress) return;
    qtTradeInProgress = true;

    const btn = document.getElementById('qt-swap-btn');
    btn.disabled = true;
    btn.innerHTML = '<div style="display:inline-block;width:16px;height:16px;border:2px solid transparent;border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;"></div> Swapping...';

    try {
        const { pool, amountIn, isForward } = qtQuoteData;

        // Determine call order based on direction (same logic as main DEX)
        // isForward = true: trading aid1 → aid2, keep order
        // isForward = false: trading aid2 → aid1, swap order
        let callAid1 = pool.aid1;
        let callAid2 = pool.aid2;
        if (!isForward) {
            callAid1 = pool.aid2;
            callAid2 = pool.aid1;
        }

        // Use val1_buy=0, val2_pay=amountIn format (same as main DEX)
        const args = `action=pool_trade,aid1=${callAid1},aid2=${callAid2},kind=${pool.kind},val1_buy=0,val2_pay=${amountIn},bPredictOnly=0,cid=${DEX_CID}`;

        const result = await apiCall('invoke_contract', { args, create_tx: true });

        // Check for success - either txid (direct creation) or raw_data (needs processing)
        if (result?.txid) {
            // Transaction created directly
            showToastAdvanced('Swap Successful!', `${qtFromAsset.symbol} → ${qtToAsset.symbol}`, 'success');
            closeModal('quick-trade-modal');
            await loadWalletData();
            renderAssetCards();
            renderBalancesTable();
        } else if (result?.raw_data) {
            // Need to process raw_data to create transaction
            await apiCall('process_invoke_data', { data: result.raw_data });
            showToastAdvanced('Swap Successful!', `${qtFromAsset.symbol} → ${qtToAsset.symbol}`, 'success');
            closeModal('quick-trade-modal');
            await loadWalletData();
            renderAssetCards();
            renderBalancesTable();
        } else if (result?.error) {
            throw new Error(result.error.message || 'Swap failed');
        } else {
            throw new Error('Unexpected response from contract');
        }
    } catch (e) {
        showToastAdvanced('Swap Failed', e.message, 'error');
    }

    qtTradeInProgress = false;
    btn.disabled = false;
    btn.textContent = `Swap ${qtFromAsset.symbol} for ${qtToAsset.symbol}`;
}

// =============================================
// QUICK WITHDRAW LP MODAL
// =============================================
let qwLpAsset = null;
let qwPool = null;

async function openQuickWithdrawLPModal(lpAssetId) {
    // Load pools if not loaded yet
    if (!dexPools || dexPools.length === 0) {
        await loadDexPools();
    }

    // Get LP token info
    const info = getAssetInfo(lpAssetId);
    if (!info.isLpToken || !info.lpPair) {
        showToast('Not a valid LP token', 'error');
        return;
    }

    qwLpAsset = info;
    qwPool = dexPools.find(p =>
        p.aid1 === info.lpPair.aid1 &&
        p.aid2 === info.lpPair.aid2 &&
        p.kind === info.lpPair.kind
    );

    if (!qwPool) {
        showToast('Pool not found', 'error');
        return;
    }

    // Update UI
    document.getElementById('qw-lp-name').textContent = info.name;
    const balance = walletData.assets.find(a => a.id === lpAssetId);
    document.getElementById('qw-lp-balance').textContent = balance ? formatAmount(balance.balance) : '0';

    const asset1 = getAssetInfo(qwPool.aid1);
    const asset2 = getAssetInfo(qwPool.aid2);
    document.getElementById('qw-asset1-symbol').textContent = asset1.symbol;
    document.getElementById('qw-asset2-symbol').textContent = asset2.symbol;

    document.getElementById('qw-slider').value = 50;
    updateQuickWithdrawAmount();

    openModal('quick-withdraw-lp-modal');
}

function setQuickWithdrawPercent(percent) {
    document.getElementById('qw-slider').value = percent;
    updateQuickWithdrawAmount();
}

function updateQuickWithdrawAmount() {
    if (!qwLpAsset || !qwPool) return;

    const percent = parseInt(document.getElementById('qw-slider').value);
    document.getElementById('qw-percent').textContent = percent + '%';

    const balance = walletData.assets.find(a => a.id === qwLpAsset.aid);
    if (!balance) return;

    const withdrawLP = Math.floor(balance.balance * percent / 100);
    const poolShare = withdrawLP / qwPool.ctl;

    const estAmt1 = qwPool.tok1 * poolShare;
    const estAmt2 = qwPool.tok2 * poolShare;

    document.getElementById('qw-asset1-amount').textContent = '+' + formatAmount(estAmt1);
    document.getElementById('qw-asset2-amount').textContent = '+' + formatAmount(estAmt2);
}

let qwWithdrawInProgress = false;

async function executeQuickWithdrawLP() {
    if (!qwLpAsset || !qwPool || qwWithdrawInProgress) return;
    qwWithdrawInProgress = true;

    const percent = parseInt(document.getElementById('qw-slider').value);
    const balance = walletData.assets.find(a => a.id === qwLpAsset.aid);
    if (!balance) {
        qwWithdrawInProgress = false;
        return;
    }

    const withdrawLP = Math.floor(balance.balance * percent / 100);
    if (withdrawLP <= 0) {
        showToast('Invalid amount', 'error');
        qwWithdrawInProgress = false;
        return;
    }

    const btn = document.getElementById('qw-withdraw-btn');
    btn.disabled = true;
    btn.innerHTML = '<div style="display:inline-block;width:16px;height:16px;border:2px solid transparent;border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;"></div> Withdrawing...';

    try {
        const args = `action=pool_withdraw,cid=${DEX_CID},aid1=${qwPool.aid1},aid2=${qwPool.aid2},kind=${qwPool.kind},ctl=${withdrawLP}`;
        const result = await apiCall('invoke_contract', { args, create_tx: true });

        // Check for success - either txid (direct creation) or raw_data (needs processing)
        const isSuccess = result?.txid || result?.raw_data;

        if (result?.raw_data && !result?.txid) {
            await apiCall('process_invoke_data', { data: result.raw_data });
        }

        if (isSuccess) {
            showToastAdvanced('Liquidity Withdrawn!', `${percent}% from ${qwLpAsset.name}`, 'success');
            closeModal('quick-withdraw-lp-modal');
            await loadWalletData();
            renderAssetCards();
            renderBalancesTable();
        } else if (result?.error) {
            throw new Error(result.error.message || 'Withdrawal failed');
        } else {
            throw new Error('Unexpected response from contract');
        }
    } catch (e) {
        showToastAdvanced('Withdrawal Failed', e.message, 'error');
    }

    qwWithdrawInProgress = false;
    btn.disabled = false;
    btn.textContent = 'Withdraw Liquidity';
}

// Render UTXOs
function renderUtxos() {
    const tbody = document.getElementById('utxo-tbody');

    if (walletData.utxos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No UTXOs available</td></tr>`;
        return;
    }

    tbody.innerHTML = walletData.utxos.map(utxo => {
        const config = ASSET_CONFIG[utxo.asset] || { name: 'Unknown', symbol: 'CA' + utxo.asset, color: `hsl(${(utxo.asset * 137) % 360}, 50%, 50%)` };
        const amount = formatAmount(utxo.amount);
        const textColor = ['warning', 'success'].includes(config.class) ? '#000' : '#fff';

        return `
            <tr>
                <td>
                    <div class="utxo-coin">
                        <div class="utxo-coin-icon" style="${config.icon ? '' : `background: ${config.color}; color: ${textColor}`}">
                            ${config.icon ? `<img src="${config.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${config.color}';this.parentNode.style.color='${textColor}';this.parentNode.textContent='${config.symbol.substring(0,2)}'">` : config.symbol.substring(0, 2)}
                        </div>
                        <span class="utxo-amount">${amount} ${config.symbol}</span>
                    </div>
                </td>
                <td><span class="utxo-maturity">${(utxo.maturity || 0).toLocaleString()}</span></td>
                <td><span class="utxo-type">${utxo.type || 'Regular'}</span></td>
                <td><span class="utxo-status ${utxo.status || 'available'}">${utxo.status || 'available'}</span></td>
            </tr>
        `;
    }).join('');
}

// Toggle asset view
function toggleAssetView() {
    document.getElementById('asset-toggle').classList.toggle('active');
}

// Toggle UTXO panel
function toggleUtxo() {
    document.getElementById('utxo-toggle').classList.toggle('expanded');
    document.getElementById('utxo-panel').classList.toggle('expanded');
}

// Modal functions
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function openReceiveModal() {
    openModal('receive-modal');
    generateAddress();
}

function openSendModal(assetId = 0) {
    openModal('send-modal');
}

// Current address type for receive modal
let currentReceiveType = 'regular';
let currentReceiveAddress = null;

// Generate address with full API options
async function generateAddress() {
    const addressEl = document.getElementById('receive-address');
    const sbbsEl = document.getElementById('receive-sbbs');
    const signatureEl = document.getElementById('receive-signature');
    const qrEl = document.getElementById('receive-qr');

    addressEl.textContent = 'Generating...';
    if (sbbsEl) sbbsEl.textContent = 'Generating...';
    qrEl.innerHTML = '<div style="color: #666;">Loading...</div>';

    // Check wallet connectivity first
    if (!walletData.isConnected) {
        addressEl.innerHTML = '<span style="color: var(--error);">Wallet not connected</span>';
        currentReceiveAddress = null;
        if (sbbsEl) sbbsEl.textContent = '-';
        if (signatureEl) signatureEl.textContent = '-';
        qrEl.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">🔌</div>
            <div style="font-size: 12px;">Please connect wallet first</div>
        </div>`;
        return;
    }

    try {
        // Get options from UI
        const expiration = document.getElementById('address-expiration')?.value || 'auto';
        const comment = document.getElementById('address-comment')?.value || '';
        const offlinePayments = parseInt(document.getElementById('offline-payments-count')?.value) || 1;

        // Build API params according to wallet-api spec
        const params = {
            type: currentReceiveType,
            expiration: expiration,
            new_style_regular: true
        };

        // Add comment if provided
        if (comment) {
            params.comment = comment;
        }

        // Add offline_payments count for offline addresses
        if (currentReceiveType === 'offline' && offlinePayments > 1) {
            params.offline_payments = offlinePayments;
        }

        console.log('Creating address with params:', params);
        const result = await apiCall('create_address', params);

        let address, signature, walletId;

        if (typeof result === 'string') {
            address = result;
            // Get full address info from address list
            try {
                const addrs = await apiCall('addr_list', { own: true });
                const found = addrs?.find(a => a.address === result);
                signature = found?.identity || null;
                walletId = found?.wallet_id || null;
            } catch (e) {
                signature = null;
                walletId = null;
            }
        } else {
            address = result.address || result;
            signature = result.identity || null;
            walletId = result.wallet_id || null;
        }

        currentReceiveAddress = address;
        addressEl.textContent = address;

        // SBBS Address (wallet_id) - the hex format some exchanges use
        if (sbbsEl) {
            if (currentReceiveType === 'regular' && walletId) {
                sbbsEl.textContent = walletId;
            } else if (currentReceiveType === 'regular') {
                // If no wallet_id, the base58 address IS the SBBS address
                sbbsEl.textContent = address;
            } else {
                sbbsEl.textContent = '-';
            }
        }

        // Show signature/identity if available
        if (signatureEl) {
            signatureEl.textContent = signature || '-';
        }

        // Generate QR
        if (typeof QRCode !== 'undefined') {
            qrEl.innerHTML = '';
            QRCode.toCanvas(address, { width: 180, margin: 2 }, (err, canvas) => {
                if (!err) qrEl.appendChild(canvas);
            });
        }
    } catch (e) {
        console.error('Generate address error:', e);

        // Show meaningful error message instead of demo addresses
        const errorMsg = e.message || 'Failed to create address';
        let userMessage = 'Unable to generate address';
        let userHint = '';

        if (errorMsg.includes('locked') || errorMsg.includes('-5')) {
            userMessage = 'Wallet is locked';
            userHint = 'Please unlock your wallet first';
        } else if (errorMsg.includes('connect') || errorMsg.includes('network') || errorMsg.includes('fetch')) {
            userMessage = 'Wallet not connected';
            userHint = 'Please start wallet-api and refresh';
        } else if (currentReceiveType === 'offline' || currentReceiveType === 'max_privacy' || currentReceiveType === 'public_offline') {
            const typeNames = {
                'offline': 'Offline',
                'max_privacy': 'Max Privacy',
                'public_offline': 'Donation'
            };
            userMessage = `${typeNames[currentReceiveType]} address unavailable`;
            userHint = 'This address type requires connection to your own node';
        } else {
            userHint = errorMsg;
        }

        addressEl.innerHTML = `<span style="color: var(--error);">${userMessage}</span>`;
        currentReceiveAddress = null;
        if (sbbsEl) sbbsEl.textContent = '-';
        if (signatureEl) signatureEl.textContent = '-';

        qrEl.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
            <div style="font-size: 12px;">${userHint}</div>
        </div>`;
    }
}

// Regenerate address when options change
function regenerateAddress() {
    // Debounce to avoid too many API calls
    if (window.regenerateAddressTimer) clearTimeout(window.regenerateAddressTimer);
    window.regenerateAddressTimer = setTimeout(() => generateAddress(), 300);
}

// Copy address
function copyAddress(elementId) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    });
}

function copyAllAndClose() {
    copyAddress('receive-address');
    setTimeout(() => closeModal('receive-modal'), 500);
}

// Address type descriptions
const ADDRESS_TYPE_INFO = {
    'regular': {
        title: 'Regular Address (SBBS)',
        desc: 'Standard address for exchanges and wallets. Both parties must be online for the transaction. Expires in 61 days but auto-renews when used.',
        label: 'Regular Address'
    },
    'offline': {
        title: 'Offline Address (Lelantus)',
        desc: 'Can be used multiple times. Sender does not need you to be online. Uses Lelantus shielded pool for enhanced privacy. Great for receiving from multiple senders.',
        label: 'Offline Address'
    },
    'max_privacy': {
        title: 'Maximum Privacy Address',
        desc: 'One-time use only for guaranteed maximum privacy. Each transaction uses a unique address. Best for high-value or sensitive transactions. Requires own node.',
        label: 'Max Privacy Address'
    },
    'public_offline': {
        title: 'Public Donation Address',
        desc: 'Can be shared publicly and used unlimited times. Perfect for tips, donations, or public payments. Anyone can send to this address anytime.',
        label: 'Donation Address'
    }
};

// Receive type tabs
function setReceiveType(type, evt) {
    currentReceiveType = type;

    // Remove active from all tabs and add to clicked one
    document.querySelectorAll('.receive-tab').forEach(t => t.classList.remove('active'));

    // Handle both onclick with event and direct JS calls
    const tab = document.querySelector(`.receive-tab[data-type="${type}"]`);
    if (tab) {
        tab.classList.add('active');
    } else if (evt && evt.target) {
        evt.target.closest('.receive-tab').classList.add('active');
    } else if (typeof event !== 'undefined' && event && event.target) {
        event.target.closest('.receive-tab').classList.add('active');
    }

    // Update address type info
    const info = ADDRESS_TYPE_INFO[type];
    if (info) {
        const infoEl = document.getElementById('address-type-info');
        if (infoEl) {
            infoEl.innerHTML = `<strong style="color: var(--beam-cyan);">${info.title}</strong><br>${info.desc}`;
        }
        const labelEl = document.getElementById('address-type-label');
        if (labelEl) {
            labelEl.textContent = info.label;
        }
    }

    // Show/hide SBBS field based on type (only for regular addresses)
    const sbbsField = document.getElementById('sbbs-field');
    if (sbbsField) {
        sbbsField.style.display = type === 'regular' ? 'block' : 'none';
    }

    // Show/hide offline payments option (only for offline type)
    const offlinePaymentsOption = document.getElementById('offline-payments-option');
    if (offlinePaymentsOption) {
        offlinePaymentsOption.style.display = type === 'offline' ? 'block' : 'none';
    }

    // Show note for max_privacy and public_offline that require own node
    if (type === 'max_privacy' || type === 'public_offline') {
        const infoEl = document.getElementById('address-type-info');
        if (infoEl) {
            infoEl.innerHTML += '<br><span style="color: var(--warning); font-size: 11px;">Note: Requires connection to your own node for full functionality.</span>';
        }
    }

    generateAddress();
}

// Toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Guide
function showGuide() {
    document.getElementById('guide-overlay').classList.add('active');
}

function closeGuide() {
    document.getElementById('guide-overlay').classList.remove('active');
    localStorage.setItem('guideShown', 'true');
}

// Node configuration state
let currentNodeType = 'public'; // 'public' or 'local'
let currentNode = 'eu-node01.mainnet.beam.mw:8100';
let localNodeSyncProgress = 0;
let ownerKey = null;

// Load settings
async function loadSettings() {
    const statusEl = document.getElementById('settings-status');
    const heightEl = document.getElementById('settings-height');
    const lastUpdateEl = document.getElementById('settings-last-update');
    const liveIndicator = document.getElementById('live-indicator');
    const nodeEl = document.getElementById('settings-node');
    const dexStatusEl = document.getElementById('dex-support-status');
    const dexWarning = document.getElementById('dex-warning');

    try {
        // Get server status including node info
        const serverStatus = await checkServerStatus();
        const walletStatus = await apiCall('wallet_status');

        if (walletStatus) {
            statusEl.innerHTML = '<span style="color: var(--beam-cyan);">Connected</span>';
            heightEl.textContent = (walletStatus.current_height || 0).toLocaleString();
            lastUpdateEl.textContent = new Date().toLocaleTimeString();
            liveIndicator.className = 'live-indicator';
            liveIndicator.innerHTML = '<span class="live-dot"></span>LIVE';

            // Update node info from server status
            if (serverStatus) {
                currentNodeType = serverStatus.node_mode || 'public';
                selectNodeType(currentNodeType);

                // Update the actual node address display
                if (currentNodeType === 'local') {
                    nodeEl.textContent = '127.0.0.1:10005';
                    document.getElementById('settings-node-type').textContent = 'Local';
                } else {
                    nodeEl.textContent = serverStatus.node_address || currentNode || 'eu-node01.mainnet.beam.mw:8100';
                    document.getElementById('settings-node-type').textContent = 'Public';
                }

                // Show local node section if node is running
                // Let startNodeSyncMonitoring handle the sync progress display
                if (serverStatus.node_running) {
                    document.getElementById('local-node-section').style.display = 'block';
                }
            }

            // Check DEX support
            checkDexSupport();

        } else {
            statusEl.innerHTML = '<span style="color: var(--error);">Disconnected</span>';
            heightEl.textContent = '-';
            lastUpdateEl.textContent = '-';
            liveIndicator.className = 'live-indicator offline';
            liveIndicator.innerHTML = '<span class="live-dot"></span>OFFLINE';
        }
    } catch (e) {
        console.error('loadSettings error:', e);
        statusEl.innerHTML = '<span style="color: var(--error);">Disconnected</span>';
        heightEl.textContent = '-';
        lastUpdateEl.textContent = '-';
        liveIndicator.className = 'live-indicator offline';
        liveIndicator.innerHTML = '<span class="live-dot"></span>OFFLINE';
    }
}

// Check DEX support
async function checkDexSupport() {
    const dexStatusEl = document.getElementById('dex-support-status');
    const dexWarning = document.getElementById('dex-warning');

    try {
        const result = await apiCall('invoke_contract', {
            args: `action=pools_view,cid=${DEX_CID}`,
            contract: typeof DEX_SHADER !== 'undefined' ? DEX_SHADER : undefined
        });

        if (result && result.output) {
            dexStatusEl.innerHTML = '<span class="status-dot status-ok"></span>Available';
            dexWarning.style.display = 'none';
        } else if (result?.error) {
            throw new Error(result.error.message || 'Not available');
        } else {
            throw new Error('No response');
        }
    } catch (e) {
        dexStatusEl.innerHTML = '<span class="status-dot status-error"></span>Not Available';
        dexWarning.style.display = 'block';
    }
}

// Select node type
function selectNodeType(type, triggerChange = false) {
    currentNodeType = type;

    document.getElementById('node-public-btn').classList.toggle('active', type === 'public');
    document.getElementById('node-local-btn').classList.toggle('active', type === 'local');
    document.getElementById('settings-node-type').textContent = type === 'public' ? 'Public' : 'Local';

    const localSection = document.getElementById('local-node-section');
    const selector = document.getElementById('node-selector');
    const newValue = type === 'local' ? '127.0.0.1:10005' : 'eu-node01.mainnet.beam.mw:8100';

    if (type === 'local') {
        localSection.style.display = 'block';
    } else {
        localSection.style.display = 'none';
    }

    // Update selector value and currentNode to match current state (no prompt)
    selector.value = newValue;
    currentNode = newValue;

    // Only trigger change if explicitly requested (e.g., from button click)
    if (triggerChange) {
        changeNode();
    }
}

// Change node - actually restarts wallet-api with new node
async function changeNode() {
    const selector = document.getElementById('node-selector');
    const newNode = selector.value;
    const isLocal = newNode.includes('127.0.0.1') || newNode.includes('localhost');

    if (newNode === currentNode) return;

    showToastAdvanced('Switching Node', `Connecting to ${isLocal ? 'local' : 'public'} node...`, 'pending');

    try {
        // Use stored password if available, otherwise prompt
        let password = storedWalletPassword || sessionStorage.getItem('walletPassword');
        if (!password) {
            password = prompt('Enter wallet password to switch nodes:\n\n(Password is needed to restart the wallet connection with the new node)');
            if (!password) {
                showToastAdvanced('Cancelled', 'Node switch cancelled', 'info');
                // Reset dropdown to current
                selector.value = currentNode;
                return;
            }
            // Store for future switches in this session
            storedWalletPassword = password;
            sessionStorage.setItem('walletPassword', password);
        }

        // Call server API to switch node
        const response = await fetch('/api/node/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: isLocal ? 'local' : 'public',
                password: password,
                node: newNode
            })
        });

        const result = await response.json();

        if (result.success) {
            currentNode = newNode;
            currentNodeType = isLocal ? 'local' : 'public';
            document.getElementById('settings-node').textContent = newNode;
            document.getElementById('settings-node-type').textContent = isLocal ? 'Local' : 'Public';

            showToastAdvanced('Node Switched', `Now connected to ${newNode}`, 'success');

            // Refresh wallet status
            setTimeout(() => loadWalletData(), 1000);
        } else {
            throw new Error(result.error || 'Failed to switch node');
        }
    } catch (e) {
        showToastAdvanced('Switch Failed', e.message, 'error');
        // Reset dropdown to current node
        selector.value = currentNode;
    }
}

// Reconnect to node
async function reconnectNode() {
    const btn = document.getElementById('reconnect-btn');
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="animation: spin 1s linear infinite;"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Reconnecting...';

    showToastAdvanced('Reconnecting', 'Please wait...', 'pending');

    try {
        // Check server status
        const serverStatus = await checkServerStatus();

        if (!serverStatus || !serverStatus.wallet_api_running) {
            throw new Error('Wallet API not running');
        }

        // Get wallet status
        const status = await apiCall('wallet_status');

        if (status) {
            showToastAdvanced('Connected', `Block height: ${status.current_height?.toLocaleString() || 'N/A'}`, 'success');
            await loadSettings();
        } else {
            throw new Error('Could not get wallet status');
        }
    } catch (e) {
        showToastAdvanced('Connection Failed', e.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Reconnect to Node';
}

// Rescan wallet
let rescanInProgress = false;

async function triggerRescan() {
    if (rescanInProgress) return;

    // Get password from stored value or session
    const password = storedWalletPassword || sessionStorage.getItem('walletPassword');
    if (!password) {
        showToastAdvanced('Rescan Failed', 'No password available. Please re-unlock your wallet.', 'error');
        return;
    }

    const btn = document.getElementById('rescan-btn');
    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="animation: spin 1s linear infinite;">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        Rescanning...
    `;
    rescanInProgress = true;

    showToastAdvanced('Rescan Started', 'Scanning blockchain for transactions...', 'pending');

    try {
        const response = await fetch('/api/wallet/rescan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const result = await response.json();

        if (result.success) {
            showToastAdvanced('Rescan Complete', 'Wallet balances updated', 'success');
            // Refresh wallet data
            await loadWalletData();
        } else {
            throw new Error(result.error || 'Rescan failed');
        }
    } catch (e) {
        showToastAdvanced('Rescan Failed', e.message, 'error');
    }

    rescanInProgress = false;
    btn.disabled = false;
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        Rescan Wallet
    `;
}

// Show owner key export modal
function showOwnerKeyExport() {
    // Create modal content
    const content = document.createElement('div');
    content.innerHTML = `
        <div style="padding: 20px;">
            <h3 style="margin-bottom: 16px;">Export Owner Key</h3>
            <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 14px;">
                To use a local node with your wallet, you need to provide the owner key.
                This allows the local node to scan the blockchain for your transactions.
            </p>
            <div class="address-field" style="margin-bottom: 16px;">
                <div class="address-label">Password</div>
                <input type="password" class="search-input" id="owner-key-password" placeholder="Enter wallet password" style="width: 100%;">
            </div>
            <button class="quick-btn quick-btn-primary" onclick="exportOwnerKey()" style="width: 100%;">
                Export Owner Key
            </button>
            <div id="owner-key-result" style="margin-top: 16px; display: none;">
                <div class="address-label">Owner Key</div>
                <div class="owner-key-value" id="owner-key-value"></div>
                <button class="quick-btn quick-btn-secondary" onclick="copyOwnerKey()" style="width: 100%; margin-top: 12px;">
                    Copy Owner Key
                </button>
            </div>
        </div>
    `;

    // Show as simple alert/modal (reuse existing modal system)
    // For now create inline
    let modal = document.getElementById('owner-key-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'owner-key-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="max-width: 480px;">
                <div class="modal-header">
                    <h2 class="modal-title">Owner Key</h2>
                    <button class="modal-close" onclick="closeModal('owner-key-modal')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body" id="owner-key-modal-body"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('owner-key-modal-body').innerHTML = content.innerHTML;
    openModal('owner-key-modal');
}

// Export owner key
async function exportOwnerKey() {
    const password = document.getElementById('owner-key-password').value;
    if (!password) {
        showToast('Please enter your wallet password', 'error');
        return;
    }

    showToastAdvanced('Exporting', 'Please wait...', 'pending');

    try {
        // Get server status to find active wallet
        const serverStatus = await checkServerStatus();
        if (!serverStatus?.active_wallet) {
            throw new Error('No active wallet found');
        }

        const response = await fetch('/api/wallet/export_owner_key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: serverStatus.active_wallet,
                password: password
            })
        });

        const result = await response.json();

        if (result.success && result.owner_key) {
            ownerKey = result.owner_key;
            document.getElementById('owner-key-value').textContent = ownerKey;
            document.getElementById('owner-key-result').style.display = 'block';
            showToastAdvanced('Success', 'Owner key exported', 'success');
        } else {
            throw new Error(result.error || 'Failed to export');
        }
    } catch (e) {
        showToastAdvanced('Export Failed', e.message, 'error');
    }
}

// Copy owner key
function copyOwnerKey() {
    if (ownerKey) {
        navigator.clipboard.writeText(ownerKey).then(() => {
            showToast('Owner key copied to clipboard', 'success');
        });
    }
}

// Update local node sync progress
function updateSyncProgress(current, total) {
    if (total === 0) return;

    const percentage = Math.min(100, Math.round((current / total) * 100));
    localNodeSyncProgress = percentage;

    document.getElementById('sync-percentage').textContent = percentage + '%';
    document.getElementById('sync-progress-fill').style.width = percentage + '%';
    document.getElementById('sync-blocks').textContent = `${current.toLocaleString()} / ${total.toLocaleString()} blocks`;

    if (percentage < 100) {
        document.getElementById('sync-status-text').textContent = 'Syncing...';
    } else {
        document.getElementById('sync-status-text').textContent = 'Fully synced';
    }
}

// Advanced toast notification with icon
function showToastAdvanced(title, subtitle, type = 'info') {
    const container = document.getElementById('toast-container');

    const iconMap = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M20 6L9 17l-5-5"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>',
        pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type === 'pending' ? 'info' : type}`;
    toast.innerHTML = `
        <div class="toast-with-icon">
            <div class="toast-icon ${type}">${iconMap[type] || iconMap.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${subtitle ? `<div class="toast-subtitle">${subtitle}</div>` : ''}
            </div>
        </div>
    `;

    container.appendChild(toast);

    // Auto remove after delay (longer for pending)
    const delay = type === 'pending' ? 5000 : 3500;
    setTimeout(() => toast.remove(), delay);

    return toast;
}

// Filter balances
function filterBalances() {
    const search = document.getElementById('balance-search').value.toLowerCase();
    const rows = document.querySelectorAll('#balances-tbody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

// All assets cache for search
let allAssetsCache = [];

// Filter all assets
function filterAllAssets() {
    if (allAssetsCache.length > 0) {
        renderAllAssets(allAssetsCache);
    }
}

// Check server status
async function checkServerStatus() {
    try {
        const response = await fetch('/api/status');
        if (response.ok) {
            const status = await response.json();
            lastServerStatus = status; // Store for sync status display
            return status;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// Welcome screen state
let welcomeWallets = [];
let welcomeSelectedWallet = null;
let welcomeCurrentView = 'main'; // 'main', 'create', 'restore'

// Show wallet locked overlay with full welcome screen
function showLockedOverlay(message) {
    let overlay = document.getElementById('locked-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'locked-overlay';
        overlay.innerHTML = `
            <style>
                #locked-overlay {
                    position: fixed;
                    inset: 0;
                    background: #050a0f;
                    z-index: 5000;
                    display: flex;
                    overflow-y: auto;
                    overflow-x: hidden;
                }
                /* Animated mesh gradient background */
                .welcome-bg {
                    position: fixed;
                    inset: 0;
                    overflow: hidden;
                    pointer-events: none;
                    z-index: 0;
                }
                .welcome-bg::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background:
                        radial-gradient(ellipse 80% 50% at 50% -20%, rgba(37, 194, 160, 0.15) 0%, transparent 50%),
                        radial-gradient(ellipse 60% 40% at 100% 100%, rgba(218, 112, 214, 0.1) 0%, transparent 50%),
                        radial-gradient(ellipse 40% 30% at 0% 80%, rgba(0, 212, 255, 0.08) 0%, transparent 50%);
                }
                .welcome-bg-orb {
                    position: absolute;
                    border-radius: 50%;
                    filter: blur(60px);
                    animation: orbFloat 20s ease-in-out infinite;
                }
                .welcome-bg-orb-1 {
                    width: 400px;
                    height: 400px;
                    top: -100px;
                    right: -50px;
                    background: radial-gradient(circle, rgba(37, 194, 160, 0.25) 0%, transparent 70%);
                }
                .welcome-bg-orb-2 {
                    width: 300px;
                    height: 300px;
                    bottom: 10%;
                    left: -80px;
                    background: radial-gradient(circle, rgba(218, 112, 214, 0.15) 0%, transparent 70%);
                    animation-delay: -10s;
                    animation-direction: reverse;
                }
                @keyframes orbFloat {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(20px, -15px) scale(1.05); }
                    66% { transform: translate(-10px, 10px) scale(0.95); }
                }
                /* Grid pattern overlay */
                .welcome-grid-pattern {
                    position: absolute;
                    inset: 0;
                    background-image:
                        linear-gradient(rgba(37, 194, 160, 0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(37, 194, 160, 0.03) 1px, transparent 1px);
                    background-size: 60px 60px;
                    mask-image: radial-gradient(ellipse 80% 60% at 50% 50%, black 20%, transparent 70%);
                }
                /* Main wrapper - centers content */
                .welcome-wrapper {
                    width: 100%;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                    z-index: 1;
                }
                /* Header bar */
                .welcome-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 24px;
                    flex-shrink: 0;
                }
                .welcome-network {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: rgba(37, 194, 160, 0.1);
                    border: 1px solid rgba(37, 194, 160, 0.2);
                    border-radius: 16px;
                    font-size: 12px;
                    font-weight: 500;
                    color: #25c2a0;
                }
                .welcome-network::before {
                    content: '';
                    width: 6px;
                    height: 6px;
                    background: #25c2a0;
                    border-radius: 50%;
                    box-shadow: 0 0 8px #25c2a0;
                }
                .welcome-version {
                    font-size: 11px;
                    color: #64748b;
                    font-family: 'JetBrains Mono', monospace;
                }
                /* Main content area */
                .welcome-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    padding: 20px 24px 40px;
                    min-height: 0;
                }
                /* Brand section - compact */
                .welcome-brand {
                    text-align: center;
                    margin-bottom: 24px;
                }
                .welcome-logo-container {
                    position: relative;
                    display: inline-block;
                    margin-bottom: 12px;
                }
                .welcome-logo {
                    width: 56px;
                    height: 56px;
                    animation: logoPulse 4s ease-in-out infinite;
                }
                .welcome-logo-glow {
                    position: absolute;
                    inset: -8px;
                    border-radius: 50%;
                    background: radial-gradient(circle, rgba(37, 194, 160, 0.3) 0%, transparent 70%);
                    filter: blur(8px);
                    animation: logoPulse 4s ease-in-out infinite;
                }
                @keyframes logoPulse {
                    0%, 100% { opacity: 0.8; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.02); }
                }
                .welcome-title {
                    font-size: 28px;
                    font-weight: 300;
                    letter-spacing: 8px;
                    margin-bottom: 2px;
                    background: linear-gradient(135deg, #25c2a0 0%, #00d4ff 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .welcome-subtitle {
                    font-size: 11px;
                    color: #da70d6;
                    letter-spacing: 3px;
                    text-transform: uppercase;
                    margin-bottom: 6px;
                }
                .welcome-tagline {
                    font-size: 13px;
                    color: #64748b;
                }
                /* Card container */
                .welcome-card {
                    width: 100%;
                    max-width: 400px;
                    background: rgba(15, 25, 35, 0.8);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(37, 194, 160, 0.1);
                    border-radius: 20px;
                    padding: 24px;
                    box-shadow:
                        0 4px 24px rgba(0, 0, 0, 0.3),
                        inset 0 1px 0 rgba(255, 255, 255, 0.03);
                }
                .welcome-form {
                    width: 100%;
                }
                .welcome-field {
                    margin-bottom: 14px;
                }
                .welcome-label {
                    display: block;
                    font-size: 12px;
                    font-weight: 500;
                    color: #94a3b8;
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .welcome-select, .welcome-input {
                    width: 100%;
                    padding: 12px 14px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(100, 116, 139, 0.2);
                    border-radius: 10px;
                    color: #f0f4f8;
                    font-family: inherit;
                    font-size: 14px;
                    transition: all 0.2s ease;
                    outline: none;
                }
                .welcome-select:focus, .welcome-input:focus {
                    border-color: #25c2a0;
                    box-shadow: 0 0 0 3px rgba(37, 194, 160, 0.1);
                    background: rgba(30, 41, 59, 0.8);
                }
                .welcome-select option {
                    background: #0f1923;
                    color: #f0f4f8;
                }
                .welcome-btn-primary {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 14px 20px;
                    background: linear-gradient(135deg, #25c2a0 0%, #1a9d82 100%);
                    border: none;
                    border-radius: 10px;
                    color: #050a0f;
                    font-family: inherit;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    margin-top: 18px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .welcome-btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 20px rgba(37, 194, 160, 0.25);
                }
                .welcome-btn-primary:active {
                    transform: translateY(0);
                }
                .welcome-btn-primary:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                }
                .welcome-btn-primary svg {
                    width: 18px;
                    height: 18px;
                }
                /* Action links - horizontal */
                .welcome-links {
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    margin-top: 18px;
                    padding-top: 18px;
                    border-top: 1px solid rgba(100, 116, 139, 0.15);
                }
                .welcome-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    padding: 10px 14px;
                    background: transparent;
                    border: 1px solid rgba(100, 116, 139, 0.25);
                    border-radius: 8px;
                    color: #94a3b8;
                    font-size: 12px;
                    font-weight: 500;
                    text-decoration: none;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .welcome-link:hover {
                    background: rgba(37, 194, 160, 0.1);
                    border-color: rgba(37, 194, 160, 0.3);
                    color: #25c2a0;
                }
                .welcome-link svg {
                    width: 14px;
                    height: 14px;
                }
                /* Error/warning messages */
                .welcome-error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    border-radius: 8px;
                    padding: 10px 12px;
                    color: #f87171;
                    font-size: 12px;
                    margin-bottom: 14px;
                    display: none;
                }
                .welcome-error.show {
                    display: block;
                }
                /* View switching */
                .welcome-view {
                    display: none;
                    width: 100%;
                }
                .welcome-view.active {
                    display: block;
                    animation: viewSlideIn 0.25s ease;
                }
                @keyframes viewSlideIn {
                    from { opacity: 0; transform: translateX(10px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                /* Back button */
                .welcome-back {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    color: #64748b;
                    font-size: 13px;
                    cursor: pointer;
                    margin-bottom: 16px;
                    transition: color 0.2s ease;
                }
                .welcome-back:hover {
                    color: #25c2a0;
                }
                .welcome-back svg {
                    width: 14px;
                    height: 14px;
                }
                /* Form titles */
                .welcome-form-title {
                    font-size: 20px;
                    font-weight: 600;
                    margin-bottom: 4px;
                    color: #f0f4f8;
                }
                .welcome-form-subtitle {
                    color: #64748b;
                    font-size: 13px;
                    margin-bottom: 18px;
                }
                /* Seed phrase grid */
                .seed-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 6px;
                    margin: 12px 0;
                }
                .seed-word {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 10px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(100, 116, 139, 0.15);
                    border-radius: 6px;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 11px;
                }
                .seed-number {
                    color: #64748b;
                    font-size: 10px;
                    min-width: 16px;
                }
                .welcome-warning {
                    background: rgba(245, 158, 11, 0.1);
                    border: 1px solid rgba(245, 158, 11, 0.2);
                    border-radius: 8px;
                    padding: 10px 12px;
                    color: #fbbf24;
                    font-size: 11px;
                    margin: 12px 0;
                    line-height: 1.4;
                }
                .welcome-checkbox {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    margin: 12px 0;
                    cursor: pointer;
                }
                .welcome-checkbox input {
                    width: 16px;
                    height: 16px;
                    accent-color: #25c2a0;
                    flex-shrink: 0;
                    margin-top: 1px;
                }
                .welcome-checkbox span {
                    font-size: 12px;
                    color: #94a3b8;
                    line-height: 1.4;
                }
                .welcome-textarea {
                    width: 100%;
                    padding: 12px 14px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(100, 116, 139, 0.2);
                    border-radius: 10px;
                    color: #f0f4f8;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 12px;
                    resize: vertical;
                    min-height: 80px;
                    outline: none;
                }
                .welcome-textarea:focus {
                    border-color: #25c2a0;
                    box-shadow: 0 0 0 3px rgba(37, 194, 160, 0.1);
                    background: rgba(30, 41, 59, 0.8);
                }
                .welcome-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid transparent;
                    border-top-color: currentColor;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                /* Responsive adjustments */
                @media (max-height: 700px) {
                    .welcome-brand { margin-bottom: 16px; }
                    .welcome-logo { width: 48px; height: 48px; }
                    .welcome-title { font-size: 24px; letter-spacing: 6px; }
                    .welcome-card { padding: 20px; }
                    .welcome-field { margin-bottom: 10px; }
                    .welcome-btn-primary { margin-top: 14px; padding: 12px 16px; }
                    .welcome-links { margin-top: 14px; padding-top: 14px; }
                }
            </style>
            <div class="welcome-bg">
                <div class="welcome-bg-orb welcome-bg-orb-1"></div>
                <div class="welcome-bg-orb welcome-bg-orb-2"></div>
                <div class="welcome-grid-pattern"></div>
            </div>
            <div class="welcome-wrapper">
                <div class="welcome-header">
                    <div class="welcome-network">
                        <span>mainnet</span>
                    </div>
                    <div class="welcome-version">v1.0.0</div>
                </div>
                <div class="welcome-content">
                    <div class="welcome-brand">
                        <div class="welcome-logo-container">
                            <div class="welcome-logo-glow"></div>
                            <svg class="welcome-logo" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <defs>
                                    <linearGradient id="beamCyan" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stop-color="#00e6d0"/>
                                        <stop offset="100%" stop-color="#00bfff"/>
                                    </linearGradient>
                                    <linearGradient id="beamPink" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stop-color="#da70d6"/>
                                        <stop offset="100%" stop-color="#9370db"/>
                                    </linearGradient>
                                </defs>
                                <polygon points="100,25 170,135 30,135" fill="url(#beamCyan)"/>
                                <polygon points="100,55 145,135 55,135" fill="#0a1628"/>
                                <polygon points="100,85 125,130 75,130" fill="url(#beamCyan)" opacity="0.6"/>
                                <polygon points="30,135 55,135 100,55 100,25" fill="url(#beamPink)" opacity="0.3"/>
                            </svg>
                        </div>
                        <div class="welcome-title">BEAM</div>
                        <div class="welcome-subtitle">Privacy Wallet</div>
                        <div class="welcome-tagline">Confidential DeFi Platform</div>
                    </div>

                    <div class="welcome-card">
                    <div class="welcome-form">
                    <!-- Main View: Login -->
                    <div class="welcome-view active" id="welcome-main-view">
                        <div class="welcome-error" id="welcome-error"></div>
                        <div class="welcome-field">
                            <label class="welcome-label">Account</label>
                            <select class="welcome-select" id="welcome-wallet-select" onchange="onWelcomeWalletSelect()">
                                <option value="">Loading wallets...</option>
                            </select>
                        </div>
                        <div class="welcome-field">
                            <label class="welcome-label">Account password</label>
                            <input type="password" class="welcome-input" id="welcome-password" placeholder="Enter your password" onkeypress="if(event.key==='Enter')welcomeUnlock()">
                        </div>
                        <button class="welcome-btn-primary" id="welcome-unlock-btn" onclick="welcomeUnlock()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="5" y="11" width="14" height="10" rx="2"/>
                                <path d="M12 16v2M8 11V7a4 4 0 1 1 8 0v4"/>
                            </svg>
                            Unlock Wallet
                        </button>
                        <div class="welcome-links">
                            <span class="welcome-link" onclick="showWelcomeView('create')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                                Create New
                            </span>
                            <span class="welcome-link" onclick="showWelcomeView('restore')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                Restore
                            </span>
                        </div>
                    </div>

                    <!-- Create Wallet View -->
                    <div class="welcome-view" id="welcome-create-view">
                        <div class="welcome-back" onclick="showWelcomeView('main')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                            Back
                        </div>
                        <div class="welcome-form-title">Create New Wallet</div>
                        <div class="welcome-form-subtitle">Set up your new BEAM wallet</div>
                        <div class="welcome-error" id="welcome-create-error"></div>
                        <div class="welcome-field">
                            <label class="welcome-label">Wallet Name</label>
                            <input type="text" class="welcome-input" id="welcome-create-name" placeholder="My Wallet">
                        </div>
                        <div class="welcome-field">
                            <label class="welcome-label">Password</label>
                            <input type="password" class="welcome-input" id="welcome-create-password" placeholder="Enter a strong password">
                        </div>
                        <div class="welcome-field">
                            <label class="welcome-label">Confirm Password</label>
                            <input type="password" class="welcome-input" id="welcome-create-confirm" placeholder="Confirm your password">
                        </div>
                        <button class="welcome-btn-primary" id="welcome-create-btn" onclick="welcomeCreateWallet()">
                            Create Wallet
                        </button>
                    </div>

                    <!-- Seed Phrase Display View -->
                    <div class="welcome-view" id="welcome-seed-view">
                        <div class="welcome-form-title">Your Seed Phrase</div>
                        <div class="welcome-form-subtitle">Write down these words and keep them safe</div>
                        <div class="welcome-warning">
                            <strong>IMPORTANT:</strong> Anyone with your seed phrase can access your funds. Never share it with anyone.
                        </div>
                        <div class="seed-grid" id="welcome-seed-grid"></div>
                        <button class="welcome-btn-primary" style="background: var(--glass); color: var(--text-primary); border: 1px solid var(--glass-border); margin-top: 12px;" onclick="copyWelcomeSeed()">
                            Copy Seed Phrase
                        </button>
                        <label class="welcome-checkbox">
                            <input type="checkbox" id="welcome-seed-confirmed" onchange="updateWelcomeSeedBtn()">
                            <span>I have written down my seed phrase and stored it safely</span>
                        </label>
                        <button class="welcome-btn-primary" id="welcome-seed-continue-btn" onclick="welcomeSeedContinue()" disabled>
                            Continue to Wallet
                        </button>
                    </div>

                    <!-- Restore Wallet View -->
                    <div class="welcome-view" id="welcome-restore-view">
                        <div class="welcome-back" onclick="showWelcomeView('main')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                            Back
                        </div>
                        <div class="welcome-form-title">Restore Wallet</div>
                        <div class="welcome-form-subtitle">Enter your 12-word seed phrase</div>
                        <div class="welcome-error" id="welcome-restore-error"></div>
                        <div class="welcome-field">
                            <label class="welcome-label">Wallet Name</label>
                            <input type="text" class="welcome-input" id="welcome-restore-name" placeholder="Restored Wallet">
                        </div>
                        <div class="welcome-field">
                            <label class="welcome-label">Seed Phrase</label>
                            <textarea class="welcome-textarea" id="welcome-restore-seed" placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"></textarea>
                        </div>
                        <div class="welcome-field">
                            <label class="welcome-label">New Password</label>
                            <input type="password" class="welcome-input" id="welcome-restore-password" placeholder="Create a password">
                        </div>
                        <div class="welcome-field">
                            <label class="welcome-label">Confirm Password</label>
                            <input type="password" class="welcome-input" id="welcome-restore-confirm" placeholder="Confirm password">
                        </div>
                        <button class="welcome-btn-primary" id="welcome-restore-btn" onclick="welcomeRestoreWallet()">
                            Restore Wallet
                        </button>
                    </div>
                </div>
                </div><!-- /welcome-card -->
                </div><!-- /welcome-content -->
            </div><!-- /welcome-wrapper -->
        `;
        document.body.appendChild(overlay);

        // Load wallets list
        loadWelcomeWallets();

        // Start local node for syncing (without owner key) - runs in background
        startNodeForSync();
    }
    overlay.style.display = 'flex';
}

function hideLockedOverlay() {
    const overlay = document.getElementById('locked-overlay');
    if (overlay) overlay.style.display = 'none';
}

// Lock wallet and show unlock screen
async function lockWallet() {
    try {
        // Call lock API to stop wallet-api
        const response = await fetch('/api/wallet/lock', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            // Clear stored password
            storedWalletPassword = null;
            sessionStorage.removeItem('walletPassword');

            // Clear wallet data from UI
            walletStatus = null;
            walletAddresses = [];
            recentTransactions = [];
            utxos = [];

            // Reset selected wallet for fresh selection
            welcomeSelectedWallet = null;

            // Show the locked/welcome overlay
            showLockedOverlay('Wallet locked');

            // Reload wallets list in the welcome screen
            loadWelcomeWallets();

            showToast('Wallet locked', 'info');
        } else {
            showToast(result.error || 'Failed to lock wallet', 'error');
        }
    } catch (e) {
        console.error('Lock wallet error:', e);
        showToast('Failed to lock wallet', 'error');
    }
}

// Start node for syncing (without owner key - just blockchain sync)
async function startNodeForSync() {
    try {
        // Check if node is already running
        const statusRes = await fetch('/api/node/status');
        const status = await statusRes.json();

        if (!status.running) {
            console.log('Starting local node for syncing...');
            await fetch('/api/node/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}) // No owner key - just sync blockchain
            });
        } else {
            console.log('Node already running, sync progress:', status.progress + '%');
        }
    } catch (e) {
        console.log('Could not start node for sync:', e);
    }
}

// Check if local node is synced
async function isLocalNodeSynced() {
    try {
        const res = await fetch('/api/node/status');
        const status = await res.json();
        return status.running && status.synced;
    } catch (e) {
        return false;
    }
}

// Welcome screen functions
async function loadWelcomeWallets() {
    try {
        const response = await fetch('/api/wallets');
        if (response.ok) {
            const data = await response.json();
            welcomeWallets = data.wallets || [];
            updateWelcomeWalletSelect();
        }
    } catch (e) {
        console.error('Failed to load wallets:', e);
    }
}

function updateWelcomeWalletSelect() {
    const select = document.getElementById('welcome-wallet-select');
    if (!select) return;

    if (welcomeWallets.length === 0) {
        select.innerHTML = '<option value="">No wallets found</option>';
        return;
    }

    select.innerHTML = welcomeWallets.map(w =>
        `<option value="${w}">${w}</option>`
    ).join('');

    welcomeSelectedWallet = welcomeWallets[0];
}

function onWelcomeWalletSelect() {
    const select = document.getElementById('welcome-wallet-select');
    welcomeSelectedWallet = select.value;
}

function showWelcomeView(view) {
    welcomeCurrentView = view;
    document.querySelectorAll('#locked-overlay .welcome-view').forEach(v => v.classList.remove('active'));
    document.getElementById('welcome-' + view + '-view').classList.add('active');

    // Clear errors
    document.querySelectorAll('#locked-overlay .welcome-error').forEach(e => {
        e.classList.remove('show');
        e.textContent = '';
    });
}

function showWelcomeError(viewId, message) {
    const errorEl = document.getElementById('welcome-' + viewId + '-error') || document.getElementById('welcome-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
    }
}

// Background local node sync checker
let localNodeSyncChecker = null;
let storedWalletPassword = null;

async function startBackgroundNodeSync() {
    if (!storedWalletPassword) return;

    // Start local node in background (with owner key)
    try {
        const exportRes = await fetch('/api/wallet/export_owner_key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: welcomeSelectedWallet, password: storedWalletPassword })
        });
        const exportResult = await exportRes.json();

        if (exportResult.success && exportResult.owner_key) {
            // Start local node with owner key
            await fetch('/api/node/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ owner_key: exportResult.owner_key, password: storedWalletPassword })
            });
            console.log('Local node started in background');

            // Start periodic check for sync status
            startNodeSyncChecker();
        }
    } catch (e) {
        console.log('Background node start failed:', e);
    }
}

function startNodeSyncChecker() {
    if (localNodeSyncChecker) clearInterval(localNodeSyncChecker);

    // Check every 60 seconds
    localNodeSyncChecker = setInterval(async () => {
        try {
            const res = await fetch('/api/node/status');
            const status = await res.json();

            if (status.running && status.synced) {
                console.log('Local node synced! Switching...');
                clearInterval(localNodeSyncChecker);
                localNodeSyncChecker = null;

                // Seamlessly switch to local node
                await seamlessSwitchToLocalNode();
            } else if (status.running) {
                console.log(`Local node sync progress: ${status.progress}%`);
            }
        } catch (e) {
            console.log('Node status check failed:', e);
        }
    }, 60000); // Check every minute
}

async function seamlessSwitchToLocalNode() {
    if (!storedWalletPassword) {
        console.log('No stored password, cannot switch');
        return;
    }

    try {
        const response = await fetch('/api/node/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'local', password: storedWalletPassword, wallet: welcomeSelectedWallet })
        });

        const result = await response.json();

        if (result.success) {
            showToastAdvanced('Local Node Active', 'Switched to local node for DEX support', 'success');

            // Update UI if settings page is showing node info
            const nodeStatusEl = document.getElementById('settings-node-type');
            if (nodeStatusEl) nodeStatusEl.textContent = 'Local';

            // Update node selector if visible
            const nodeSelector = document.getElementById('node-selector');
            if (nodeSelector) nodeSelector.value = '127.0.0.1:10005';

            // Refresh DEX data
            if (typeof loadDexPools === 'function') {
                setTimeout(loadDexPools, 2000);
            }
        }
    } catch (e) {
        console.log('Seamless switch failed:', e);
    }
}

async function welcomeUnlock() {
    const password = document.getElementById('welcome-password').value;

    if (!welcomeSelectedWallet) {
        showWelcomeError('', 'Please select a wallet');
        return;
    }

    if (!password) {
        showWelcomeError('', 'Please enter your password');
        return;
    }

    const btn = document.getElementById('welcome-unlock-btn');
    btn.innerHTML = '<div class="welcome-spinner"></div> Checking node...';
    btn.disabled = true;

    // Helper to reset button
    const resetButton = () => {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 10H2M7 15h4"/></svg> Unlock Wallet';
        btn.disabled = false;
    };

    try {
        // Store password for node switching
        storedWalletPassword = password;
        sessionStorage.setItem('walletPassword', password);

        // Check if local node is already synced
        const nodeSynced = await isLocalNodeSynced();
        console.log('Node synced check:', nodeSynced);
        debugLog('info', 'isLocalNodeSynced', { synced: nodeSynced });

        if (nodeSynced) {
            // Local node is synced - use it directly with owner key
            btn.innerHTML = '<div class="welcome-spinner"></div> Connecting to local node...';
            console.log('Attempting local node switch for wallet:', welcomeSelectedWallet);

            const switchRes = await fetch('/api/node/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'local', password: password, wallet: welcomeSelectedWallet })
            });
            const switchResult = await switchRes.json();
            console.log('Switch result:', switchResult);
            debugLog('response', 'node/switch', switchResult);

            if (switchResult.success) {
                hideLockedOverlay();
                const connected = await loadWalletData();
                if (connected) {
                    renderAssetCards();
                    renderBalancesTable();
                    renderUtxos();
                    showToastAdvanced('Wallet Unlocked', 'Connected to local node (DEX ready)', 'success');
                }
            } else {
                // Check if it's a password error - don't fallback, show error directly
                const errLower = (switchResult.error || '').toLowerCase();
                if (errLower.includes('password') || errLower.includes('invalid')) {
                    showWelcomeError('', switchResult.error || 'Invalid password');
                    resetButton();
                    return; // Don't proceed with fallback
                }

                // Fallback to public node for non-password errors
                console.log('Local switch failed, falling back to public:', switchResult.error);
                debugLog('error', 'node/switch', { fallback: 'public', reason: switchResult.error });
                await unlockWithPublicNode(password);

                // Schedule a retry to switch to local node after 5 seconds
                setTimeout(async () => {
                    const stillSynced = await isLocalNodeSynced();
                    if (stillSynced) {
                        console.log('Retrying local node switch...');
                        seamlessSwitchToLocalNode();
                    }
                }, 5000);
            }
        } else {
            // Local node not synced - use public node, continue syncing in background
            console.log('Node not synced, using public node');
            await unlockWithPublicNode(password);

            // Continue background sync and check periodically
            startNodeSyncChecker();
        }
    } catch (e) {
        // Don't show generic connection error if password error was already shown
        if (e.name === 'AbortError') {
            showWelcomeError('', 'Connection timed out. Please try again.');
        } else if (!e.message || (!e.message.includes('Invalid password') && !e.message.includes('password'))) {
            showWelcomeError('', 'Connection error. Is the server running?');
        }
        // If password error, it was already shown by unlockWithPublicNode
    }

    resetButton();
}

async function unlockWithPublicNode(password) {
    const btn = document.getElementById('welcome-unlock-btn');
    btn.innerHTML = '<div class="welcome-spinner"></div> Unlocking...';

    // Use AbortController for timeout (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch('/api/wallet/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: welcomeSelectedWallet, password: password }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const result = await response.json();

        if (result.success) {
            hideLockedOverlay();
            const connected = await loadWalletData();
            if (connected) {
                renderAssetCards();
                renderBalancesTable();
                renderUtxos();
                showToast('Wallet unlocked (public node)', 'success');
            }
        } else {
            showWelcomeError('', result.error || 'Invalid password');
            throw new Error(result.error);
        }
    } catch (e) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') {
            showWelcomeError('', 'Unlock timed out. Please try again.');
        }
        throw e;
    }
}

let welcomeCreatedSeed = null;
let welcomeCreatedWallet = null;
let welcomeCreatedPassword = null;

async function welcomeCreateWallet() {
    const name = document.getElementById('welcome-create-name').value.trim() || 'My Wallet';
    const password = document.getElementById('welcome-create-password').value;
    const confirm = document.getElementById('welcome-create-confirm').value;

    if (!password) {
        showWelcomeError('create', 'Please enter a password');
        return;
    }

    if (password.length < 6) {
        showWelcomeError('create', 'Password must be at least 6 characters');
        return;
    }

    if (password !== confirm) {
        showWelcomeError('create', 'Passwords do not match');
        return;
    }

    // Validate wallet name
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        showWelcomeError('create', 'Wallet name can only contain letters, numbers, underscore, and hyphen');
        return;
    }

    const btn = document.getElementById('welcome-create-btn');
    btn.innerHTML = '<div class="welcome-spinner"></div> Creating...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/wallet/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: name, password: password })
        });

        const result = await response.json();

        if (result.success) {
            welcomeCreatedSeed = result.seed_phrase;
            welcomeCreatedWallet = name;
            welcomeCreatedPassword = password;

            // Display seed phrase
            const grid = document.getElementById('welcome-seed-grid');
            const words = result.seed_phrase ? result.seed_phrase.split(' ') : [];
            grid.innerHTML = words.map((w, i) =>
                `<div class="seed-word"><span class="seed-number">${i + 1}.</span>${w}</div>`
            ).join('');

            document.getElementById('welcome-seed-confirmed').checked = false;
            document.getElementById('welcome-seed-continue-btn').disabled = true;

            showWelcomeView('seed');
        } else {
            showWelcomeError('create', result.error || 'Failed to create wallet');
        }
    } catch (e) {
        showWelcomeError('create', 'Connection error');
    }

    btn.innerHTML = 'Create Wallet';
    btn.disabled = false;
}

function copyWelcomeSeed() {
    if (welcomeCreatedSeed) {
        navigator.clipboard.writeText(welcomeCreatedSeed).then(() => {
            showToast('Seed phrase copied to clipboard', 'success');
        }).catch(() => {
            showToast('Failed to copy', 'error');
        });
    }
}

function updateWelcomeSeedBtn() {
    const btn = document.getElementById('welcome-seed-continue-btn');
    const checkbox = document.getElementById('welcome-seed-confirmed');
    btn.disabled = !checkbox.checked;
}

async function welcomeSeedContinue() {
    if (!welcomeCreatedWallet || !welcomeCreatedPassword) return;

    const btn = document.getElementById('welcome-seed-continue-btn');
    btn.innerHTML = '<div class="welcome-spinner"></div> Unlocking...';
    btn.disabled = true;

    const resetButton = () => {
        btn.innerHTML = 'Continue to Wallet';
        btn.disabled = false;
    };

    try {
        // Use AbortController for timeout (30 seconds for unlock)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('/api/wallet/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: welcomeCreatedWallet, password: welcomeCreatedPassword }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const result = await response.json();

        if (result.success) {
            // Store password for background node switching
            storedWalletPassword = welcomeCreatedPassword;
            welcomeSelectedWallet = welcomeCreatedWallet;
            sessionStorage.setItem('walletPassword', welcomeCreatedPassword);
            hideLockedOverlay();
            resetButton();

            const connected = await loadWalletData();
            if (connected) {
                renderAssetCards();
                renderBalancesTable();
                renderUtxos();
                showToast('Wallet created and unlocked!', 'success');
            }

            // Start background local node sync
            setTimeout(() => {
                startBackgroundNodeSync();
            }, 3000);
            return; // Exit successfully
        } else {
            showWelcomeError('', result.error || 'Failed to unlock wallet');
            showWelcomeView('main');
            loadWelcomeWallets();
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            showWelcomeError('', 'Unlock timed out. Please try again.');
        } else {
            showWelcomeError('', 'Connection error: ' + e.message);
        }
        showWelcomeView('main');
    }

    resetButton();
}

async function welcomeRestoreWallet() {
    const name = document.getElementById('welcome-restore-name').value.trim() || 'Restored Wallet';
    const seed = document.getElementById('welcome-restore-seed').value.trim();
    const password = document.getElementById('welcome-restore-password').value;
    const confirm = document.getElementById('welcome-restore-confirm').value;

    if (!seed) {
        showWelcomeError('restore', 'Please enter your seed phrase');
        return;
    }

    const words = seed.split(/\s+/);
    if (words.length !== 12) {
        showWelcomeError('restore', 'Seed phrase must be exactly 12 words');
        return;
    }

    if (!password) {
        showWelcomeError('restore', 'Please enter a password');
        return;
    }

    if (password.length < 6) {
        showWelcomeError('restore', 'Password must be at least 6 characters');
        return;
    }

    if (password !== confirm) {
        showWelcomeError('restore', 'Passwords do not match');
        return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        showWelcomeError('restore', 'Invalid wallet name');
        return;
    }

    const btn = document.getElementById('welcome-restore-btn');
    btn.innerHTML = '<div class="welcome-spinner"></div> Restoring...';
    btn.disabled = true;

    // Helper to reset button
    const resetButton = () => {
        btn.innerHTML = 'Restore Wallet';
        btn.disabled = false;
    };

    try {
        // Use AbortController for timeout (90 seconds for restore)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        const response = await fetch('/api/wallet/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: name, password: password, seed_phrase: seed }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const result = await response.json();

        if (result.success) {
            btn.innerHTML = '<div class="welcome-spinner"></div> Unlocking...';

            // Auto-unlock the restored wallet (with timeout)
            const unlockController = new AbortController();
            const unlockTimeoutId = setTimeout(() => unlockController.abort(), 30000);

            const unlockResponse = await fetch('/api/wallet/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet: name, password: password }),
                signal: unlockController.signal
            });
            clearTimeout(unlockTimeoutId);

            const unlockResult = await unlockResponse.json();

            if (unlockResult.success) {
                // Store password for background node switching
                storedWalletPassword = password;
                welcomeSelectedWallet = name;
                sessionStorage.setItem('walletPassword', password);
                hideLockedOverlay();
                resetButton();

                const connected = await loadWalletData();
                if (connected) {
                    renderAssetCards();
                    renderBalancesTable();
                    renderUtxos();
                    showToast('Wallet restored and unlocked!', 'success');
                }

                // Start background local node sync
                setTimeout(() => {
                    startBackgroundNodeSync();
                }, 3000);
                return; // Exit successfully
            } else {
                showWelcomeError('restore', unlockResult.error || 'Wallet restored but unlock failed');
            }
        } else {
            showWelcomeError('restore', result.error || 'Failed to restore wallet');
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            showWelcomeError('restore', 'Operation timed out. Please try again.');
        } else {
            showWelcomeError('restore', 'Connection error: ' + e.message);
        }
    }

    resetButton();
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Show loading state
    document.getElementById('asset-cards').innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading...</div>';
    document.getElementById('balances-tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">Loading...</td></tr>';

    // Check server status first
    const serverStatus = await checkServerStatus();

    if (serverStatus) {
        console.log('Server status:', serverStatus);

        if (!serverStatus.wallet_api_running) {
            showLockedOverlay('Wallet API is not running. Please unlock your wallet first.');
            return;
        }
    }

    // Try to load data from API
    const connected = await loadWalletData();

    if (!connected) {
        // Check if it's because wallet is locked
        if (serverStatus && !serverStatus.wallet_api_running) {
            showLockedOverlay('Please unlock your wallet to continue.');
            return;
        }

        // Show demo data if not connected (for development)
        walletData.assets = [
            { id: 0, balance: 0, locked: 0 },
        ];
        walletData.utxos = [];
        showToast('Wallet API not connected. Start wallet-api to see real data.', 'info');
    }

    hideLockedOverlay();
    renderAssetCards();
    renderBalancesTable();
    renderUtxos();

    // Auto-start local node in background for DEX support
    autoStartLocalNode();

    // Refresh every 10 seconds if connected
    if (connected) {
        setInterval(async () => {
            const stillConnected = await loadWalletData();
            if (stillConnected) {
                renderAssetCards();
                renderBalancesTable();
                renderUtxos();
            } else {
                showLockedOverlay('Connection lost. Please check wallet-api.');
            }
        }, 10000);
    }

    // Show guide for first-time users
    if (!localStorage.getItem('guideShown')) {
        setTimeout(showGuide, 1000);
    }
});

// Current asset for send modal
let currentSendAsset = 0;

// Open send modal with specific asset
function openSendModal(assetId = 0) {
    currentSendAsset = assetId;
    const config = ASSET_CONFIG[assetId] || { name: `Asset #${assetId}`, symbol: 'CA' + assetId, color: '#64748b' };

    // Update modal title/info
    const modalTitle = document.querySelector('#send-modal .modal-title');
    if (modalTitle) {
        modalTitle.textContent = `Send ${config.symbol} (#${assetId})`;
    }

    // Get balance for this asset
    const asset = walletData.assets.find(a => a.id === assetId);
    const balance = asset ? formatAmount(asset.balance) : '0';

    // Add balance display if not exists
    let balanceInfo = document.getElementById('send-balance-info');
    if (!balanceInfo) {
        const amountField = document.querySelector('#send-modal .address-field:nth-child(2)');
        if (amountField) {
            balanceInfo = document.createElement('div');
            balanceInfo.id = 'send-balance-info';
            balanceInfo.style.cssText = 'font-size:12px;color:var(--text-muted);margin-top:4px;';
            amountField.appendChild(balanceInfo);
        }
    }
    if (balanceInfo) {
        balanceInfo.innerHTML = `Available: <strong>${balance} ${config.symbol}</strong> <button onclick="setMaxAmount()" style="background:var(--beam-cyan-dim);border:none;color:var(--beam-cyan);padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;margin-left:8px;">MAX</button>`;
    }

    // Clear inputs
    document.getElementById('send-address').value = '';
    document.getElementById('send-amount').value = '';
    document.getElementById('send-comment').value = '';

    openModal('send-modal');
}

// Set max amount for send
function setMaxAmount() {
    const asset = walletData.assets.find(a => a.id === currentSendAsset);
    if (asset) {
        // Subtract fee (100000 groth = 0.001 BEAM) for BEAM transactions
        const maxAmount = currentSendAsset === 0 ? Math.max(0, asset.balance - 100000) : asset.balance;
        document.getElementById('send-amount').value = formatAmount(maxAmount);
    }
}

// Pending send transaction data
let pendingSendTx = null;

// Send confirmation - shows confirmation modal first
function confirmSend() {
    const address = document.getElementById('send-address').value.trim();
    const amount = document.getElementById('send-amount').value;
    const comment = document.getElementById('send-comment').value;

    if (!address) {
        showToast('Please enter recipient address', 'error');
        return;
    }
    if (!amount || parseFloat(amount) <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    // Get asset info
    const assetInfo = getAssetInfo(currentSendAsset);
    const fee = 0.001; // 0.001 BEAM fee

    // Store pending transaction
    pendingSendTx = {
        address,
        amount: parseFloat(amount),
        amountGroth: Math.round(parseFloat(amount) * GROTH),
        assetId: currentSendAsset,
        assetInfo,
        comment,
        fee
    };

    // Build icon HTML
    const iconHtml = assetInfo.icon
        ? `<img src="${assetInfo.icon}" onerror="this.style.display='none';this.parentNode.textContent='${assetInfo.symbol.substring(0,2)}'">`
        : assetInfo.symbol.substring(0, 2);
    const iconBg = assetInfo.icon ? 'transparent' : (assetInfo.color || '#64748b');

    // Build confirmation content
    const content = document.getElementById('send-confirm-content');
    content.innerHTML = `
        <!-- Asset being sent -->
        <div class="confirm-swap-asset spending">
            <div class="confirm-asset-icon" style="background: ${iconBg}">
                ${iconHtml}
            </div>
            <div class="confirm-asset-info">
                <div class="confirm-asset-label spending">You're Sending</div>
                <div class="confirm-asset-name">${assetInfo.name}</div>
                <div class="confirm-asset-id">${assetInfo.symbol} • ID #${currentSendAsset}</div>
            </div>
            <div class="confirm-asset-amount spending">
                <span class="amount">-${amount}</span>
                <span class="symbol">${assetInfo.symbol}</span>
            </div>
        </div>

        <!-- Arrow -->
        <div class="confirm-swap-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
        </div>

        <!-- Recipient -->
        <div class="confirm-swap-asset" style="background: var(--void-lighter);">
            <div class="confirm-asset-icon" style="background: var(--text-muted);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
            </div>
            <div class="confirm-asset-info">
                <div class="confirm-asset-label">Recipient</div>
                <div class="confirm-asset-name" style="font-size: 12px; word-break: break-all;">${address}</div>
            </div>
        </div>

        <!-- Transaction Details -->
        <div class="confirm-swap-details">
            <div class="confirm-swap-row">
                <span class="confirm-swap-label">Amount</span>
                <span class="confirm-swap-value">${amount} ${assetInfo.symbol}</span>
            </div>
            <div class="confirm-swap-row">
                <span class="confirm-swap-label">Network Fee</span>
                <span class="confirm-swap-value">${fee} BEAM</span>
            </div>
            ${comment ? `
            <div class="confirm-swap-row">
                <span class="confirm-swap-label">Comment</span>
                <span class="confirm-swap-value" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${comment}</span>
            </div>
            ` : ''}
        </div>

        <!-- Warning -->
        <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 8px; color: #f59e0b; font-size: 13px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <span>Please verify all details before confirming</span>
            </div>
        </div>

        <!-- Buttons -->
        <div class="confirm-buttons">
            <button class="btn btn-cancel" onclick="closeModal('send-confirm-modal')">Cancel</button>
            <button class="btn btn-confirm" onclick="executeSend()">Confirm & Send</button>
        </div>
    `;

    // Close send modal and open confirmation
    closeModal('send-modal');
    openModal('send-confirm-modal');
}

// Execute the send transaction after confirmation
async function executeSend() {
    if (!pendingSendTx) return;

    closeModal('send-confirm-modal');

    const { address, amount, amountGroth, assetId, assetInfo, comment } = pendingSendTx;

    // Show pending notification
    showToastAdvanced(
        'Sending Transaction',
        `${amount} ${assetInfo.symbol} → ${address.substring(0, 12)}...`,
        'pending'
    );

    try {
        const result = await apiCall('tx_send', {
            address: address,
            value: amountGroth,
            fee: 100000, // 0.001 BEAM fee
            asset_id: assetId,
            comment: comment,
            offline: true
        });

        showToastAdvanced(
            'Transaction Sent!',
            `${amount} ${assetInfo.symbol} sent successfully`,
            'success'
        );

        // Reset form
        document.getElementById('send-address').value = '';
        document.getElementById('send-amount').value = '';
        document.getElementById('send-comment').value = '';

        // Refresh wallet data
        await loadWalletData();
        renderAssetCards();
        renderBalancesTable();

        // Refresh transactions to show pending
        await loadTransactions();

        // Visual feedback
        const assetCards = document.getElementById('asset-cards');
        assetCards.classList.add('data-refreshing');
        setTimeout(() => assetCards.classList.remove('data-refreshing'), 2000);

        // Show donation popup after successful transaction
        setTimeout(() => showDonationPopup(), 2000);

    } catch (e) {
        showToastAdvanced('Transaction Failed', e.message, 'error');
    }

    pendingSendTx = null;
}

// Generate new SBBS address (from addresses page)
async function generateNewAddress() {
    try {
        // Create SBBS (regular) address by default - standard for exchanges and wallets
        const result = await apiCall('create_address', {
            type: 'regular',
            expiration: 'auto',
            new_style_regular: true,
            comment: 'SBBS Address'
        });
        showToast('New SBBS address created!', 'success');
        await loadAddresses();
    } catch (e) {
        showToast('Failed to create address: ' + e.message, 'error');
    }
}

// Load all blockchain assets
async function loadAllAssets() {
    const tbody = document.getElementById('all-assets-tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">Loading assets...</td></tr>';

    try {
        // Get all assets from wallet using assets_list API
        // Response: { assets: [{asset_id, metadata, metadata_pairs, emission, ...}] }
        const response = await apiCall('assets_list', { refresh: true });

        // Handle both response.assets array and direct array
        const assets = response?.assets || response || [];

        if (!assets || assets.length === 0) {
            // If no assets returned, create list from wallet status
            allAssetsCache = [];

            // Add BEAM first
            allAssetsCache.push({
                asset_id: 0,
                metadata: { N: 'BEAM', UN: 'BEAM', SN: 'BEAM' },
                value: walletData.assets.find(a => a.id === 0)?.balance || 0
            });

            // Add assets from wallet balances
            walletData.assets.forEach(a => {
                if (a.id !== 0) {
                    const config = ASSET_CONFIG[a.id] || {};
                    allAssetsCache.push({
                        asset_id: a.id,
                        metadata: { N: config.name || `Asset #${a.id}`, UN: config.symbol || `CA${a.id}` },
                        value: a.balance
                    });
                }
            });
        } else {
            // Process the assets array
            // assets_list returns: [{asset_id, metadata_pairs: {N, UN, SN, ...}, emission, ...}]
            allAssetsCache = assets.map(a => ({
                asset_id: a.asset_id,
                // Use metadata_pairs if available (already parsed), otherwise parse metadata string
                metadata: a.metadata_pairs || (typeof a.metadata === 'string' ? parseMetadata(a.metadata) : (a.metadata || {})),
                value: a.emission || 0,
                lock_height: a.lockHeight
            }));

            // Sort by asset_id
            allAssetsCache.sort((a, b) => (a.asset_id || 0) - (b.asset_id || 0));
        }

        renderAllAssets(allAssetsCache);

        // Add search event listener
        const searchInput = document.getElementById('all-assets-search');
        if (searchInput && !searchInput.hasAttribute('data-listener')) {
            searchInput.setAttribute('data-listener', 'true');
            searchInput.addEventListener('input', () => renderAllAssets(allAssetsCache));
        }
    } catch (e) {
        console.error('Load assets error:', e);

        // Show known assets as fallback (from config + wallet balances)
        allAssetsCache = [];

        // Add BEAM
        allAssetsCache.push({
            asset_id: 0,
            metadata: { N: 'BEAM', UN: 'BEAM' },
            value: 0
        });

        // Add from config
        Object.keys(ASSET_CONFIG).forEach(aid => {
            const id = parseInt(aid);
            if (id !== 0) {
                allAssetsCache.push({
                    asset_id: id,
                    metadata: { N: ASSET_CONFIG[id].name, UN: ASSET_CONFIG[id].symbol },
                    value: 0
                });
            }
        });

        // Add from wallet balances
        walletData.assets.forEach(a => {
            if (!allAssetsCache.find(c => c.asset_id === a.id)) {
                const config = ASSET_CONFIG[a.id] || {};
                allAssetsCache.push({
                    asset_id: a.id,
                    metadata: { N: config.name || `Asset #${a.id}`, UN: config.symbol || `CA${a.id}` },
                    value: a.balance
                });
            }
        });

        renderAllAssets(allAssetsCache);
    }
}

// Toggle show hidden assets
function toggleShowHidden() {
    showHiddenAssets = document.getElementById('show-hidden-assets')?.checked || false;
    renderAllAssets(allAssetsCache);
}

// Toggle hide/unhide asset
function toggleHideAsset(assetId) {
    if (hiddenAssets.has(assetId)) {
        hiddenAssets.delete(assetId);
        showToast('Asset unhidden', 'success');
    } else {
        hiddenAssets.add(assetId);
        showToast('Asset hidden', 'success');
    }
    localStorage.setItem('hiddenAssets', JSON.stringify([...hiddenAssets]));
    renderAllAssets(allAssetsCache);
}

function renderAllAssets(assets) {
    const tbody = document.getElementById('all-assets-tbody');
    const search = document.getElementById('all-assets-search')?.value.toLowerCase() || '';

    const filtered = assets.filter(a => {
        const aid = a.asset_id;

        // Hide hidden assets unless show hidden is checked
        if (hiddenAssets.has(aid) && !showHiddenAssets) {
            return false;
        }

        const meta = a.metadata || {};
        const name = (meta.N || meta.name || `Asset #${aid}`).toLowerCase();
        const symbol = (meta.UN || meta.symbol || 'CA').toLowerCase();
        const shortName = (meta.SN || '').toLowerCase();
        const id = String(aid);
        return name.includes(search) || symbol.includes(search) || shortName.includes(search) || id.includes(search);
    });

    // Sort by user balance (highest first), then by asset ID
    filtered.sort((a, b) => {
        const balA = walletData.assets.find(ua => ua.id === a.asset_id);
        const balB = walletData.assets.find(ua => ua.id === b.asset_id);
        const valA = balA ? (balA.balance + balA.locked) : 0;
        const valB = balB ? (balB.balance + balB.locked) : 0;
        if (valB !== valA) return valB - valA; // Higher balance first
        return a.asset_id - b.asset_id; // Then by asset ID
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">No assets match your search</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(a => {
        const aid = a.asset_id || 0;
        const meta = a.metadata || {};

        // Get full asset info to detect LP tokens
        const info = getAssetInfo(aid);
        const isLpToken = info.isLpToken;

        // Get name and symbol from metadata or config
        const configAsset = ASSET_CONFIG[aid] || {};
        const name = info.name || meta.N || meta.name || configAsset.name || `Asset #${aid}`;
        const symbol = info.symbol || meta.UN || meta.symbol || configAsset.symbol || 'CA' + aid;
        const color = info.color || configAsset.color || meta.OPT_COLOR || `hsl(${(aid * 137) % 360}, 50%, 50%)`;
        const icon = info.icon || configAsset.icon;

        // Find user's balance for this asset
        const userAsset = walletData.assets.find(ua => ua.id === aid);
        const userBalance = userAsset ? formatAmount(userAsset.balance) : '0';
        const hasBalance = userAsset && (userAsset.balance + userAsset.locked) > 0;

        // Format supply (emission value)
        const supply = a.value ? formatAmount(a.value) : '-';

        const isHidden = hiddenAssets.has(aid);

        // LP Token badge
        const lpBadge = isLpToken ? '<span style="font-size:9px;padding:2px 6px;background:linear-gradient(135deg, #25c2a0, #60a5fa);color:#fff;border-radius:4px;margin-left:6px;">LP</span>' : '';

        // Action button - Withdraw LP for LP tokens, Trade for regular - opens popup modals
        const actionButton = isLpToken
            ? `<button class="action-btn trade-btn" onclick="event.stopPropagation();openQuickWithdrawLPModal(${aid})" style="background:linear-gradient(135deg, #25c2a0, #60a5fa);">Withdraw LP</button>`
            : `<button class="action-btn trade-btn" onclick="event.stopPropagation();openQuickTradeModal(${aid})">Trade</button>`;

        return `
            <tr style="${hasBalance ? 'background:var(--beam-cyan-dim);' : ''}${isHidden ? 'opacity:0.5;' : ''}" ${isLpToken ? 'title="Liquidity Provider Token - Represents your share in a DEX pool"' : ''}>
                <td>
                    <div class="asset-cell">
                        <div class="asset-cell-icon" style="${icon ? '' : `background: ${isLpToken ? 'linear-gradient(135deg, #25c2a0, #60a5fa)' : color}; color: #fff`}">
                            ${icon ? `<img src="${icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${color}';this.parentNode.style.color='#fff';this.parentNode.textContent='${symbol.substring(0,2)}'">` : (isLpToken ? 'LP' : symbol.substring(0, 2).toUpperCase())}
                        </div>
                        <div class="asset-cell-info">
                            <span class="asset-cell-name">${name}${lpBadge}${isHidden ? ' <span style="color:var(--text-muted);font-size:11px;">(hidden)</span>' : ''}</span>
                            <span class="asset-cell-symbol">${symbol}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="balance-cell" style="${hasBalance ? 'color:var(--beam-cyan);font-weight:600;' : ''}">${userBalance} ${symbol}</div>
                </td>
                <td>
                    <span class="asset-id-cell">#${aid}</span>
                </td>
                <td>
                    <span class="balance-locked">${supply}</span>
                </td>
                <td>
                    <div class="action-cell">
                        <button class="action-btn" onclick="event.stopPropagation();openSendModal(${aid})">Send</button>
                        <button class="action-btn" onclick="event.stopPropagation();openReceiveModal()">Receive</button>
                        ${actionButton}
                        <button class="action-btn" onclick="event.stopPropagation();toggleHideAsset(${aid})" title="${isHidden ? 'Unhide' : 'Hide'}">
                            ${isHidden ? '👁' : '🙈'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Load transactions
async function loadTransactions() {
    const container = document.getElementById('transactions-list');
    container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading...</div>';

    try {
        const txs = await apiCall('tx_list', { count: 50 });

        if (!txs || txs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2v20M17 7l-5-5-5 5M7 17l5 5 5-5"/>
                    </svg>
                    <h3>No transactions yet</h3>
                    <p>Your transaction history will appear here</p>
                </div>
            `;
            return;
        }

        renderTransactions(txs);
    } catch (e) {
        console.error('Load transactions error:', e);
        container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Failed to load transactions</div>';
    }
}

// Detect if invoke_data indicates an add liquidity transaction
// Add liquidity: sends 2 different assets (both positive amounts)
function detectAddLiquidity(invokeData) {
    const amounts = invokeData?.amounts || [];
    if (amounts.length < 2) return false;

    // Count assets being sent (positive amounts)
    const sent = amounts.filter(a => a.amount > 0);
    const received = amounts.filter(a => a.amount < 0);

    // Add liquidity typically sends 2 assets and receives 1 LP token
    // Or sends 2 assets with no explicit LP return in amounts
    return sent.length >= 2 && received.length <= 1;
}

// Detect if invoke_data indicates a remove liquidity transaction
// Remove liquidity: sends LP token (1 asset), receives 2 assets
function detectRemoveLiquidity(invokeData) {
    const amounts = invokeData?.amounts || [];
    if (amounts.length < 2) return false;

    // Count assets being sent (positive) vs received (negative)
    const sent = amounts.filter(a => a.amount > 0);
    const received = amounts.filter(a => a.amount < 0);

    // Remove liquidity typically sends 1 LP token and receives 2 assets
    return sent.length === 1 && received.length >= 2;
}

async function renderTransactions(txs) {
    const container = document.getElementById('transactions-list');

    // Get current height for confirmation calculation
    let currentHeight = 0;
    try {
        const status = await apiCall('wallet_status');
        currentHeight = status?.current_height || 0;
    } catch (e) {}

    // Store transactions for expansion
    window.txCache = txs;

    // Build transaction cards
    const txHtml = txs.map((tx, idx) => {
        const isReceive = tx.income;
        const aid = tx.asset_id || 0;
        const config = ASSET_CONFIG[aid] || { symbol: 'CA' + aid, color: '#64748b', icon: null };
        const amount = formatAmount(tx.value || 0);
        const fee = tx.fee ? formatAmount(tx.fee) : '0';
        const txId = tx.txId || tx.tx_id || '-';
        const kernel = tx.kernel || '-';
        const sender = tx.sender || '-';
        const receiver = tx.receiver || '-';

        // Check transaction type from comment or invoke_data
        const commentLower = (tx.comment || '').toLowerCase();
        const isContract = tx.tx_type === 7 || tx.tx_type === 12 || tx.tx_type_string === 'contract';

        // Detect liquidity operations
        const isAddLiquidity = commentLower.includes('add liquidity') || commentLower.includes('pool_add_liquidity') ||
                              (isContract && tx.invoke_data && tx.invoke_data.length > 0 && detectAddLiquidity(tx.invoke_data[0]));
        const isRemoveLiquidity = commentLower.includes('withdraw') || commentLower.includes('remove liquidity') ||
                                  (isContract && tx.invoke_data && tx.invoke_data.length > 0 && detectRemoveLiquidity(tx.invoke_data[0]));

        // Check if this is a swap transaction
        const isSwap = !isAddLiquidity && !isRemoveLiquidity && (
                      isContract ||
                      commentLower.includes('swap') ||
                      commentLower.includes('amm trade'));

        // Parse transaction details from invoke_data
        let swapDetails = null;
        let liquidityDetails = null;

        if (tx.invoke_data && tx.invoke_data.length > 0) {
            const amounts = tx.invoke_data[0].amounts || [];

            if (isAddLiquidity) {
                // Add liquidity: sends 2 assets, receives LP token
                const sent = amounts.filter(a => a.amount > 0);  // Positive = sent
                const received = amounts.filter(a => a.amount < 0);  // Negative = received
                if (sent.length >= 2) {
                    const info1 = getAssetInfo(sent[0].asset_id);
                    const info2 = getAssetInfo(sent[1].asset_id);
                    const lpInfo = received.length > 0 ? getAssetInfo(Math.abs(received[0].asset_id)) : null;
                    liquidityDetails = {
                        type: 'add',
                        asset1: { symbol: info1.symbol, amount: formatAmount(sent[0].amount), aid: sent[0].asset_id },
                        asset2: { symbol: info2.symbol, amount: formatAmount(sent[1].amount), aid: sent[1].asset_id },
                        lpToken: lpInfo ? { symbol: lpInfo.symbol, amount: formatAmount(Math.abs(received[0].amount)), aid: lpInfo.aid } : null
                    };
                }
            } else if (isRemoveLiquidity) {
                // Remove liquidity: sends LP token, receives 2 assets
                const sent = amounts.filter(a => a.amount > 0);  // Positive = sent (LP token)
                const received = amounts.filter(a => a.amount < 0);  // Negative = received
                if (received.length >= 2) {
                    const info1 = getAssetInfo(Math.abs(received[0].asset_id));
                    const info2 = getAssetInfo(Math.abs(received[1].asset_id));
                    const lpInfo = sent.length > 0 ? getAssetInfo(sent[0].asset_id) : null;
                    liquidityDetails = {
                        type: 'remove',
                        asset1: { symbol: info1.symbol, amount: formatAmount(Math.abs(received[0].amount)), aid: received[0].asset_id },
                        asset2: { symbol: info2.symbol, amount: formatAmount(Math.abs(received[1].amount)), aid: received[1].asset_id },
                        lpToken: lpInfo ? { symbol: lpInfo.symbol, amount: formatAmount(sent[0].amount), aid: lpInfo.aid } : null
                    };
                }
            } else if (isSwap) {
                const paid = amounts.find(a => a.amount > 0);
                const received = amounts.find(a => a.amount < 0);
                if (paid && received) {
                    const paidInfo = getAssetInfo(paid.asset_id);
                    const recvInfo = getAssetInfo(Math.abs(received.asset_id));
                    swapDetails = {
                        paidAmount: formatAmount(paid.amount),
                        paidSymbol: paidInfo.symbol,
                        paidAssetId: paid.asset_id,
                        receivedAmount: formatAmount(Math.abs(received.amount)),
                        receivedSymbol: recvInfo.symbol,
                        receivedAssetId: received.asset_id
                    };
                }
            }
        }

        // Action type
        const actionTypes = { 0: 'Simple', 1: 'Split', 2: 'AssetIssue', 3: 'AssetConsume', 4: 'AssetInfo', 5: 'PushTx', 6: 'PullTx', 7: 'Contract', 12: 'Contract' };
        let action;
        if (isAddLiquidity) action = 'Add Liquidity';
        else if (isRemoveLiquidity) action = 'Remove Liquidity';
        else if (isSwap) action = 'Swap';
        else action = actionTypes[tx.tx_type] || (isReceive ? 'Receive' : 'Send');

        // Calculate confirmations
        let confirmations = 0;
        let confirmText = '-';
        let confirmColor = 'var(--text-muted)';
        if (tx.height && tx.height > 0 && currentHeight > 0) {
            confirmations = Math.max(0, currentHeight - tx.height + 1);
            if (confirmations >= 80) { confirmText = '80+'; confirmColor = 'var(--success)'; }
            else if (confirmations > 0) { confirmText = String(confirmations); confirmColor = 'var(--warning)'; }
        } else if (tx.status === 0 || tx.status === 1) { confirmText = '0'; }

        // Status mapping
        const statusMap = { 0: { text: 'Pending', cls: 'status-pending' }, 1: { text: 'In Progress', cls: 'status-pending' }, 2: { text: 'Canceled', cls: 'expired' }, 3: { text: 'Completed', cls: 'available' }, 4: { text: 'Failed', cls: 'spent' } };
        const status = statusMap[tx.status] || { text: 'Unknown', cls: '' };
        const isPending = tx.status === 0 || tx.status === 1;

        // Format date
        let dateStr = '-', timeStr = '-';
        if (tx.create_time) {
            const d = new Date(tx.create_time * 1000);
            dateStr = d.toLocaleDateString();
            timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        // Icon HTML - no background when icon exists
        const iconHtml = config.icon
            ? '<img src="' + config.icon + '" style="width:100%;height:100%;" onerror="this.style.display=\'none\';this.parentNode.style.background=\'' + config.color + '\';this.parentNode.textContent=\'' + config.symbol.substring(0,2) + '\'">'
            : config.symbol.substring(0, 2).toUpperCase();
        const iconBg = config.icon ? 'transparent' : config.color;

        // Background color based on transaction type
        let bgColor;
        if (isAddLiquidity) bgColor = 'linear-gradient(135deg, #25c2a0, #60a5fa)';  // LP gradient
        else if (isRemoveLiquidity) bgColor = 'linear-gradient(135deg, #f59e0b, #ef4444)';  // Orange-red gradient
        else if (isSwap) bgColor = 'linear-gradient(135deg, var(--beam-cyan), var(--beam-pink))';
        else bgColor = isReceive ? 'var(--success)' : 'var(--warning)';

        // SVG icon based on type
        let svgIcon;
        if (isAddLiquidity) svgIcon = '<path d="M12 5v14M5 12h14"/>'; // Plus
        else if (isRemoveLiquidity) svgIcon = '<path d="M5 12h14"/>'; // Minus
        else if (isSwap) svgIcon = '<path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>';
        else svgIcon = '<path d="' + (isReceive ? 'M12 5v14M19 12l-7 7-7-7' : 'M12 19V5M5 12l7-7 7 7') + '"/>';

        // Truncate helper
        const trunc = (s, len) => s && s !== '-' ? s.substring(0, len) + '...' : '-';

        // Build detail info based on transaction type
        let detailHtml, amountHtml;
        if (liquidityDetails) {
            if (liquidityDetails.type === 'add') {
                detailHtml = '<div class="tx-swap-detail" style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:4px;">' +
                    '<span style="color:var(--warning);">' + liquidityDetails.asset1.symbol + '+' + liquidityDetails.asset2.symbol + '</span>' +
                    '<span>→</span>' +
                    '<span style="color:var(--success);">LP</span>' +
                '</div>';
                amountHtml = '<div class="tx-amount" style="color:var(--warning);font-size:11px;">-' + liquidityDetails.asset1.amount + ' ' + liquidityDetails.asset1.symbol + '</div>' +
                    '<div class="tx-amount" style="color:var(--warning);font-size:11px;">-' + liquidityDetails.asset2.amount + ' ' + liquidityDetails.asset2.symbol + '</div>' +
                    (liquidityDetails.lpToken ? '<div class="tx-amount" style="color:var(--success);font-size:11px;">+' + liquidityDetails.lpToken.amount + ' LP</div>' : '');
            } else {
                detailHtml = '<div class="tx-swap-detail" style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:4px;">' +
                    '<span style="color:var(--warning);">LP</span>' +
                    '<span>→</span>' +
                    '<span style="color:var(--success);">' + liquidityDetails.asset1.symbol + '+' + liquidityDetails.asset2.symbol + '</span>' +
                '</div>';
                amountHtml = (liquidityDetails.lpToken ? '<div class="tx-amount" style="color:var(--warning);font-size:11px;">-' + liquidityDetails.lpToken.amount + ' LP</div>' : '') +
                    '<div class="tx-amount" style="color:var(--success);font-size:11px;">+' + liquidityDetails.asset1.amount + ' ' + liquidityDetails.asset1.symbol + '</div>' +
                    '<div class="tx-amount" style="color:var(--success);font-size:11px;">+' + liquidityDetails.asset2.amount + ' ' + liquidityDetails.asset2.symbol + '</div>';
            }
        } else if (swapDetails) {
            detailHtml = '<div class="tx-swap-detail" style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:4px;">' +
                '<span style="color:var(--warning);">' + swapDetails.paidSymbol + '</span>' +
                '<span>→</span>' +
                '<span style="color:var(--success);">' + swapDetails.receivedSymbol + '</span>' +
            '</div>';
            amountHtml = '<div class="tx-amount" style="color:var(--warning);font-size:12px;">-' + swapDetails.paidAmount + ' ' + swapDetails.paidSymbol + '</div>' +
                '<div class="tx-amount" style="color:var(--success);font-size:12px;">+' + swapDetails.receivedAmount + ' ' + swapDetails.receivedSymbol + '</div>';
        } else {
            detailHtml = '<div class="tx-asset">' +
                '<span class="tx-asset-icon" style="background:' + iconBg + '">' + iconHtml + '</span>' +
                '<span>' + config.symbol + '</span>' +
                '<span class="tx-asset-id">#' + aid + '</span>' +
            '</div>';
            amountHtml = '<div class="tx-amount" style="color:' + (isReceive ? 'var(--success)' : 'var(--warning)') + '">' + (isReceive ? '+' : '-') + amount + '</div>' +
                '<div class="tx-fee">Fee: ' + fee + ' BEAM</div>';
        }

        return '<div class="tx-card ' + (isPending ? 'tx-pending' : '') + '" onclick="toggleTxDetails(' + idx + ')">' +
            '<div class="tx-card-main">' +
                '<div class="tx-icon" style="background:' + bgColor + '">' + (isPending ? '<div class="tx-icon-pulse"></div>' : '') +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="18" height="18">' + svgIcon + '</svg>' +
                '</div>' +
                '<div class="tx-main-info">' +
                    '<div class="tx-action">' + action + '</div>' +
                    detailHtml +
                '</div>' +
                '<div class="tx-amount-col">' + amountHtml + '</div>' +
                '<div class="tx-confirms" style="color:' + confirmColor + '">' + confirmText + '</div>' +
                '<div class="tx-status"><span class="utxo-status ' + status.cls + '" style="' + (isPending ? 'animation:livePulse 2s infinite;' : '') + '">' + status.text + '</span></div>' +
                '<div class="tx-date"><div>' + dateStr + '</div><div style="font-size:11px;color:var(--text-muted);">' + timeStr + '</div></div>' +
                '<div class="tx-expand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M6 9l6 6 6-6"/></svg></div>' +
            '</div>' +
            '<div class="tx-details" id="tx-details-' + idx + '">' +
                '<div class="tx-detail-grid">' +
                    '<div class="tx-detail-item"><span class="tx-detail-label">TxID</span><span class="tx-detail-value mono-text" onclick="event.stopPropagation();copyToClipboard(\'' + txId + '\')" style="cursor:pointer;" title="Click to copy">' + trunc(txId, 16) + '</span></div>' +
                    '<div class="tx-detail-item"><span class="tx-detail-label">Kernel</span><span class="tx-detail-value mono-text" onclick="event.stopPropagation();copyToClipboard(\'' + kernel + '\')" style="cursor:pointer;">' + trunc(kernel, 16) + '</span></div>' +
                    '<div class="tx-detail-item"><span class="tx-detail-label">Sender</span><span class="tx-detail-value mono-text" onclick="event.stopPropagation();copyToClipboard(\'' + sender + '\')" style="cursor:pointer;">' + trunc(sender, 16) + '</span></div>' +
                    '<div class="tx-detail-item"><span class="tx-detail-label">Receiver</span><span class="tx-detail-value mono-text" onclick="event.stopPropagation();copyToClipboard(\'' + receiver + '\')" style="cursor:pointer;">' + trunc(receiver, 16) + '</span></div>' +
                    '<div class="tx-detail-item"><span class="tx-detail-label">Height</span><span class="tx-detail-value">' + (tx.height || '-') + '</span></div>' +
                    '<div class="tx-detail-item"><span class="tx-detail-label">Confirmations</span><span class="tx-detail-value" style="color:' + confirmColor + '">' + (confirmations > 0 ? confirmations : (isPending ? 'Pending' : '-')) + '</span></div>' +
                '</div>' +
                (tx.comment ? '<div class="tx-comment">💬 ' + tx.comment + '</div>' : '') +
            '</div>' +
        '</div>';
    }).join('');

    container.innerHTML = '<div class="balances-card"><div id="tx-list-inner">' + txHtml + '</div></div>';

    // Add refresh indicator
    const refreshNote = document.createElement('div');
    refreshNote.style.cssText = 'text-align: center; padding: 12px; font-size: 12px; color: var(--text-muted);';
    refreshNote.innerHTML = `
        <span id="tx-refresh-time">Last updated: ${new Date().toLocaleTimeString()}</span>
        <button onclick="loadTransactions()" style="background: none; border: none; color: var(--beam-cyan); cursor: pointer; margin-left: 8px;">
            ↻ Refresh
        </button>
    `;
    container.appendChild(refreshNote);
}

// Toggle transaction details
function toggleTxDetails(idx) {
    const details = document.getElementById('tx-details-' + idx);
    if (details) {
        details.classList.toggle('expanded');
        const card = details.closest('.tx-card');
        if (card) card.classList.toggle('expanded');
    }
}

// Load addresses
async function loadAddresses() {
    const container = document.getElementById('addresses-list');
    container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading...</div>';

    try {
        const addrs = await apiCall('addr_list', { own: true });

        if (!addrs || addrs.length === 0) {
            container.innerHTML = `
                <div style="padding:32px;text-align:center;color:var(--text-muted);">
                    No addresses yet. Click "New Address" to create one.
                </div>
            `;
            return;
        }

        renderAddresses(addrs);
    } catch (e) {
        console.error('Load addresses error:', e);
        container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Failed to load addresses</div>';
    }
}

function renderAddresses(addrs) {
    const container = document.getElementById('addresses-list');
    const now = Math.floor(Date.now() / 1000);
    const isWideScreen = window.innerWidth > 768;

    // Map type to user-friendly names
    const typeNames = {
        'regular': 'SBBS',
        'regular_new': 'SBBS',
        'offline': 'Offline',
        'max_privacy': 'Max Privacy',
        'public_offline': 'Donation',
        'default': 'Default'
    };

    if (isWideScreen) {
        // Desktop: Table layout with full info
        container.innerHTML = `
            <table class="balances-table" style="width:100%;">
                <thead>
                    <tr>
                        <th style="width:40%;">Address</th>
                        <th style="width:12%;">Type</th>
                        <th style="width:20%;">Comment</th>
                        <th style="width:10%;">Status</th>
                        <th style="width:18%;text-align:right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${addrs.map(a => {
                        const expired = a.expired || (a.expire && a.expire < now);
                        const addrDisplay = a.address.substring(0, 24) + '...' + a.address.substring(a.address.length - 12);
                        const typeName = typeNames[a.type] || a.type || 'SBBS';

                        return `
                            <tr style="${expired ? 'opacity:0.5;' : ''}">
                                <td>
                                    <span class="asset-id-cell" title="${a.address}" style="cursor:pointer;font-family:var(--font-mono);font-size:12px;"
                                          onclick="copyToClipboard('${a.address}')">${addrDisplay}</span>
                                </td>
                                <td><span style="color:var(--accent-primary);font-weight:500;">${typeName}</span></td>
                                <td style="color:var(--text-muted);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.comment || '-'}</td>
                                <td>
                                    <span class="utxo-status ${expired ? 'spent' : 'available'}">${expired ? 'Expired' : 'Active'}</span>
                                </td>
                                <td style="text-align:right;">
                                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                                        <button class="action-btn" onclick="copyToClipboard('${a.address}')" title="Copy Address" style="padding:8px 12px;">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                                            Copy
                                        </button>
                                        <button class="action-btn" onclick="deleteAddress('${a.address}')" title="Delete Address" style="padding:8px 12px;color:var(--error);">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    } else {
        // Mobile: Card layout
        container.innerHTML = addrs.map(a => {
            const expired = a.expired || (a.expire && a.expire < now);
            const addrShort = a.address.substring(0, 12) + '...' + a.address.substring(a.address.length - 8);
            const typeName = typeNames[a.type] || a.type || 'SBBS';

            return `
                <div class="address-card" style="background:var(--bg-tertiary);border-radius:12px;padding:12px;margin-bottom:8px;${expired ? 'opacity:0.5;' : ''}">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                                <span class="utxo-status ${expired ? 'spent' : 'available'}" style="font-size:10px;">${expired ? 'Expired' : 'Active'}</span>
                                <span style="color:var(--accent-primary);font-size:11px;font-weight:500;">${typeName}</span>
                            </div>
                            <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-primary);cursor:pointer;word-break:break-all;"
                                 onclick="copyToClipboard('${a.address}')" title="Click to copy">
                                ${addrShort}
                            </div>
                            ${a.comment ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${a.comment}</div>` : ''}
                        </div>
                        <div style="display:flex;gap:6px;margin-left:8px;">
                            <button class="action-btn" onclick="copyToClipboard('${a.address}')" title="Copy" style="padding:6px;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                            </button>
                            <button class="action-btn" onclick="deleteAddress('${a.address}')" title="Delete" style="padding:6px;color:var(--error);">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Delete address
async function deleteAddress(address) {
    if (!confirm('Are you sure you want to delete this address?')) return;

    try {
        await apiCall('delete_address', { address });
        showToast('Address deleted', 'success');
        await loadAddresses();
    } catch (e) {
        showToast('Failed to delete address: ' + e.message, 'error');
    }
}

// Copy to clipboard helper
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(e => {
        showToast('Failed to copy', 'error');
    });
}

// =============================================
// DEX FUNCTIONALITY
// =============================================
const DEX_CID = '729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf';
let dexPools = [];
// Default pair: BEAM → FOMO
let dexFromAsset = { aid: 0, symbol: 'BEAM', name: 'BEAM', color: '#25c2a0', icon: ASSET_ICONS[0] };
let dexToAsset = { aid: 174, symbol: 'FOMO', name: 'FOMO', color: '#60a5fa', icon: ASSET_ICONS[174] };
let dexQuote = null;
let quoteDebounceTimer = null;
let tokenSelectMode = 'from'; // 'from', 'to', 'liq-a', 'liq-b'
let pendingPoolCreate = null; // Store pool create info

// Show DEX tab
async function showDexTab(tab) {
    document.querySelectorAll('.dex-tab').forEach(t => t.classList.toggle('active', t.dataset.dexTab === tab));
    document.querySelectorAll('.dex-panel').forEach(p => p.classList.toggle('active', p.id === 'dex-' + tab));
    if (tab === 'pools') loadDexPools();
    if (tab === 'liquidity') {
        // Ensure pools are loaded before initializing liquidity UI
        if (dexPools.length === 0) await loadDexPools();
        initLiquidityAdd();
    }
}

// Load DEX pools
let dexAvailable = false;

async function loadDexPools() {
    const container = document.getElementById('pools-list');
    container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);">Loading pools...</div>';

    try {
        const result = await apiCall('invoke_contract', {
            args: `action=pools_view,cid=${DEX_CID}`,
            contract: typeof DEX_SHADER !== 'undefined' ? DEX_SHADER : undefined
        });

        // Check for error response
        if (result?.error) {
            throw new Error(result.error.message || 'Contract call failed');
        }

        let output = result;
        if (result?.output) {
            try { output = JSON.parse(result.output); } catch(e) {}
        }

        const allPools = output?.res || [];

        if (allPools.length === 0 && !result?.output) {
            throw new Error('No pools data returned');
        }

        // Filter pools with liquidity
        dexPools = allPools.filter(p => p.tok1 > 0 && p.tok2 > 0);

        // Sort by BEAM reserve
        dexPools.sort((a, b) => {
            const aBeam = a.aid1 === 0 ? a.tok1 : (a.aid2 === 0 ? a.tok2 : 0);
            const bBeam = b.aid1 === 0 ? b.tok1 : (b.aid2 === 0 ? b.tok2 : 0);
            return bBeam - aBeam;
        });

        dexAvailable = true;
        renderDexPools();
    } catch (e) {
        console.error('Load pools error:', e);
        dexAvailable = false;

        // Show informative error with explanation
        container.innerHTML = `
            <div style="text-align:center;padding:32px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" width="48" height="48" style="margin-bottom:16px;">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <h3 style="margin-bottom:8px;color:var(--warning);">DEX Unavailable</h3>
                <p style="color:var(--text-secondary);margin-bottom:16px;max-width:400px;margin-left:auto;margin-right:auto;">
                    DEX features require a node with shader support. Public nodes typically don't support smart contract calls.
                </p>
                <p style="color:var(--text-muted);font-size:12px;margin-bottom:20px;">
                    To use DEX: Switch to a local node in Settings
                </p>
                <button class="quick-btn" onclick="showPage('settings')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-right:8px;">
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                    </svg>
                    Go to Settings
                </button>
            </div>
        `;
    }
}

// Render pools list
// Render token icon (with image or fallback to initials)
function renderTokenIcon(asset, size = 32) {
    const initials = (asset.symbol || 'XX').substring(0, 2).toUpperCase();
    if (asset.icon) {
        // No background when icon exists - transparent container
        return `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;">
            <img src="${asset.icon}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentNode.style.background='${asset.color || '#333'}';this.parentNode.innerHTML='${initials}'">
        </div>`;
    }
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${asset.color || '#333'};display:flex;align-items:center;justify-content:center;font-size:${size * 0.4}px;font-weight:600;">${initials}</div>`;
}

function renderDexPools() {
    const container = document.getElementById('pools-list');
    const countEl = document.getElementById('pools-count');

    // Get filter values
    const minBeamInput = document.getElementById('pool-min-beam');
    const showLowLpCheckbox = document.getElementById('pool-show-low-lp');
    const minBeamReserve = (parseFloat(minBeamInput?.value) || 0) * GROTH; // Convert to groth
    const showLowLp = showLowLpCheckbox?.checked || false;

    // Low LP threshold: 100 BEAM equivalent in total reserves
    const LOW_LP_THRESHOLD = 100 * GROTH;

    // Filter pools
    const filteredPools = dexPools.filter(p => {
        // Get BEAM reserve
        const beamReserve = p.aid1 === 0 ? p.tok1 : (p.aid2 === 0 ? p.tok2 : 0);

        // Check min BEAM reserve filter
        if (minBeamReserve > 0 && beamReserve < minBeamReserve) return false;

        // Check low LP filter (if checkbox is NOT checked, hide low LP pools)
        if (!showLowLp) {
            const totalReserve = p.tok1 + p.tok2;
            if (totalReserve < LOW_LP_THRESHOLD) return false;
        }

        return true;
    });

    // Update count
    if (countEl) {
        countEl.textContent = `${filteredPools.length} of ${dexPools.length} pools`;
    }

    if (filteredPools.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);">
            No pools match your filters
            <br><small style="color:var(--text-muted);">Try lowering minimum reserve or enabling low liquidity pools</small>
        </div>`;
        return;
    }

    container.innerHTML = filteredPools.map(p => {
        const a1 = getAssetInfo(p.aid1);
        const a2 = getAssetInfo(p.aid2);
        const reserve1 = formatAmount(p.tok1);
        const reserve2 = formatAmount(p.tok2);
        const feeLabel = p.kind === 1 ? '0.1%' : p.kind === 2 ? '0.3%' : '0.5%';
        const feeClass = p.kind === 1 ? 'success' : p.kind === 2 ? 'warning' : 'error';
        const rate = p.tok1 > 0 ? (p.tok2 / p.tok1).toFixed(4).replace(/,/g, '.') : '-';
        const lpToken = p['lp-token'] || '-';
        const lpTokenInfo = getAssetInfo(p['lp-token']);
        const lpSupply = p.ctl ? formatAmount(p.ctl) : '-';

        // Check if this is a low liquidity pool
        const beamReserve = p.aid1 === 0 ? p.tok1 : (p.aid2 === 0 ? p.tok2 : 0);
        const isLowLp = beamReserve < LOW_LP_THRESHOLD;
        const lowLpBadge = isLowLp ? '<span style="font-size:9px;padding:2px 6px;background:var(--warning);color:#000;border-radius:4px;margin-left:8px;">LOW LP</span>' : '';

        return `
            <div class="pool-card" onclick="selectPoolForSwap(${p.aid1}, ${p.aid2})" style="cursor:pointer;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                    <div style="display:flex;margin-right:4px;">
                        ${renderTokenIcon(a1, 36)}
                        <div style="margin-left:-12px;">${renderTokenIcon(a2, 36)}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;font-size:16px;">${a1.symbol} / ${a2.symbol}${lowLpBadge}</div>
                        <div style="font-size:11px;color:var(--text-muted);">LP: ${lpTokenInfo.symbol || '#' + lpToken}</div>
                    </div>
                    <span style="margin-left:auto;font-size:11px;padding:3px 10px;background:var(--${feeClass});color:#fff;border-radius:12px;font-weight:500;">${feeLabel}</span>
                </div>
                <div class="pool-stats" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div style="background:var(--void);padding:10px;border-radius:8px;">
                        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${a1.symbol} Reserve</div>
                        <div style="font-family:'JetBrains Mono',monospace;font-size:14px;">${reserve1}</div>
                    </div>
                    <div style="background:var(--void);padding:10px;border-radius:8px;">
                        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${a2.symbol} Reserve</div>
                        <div style="font-family:'JetBrains Mono',monospace;font-size:14px;">${reserve2}</div>
                    </div>
                    <div style="background:var(--void);padding:10px;border-radius:8px;">
                        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Rate</div>
                        <div style="font-family:'JetBrains Mono',monospace;font-size:14px;">1 : ${rate}</div>
                    </div>
                    <div style="background:var(--void);padding:10px;border-radius:8px;">
                        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">LP Supply</div>
                        <div style="font-family:'JetBrains Mono',monospace;font-size:14px;">${lpSupply}</div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;margin-top:12px;">
                    <button class="quick-btn" onclick="event.stopPropagation();openLiquidityModal(${p.aid1},${p.aid2},${p.kind},'add')" style="flex:1;font-size:12px;">+ Add Liquidity</button>
                    <button class="quick-btn" onclick="event.stopPropagation();openLiquidityModal(${p.aid1},${p.aid2},${p.kind},'remove')" style="flex:1;font-size:12px;">- Remove</button>
                </div>
            </div>
        `;
    }).join('');
}

// Get asset info from config or cache
function getAssetInfo(aid) {
    // Priority tokens from config (with local/known icons)
    const config = ASSET_CONFIG[aid];
    if (config) return { aid, ...config };

    // Check allAssetsCache for assets from assets_list
    const cached = allAssetsCache.find(a => a.asset_id === aid);
    if (cached) {
        // metadata_pairs is an object with keys like {N: "Name", UN: "Symbol", ...}
        // Also check metadata if it's already an object (parsed by assets_list)
        let meta = cached.metadata_pairs || {};

        // If metadata_pairs is empty, check if metadata is already an object
        if (Object.keys(meta).length === 0 && cached.metadata && typeof cached.metadata === 'object') {
            meta = cached.metadata;
        }

        // If still empty and metadata is a string, parse it
        if (Object.keys(meta).length === 0 && typeof cached.metadata === 'string') {
            // Parse metadata string like "STD:SCH_VER=1;N=Name;UN=SYM..."
            const parsed = {};
            cached.metadata.replace(/^STD:/, '').split(';').forEach(pair => {
                const [key, ...valueParts] = pair.split('=');
                if (key) parsed[key.trim()] = valueParts.join('=').trim();
            });
            meta = parsed;
        }

        // Parse icon from metadata
        let icon = meta.OPT_ICON_URL || meta.OPT_LOGO_URL || meta.OPT_FAVICON_URL || meta.ICON || null;

        // Check ASSET_ICONS as fallback
        if (!icon && ASSET_ICONS[aid]) {
            icon = ASSET_ICONS[aid];
        }

        let name = meta.N || meta.name || `Asset #${aid}`;
        let symbol = meta.UN || meta.SN || meta.symbol || `A${aid}`;

        // Check if this is an LP token (AMM Liquidity Token)
        // Format: "Amm Liquidity Token X-Y-Z" where X, Y are asset IDs
        const lpMatch = name.match(/Amm Liquidity Token (\d+)-(\d+)-(\d+)/i);
        if (lpMatch || symbol === 'AMML') {
            const aid1 = lpMatch ? parseInt(lpMatch[1]) : null;
            const aid2 = lpMatch ? parseInt(lpMatch[2]) : null;

            // Get the paired asset names for better display
            if (aid1 !== null && aid2 !== null) {
                const asset1 = getAssetInfoBasic(aid1);
                const asset2 = getAssetInfoBasic(aid2);
                name = `${asset1.symbol}/${asset2.symbol} LP Token`;
                symbol = `${asset1.symbol}/${asset2.symbol}`;
            } else {
                name = 'LP Token (DEX)';
            }

            return {
                aid,
                name,
                symbol,
                color: 'linear-gradient(135deg, #25c2a0, #60a5fa)',
                icon: null,
                isLpToken: true,
                lpPair: lpMatch ? { aid1, aid2, kind: parseInt(lpMatch[3]) } : null
            };
        }

        return {
            aid,
            name,
            symbol,
            color: meta.OPT_COLOR || `hsl(${(aid * 137) % 360}, 50%, 50%)`,
            icon: icon
        };
    }

    // Check if this might be an LP token based on pools
    const lpPool = dexPools.find(p => p['lp-token'] === aid);
    if (lpPool) {
        const asset1 = getAssetInfoBasic(lpPool.aid1);
        const asset2 = getAssetInfoBasic(lpPool.aid2);
        return {
            aid,
            name: `${asset1.symbol}/${asset2.symbol} LP Token`,
            symbol: `${asset1.symbol}/${asset2.symbol}`,
            color: 'linear-gradient(135deg, #25c2a0, #60a5fa)',
            icon: null,
            isLpToken: true,
            lpPair: { aid1: lpPool.aid1, aid2: lpPool.aid2, kind: lpPool.kind }
        };
    }

    return {
        aid,
        name: `Asset #${aid}`,
        symbol: `A${aid}`,
        color: `hsl(${(aid * 137) % 360}, 50%, 50%)`,
        icon: null
    };
}

// Basic asset info without recursion (for LP token name resolution)
function getAssetInfoBasic(aid) {
    const config = ASSET_CONFIG[aid];
    if (config) return { aid, symbol: config.symbol, name: config.name };

    const cached = allAssetsCache.find(a => a.asset_id === aid);
    if (cached) {
        const pairs = cached.metadata_pairs || {};
        return {
            aid,
            symbol: pairs.UN || pairs.SN || `A${aid}`,
            name: pairs.N || `Asset #${aid}`
        };
    }

    return { aid, symbol: `A${aid}`, name: `Asset #${aid}` };
}

// Select pool for swap
function selectPoolForSwap(aid1, aid2) {
    dexFromAsset = getAssetInfo(aid1);
    dexToAsset = getAssetInfo(aid2);
    updateSwapUI();
    showDexTab('swap');
    document.getElementById('dex-from-amount').value = '1';
    debounceGetQuote();
}

// =============================================
// LIQUIDITY FUNCTIONS
// =============================================
let currentLiqPool = null;
let currentLiqMode = 'add'; // 'add' or 'remove'

function openLiquidityModal(aid1, aid2, kind, mode) {
    currentLiqMode = mode;
    const pool = dexPools.find(p => p.aid1 === aid1 && p.aid2 === aid2 && p.kind === kind);
    if (!pool) {
        showToast('Pool not found', 'error');
        return;
    }
    currentLiqPool = pool;

    const a1 = getAssetInfo(aid1);
    const a2 = getAssetInfo(aid2);

    // Update modal title
    document.getElementById('liquidity-modal-title').textContent = mode === 'add' ? 'Add Liquidity' : 'Remove Liquidity';

    // Update pool info
    document.getElementById('liq-pool-icons').innerHTML = renderTokenIcon(a1, 32) + '<div style="margin-left:-10px;">' + renderTokenIcon(a2, 32) + '</div>';
    document.getElementById('liq-pool-name').textContent = `${a1.symbol} / ${a2.symbol}`;
    document.getElementById('liq-pool-fee').textContent = `Fee: ${kind === 1 ? '0.1%' : '0.3%'}`;

    // Update labels
    document.getElementById('liq-asset1-label').textContent = a1.symbol;
    document.getElementById('liq-asset2-label').textContent = a2.symbol;

    // Get balances
    const bal1 = walletData.assets.find(a => a.id === aid1);
    const bal2 = walletData.assets.find(a => a.id === aid2);
    document.getElementById('liq-balance1').textContent = bal1 ? formatAmount(bal1.balance) : '0';
    document.getElementById('liq-balance2').textContent = bal2 ? formatAmount(bal2.balance) : '0';

    // Get LP balance
    const lpToken = pool['lp-token'];
    const lpBal = walletData.assets.find(a => a.id === lpToken);
    document.getElementById('liq-lp-balance').textContent = lpBal ? formatAmount(lpBal.balance) : '0';

    // Show/hide panels
    document.getElementById('liq-add-panel').style.display = mode === 'add' ? 'block' : 'none';
    document.getElementById('liq-remove-panel').style.display = mode === 'remove' ? 'block' : 'none';

    // Clear inputs
    document.getElementById('liq-amount1').value = '';
    document.getElementById('liq-amount2').value = '';
    document.getElementById('liq-remove-amount').value = '';
    document.getElementById('liq-add-info').style.display = 'none';

    // Update pool rate
    if (pool.tok1 > 0 && pool.tok2 > 0) {
        const rate = formatForInput(pool.tok2 / pool.tok1, 6);
        document.getElementById('liq-rate').textContent = `1 ${a1.symbol} = ${rate} ${a2.symbol}`;
    }

    updateLiqAddButton();
    updateLiqRemoveButton();
    openModal('liquidity-modal');
}

function calculateLiquidityRatio() {
    if (!currentLiqPool) return;
    const pool = currentLiqPool;
    const a1 = getAssetInfo(pool.aid1);
    const a2 = getAssetInfo(pool.aid2);

    const amt1 = parseFloat(document.getElementById('liq-amount1').value) || 0;
    const amt2 = parseFloat(document.getElementById('liq-amount2').value) || 0;

    if (amt1 > 0 && pool.tok1 > 0 && pool.tok2 > 0) {
        // Calculate required amount2 based on pool ratio
        const ratio = pool.tok2 / pool.tok1;
        const requiredAmt2 = amt1 * ratio;
        document.getElementById('liq-amount2').value = formatForInput(requiredAmt2, 6);

        // Show info
        document.getElementById('liq-rate').textContent = `1 ${a1.symbol} = ${formatForInput(ratio, 6)} ${a2.symbol}`;
        document.getElementById('liq-add-info').style.display = 'block';
    }

    updateLiqAddButton();
}

function updateLiqAddButton() {
    const btn = document.getElementById('liq-add-btn');
    const amt1 = parseFloat(document.getElementById('liq-amount1').value) || 0;
    const amt2 = parseFloat(document.getElementById('liq-amount2').value) || 0;

    if (amt1 > 0 && amt2 > 0) {
        btn.disabled = false;
        btn.textContent = 'Add Liquidity';
    } else {
        btn.disabled = true;
        btn.textContent = 'Enter amounts';
    }
}

function updateLiqRemoveButton() {
    const btn = document.getElementById('liq-remove-btn');
    const amt = parseFloat(document.getElementById('liq-remove-amount').value) || 0;

    if (amt > 0) {
        btn.disabled = false;
        btn.textContent = 'Remove Liquidity';
    } else {
        btn.disabled = true;
        btn.textContent = 'Enter amount';
    }
}

function setRemovePercent(percent) {
    if (!currentLiqPool) return;
    const lpToken = currentLiqPool['lp-token'];
    const lpBal = walletData.assets.find(a => a.id === lpToken);
    if (lpBal && lpBal.balance > 0) {
        const amount = (lpBal.balance * percent / 100) / GROTH;
        document.getElementById('liq-remove-amount').value = formatForInput(amount, 6);
        updateLiqRemoveButton();
    }
}

// Pending liquidity operation
let pendingLiqOp = null;

// Add Liquidity - show confirmation first
function addLiquidity() {
    if (!currentLiqPool) return;

    const pool = currentLiqPool;
    const amt1 = parseFloat(document.getElementById('liq-amount1').value) || 0;
    const amt2 = parseFloat(document.getElementById('liq-amount2').value) || 0;

    if (amt1 <= 0 || amt2 <= 0) {
        showToast('Enter valid amounts', 'error');
        return;
    }

    const a1 = getAssetInfo(pool.aid1);
    const a2 = getAssetInfo(pool.aid2);

    // Estimate LP tokens to receive
    const totalLiquidity = Math.sqrt(pool.tok1 * pool.tok2);
    const lpEstimate = totalLiquidity > 0 ? (amt1 * GROTH * pool.ctl) / pool.tok1 : 0;
    const lpEstimateFormatted = formatAmount(lpEstimate);

    // Store pending operation
    pendingLiqOp = {
        type: 'add',
        pool,
        amt1,
        amt2,
        amount1Groth: Math.floor(amt1 * GROTH),
        a1,
        a2,
        lpEstimate: lpEstimateFormatted
    };

    // Build confirmation content
    const content = document.getElementById('liq-confirm-content');
    document.getElementById('liq-confirm-title').textContent = 'Confirm Add Liquidity';

    content.innerHTML = `
        <!-- You're Adding -->
        <div class="confirm-swap-asset spending">
            <div class="confirm-asset-icon" style="background: ${a1.color || '#64748b'}">
                ${a1.symbol.substring(0, 2)}
            </div>
            <div class="confirm-asset-info">
                <div class="confirm-asset-label spending">You're Adding</div>
                <div class="confirm-asset-name">${a1.name}</div>
            </div>
            <div class="confirm-asset-amount spending">
                <span class="amount">-${amt1}</span>
                <span class="symbol">${a1.symbol}</span>
            </div>
        </div>

        <div class="confirm-swap-asset spending" style="margin-top: 8px;">
            <div class="confirm-asset-icon" style="background: ${a2.color || '#64748b'}">
                ${a2.symbol.substring(0, 2)}
            </div>
            <div class="confirm-asset-info">
                <div class="confirm-asset-name">${a2.name}</div>
            </div>
            <div class="confirm-asset-amount spending">
                <span class="amount">-${amt2}</span>
                <span class="symbol">${a2.symbol}</span>
            </div>
        </div>

        <!-- Arrow -->
        <div class="confirm-swap-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
        </div>

        <!-- You'll Receive -->
        <div class="confirm-swap-asset receiving">
            <div class="confirm-asset-icon" style="background: linear-gradient(135deg, ${a1.color || '#64748b'}, ${a2.color || '#64748b'})">
                LP
            </div>
            <div class="confirm-asset-info">
                <div class="confirm-asset-label receiving">You'll Receive (est.)</div>
                <div class="confirm-asset-name">${a1.symbol}/${a2.symbol} LP</div>
                <div class="confirm-asset-id">LP Token #${pool['lp-token']}</div>
            </div>
            <div class="confirm-asset-amount receiving">
                <span class="amount">+${lpEstimateFormatted}</span>
                <span class="symbol">LP</span>
            </div>
        </div>

        <!-- Details -->
        <div class="confirm-swap-details">
            <div class="confirm-swap-row">
                <span class="confirm-swap-label">Pool</span>
                <span class="confirm-swap-value">${a1.symbol} / ${a2.symbol}</span>
            </div>
            <div class="confirm-swap-row">
                <span class="confirm-swap-label">Pool Fee</span>
                <span class="confirm-swap-value">${pool.kind === 1 ? '0.1%' : '0.3%'}</span>
            </div>
        </div>

        <!-- Buttons -->
        <div class="confirm-buttons">
            <button class="btn btn-cancel" onclick="closeModal('liquidity-confirm-modal')">Cancel</button>
            <button class="btn btn-confirm" onclick="executeAddLiquidityFromPoolModal()">Confirm Add</button>
        </div>
    `;

    closeModal('liquidity-modal');
    openModal('liquidity-confirm-modal');
}

// Execute add liquidity after confirmation (from Pool card modal)
async function executeAddLiquidityFromPoolModal() {
    if (!pendingLiqOp || pendingLiqOp.type !== 'add') return;

    closeModal('liquidity-confirm-modal');

    const { pool, amt1, amount1Groth, a1, a2 } = pendingLiqOp;

    showToastAdvanced('Adding Liquidity', `${a1.symbol} + ${a2.symbol}`, 'pending');

    try {
        const args = `action=pool_add_liquidity,aid1=${pool.aid1},aid2=${pool.aid2},kind=${pool.kind},val1=${amount1Groth},bCoversAll=1,cid=${DEX_CID}`;

        const result = await apiCall('invoke_contract', { args, create_tx: true });

        // Check for success - either txid (direct creation) or raw_data (needs processing)
        const isSuccess = result?.txid || result?.raw_data;
        let txid = result?.txid;

        if (result?.raw_data && !result?.txid) {
            const txResult = await apiCall('process_invoke_data', { data: result.raw_data });
            txid = txResult?.txid;
        }

        if (isSuccess) {
            showToastAdvanced('Liquidity Added!', `TX: ${(txid || 'pending').slice(0, 16)}...`, 'success');
            setTimeout(loadDexPools, 2000);
            await loadWalletData();
            renderAssetCards();
            // Show donation popup after successful liquidity add
            setTimeout(() => showDonationPopup(), 2000);
        } else if (result?.error) {
            throw new Error(result.error.message || 'No transaction data');
        } else {
            throw new Error('Unexpected response from contract');
        }
    } catch (e) {
        showToast('Failed: ' + e.message, 'error');
    }

    pendingLiqOp = null;
}

// Remove Liquidity - show confirmation first
function removeLiquidity() {
    if (!currentLiqPool) return;

    const pool = currentLiqPool;
    const amt = parseFloat(document.getElementById('liq-remove-amount').value) || 0;

    if (amt <= 0) {
        showToast('Enter valid amount', 'error');
        return;
    }

    const a1 = getAssetInfo(pool.aid1);
    const a2 = getAssetInfo(pool.aid2);

    // Estimate assets to receive
    const ctlAmount = Math.floor(amt * GROTH);
    const shareRatio = pool.ctl > 0 ? ctlAmount / pool.ctl : 0;
    const estAsset1 = shareRatio * pool.tok1;
    const estAsset2 = shareRatio * pool.tok2;

    // Store pending operation
    pendingLiqOp = {
        type: 'remove',
        pool,
        amt,
        ctlAmount,
        a1,
        a2,
        estAsset1: formatAmount(estAsset1),
        estAsset2: formatAmount(estAsset2)
    };

    // Build confirmation content
    const content = document.getElementById('liq-confirm-content');
    document.getElementById('liq-confirm-title').textContent = 'Confirm Remove Liquidity';

    content.innerHTML = `
        <!-- You're Removing -->
        <div class="confirm-swap-asset spending">
            <div class="confirm-asset-icon" style="background: linear-gradient(135deg, ${a1.color || '#64748b'}, ${a2.color || '#64748b'})">
                LP
            </div>
            <div class="confirm-asset-info">
                <div class="confirm-asset-label spending">You're Removing</div>
                <div class="confirm-asset-name">${a1.symbol}/${a2.symbol} LP</div>
                <div class="confirm-asset-id">LP Token #${pool['lp-token']}</div>
            </div>
            <div class="confirm-asset-amount spending">
                <span class="amount">-${amt}</span>
                <span class="symbol">LP</span>
            </div>
        </div>

        <!-- Arrow -->
        <div class="confirm-swap-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
        </div>

        <!-- You'll Receive -->
        <div class="confirm-swap-asset receiving">
            <div class="confirm-asset-icon" style="background: ${a1.color || '#64748b'}">
                ${a1.symbol.substring(0, 2)}
            </div>
            <div class="confirm-asset-info">
                <div class="confirm-asset-label receiving">You'll Receive (est.)</div>
                <div class="confirm-asset-name">${a1.name}</div>
            </div>
            <div class="confirm-asset-amount receiving">
                <span class="amount">+${formatAmount(estAsset1)}</span>
                <span class="symbol">${a1.symbol}</span>
            </div>
        </div>

        <div class="confirm-swap-asset receiving" style="margin-top: 8px;">
            <div class="confirm-asset-icon" style="background: ${a2.color || '#64748b'}">
                ${a2.symbol.substring(0, 2)}
            </div>
            <div class="confirm-asset-info">
                <div class="confirm-asset-name">${a2.name}</div>
            </div>
            <div class="confirm-asset-amount receiving">
                <span class="amount">+${formatAmount(estAsset2)}</span>
                <span class="symbol">${a2.symbol}</span>
            </div>
        </div>

        <!-- Details -->
        <div class="confirm-swap-details">
            <div class="confirm-swap-row">
                <span class="confirm-swap-label">Pool</span>
                <span class="confirm-swap-value">${a1.symbol} / ${a2.symbol}</span>
            </div>
            <div class="confirm-swap-row">
                <span class="confirm-swap-label">Your Share</span>
                <span class="confirm-swap-value">${(shareRatio * 100).toFixed(4)}%</span>
            </div>
        </div>

        <!-- Buttons -->
        <div class="confirm-buttons">
            <button class="btn btn-cancel" onclick="closeModal('liquidity-confirm-modal')">Cancel</button>
            <button class="btn btn-confirm" style="background: var(--error);" onclick="executeRemoveLiquidity()">Confirm Remove</button>
        </div>
    `;

    closeModal('liquidity-modal');
    openModal('liquidity-confirm-modal');
}

// Execute remove liquidity after confirmation
async function executeRemoveLiquidity() {
    if (!pendingLiqOp || pendingLiqOp.type !== 'remove') return;

    closeModal('liquidity-confirm-modal');

    const { pool, ctlAmount, a1, a2 } = pendingLiqOp;

    showToastAdvanced('Removing Liquidity', `${a1.symbol} / ${a2.symbol}`, 'pending');

    try {
        const args = `action=pool_withdraw,aid1=${pool.aid1},aid2=${pool.aid2},kind=${pool.kind},ctl=${ctlAmount},cid=${DEX_CID}`;

        const result = await apiCall('invoke_contract', { args, create_tx: true });

        // Check for success - either txid (direct creation) or raw_data (needs processing)
        const isSuccess = result?.txid || result?.raw_data;
        let txid = result?.txid;

        if (result?.raw_data && !result?.txid) {
            const txResult = await apiCall('process_invoke_data', { data: result.raw_data });
            txid = txResult?.txid;
        }

        if (isSuccess) {
            showToastAdvanced('Liquidity Removed!', `TX: ${(txid || 'pending').slice(0, 16)}...`, 'success');
            setTimeout(loadDexPools, 2000);
            await loadWalletData();
            renderAssetCards();
            // Show donation popup after successful liquidity removal
            setTimeout(() => showDonationPopup(), 2000);
        } else if (result?.error) {
            throw new Error(result.error.message || 'No transaction data');
        } else {
            throw new Error('Unexpected response from contract');
        }
    } catch (e) {
        showToast('Failed: ' + e.message, 'error');
    }

    pendingLiqOp = null;
}

// Update swap UI
function updateSwapUI() {
    if (dexFromAsset) {
        document.getElementById('dex-from-symbol').textContent = dexFromAsset.symbol;
        const fromIcon = document.getElementById('dex-from-icon');

        // Use icon if available - no background when icon exists
        if (dexFromAsset.icon) {
            fromIcon.style.background = 'transparent';
            fromIcon.innerHTML = `<img src="${dexFromAsset.icon}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentNode.style.background='${dexFromAsset.color}';this.parentNode.textContent='${dexFromAsset.symbol.substring(0,2).toUpperCase()}'">`;
        } else {
            fromIcon.style.background = dexFromAsset.color;
            fromIcon.textContent = dexFromAsset.symbol.substring(0, 2).toUpperCase();
        }

        // Update balance
        const asset = walletData.assets.find(a => a.id === dexFromAsset.aid);
        document.getElementById('dex-from-balance').textContent = asset ? formatAmount(asset.balance) : '0';
    }

    if (dexToAsset) {
        document.getElementById('dex-to-symbol').textContent = dexToAsset.symbol;
        const toIcon = document.getElementById('dex-to-icon');

        // Use icon if available - no background when icon exists
        if (dexToAsset.icon) {
            toIcon.style.background = 'transparent';
            toIcon.innerHTML = `<img src="${dexToAsset.icon}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentNode.style.background='${dexToAsset.color}';this.parentNode.textContent='${dexToAsset.symbol.substring(0,2).toUpperCase()}'">`;
        } else {
            toIcon.style.background = dexToAsset.color;
            toIcon.textContent = dexToAsset.symbol.substring(0, 2).toUpperCase();
        }
    }

    updateSwapButton();
}

// Swap direction
function swapDirection() {
    [dexFromAsset, dexToAsset] = [dexToAsset, dexFromAsset];
    updateSwapUI();
    debounceGetQuote();
}

// Debounced quote
function debounceGetQuote() {
    clearTimeout(quoteDebounceTimer);
    quoteDebounceTimer = setTimeout(getDexQuote, 500);
}

// Get swap quote
async function getDexQuote() {
    const amount = parseFloat(document.getElementById('dex-from-amount').value) || 0;
    const toAmountEl = document.getElementById('dex-to-amount');
    const infoEl = document.getElementById('dex-swap-info');

    if (!dexFromAsset || !dexToAsset || amount <= 0) {
        toAmountEl.value = '';
        infoEl.style.display = 'none';
        dexQuote = null;
        updateSwapButton();
        return;
    }

    toAmountEl.value = '...';

    try {
        // Find pool
        const pool = dexPools.find(p =>
            (p.aid1 === dexFromAsset.aid && p.aid2 === dexToAsset.aid) ||
            (p.aid1 === dexToAsset.aid && p.aid2 === dexFromAsset.aid)
        );

        if (!pool) {
            toAmountEl.value = 'No pool';
            dexQuote = null;
            pendingPoolCreate = { aid1: dexFromAsset.aid, aid2: dexToAsset.aid };
            showCreatePoolPrompt();
            return;
        }
        pendingPoolCreate = null;

        // Determine call order
        let callAid1, callAid2;
        if (dexFromAsset.aid === pool.aid2) {
            callAid1 = pool.aid1;
            callAid2 = pool.aid2;
        } else {
            callAid1 = pool.aid2;
            callAid2 = pool.aid1;
        }

        const amountSmall = Math.round(amount * GROTH);
        const args = `action=pool_trade,aid1=${callAid1},aid2=${callAid2},kind=${pool.kind},val1_buy=0,val2_pay=${amountSmall},bPredictOnly=1`;

        const result = await apiCall('invoke_contract', {
            args: `${args},cid=${DEX_CID}`,
            contract: typeof DEX_SHADER !== 'undefined' ? DEX_SHADER : undefined
        });

        let output = result;
        if (result?.output) {
            try { output = JSON.parse(result.output); } catch(e) {}
        }

        const r = output?.res || output || {};
        const buyAmount = r.buy || 0;
        const payAmount = r.pay || amountSmall;
        const fee = r.fee_pool || 0;

        const buyFormatted = buyAmount / GROTH;
        const payFormatted = payAmount / GROTH;
        const feeFormatted = fee / GROTH;
        const minReceive = buyFormatted * 0.995; // 0.5% slippage

        // Update output amount - always use dot as decimal separator
        toAmountEl.value = formatForInput(buyFormatted, 6);

        // Update swap info display - matching AllDapps format
        document.getElementById('dex-rate').textContent = buyAmount > 0
            ? `1 ${dexToAsset.symbol} = ${formatForInput(payFormatted / buyFormatted, 6)} ${dexFromAsset.symbol}`
            : '-';
        document.getElementById('dex-pay').textContent = `${formatForInput(payFormatted, 6)} ${dexFromAsset.symbol}`;
        document.getElementById('dex-receive').textContent = `${formatForInput(buyFormatted, 6)} ${dexToAsset.symbol}`;
        document.getElementById('dex-fee').textContent = `${formatForInput(feeFormatted, 6)} ${dexToAsset.symbol}`;
        document.getElementById('dex-min-receive').textContent = `${formatForInput(minReceive, 6)} ${dexToAsset.symbol}`;
        infoEl.style.display = 'block';

        dexQuote = { pool, amountSmall: payAmount, callAid1, callAid2, buyAmount, fee };
        updateSwapButton();
    } catch (e) {
        console.error('Quote error:', e);
        toAmountEl.value = 'Error';
        dexQuote = null;
        updateSwapButton();
    }
}

// Update swap button state
function updateSwapButton() {
    const btn = document.getElementById('dex-swap-btn');

    // Reset onclick to executeSwap (in case it was changed to createPool)
    btn.onclick = executeSwap;

    if (!dexFromAsset || !dexToAsset) {
        btn.textContent = 'Select tokens';
        btn.disabled = true;
    } else if (pendingPoolCreate) {
        btn.textContent = `Create ${dexFromAsset.symbol}/${dexToAsset.symbol} Pool`;
        btn.disabled = false;
        btn.onclick = openCreatePoolModal;
    } else if (!dexQuote) {
        btn.textContent = 'Enter amount';
        btn.disabled = true;
    } else {
        btn.textContent = `Swap ${dexFromAsset.symbol} for ${dexToAsset.symbol}`;
        btn.disabled = false;
    }
}

// Show swap confirmation modal
function executeSwap() {
    if (!dexQuote) return;

    const fromAmount = document.getElementById('dex-from-amount').value;
    const toAmount = document.getElementById('dex-to-amount').value;
    const rate = dexQuote.buyAmount > 0
        ? (dexQuote.amountSmall / dexQuote.buyAmount).toFixed(6)
        : '-';
    const fee = (dexQuote.fee / GROTH).toFixed(6);

    // Get asset configs for icons
    const fromConfig = ASSET_CONFIG[dexFromAsset.aid] || { symbol: dexFromAsset.symbol, color: '#64748b' };
    const toConfig = ASSET_CONFIG[dexToAsset.aid] || { symbol: dexToAsset.symbol, color: '#64748b' };

    // Build icon HTML for "from" asset
    const fromIconHtml = fromConfig.icon
        ? `<img src="${fromConfig.icon}" onerror="this.style.display='none';this.parentNode.textContent='${fromConfig.symbol.substring(0,2)}'">`
        : fromConfig.symbol.substring(0, 2);
    const fromIconBg = fromConfig.icon ? 'transparent' : (fromConfig.color || '#64748b');

    // Build icon HTML for "to" asset
    const toIconHtml = toConfig.icon
        ? `<img src="${toConfig.icon}" onerror="this.style.display='none';this.parentNode.textContent='${toConfig.symbol.substring(0,2)}'">`
        : toConfig.symbol.substring(0, 2);
    const toIconBg = toConfig.icon ? 'transparent' : (toConfig.color || '#64748b');

    const content = document.getElementById('swap-confirm-content');
    content.innerHTML = `
        <!-- Spending (From) -->
        <div class="confirm-swap-asset spending">
            <div class="confirm-asset-icon" style="background: ${fromIconBg}">
                ${fromIconHtml}
            </div>
            <div class="confirm-asset-info">
                <div class="confirm-asset-label spending">You're Spending</div>
                <div class="confirm-asset-name">${fromConfig.name || dexFromAsset.symbol}</div>
                <div class="confirm-asset-id">${dexFromAsset.symbol} • ID #${dexFromAsset.aid}</div>
            </div>
            <div class="confirm-asset-amount spending">
                <span class="amount">-${fromAmount}</span>
                <span class="symbol">${dexFromAsset.symbol}</span>
            </div>
        </div>

        <!-- Arrow -->
        <div class="confirm-swap-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
        </div>

        <!-- Receiving (To) -->
        <div class="confirm-swap-asset receiving">
            <div class="confirm-asset-icon" style="background: ${toIconBg}">
                ${toIconHtml}
            </div>
            <div class="confirm-asset-info">
                <div class="confirm-asset-label receiving">You're Receiving</div>
                <div class="confirm-asset-name">${toConfig.name || dexToAsset.symbol}</div>
                <div class="confirm-asset-id">${dexToAsset.symbol} • ID #${dexToAsset.aid}</div>
            </div>
            <div class="confirm-asset-amount receiving">
                <span class="amount">+${toAmount}</span>
                <span class="symbol">${dexToAsset.symbol}</span>
            </div>
        </div>

        <!-- Swap Details -->
        <div class="confirm-swap-details">
            <div class="confirm-swap-row">
                <span class="confirm-swap-label">Exchange Rate</span>
                <span class="confirm-swap-value">1 ${dexToAsset.symbol} = ${rate} ${dexFromAsset.symbol}</span>
            </div>
            <div class="confirm-swap-row">
                <span class="confirm-swap-label">Pool Fee</span>
                <span class="confirm-swap-value">${fee} ${dexToAsset.symbol}</span>
            </div>
            <div class="confirm-swap-row">
                <span class="confirm-swap-label">Slippage Tolerance</span>
                <span class="confirm-swap-value">0.5%</span>
            </div>
        </div>

        <!-- Buttons -->
        <div class="confirm-buttons">
            <button class="btn btn-cancel" onclick="closeModal('swap-confirm-modal')">Cancel</button>
            <button class="btn btn-confirm" onclick="confirmAndExecuteSwap()">Confirm Swap</button>
        </div>
    `;

    openModal('swap-confirm-modal');
}

// Actually execute the swap after confirmation
let dexSwapInProgress = false;

async function confirmAndExecuteSwap() {
    closeModal('swap-confirm-modal');

    if (!dexQuote || dexSwapInProgress) return;
    dexSwapInProgress = true;

    const btn = document.getElementById('dex-swap-btn');
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Swapping...';

    // Show pending notification
    showToastAdvanced(
        'Swap Initiated',
        `${dexFromAsset.symbol} → ${dexToAsset.symbol}`,
        'pending'
    );

    try {
        const { pool, amountSmall, callAid1, callAid2 } = dexQuote;
        const args = `action=pool_trade,aid1=${callAid1},aid2=${callAid2},kind=${pool.kind},val1_buy=0,val2_pay=${amountSmall},bPredictOnly=0,cid=${DEX_CID}`;

        const result = await apiCall('invoke_contract', { args, create_tx: true });

        // Check for success - either txid (direct creation) or raw_data (needs processing)
        const isSuccess = result?.txid || result?.raw_data;

        if (result?.raw_data && !result?.txid) {
            // Need to process raw_data to create transaction
            await apiCall('process_invoke_data', { data: result.raw_data });
        }

        if (isSuccess) {
            // Success notification with swap details
            const fromAmount = document.getElementById('dex-from-amount').value;
            const toAmount = document.getElementById('dex-to-amount').value;

            showToastAdvanced(
                'Swap Submitted!',
                `${fromAmount} ${dexFromAsset.symbol} → ${toAmount} ${dexToAsset.symbol}`,
                'success'
            );

            // Clear form
            document.getElementById('dex-from-amount').value = '';
            document.getElementById('dex-to-amount').value = '';
            document.getElementById('dex-swap-info').style.display = 'none';
            dexQuote = null;

            // Refresh balances and show updated data
            await loadWalletData();
            renderAssetCards();

            // Refresh transactions to show the pending swap
            await loadTransactions();

            // Show liveness - flash the balance
            const assetCards = document.getElementById('asset-cards');
            assetCards.classList.add('data-refreshing');
            setTimeout(() => assetCards.classList.remove('data-refreshing'), 2000);

            // Show donation popup after successful swap
            setTimeout(() => showDonationPopup(), 2000);

        } else if (result?.error) {
            throw new Error(result.error.message || 'Contract error');
        } else {
            throw new Error('No transaction data returned');
        }
    } catch (e) {
        showToastAdvanced('Swap Failed', e.message, 'error');
    }

    dexSwapInProgress = false;
    updateSwapButton();
}

// Show Create Pool prompt when no pool exists
function showCreatePoolPrompt() {
    const btn = document.getElementById('dex-swap-btn');
    btn.textContent = 'Create Pool';
    btn.disabled = false;
    btn.onclick = () => openCreatePoolModal();
}

// Open create pool modal (with asset selection)
function openCreatePoolModal() {
    // Initialize from pendingPoolCreate or use defaults
    if (pendingPoolCreate) {
        createPoolToken1 = getAssetInfo(pendingPoolCreate.aid1);
        createPoolToken2 = getAssetInfo(pendingPoolCreate.aid2);
    } else if (!createPoolToken1 || !createPoolToken2) {
        createPoolToken1 = getAssetInfo(0);
        const availableAssets = walletData.assets.filter(a => a.id !== 0 && a.balance > 0);
        createPoolToken2 = availableAssets.length > 0 ? getAssetInfo(availableAssets[0].id) : null;
    }

    renderCreatePoolModal();
    openModal('create-pool-modal');
}

// Render create pool modal content
function renderCreatePoolModal() {
    const a1 = createPoolToken1;
    const a2 = createPoolToken2;

    if (!a1 || !a2) return;

    // Create modal if doesn't exist
    let modal = document.getElementById('create-pool-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'create-pool-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h2 class="modal-title">Create Liquidity Pool</h2>
                    <button class="modal-close" onclick="closeModal('create-pool-modal')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body" id="create-pool-body"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Check if pool already exists
    const existingPool = dexPools.find(p =>
        (p.aid1 === a1.aid && p.aid2 === a2.aid) ||
        (p.aid1 === a2.aid && p.aid2 === a1.aid)
    );

    // Get user balances
    const bal1 = walletData.assets.find(a => a.id === a1.aid);
    const bal2 = walletData.assets.find(a => a.id === a2.aid);
    const balance1 = bal1 ? formatAmount(bal1.balance) : '0';
    const balance2 = bal2 ? formatAmount(bal2.balance) : '0';

    // Update pendingPoolCreate with current selection
    pendingPoolCreate = { aid1: a1.aid, aid2: a2.aid };

    document.getElementById('create-pool-body').innerHTML = `
        <div style="padding: 8px 0;">
            <!-- Token Selection -->
            <div style="display: flex; justify-content: center; gap: 16px; align-items: center; margin-bottom: 16px;">
                <button class="token-select-btn" style="flex-direction: column; padding: 12px 20px; min-width: 100px;" onclick="openCreatePoolTokenSelector(1)">
                    <div class="token-icon-small" style="${a1.icon ? '' : `background: ${a1.color};`} width: 48px; height: 48px; font-size: 16px; margin-bottom: 8px;">
                        ${a1.icon ? `<img src="${a1.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${a1.color}';this.parentNode.textContent='${a1.symbol.substring(0,2)}'">` : a1.symbol.substring(0, 2)}
                    </div>
                    <div style="font-weight: 600;">${a1.symbol}</div>
                    <div style="font-size: 10px; color: var(--text-muted);">Click to change</div>
                </button>
                <div style="font-size: 24px; color: var(--text-muted);">+</div>
                <button class="token-select-btn" style="flex-direction: column; padding: 12px 20px; min-width: 100px;" onclick="openCreatePoolTokenSelector(2)">
                    <div class="token-icon-small" style="${a2.icon ? '' : `background: ${a2.color};`} width: 48px; height: 48px; font-size: 16px; margin-bottom: 8px;">
                        ${a2.icon ? `<img src="${a2.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${a2.color}';this.parentNode.textContent='${a2.symbol.substring(0,2)}'">` : a2.symbol.substring(0, 2)}
                    </div>
                    <div style="font-weight: 600;">${a2.symbol}</div>
                    <div style="font-size: 10px; color: var(--text-muted);">Click to change</div>
                </button>
            </div>

            ${existingPool ? `
                <div style="background: var(--warning-bg, rgba(245, 158, 11, 0.1)); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--warning);">
                    <div style="color: var(--warning); font-weight: 500; margin-bottom: 4px;">Pool Already Exists</div>
                    <div style="color: var(--text-secondary); font-size: 13px;">A ${a1.symbol}/${a2.symbol} pool already exists. Select different tokens or add liquidity to existing pool.</div>
                </div>
            ` : `
                <p style="color: var(--text-secondary); font-size: 13px; text-align: center; margin-bottom: 16px;">No pool exists for this pair. Create one to enable trading.</p>
            `}

            <div class="address-field" style="margin-bottom: 16px;">
                <div class="address-label">Fee Model</div>
                <select id="pool-fee-model" class="search-input" style="width: 100%; cursor: pointer;">
                    <option value="2">Standard (0.3% fee) - Recommended</option>
                    <option value="1">Stable (0.1% fee) - For stablecoins</option>
                    <option value="0">Volatile (0.5% fee) - For volatile pairs</option>
                </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                <div class="address-field">
                    <div class="address-label">${a1.symbol} Amount</div>
                    <input type="text" inputmode="decimal" id="pool-amount-1" class="search-input" style="width: 100%;" placeholder="0.00" oninput="sanitizeNumericInput(this)">
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                        Balance: ${balance1} ${a1.symbol}
                    </div>
                </div>
                <div class="address-field">
                    <div class="address-label">${a2.symbol} Amount</div>
                    <input type="text" inputmode="decimal" id="pool-amount-2" class="search-input" style="width: 100%;" placeholder="0.00" oninput="sanitizeNumericInput(this)">
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                        Balance: ${balance2} ${a2.symbol}
                    </div>
                </div>
            </div>

            <div style="background: var(--void); padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Initial Rate</div>
                <div id="pool-initial-rate" style="font-weight: 500;">Enter amounts to see initial rate</div>
            </div>

            <button class="quick-btn quick-btn-primary" onclick="createPool()" style="width: 100%; padding: 16px;">
                Create Pool & Add Liquidity
            </button>
        </div>
    `;

    // Add rate calculation listeners
    document.getElementById('pool-amount-1').addEventListener('input', updatePoolRate);
    document.getElementById('pool-amount-2').addEventListener('input', updatePoolRate);

    openModal('create-pool-modal');
}

// Update pool creation rate
function updatePoolRate() {
    const amt1 = parseFloat(document.getElementById('pool-amount-1').value) || 0;
    const amt2 = parseFloat(document.getElementById('pool-amount-2').value) || 0;
    const rateEl = document.getElementById('pool-initial-rate');

    if (amt1 > 0 && amt2 > 0) {
        const a1 = getAssetInfo(pendingPoolCreate.aid1);
        const a2 = getAssetInfo(pendingPoolCreate.aid2);
        const rate = formatForInput(amt2 / amt1, 6);
        rateEl.innerHTML = `1 ${a1.symbol} = ${rate} ${a2.symbol}`;
    } else {
        rateEl.textContent = 'Enter amounts to see initial rate';
    }
}

// Open Create Pool UI from the Pools tab (with token selection)
let createPoolToken1 = null;
let createPoolToken2 = null;

function openCreatePoolUI() {
    // Create or get the create pool UI modal
    let modal = document.getElementById('create-pool-ui-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'create-pool-ui-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="max-width: 480px;">
                <div class="modal-header">
                    <h2 class="modal-title">Create New Pool</h2>
                    <button class="modal-close" onclick="closeModal('create-pool-ui-modal')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body" id="create-pool-ui-body"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Default to BEAM and first non-BEAM asset
    createPoolToken1 = getAssetInfo(0);
    const availableAssets = walletData.assets.filter(a => a.id !== 0 && a.balance > 0);
    createPoolToken2 = availableAssets.length > 0 ? getAssetInfo(availableAssets[0].id) : null;

    renderCreatePoolUI();
    openModal('create-pool-ui-modal');
}

function renderCreatePoolUI() {
    const body = document.getElementById('create-pool-ui-body');
    if (!body) return;

    const t1 = createPoolToken1;
    const t2 = createPoolToken2;
    const bal1 = t1 ? walletData.assets.find(a => a.id === t1.aid) : null;
    const bal2 = t2 ? walletData.assets.find(a => a.id === t2.aid) : null;

    // Check if pool exists
    let poolExists = false;
    let existingPool = null;
    if (t1 && t2) {
        existingPool = dexPools.find(p =>
            (p.aid1 === t1.aid && p.aid2 === t2.aid) ||
            (p.aid1 === t2.aid && p.aid2 === t1.aid)
        );
        poolExists = !!existingPool;
    }

    body.innerHTML = `
        <div style="padding: 8px 0;">
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Select Token A</label>
                <button class="token-select-btn" style="width: 100%; justify-content: flex-start; padding: 12px; background: var(--void);" onclick="openCreatePoolTokenSelector(1, 'ui')">
                    ${t1 ? `
                        <div class="token-icon-small" style="${t1.icon ? '' : `background: ${t1.color};`}">
                            ${t1.icon ? `<img src="${t1.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.textContent='${t1.symbol.substring(0,2)}'">` : t1.symbol.substring(0,2)}
                        </div>
                        <span style="flex: 1; text-align: left;">${t1.symbol}</span>
                        <span style="color: var(--text-muted); font-size: 12px;">Balance: ${bal1 ? formatAmount(bal1.balance) : '0'}</span>
                    ` : '<span style="color: var(--text-muted);">Select token</span>'}
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                </button>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Select Token B</label>
                <button class="token-select-btn" style="width: 100%; justify-content: flex-start; padding: 12px; background: var(--void);" onclick="openCreatePoolTokenSelector(2, 'ui')">
                    ${t2 ? `
                        <div class="token-icon-small" style="${t2.icon ? '' : `background: ${t2.color};`}">
                            ${t2.icon ? `<img src="${t2.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.textContent='${t2.symbol.substring(0,2)}'">` : t2.symbol.substring(0,2)}
                        </div>
                        <span style="flex: 1; text-align: left;">${t2.symbol}</span>
                        <span style="color: var(--text-muted); font-size: 12px;">Balance: ${bal2 ? formatAmount(bal2.balance) : '0'}</span>
                    ` : '<span style="color: var(--text-muted);">Select token</span>'}
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                </button>
            </div>

            ${poolExists ? `
                <div style="background: var(--warning-bg, rgba(245, 158, 11, 0.1)); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--warning);">
                    <div style="color: var(--warning); font-weight: 500; margin-bottom: 4px;">Pool Already Exists</div>
                    <div style="color: var(--text-secondary); font-size: 13px;">A ${t1.symbol}/${t2.symbol} pool already exists. You can add liquidity to it instead.</div>
                    <button class="quick-btn" onclick="closeModal('create-pool-ui-modal'); openLiquidityModal(${existingPool.aid1}, ${existingPool.aid2}, ${existingPool.kind}, 'add')" style="margin-top: 12px; width: 100%;">Add Liquidity to Existing Pool</button>
                </div>
            ` : t1 && t2 ? `
                <div style="background: var(--void); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                    <div style="color: var(--success); font-weight: 500; margin-bottom: 4px;">✓ No Pool Found</div>
                    <div style="color: var(--text-secondary); font-size: 13px;">You can create a new ${t1.symbol}/${t2.symbol} pool.</div>
                </div>

                <button class="quick-btn quick-btn-primary" onclick="proceedToCreatePool()" style="width: 100%; padding: 16px;">
                    Continue to Create Pool
                </button>
            ` : `
                <div style="text-align: center; color: var(--text-muted); padding: 20px;">
                    Select both tokens to check pool availability
                </div>
            `}
        </div>
    `;
}

let createPoolSelectMode = null;
let createPoolSelectContext = 'ui'; // 'ui' = from create-pool-ui-modal, 'modal' = from create-pool-modal

function openCreatePoolTokenSelector(which, context = 'modal') {
    createPoolSelectMode = which;
    createPoolSelectContext = context;

    // Show token selector modal - reuse the existing one
    const modal = document.getElementById('token-select-modal');
    const list = document.getElementById('token-list');

    if (!modal || !list) return;

    // Get all available assets
    const assets = new Set([0]); // Always include BEAM
    walletData.assets.forEach(a => assets.add(a.id));
    dexPools.forEach(p => {
        assets.add(p.aid1);
        assets.add(p.aid2);
    });

    // Exclude the other selected token
    const excludeId = which === 1 ? createPoolToken2?.aid : createPoolToken1?.aid;

    list.innerHTML = Array.from(assets)
        .filter(aid => aid !== excludeId)
        .map(aid => {
            const info = getAssetInfo(aid);
            const balance = walletData.assets.find(a => a.id === aid);
            return `
                <div class="token-option" onclick="selectCreatePoolToken(${aid})">
                    <div class="token-icon-small" style="${info.icon ? '' : `background: ${info.color};`}">
                        ${info.icon ? `<img src="${info.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.textContent='${info.symbol.substring(0,2)}'">` : info.symbol.substring(0,2)}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:500;">${info.symbol}</div>
                        <div style="font-size:11px;color:var(--text-muted);">${info.name}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:12px;">${balance ? formatAmount(balance.balance) : '0'}</div>
                    </div>
                </div>
            `;
        }).join('');

    openModal('token-select-modal');
}

function selectCreatePoolToken(aid) {
    const info = getAssetInfo(aid);
    if (createPoolSelectMode === 1) {
        createPoolToken1 = info;
    } else {
        createPoolToken2 = info;
    }
    closeModal('token-select-modal');

    // Re-render the appropriate modal based on context
    if (createPoolSelectContext === 'modal') {
        // Came from the create-pool-modal (amounts modal) - re-render it
        openCreatePoolModal();
    } else {
        // Came from the create-pool-ui-modal (initial selection) - re-render it
        renderCreatePoolUI();
    }
}

function proceedToCreatePool() {
    if (!createPoolToken1 || !createPoolToken2) {
        showToast('Please select both tokens', 'error');
        return;
    }

    // Set pendingPoolCreate and open the create pool modal
    pendingPoolCreate = {
        aid1: createPoolToken1.aid,
        aid2: createPoolToken2.aid
    };

    closeModal('create-pool-ui-modal');
    openCreatePoolModal();
}

// Create new pool
async function createPool() {
    if (!pendingPoolCreate) return;

    const amt1 = parseFloat(document.getElementById('pool-amount-1').value) || 0;
    const amt2 = parseFloat(document.getElementById('pool-amount-2').value) || 0;
    const kind = document.getElementById('pool-fee-model').value;

    if (amt1 <= 0 || amt2 <= 0) {
        showToast('Please enter amounts for both tokens', 'error');
        return;
    }

    const a1 = getAssetInfo(pendingPoolCreate.aid1);
    const a2 = getAssetInfo(pendingPoolCreate.aid2);

    showToastAdvanced('Creating Pool', `${a1.symbol}/${a2.symbol} pool...`, 'pending');

    try {
        // First create the pool
        const createArgs = `action=pool_create,cid=${DEX_CID},aid1=${pendingPoolCreate.aid1},aid2=${pendingPoolCreate.aid2},kind=${kind}`;
        const createResult = await apiCall('invoke_contract', { args: createArgs, create_tx: true });

        if (createResult?.raw_data) {
            await apiCall('process_invoke_data', { data: createResult.raw_data });
        }

        // Then add initial liquidity
        const amt1Groth = Math.round(amt1 * GROTH);
        const amt2Groth = Math.round(amt2 * GROTH);
        const liqArgs = `action=pool_add_liquidity,cid=${DEX_CID},aid1=${pendingPoolCreate.aid1},aid2=${pendingPoolCreate.aid2},kind=${kind},val1=${amt1Groth},val2=${amt2Groth}`;
        const liqResult = await apiCall('invoke_contract', { args: liqArgs, create_tx: true });

        if (liqResult?.raw_data) {
            await apiCall('process_invoke_data', { data: liqResult.raw_data });
        }

        showToastAdvanced('Pool Created!', `${a1.symbol}/${a2.symbol} pool is now live`, 'success');
        closeModal('create-pool-modal');

        // Reload pools
        await loadDexPools();
        pendingPoolCreate = null;

        // Refresh wallet
        await loadWalletData();
        renderAssetCards();

    } catch (e) {
        showToastAdvanced('Pool Creation Failed', e.message, 'error');
    }
}

// Open token selector modal
async function openTokenSelector(mode) {
    tokenSelectMode = mode;
    openModal('token-select-modal');

    // Always load all assets for comprehensive token list
    if (allAssetsCache.length === 0) {
        document.getElementById('token-select-list').innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);">Loading all Confidential Assets...</div>';
        try {
            // Load from wallet API with refresh to get latest
            const response = await apiCall('assets_list', { refresh: true });
            allAssetsCache = response?.assets || response || [];
            console.log(`Loaded ${allAssetsCache.length} assets from blockchain`);
        } catch (e) {
            console.error('Failed to load assets:', e);
        }
    }

    renderTokenList();
}

// Check if asset is an LP token (contains AMML in name or symbol)
function isLPToken(asset) {
    const name = (asset.name || '').toLowerCase();
    const symbol = (asset.symbol || '').toLowerCase();

    // LP tokens have "amml" in their name or symbol
    return name.includes('amml') || symbol.includes('amml');
}

// Initialize DEX with default BEAM → FOMO pair and prefill amount
function initializeDexDefaults() {
    // Make sure we have the full asset info with icons
    dexFromAsset = getAssetInfo(0); // BEAM
    dexToAsset = getAssetInfo(174); // FOMO
    updateSwapUI();

    // Pre-fill with a small default amount for better UX
    const beamAsset = walletData.assets.find(a => a.id === 0);
    if (beamAsset && beamAsset.balance > 100000000) { // If user has > 1 BEAM
        document.getElementById('dex-from-amount').value = '0.1';
        // Get quote automatically
        setTimeout(() => debounceGetQuote(), 300);
    }

    // Populate pool selector for liquidity tab
    populatePoolSelector();
}

// Render token list for selector
function renderTokenList() {
    const container = document.getElementById('token-select-list');
    const search = document.getElementById('token-search-input')?.value.toLowerCase() || '';
    const isFromMode = tokenSelectMode === 'from';

    // Build comprehensive token list from all sources
    const tokenSet = new Map();

    // 1. Add ALL assets from blockchain cache first (comprehensive list)
    if (allAssetsCache.length > 0) {
        allAssetsCache.forEach(a => {
            const aid = a.asset_id;
            const info = getAssetInfo(aid);
            tokenSet.set(aid, { ...info, balance: 0, locked: 0 });
        });
    }

    // 2. Add pool assets (these are tradeable)
    dexPools.forEach(p => {
        if (!tokenSet.has(p.aid1)) tokenSet.set(p.aid1, { ...getAssetInfo(p.aid1), balance: 0, locked: 0 });
        if (!tokenSet.has(p.aid2)) tokenSet.set(p.aid2, { ...getAssetInfo(p.aid2), balance: 0, locked: 0 });
    });

    // 3. Update with wallet balances (user's holdings)
    walletData.assets.forEach(a => {
        const existing = tokenSet.get(a.id);
        const info = getAssetInfo(a.id);
        tokenSet.set(a.id, {
            ...(existing || info),
            ...info,
            balance: a.balance,
            locked: a.locked || 0
        });
    });

    // 4. Ensure priority tokens are always included
    [0, 4, 7, 9, 47, 174].forEach(aid => {
        if (!tokenSet.has(aid)) {
            tokenSet.set(aid, { ...getAssetInfo(aid), balance: 0, locked: 0 });
        }
    });

    // Filter tokens
    let tokens = Array.from(tokenSet.values()).filter(t => {
        // For "from" mode: only show tokens with balance > 0
        if (isFromMode && (!t.balance || t.balance <= 0)) return false;

        // Always filter out LP tokens from token selector (LP tokens are received as output, not selected as input)
        if (isLPToken(t)) return false;

        // Search filter
        if (search) {
            return t.name.toLowerCase().includes(search) ||
                   t.symbol.toLowerCase().includes(search) ||
                   String(t.aid).includes(search);
        }

        return true;
    });

    // Sort: priority tokens first, then by balance, then by name
    const priorityAids = [0, 174, 7, 4, 47, 9]; // BEAM, FOMO, BEAMX, Crown, NPH, Tico
    tokens.sort((a, b) => {
        // Priority tokens first
        const aPriority = priorityAids.indexOf(a.aid);
        const bPriority = priorityAids.indexOf(b.aid);
        if (aPriority !== -1 && bPriority === -1) return -1;
        if (bPriority !== -1 && aPriority === -1) return 1;
        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;

        // Then by balance
        const aHas = (a.balance || 0) > 0 ? 1 : 0;
        const bHas = (b.balance || 0) > 0 ? 1 : 0;
        if (bHas !== aHas) return bHas - aHas;

        return a.name.localeCompare(b.name);
    });

    if (tokens.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 32px; color: var(--text-muted);">
                ${isFromMode ? 'No tokens with balance found' : 'No tokens found'}
            </div>
        `;
        return;
    }

    container.innerHTML = tokens.map(t => {
        const hasBalance = (t.balance || 0) > 0;
        // No background when icon exists
        const iconHtml = t.icon
            ? `<img src="${t.icon}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentNode.style.background='${t.color}';this.parentNode.textContent='${t.symbol.substring(0,2).toUpperCase()}'">`
            : t.symbol.substring(0, 2).toUpperCase();
        const iconBg = t.icon ? 'transparent' : t.color;

        return `
            <div class="token-select-item" onclick="selectToken(${t.aid})" style="display:flex;align-items:center;gap:12px;padding:12px;cursor:pointer;border-radius:8px;${hasBalance ? 'background:var(--beam-cyan-dim);' : ''}" onmouseover="this.style.background='var(--void-lighter)'" onmouseout="this.style.background='${hasBalance ? 'var(--beam-cyan-dim)' : ''}'">
                <div class="token-icon-small" style="background:${iconBg};width:36px;height:36px;font-size:12px;display:flex;align-items:center;justify-content:center;border-radius:50%;overflow:hidden;">${iconHtml}</div>
                <div style="flex:1;">
                    <div style="font-weight:500;">${t.name}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${t.symbol} | #${t.aid}</div>
                </div>
                ${hasBalance ? `<div style="text-align:right;"><div style="font-weight:500;">${formatAmount(t.balance)}</div><div style="font-size:11px;color:var(--text-muted);">${t.symbol}</div></div>` : ''}
            </div>
        `;
    }).join('');
}

// Select token
function selectToken(aid) {
    const info = getAssetInfo(aid);

    if (tokenSelectMode === 'from') {
        dexFromAsset = info;
        updateSwapUI();
        debounceGetQuote();
    } else if (tokenSelectMode === 'to') {
        dexToAsset = info;
        updateSwapUI();
        debounceGetQuote();
    } else if (tokenSelectMode === 'liq-a' || tokenSelectMode === 'liq-b') {
        setLiqToken(tokenSelectMode, info);
    }

    closeModal('token-select-modal');
}

// =============================================
// QUICK AMOUNT BUTTONS
// =============================================
function setQuickAmount(amount) {
    if (amount === 'max') {
        // Get max balance of from asset
        const asset = walletData.assets.find(a => a.id === dexFromAsset?.aid);
        if (asset && asset.balance > 0) {
            // Leave small amount for fees if BEAM
            const maxAmount = dexFromAsset.aid === 0
                ? Math.max(0, asset.balance - 100000) // Leave 0.001 BEAM for fees
                : asset.balance;
            document.getElementById('dex-from-amount').value = formatAmount(maxAmount);
        }
    } else {
        document.getElementById('dex-from-amount').value = amount;
    }
    debounceGetQuote();
}

// =============================================
// LIQUIDITY FUNCTIONS
// =============================================
let selectedLiqPool = null;
let liqAssetA = { aid: 0, symbol: 'BEAM', name: 'BEAM', color: '#25c2a0' };
let liqAssetB = { aid: 174, symbol: 'FOMO', name: 'FOMO', color: '#60a5fa' };
let selectedLPPosition = null;

// Populate pool selector dropdown
function populatePoolSelector() {
    const select = document.getElementById('liq-pool-select');
    if (!select || !dexPools || dexPools.length === 0) return;

    select.innerHTML = dexPools.map((pool, idx) => {
        const asset1 = getAssetInfo(pool.aid1);
        const asset2 = getAssetInfo(pool.aid2);
        return `<option value="${idx}">${asset1.symbol} / ${asset2.symbol}</option>`;
    }).join('');

    // Select first pool by default
    if (dexPools.length > 0) {
        onPoolSelect();
    }
}

// Handle pool selection from dropdown
function onPoolSelect() {
    const select = document.getElementById('liq-pool-select');
    if (!select) return;

    const idx = parseInt(select.value);
    const pool = dexPools[idx];
    if (!pool) return;

    selectedLiqPool = pool;
    liqAssetA = getAssetInfo(pool.aid1);
    liqAssetB = getAssetInfo(pool.aid2);
    updateLiqTokenUI();
}

function switchLiqMode(mode) {
    document.querySelectorAll('.liq-mode-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-liq-mode="${mode}"]`)?.classList.add('active');

    document.querySelectorAll('.liq-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`liq-${mode}-panel`)?.classList.add('active');

    if (mode === 'add') {
        initLiquidityAdd();
    } else if (mode === 'withdraw') {
        loadLPPositions();
    }
}

// Initialize liquidity add UI
function initLiquidityAdd() {
    // Set default tokens
    liqAssetA = getAssetInfo(0);
    liqAssetB = getAssetInfo(174);
    updateLiqTokenUI();
    findPoolsForPair();
}

// Update liquidity token UI
function updateLiqTokenUI() {
    // Token A
    document.getElementById('liq-symbol-a').textContent = liqAssetA.symbol;
    const iconA = document.getElementById('liq-icon-a');
    iconA.style.background = liqAssetA.icon ? 'transparent' : (liqAssetA.color || '#333');
    iconA.innerHTML = liqAssetA.icon
        ? `<img src="${liqAssetA.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${liqAssetA.color}';this.parentNode.textContent='${liqAssetA.symbol.substring(0,2)}'">`
        : liqAssetA.symbol.substring(0, 2);

    // Token B
    document.getElementById('liq-symbol-b').textContent = liqAssetB.symbol;
    const iconB = document.getElementById('liq-icon-b');
    iconB.style.background = liqAssetB.icon ? 'transparent' : (liqAssetB.color || '#333');
    iconB.innerHTML = liqAssetB.icon
        ? `<img src="${liqAssetB.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${liqAssetB.color}';this.parentNode.textContent='${liqAssetB.symbol.substring(0,2)}'">`
        : liqAssetB.symbol.substring(0, 2);

    // Balances
    const balA = walletData.assets.find(a => a.id === liqAssetA.aid);
    const balB = walletData.assets.find(a => a.id === liqAssetB.aid);
    document.getElementById('liq-balance-a').textContent = balA ? formatAmount(balA.balance) : '0';
    document.getElementById('liq-balance-b').textContent = balB ? formatAmount(balB.balance) : '0';
}

// Find pools for the selected token pair
function findPoolsForPair() {
    const container = document.getElementById('liq-pool-list');

    if (!liqAssetA || !liqAssetB) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Select both tokens</div>';
        selectedLiqPool = null;
        updateLiqButton();
        return;
    }

    // Find all pools matching this pair
    const matchingPools = dexPools.filter(p =>
        (p.aid1 === liqAssetA.aid && p.aid2 === liqAssetB.aid) ||
        (p.aid1 === liqAssetB.aid && p.aid2 === liqAssetA.aid)
    );

    if (matchingPools.length === 0) {
        container.innerHTML = `
            <div style="color:var(--text-muted);font-size:12px;text-align:center;width:100%;">
                No pool exists for ${liqAssetA.symbol}/${liqAssetB.symbol}
                <br><small>You can create one by selecting a fee tier</small>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;width:100%;">
                <button class="quick-btn" onclick="createPoolWithFee(1)" style="flex:1;font-size:11px;">Create 0.1% Pool</button>
                <button class="quick-btn" onclick="createPoolWithFee(2)" style="flex:1;font-size:11px;">Create 0.3% Pool</button>
            </div>
        `;
        selectedLiqPool = null;
        updateLiqButton();
        return;
    }

    // Render pool options
    container.innerHTML = matchingPools.map((p, i) => {
        const feeLabel = p.kind === 1 ? '0.1%' : p.kind === 2 ? '0.3%' : '0.5%';
        const reserve1 = formatAmount(p.tok1);
        const reserve2 = formatAmount(p.tok2);
        const a1 = getAssetInfo(p.aid1);
        const a2 = getAssetInfo(p.aid2);
        const isSelected = selectedLiqPool && selectedLiqPool.aid1 === p.aid1 && selectedLiqPool.aid2 === p.aid2 && selectedLiqPool.kind === p.kind;

        return `
            <div class="pool-option ${isSelected ? 'selected' : ''}" onclick="selectLiqPool(${p.aid1}, ${p.aid2}, ${p.kind})"
                 style="flex:1;min-width:140px;padding:12px;background:var(--void${isSelected ? '-lighter' : ''});border-radius:8px;cursor:pointer;border:1px solid ${isSelected ? 'var(--beam-cyan)' : 'transparent'};">
                <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${feeLabel} Fee</div>
                <div style="font-size:11px;color:var(--text-muted);">${reserve1} ${a1.symbol}</div>
                <div style="font-size:11px;color:var(--text-muted);">${reserve2} ${a2.symbol}</div>
            </div>
        `;
    }).join('');

    // Auto-select best pool (highest liquidity)
    if (!selectedLiqPool) {
        const bestPool = matchingPools.sort((a, b) => (b.tok1 + b.tok2) - (a.tok1 + a.tok2))[0];
        selectLiqPool(bestPool.aid1, bestPool.aid2, bestPool.kind);
    }
}

// Select a specific pool
function selectLiqPool(aid1, aid2, kind) {
    selectedLiqPool = dexPools.find(p => p.aid1 === aid1 && p.aid2 === aid2 && p.kind === kind);

    if (!selectedLiqPool) return;

    // Update liqAssetA/B to match pool order
    if (selectedLiqPool.aid1 === liqAssetA.aid) {
        // Already correct order
    } else {
        // Swap A and B
        [liqAssetA, liqAssetB] = [liqAssetB, liqAssetA];
        updateLiqTokenUI();
    }

    // Refresh pool list to show selection
    findPoolsForPair();

    // Show pool info
    document.getElementById('liq-pool-info').style.display = 'block';
    const rate = parseFloat(selectedLiqPool.k1_2) || 0;
    document.getElementById('liq-rate').textContent = `1 ${liqAssetA.symbol} = ${formatForInput(rate, 6)} ${liqAssetB.symbol}`;
    document.getElementById('liq-share').textContent = '0%';
    document.getElementById('liq-lp-tokens').textContent = '0';

    updateLiqButton();
    calcLiquidityB();
}

// Handle liquidity token selection (from token selector modal)
function setLiqToken(mode, asset) {
    if (mode === 'liq-a') {
        liqAssetA = asset;
    } else if (mode === 'liq-b') {
        liqAssetB = asset;
    }

    updateLiqTokenUI();
    selectedLiqPool = null;
    findPoolsForPair();
}

// Update add liquidity button state
function updateLiqButton() {
    const btn = document.getElementById('add-liq-btn');
    const amtA = parseFloat(document.getElementById('liq-amount-a')?.value) || 0;
    const amtB = parseFloat(document.getElementById('liq-amount-b')?.value) || 0;

    if (!selectedLiqPool) {
        btn.disabled = true;
        btn.textContent = 'Select Pool';
    } else if (amtA <= 0 || amtB <= 0) {
        btn.disabled = true;
        btn.textContent = 'Enter Amounts';
    } else {
        btn.disabled = false;
        btn.textContent = 'Add Liquidity';
    }
}

// Create new pool with specified fee (placeholder for future)
function createPoolWithFee(kind) {
    showToast('Pool creation coming soon', 'info');
}

function calcLiquidityB() {
    if (!selectedLiqPool) return;
    const amtA = parseFloat(document.getElementById('liq-amount-a').value) || 0;
    if (amtA > 0) {
        const rate = parseFloat(selectedLiqPool.k1_2) || 0;
        const amtB = amtA * rate;
        document.getElementById('liq-amount-b').value = formatForInput(amtB, 6);
        updateLiquidityPreview(amtA, amtB);
    }
}

function calcLiquidityA() {
    if (!selectedLiqPool) return;
    const amtB = parseFloat(document.getElementById('liq-amount-b').value) || 0;
    if (amtB > 0) {
        const rate = parseFloat(selectedLiqPool.k2_1) || 0;
        const amtA = amtB * rate;
        document.getElementById('liq-amount-a').value = formatForInput(amtA, 6);
        updateLiquidityPreview(amtA, amtB);
    }
}

function updateLiquidityPreview(amtA, amtB) {
    if (!selectedLiqPool) return;
    // Estimate LP tokens and share
    const poolTok1 = selectedLiqPool.tok1 || 1;
    const poolCtl = selectedLiqPool.ctl || 1;
    const amtAGroth = amtA * GROTH;
    const estimatedLP = Math.sqrt(amtA * amtB * GROTH * GROTH);
    const sharePercent = (amtAGroth / (poolTok1 + amtAGroth)) * 100;

    document.getElementById('liq-share').textContent = sharePercent.toFixed(2).replace(/,/g, '.') + '%';
    document.getElementById('liq-lp-tokens').textContent = '~' + formatAmount(estimatedLP);
}

// Show add liquidity confirmation
function showAddLiquidityConfirmation() {
    if (!selectedLiqPool) return;

    const amtA = parseFloat(document.getElementById('liq-amount-a').value) || 0;
    const amtB = parseFloat(document.getElementById('liq-amount-b').value) || 0;

    if (amtA <= 0 || amtB <= 0) {
        showToast('Please enter amounts for both tokens', 'error');
        return;
    }

    // Estimate LP tokens
    const poolTok1 = selectedLiqPool.tok1 || 1;
    const poolCtl = selectedLiqPool.ctl || 1;
    const estimatedLP = Math.sqrt(amtA * amtB * GROTH * GROTH);
    const sharePercent = ((amtA * GROTH) / (poolTok1 + amtA * GROTH)) * 100;
    const feeLabel = selectedLiqPool.kind === 1 ? '0.1%' : selectedLiqPool.kind === 2 ? '0.3%' : '0.5%';

    // Build confirmation content
    const content = document.getElementById('liq-confirm-content');
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">You're Adding</div>
            <div style="background: var(--void); padding: 16px; border-radius: 12px; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${renderTokenIcon(liqAssetA, 32)}
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${liqAssetA.symbol}</div>
                        <div style="font-size: 12px; color: var(--text-muted);">${liqAssetA.name}</div>
                    </div>
                    <div style="font-size: 18px; font-weight: 600; color: var(--warning);">-${amtA}</div>
                </div>
            </div>
            <div style="text-align: center; margin: 8px 0; color: var(--text-muted);">+</div>
            <div style="background: var(--void); padding: 16px; border-radius: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${renderTokenIcon(liqAssetB, 32)}
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${liqAssetB.symbol}</div>
                        <div style="font-size: 12px; color: var(--text-muted);">${liqAssetB.name}</div>
                    </div>
                    <div style="font-size: 18px; font-weight: 600; color: var(--warning);">-${amtB.toFixed(6)}</div>
                </div>
            </div>
        </div>

        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">You'll Receive</div>
        <div style="background: var(--success-dim); padding: 16px; border-radius: 12px; border: 1px solid var(--success);">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #25c2a0, #60a5fa); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;">LP</div>
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${liqAssetA.symbol}/${liqAssetB.symbol} LP Token</div>
                    <div style="font-size: 12px; color: var(--text-muted);">Pool Fee: ${feeLabel}</div>
                </div>
                <div style="font-size: 18px; font-weight: 600; color: var(--success);">~${formatAmount(estimatedLP)}</div>
            </div>
        </div>

        <div style="background: var(--void); padding: 12px; border-radius: 8px; margin-top: 16px; font-size: 13px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: var(--text-muted);">Your Pool Share</span>
                <span>${sharePercent.toFixed(4)}%</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted);">Pool Rate</span>
                <span>1 ${liqAssetA.symbol} = ${(parseFloat(selectedLiqPool.k1_2) || 0).toFixed(6)} ${liqAssetB.symbol}</span>
            </div>
        </div>
    `;

    openModal('liquidity-confirm-modal');
}

let addLiqInProgress = false;

async function executeAddLiquidity() {
    if (!selectedLiqPool || addLiqInProgress) return;
    addLiqInProgress = true;

    closeModal('liquidity-confirm-modal');

    const amtA = parseFloat(document.getElementById('liq-amount-a').value) || 0;
    const amtB = parseFloat(document.getElementById('liq-amount-b').value) || 0;

    if (amtA <= 0 || amtB <= 0) {
        showToast('Please enter amounts for both tokens', 'error');
        addLiqInProgress = false;
        return;
    }

    const btn = document.getElementById('add-liq-btn');
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"/></svg> Adding...';

    showToastAdvanced('Adding Liquidity', `${liqAssetA.symbol}/${liqAssetB.symbol}`, 'pending');

    try {
        const val1 = Math.round(amtA * GROTH);
        // Use bCoversAll=1 to let the contract calculate the correct ratio
        // This prevents "val1 too large" errors when amounts don't match pool ratio exactly
        const args = `action=pool_add_liquidity,cid=${DEX_CID},aid1=${selectedLiqPool.aid1},aid2=${selectedLiqPool.aid2},kind=${selectedLiqPool.kind},val1=${val1},bCoversAll=1`;

        const result = await apiCall('invoke_contract', { args, create_tx: true });

        // Check for success - either txid (direct creation) or raw_data (needs processing)
        const isSuccess = result?.txid || result?.raw_data;

        if (result?.raw_data && !result?.txid) {
            await apiCall('process_invoke_data', { data: result.raw_data });
        }

        if (isSuccess) {
            showToastAdvanced('Liquidity Added!', `${amtA} ${liqAssetA.symbol} + ${amtB} ${liqAssetB.symbol}`, 'success');

            // Clear form
            document.getElementById('liq-amount-a').value = '';
            document.getElementById('liq-amount-b').value = '';

            // Refresh data
            await loadWalletData();
            await loadDexPools();
            renderAssetCards();

            // Show donation popup after successful liquidity add
            setTimeout(() => showDonationPopup(), 2000);
        } else if (result?.output) {
            // Check for contract error in output
            try {
                const output = JSON.parse(result.output);
                if (output.error) {
                    throw new Error(output.error);
                }
            } catch (parseErr) {
                // JSON parse failed or error was thrown
                throw parseErr;
            }
        } else {
            throw new Error(result?.error?.message || 'Failed to add liquidity');
        }
    } catch (e) {
        showToastAdvanced('Add Liquidity Failed', e.message, 'error');
    }

    addLiqInProgress = false;
    btn.disabled = false;
    btn.textContent = 'Add Liquidity';
}

// Open withdraw liquidity panel for a specific LP token
function openWithdrawLiquidity(lpTokenId) {
    console.log('Opening withdraw for LP token:', lpTokenId);

    // Navigate to DEX liquidity tab
    showPage('dex');
    showDexTab('liquidity');

    // Switch to withdraw mode
    setTimeout(() => {
        switchLiqMode('withdraw');

        // Wait for LP positions to load, then select the matching one
        setTimeout(() => {
            if (window.lpPositions) {
                const idx = window.lpPositions.findIndex(p => p.lpToken === lpTokenId);
                if (idx >= 0) {
                    selectLPPosition(idx);
                }
            }
        }, 500);
    }, 100);
}

async function loadLPPositions() {
    const container = document.getElementById('lp-positions');
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);">Loading...</div>';

    // Find LP tokens in wallet
    const lpPositions = [];
    for (const asset of walletData.assets) {
        if (asset.balance > 0) {
            // Check if this is an LP token using getAssetInfo
            const info = getAssetInfo(asset.id);

            if (info.isLpToken) {
                // Find which pool this LP token belongs to
                const pool = dexPools.find(p => p['lp-token'] === asset.id);
                if (pool) {
                    const a1 = getAssetInfo(pool.aid1);
                    const a2 = getAssetInfo(pool.aid2);
                    lpPositions.push({
                        lpToken: asset.id,
                        balance: asset.balance,
                        pool: pool,
                        asset1: a1,
                        asset2: a2,
                        info: info
                    });
                } else if (info.lpPair) {
                    // Use parsed LP pair info if pool not found
                    const a1 = getAssetInfo(info.lpPair.aid1);
                    const a2 = getAssetInfo(info.lpPair.aid2);
                    lpPositions.push({
                        lpToken: asset.id,
                        balance: asset.balance,
                        pool: null,
                        asset1: a1,
                        asset2: a2,
                        info: info
                    });
                }
            }
        }
    }

    if (lpPositions.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:32px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="48" height="48" style="margin-bottom:16px;">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18M9 21V9"/>
                </svg>
                <h4 style="margin-bottom:8px;">No LP Positions</h4>
                <p style="color:var(--text-muted);font-size:13px;">Add liquidity to a pool to see your positions here</p>
            </div>
        `;
        document.getElementById('withdraw-form').style.display = 'none';
        return;
    }

    container.innerHTML = lpPositions.map((pos, idx) => {
        const icon1 = pos.asset1.icon ? `<img src="${pos.asset1.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${pos.asset1.color}';this.parentNode.textContent='${pos.asset1.symbol.substring(0,2)}'">` : pos.asset1.symbol.substring(0,2);
        const icon2 = pos.asset2.icon ? `<img src="${pos.asset2.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${pos.asset2.color}';this.parentNode.textContent='${pos.asset2.symbol.substring(0,2)}'">` : pos.asset2.symbol.substring(0,2);
        const bg1 = pos.asset1.icon ? 'transparent' : pos.asset1.color;
        const bg2 = pos.asset2.icon ? 'transparent' : pos.asset2.color;

        return `
        <div class="lp-position-card ${selectedLPPosition === idx ? 'selected' : ''}" onclick="selectLPPosition(${idx})">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="display:flex;">
                        <div class="token-icon-small" style="background:${bg1};z-index:1;">${icon1}</div>
                        <div class="token-icon-small" style="background:${bg2};margin-left:-8px;">${icon2}</div>
                    </div>
                    <div>
                        <div style="font-weight:600;">${pos.asset1.symbol}/${pos.asset2.symbol}</div>
                        <div style="font-size:11px;color:var(--text-muted);">LP Token #${pos.lpToken}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:500;">${formatAmount(pos.balance)}</div>
                    <div style="font-size:11px;color:var(--text-muted);">LP Tokens</div>
                </div>
            </div>
        </div>
    `}).join('');

    // Store positions for withdraw
    window.lpPositions = lpPositions;

    // Auto-select first position
    if (lpPositions.length > 0 && selectedLPPosition === null) {
        selectLPPosition(0);
    }
}

function selectLPPosition(idx) {
    selectedLPPosition = idx;

    // Update UI
    document.querySelectorAll('.lp-position-card').forEach((card, i) => {
        card.classList.toggle('selected', i === idx);
    });

    document.getElementById('withdraw-form').style.display = 'block';
    document.getElementById('withdraw-slider').value = 100;
    updateWithdrawAmount();
}

function setWithdrawPercent(percent) {
    document.getElementById('withdraw-slider').value = percent;
    updateWithdrawAmount();
}

function updateWithdrawAmount() {
    const percent = parseInt(document.getElementById('withdraw-slider').value);
    document.getElementById('withdraw-percent').textContent = percent;

    if (selectedLPPosition === null || !window.lpPositions) return;

    const pos = window.lpPositions[selectedLPPosition];
    if (!pos) return;

    const withdrawLP = Math.floor(pos.balance * percent / 100);

    // Estimate amounts to receive
    const pool = pos.pool;
    const shareRatio = withdrawLP / (pool.ctl || 1);
    const amt1 = Math.floor((pool.tok1 || 0) * shareRatio);
    const amt2 = Math.floor((pool.tok2 || 0) * shareRatio);

    document.getElementById('withdraw-amounts').innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-top:8px;">
            <span>${pos.asset1.symbol}</span>
            <span style="color:var(--success);">~${formatAmount(amt1)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;">
            <span>${pos.asset2.symbol}</span>
            <span style="color:var(--success);">~${formatAmount(amt2)}</span>
        </div>
    `;
}

// Pending withdraw operation (stores values from confirmation to execution)
let pendingWithdrawOp = null;

// Show withdraw confirmation modal
function showWithdrawConfirmation() {
    if (selectedLPPosition === null || !window.lpPositions) {
        showToast('Please select an LP position', 'error');
        return;
    }

    const pos = window.lpPositions[selectedLPPosition];
    const percent = parseInt(document.getElementById('withdraw-slider').value);
    const withdrawLP = Math.floor(pos.balance * percent / 100);

    if (withdrawLP <= 0) {
        showToast('Please select amount to withdraw', 'error');
        return;
    }

    // Store pending operation to prevent slider reset issues
    pendingWithdrawOp = {
        posIndex: selectedLPPosition,
        pos: pos,
        percent: percent,
        withdrawLP: withdrawLP
    };

    // Calculate estimated receive amounts
    const poolShare = withdrawLP / pos.pool.ctl;
    const estAmt1 = pos.pool.tok1 * poolShare;
    const estAmt2 = pos.pool.tok2 * poolShare;

    const content = document.getElementById('withdraw-confirm-content');
    content.innerHTML = `
        <div style="margin-bottom:20px;">
            <p style="color:var(--text-muted);font-size:12px;margin-bottom:12px;">You're Withdrawing</p>
            <div class="confirm-token" style="background:var(--bg-tertiary);border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg, #25c2a0, #60a5fa);display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:12px;">LP</div>
                    <div>
                        <div style="font-weight:600;">${pos.asset1.symbol}/${pos.asset2.symbol} LP Token</div>
                        <div style="font-size:12px;color:var(--text-muted);">${percent}% of position</div>
                    </div>
                </div>
                <div style="text-align:right;color:var(--warning);font-weight:600;">
                    -${formatAmount(withdrawLP)}
                </div>
            </div>
        </div>

        <div style="margin-bottom:20px;">
            <p style="color:var(--text-muted);font-size:12px;margin-bottom:12px;">You'll Receive (Estimated)</p>
            <div style="background:var(--bg-tertiary);border-radius:12px;padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="width:28px;height:28px;border-radius:50%;background:${pos.asset1.color || 'var(--beam-cyan)'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;">${pos.asset1.symbol.slice(0,2)}</div>
                        <span>${pos.asset1.symbol}</span>
                    </div>
                    <span style="color:var(--success);font-weight:600;">+${formatAmount(estAmt1)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div style="width:28px;height:28px;border-radius:50%;background:${pos.asset2.color || 'var(--beam-pink)'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;">${pos.asset2.symbol.slice(0,2)}</div>
                        <span>${pos.asset2.symbol}</span>
                    </div>
                    <span style="color:var(--success);font-weight:600;">+${formatAmount(estAmt2)}</span>
                </div>
            </div>
        </div>

        <div style="background:var(--bg-tertiary);border-radius:12px;padding:12px;font-size:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:var(--text-muted);">Pool</span>
                <span>${pos.asset1.symbol}/${pos.asset2.symbol}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-muted);">Remaining LP</span>
                <span>${formatAmount(pos.balance - withdrawLP)}</span>
            </div>
        </div>
    `;

    openModal('withdraw-confirm-modal');
}

async function executeWithdrawLiquidity() {
    // Use stored pending operation instead of re-reading slider
    if (!pendingWithdrawOp) {
        showToast('No pending withdrawal', 'error');
        return;
    }

    closeModal('withdraw-confirm-modal');

    const { pos, percent, withdrawLP } = pendingWithdrawOp;

    if (!pos || withdrawLP <= 0) {
        showToast('Invalid withdrawal amount', 'error');
        pendingWithdrawOp = null;
        return;
    }

    const btn = document.getElementById('withdraw-liq-btn');
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"/></svg> Withdrawing...';

    showToastAdvanced('Withdrawing Liquidity', `${pos.asset1.symbol}/${pos.asset2.symbol}`, 'pending');

    try {
        const args = `action=pool_withdraw,cid=${DEX_CID},aid1=${pos.pool.aid1},aid2=${pos.pool.aid2},kind=${pos.pool.kind},ctl=${withdrawLP}`;

        const result = await apiCall('invoke_contract', { args, create_tx: true });

        // Check for success - either txid (direct creation) or raw_data (needs processing)
        const isSuccess = result?.txid || result?.raw_data;

        if (result?.raw_data && !result?.txid) {
            await apiCall('process_invoke_data', { data: result.raw_data });
        }

        if (isSuccess) {
            showToastAdvanced('Liquidity Withdrawn!', `${percent}% from ${pos.asset1.symbol}/${pos.asset2.symbol}`, 'success');

            // Refresh data
            selectedLPPosition = null;
            await loadWalletData();
            await loadDexPools();
            renderAssetCards();
            loadLPPositions();
        } else if (result?.error) {
            throw new Error(result.error.message || 'Failed to withdraw');
        } else {
            throw new Error('Unexpected response from contract');
        }
    } catch (e) {
        showToastAdvanced('Withdraw Failed', e.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Withdraw Liquidity';
    pendingWithdrawOp = null;
}

// =============================================
// LOCAL NODE AUTO-SWITCH
// =============================================
let nodeSyncCheckInterval = null;
let nodeAutoStarted = false;

// Auto-start local node when app loads
async function autoStartLocalNode() {
    if (nodeAutoStarted) return;

    try {
        const serverStatus = await checkServerStatus();

        // If node not running, start it automatically
        if (!serverStatus.node_running) {
            console.log('Auto-starting local node...');
            showToastAdvanced('Starting Node', 'Starting local BEAM node in background...', 'pending');

            const resp = await fetch(`/api/node/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const result = await resp.json();

            if (result.success) {
                showToastAdvanced('Node Started', 'Local node is syncing...', 'success');
                nodeAutoStarted = true;
                // Show local node section and start monitoring
                document.getElementById('local-node-section').style.display = 'block';
                startNodeSyncMonitoring();
            } else {
                console.error('Failed to start node:', result.error);
            }
        } else {
            nodeAutoStarted = true;
            // Node already running, show sync progress
            document.getElementById('local-node-section').style.display = 'block';
            startNodeSyncMonitoring();
        }
    } catch (e) {
        console.error('Auto-start node error:', e);
    }
}

function startNodeSyncMonitoring() {
    // Clear any existing interval
    stopNodeSyncMonitoring();

    // Check sync every 3 seconds
    nodeSyncCheckInterval = setInterval(async () => {
        try {
            // Get node status from server API
            const resp = await fetch(`/api/node/status`);
            const nodeStatus = await resp.json();

            if (nodeStatus.running) {
                const current = nodeStatus.height || 0;
                const target = nodeStatus.target || 0;
                const progress = nodeStatus.progress || 0;

                // Update UI
                document.getElementById('sync-percentage').textContent = progress + '%';
                document.getElementById('sync-progress-fill').style.width = progress + '%';
                document.getElementById('sync-blocks').textContent = `${current.toLocaleString()} / ${target.toLocaleString()} headers`;

                if (nodeStatus.synced) {
                    document.getElementById('sync-status-text').textContent = 'Fully synced';
                    document.getElementById('sync-status-text').style.color = 'var(--success)';

                    if (localNodeSyncProgress < 100) {
                        localNodeSyncProgress = 100;
                        showToastAdvanced('Node Synced!', 'Local node is fully synchronized', 'success');
                        showToastAdvanced('DEX Ready', 'You can now use DEX features with local node', 'success');

                        // Slow down monitoring once synced
                        stopNodeSyncMonitoring();
                        nodeSyncCheckInterval = setInterval(async () => {
                            const r = await fetch(`/api/node/status`);
                            const s = await r.json();
                            document.getElementById('sync-percentage').textContent = '100%';
                            document.getElementById('sync-progress-fill').style.width = '100%';
                            document.getElementById('sync-blocks').textContent = `${s.height?.toLocaleString() || 0} blocks`;
                        }, 30000);
                    }
                } else {
                    localNodeSyncProgress = progress;
                    document.getElementById('sync-status-text').textContent = 'Syncing headers...';
                    document.getElementById('sync-status-text').style.color = 'var(--beam-cyan)';
                }
            } else {
                document.getElementById('sync-status-text').textContent = 'Node not running';
                document.getElementById('sync-status-text').style.color = 'var(--warning)';
            }
        } catch (e) {
            console.error('Sync check failed:', e);
        }
    }, 3000);
}

function stopNodeSyncMonitoring() {
    if (nodeSyncCheckInterval) {
        clearInterval(nodeSyncCheckInterval);
        nodeSyncCheckInterval = null;
    }
}

// Start local node manually
async function startLocalNode() {
    showToastAdvanced('Starting Node', 'Starting local BEAM node...', 'pending');

    try {
        const resp = await fetch(`/api/node/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const result = await resp.json();

        if (result.success) {
            showToastAdvanced('Node Started', 'Local node is syncing...', 'success');
            document.getElementById('local-node-section').style.display = 'block';
            startNodeSyncMonitoring();
        } else {
            showToastAdvanced('Start Failed', result.error || 'Unknown error', 'error');
        }
    } catch (e) {
        showToastAdvanced('Start Failed', e.message, 'error');
    }
}

// Stop local node
async function stopLocalNode() {
    try {
        const resp = await fetch(`/api/node/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await resp.json();

        if (result.success) {
            showToastAdvanced('Node Stopped', 'Local node has been stopped', 'info');
            stopNodeSyncMonitoring();
            document.getElementById('sync-status-text').textContent = 'Node stopped';
            document.getElementById('sync-status-text').style.color = 'var(--text-muted)';
        }
    } catch (e) {
        console.error('Stop node error:', e);
    }
}

// Select asset
function selectAsset(assetId) {
    console.log('Selected asset:', assetId);
}

// Sort balances
function sortBalances(column) {
    console.log('Sort by:', column);
}

// =============================================
// DEBUG PANEL
// =============================================
let debugPanelOpen = false;

function toggleDebugPanel() {
    debugPanelOpen = !debugPanelOpen;
    const panel = document.getElementById('debug-panel');
    if (debugPanelOpen) {
        panel.classList.add('open');
        renderDebugLogs();
    } else {
        panel.classList.remove('open');
    }
}

// Create debug panel on load
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.innerHTML = `
        <style>
            #debug-panel {
                position: fixed;
                bottom: 0;
                left: 80px;
                right: 0;
                height: 40px;
                background: var(--void);
                border-top: 1px solid var(--glass-border);
                z-index: 4000;
                transition: height 0.3s ease;
                display: flex;
                flex-direction: column;
            }
            #debug-panel.open {
                height: 350px;
            }
            .debug-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 16px;
                background: var(--void-lighter);
                border-bottom: 1px solid var(--glass-border);
                cursor: pointer;
                min-height: 40px;
            }
            .debug-header:hover {
                background: var(--glass);
            }
            .debug-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                font-weight: 600;
                color: var(--text-secondary);
            }
            .debug-title svg {
                width: 16px;
                height: 16px;
            }
            .debug-actions {
                display: flex;
                gap: 8px;
            }
            .debug-btn {
                padding: 4px 12px;
                font-size: 11px;
                background: var(--glass);
                border: 1px solid var(--glass-border);
                border-radius: 4px;
                color: var(--text-secondary);
                cursor: pointer;
            }
            .debug-btn:hover {
                background: var(--beam-cyan);
                color: var(--void);
            }
            .debug-content {
                flex: 1;
                overflow-y: auto;
                padding: 12px;
                display: none;
            }
            #debug-panel.open .debug-content {
                display: block;
            }
            .debug-stats {
                display: flex;
                gap: 16px;
                font-size: 11px;
                color: var(--text-muted);
            }
            .debug-stat {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .debug-stat .count {
                background: var(--beam-cyan);
                color: var(--void);
                padding: 2px 6px;
                border-radius: 10px;
                font-weight: 600;
            }
        </style>
        <div class="debug-header" onclick="toggleDebugPanel()">
            <div class="debug-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/>
                </svg>
                Debug Console
            </div>
            <div class="debug-stats">
                <span class="debug-stat">Logs: <span class="count" id="debug-count">0</span></span>
            </div>
            <div class="debug-actions" onclick="event.stopPropagation()">
                <button class="debug-btn" onclick="clearDebugLogs()">Clear</button>
                <button class="debug-btn" onclick="exportDebugLogs()">Export</button>
            </div>
        </div>
        <div class="debug-content" id="debug-log-list">
            <div style="text-align:center;color:var(--text-muted);padding:20px;">No logs yet. Make API calls to see them here.</div>
        </div>
    `;
    document.body.appendChild(panel);
});

function exportDebugLogs() {
    const data = JSON.stringify(debugLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beam-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Update debug count when logs change
const originalDebugLog = debugLog;
window.debugLog = function(...args) {
    originalDebugLog(...args);
    const countEl = document.getElementById('debug-count');
    if (countEl) countEl.textContent = debugLogs.length;
};

// ============================================
// DONATION POPUP - Support the developers!
// ============================================

const DONATION_ADDRESS = 'e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048';
let lastDonationShown = 0;

function showDonationPopup() {
    // Don't show too frequently (at least 30 seconds between popups)
    if (Date.now() - lastDonationShown < 30000) return;

    // Get BEAM balance
    const beamAsset = walletData.assets?.find(a => a.id === 0);
    const availableGroth = beamAsset?.available || 0;
    const availableBeam = availableGroth / 100000000;

    // Need at least 1 BEAM to show donation
    if (availableBeam < 1) return;

    // Calculate 3% default
    const defaultPercent = 3;
    const donationAmount = (availableBeam * defaultPercent / 100).toFixed(4);

    lastDonationShown = Date.now();

    // Create popup
    const popup = document.createElement('div');
    popup.id = 'donation-popup';
    popup.innerHTML = `
        <div class="donation-overlay" onclick="closeDonationPopup()"></div>
        <div class="donation-modal">
            <div class="donation-header">
                <div class="donation-icon">💝</div>
                <h3>Support BEAM Light Wallet</h3>
                <p class="donation-subtitle">Thank you for using our wallet! Your donation helps us continue development.</p>
            </div>

            <div class="donation-amount-section">
                <div class="donation-balance">Your balance: <strong>${availableBeam.toFixed(4)} BEAM</strong></div>

                <div class="donation-percent-buttons">
                    <button class="percent-btn" onclick="setDonationPercent(1)">1%</button>
                    <button class="percent-btn" onclick="setDonationPercent(2)">2%</button>
                    <button class="percent-btn active" onclick="setDonationPercent(3)">3%</button>
                    <button class="percent-btn" onclick="setDonationPercent(4)">4%</button>
                    <button class="percent-btn" onclick="setDonationPercent(5)">5%</button>
                </div>

                <div class="donation-input-row">
                    <input type="number" id="donation-amount" value="${donationAmount}" min="0.0001" step="0.0001" class="donation-input">
                    <span class="donation-currency">BEAM</span>
                </div>
            </div>

            <div class="donation-actions">
                <button class="donation-btn-send" onclick="sendDonation()">
                    <span class="btn-icon">❤️</span> Send Donation
                </button>
                <button class="donation-btn-skip" onclick="closeDonationPopup()">Maybe Later</button>
            </div>

            <div class="donation-footer">
                <small>Every contribution makes a difference. Thank you! 🙏</small>
            </div>
        </div>
    `;

    // Add styles if not already added
    if (!document.getElementById('donation-styles')) {
        const styles = document.createElement('style');
        styles.id = 'donation-styles';
        styles.textContent = `
            #donation-popup {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.3s ease;
            }
            .donation-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.7);
                backdrop-filter: blur(4px);
            }
            .donation-modal {
                position: relative;
                background: linear-gradient(145deg, #1a2332, #0f1620);
                border: 1px solid rgba(37, 194, 160, 0.3);
                border-radius: 20px;
                padding: 28px;
                max-width: 380px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(37, 194, 160, 0.1);
                animation: slideUp 0.3s ease;
            }
            @keyframes slideUp {
                from { transform: translateY(30px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .donation-header {
                text-align: center;
                margin-bottom: 24px;
            }
            .donation-icon {
                font-size: 48px;
                margin-bottom: 12px;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
            .donation-header h3 {
                color: #fff;
                font-size: 20px;
                margin: 0 0 8px 0;
                font-weight: 600;
            }
            .donation-subtitle {
                color: var(--text-secondary);
                font-size: 13px;
                margin: 0;
                line-height: 1.5;
            }
            .donation-amount-section {
                background: rgba(0,0,0,0.3);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 20px;
            }
            .donation-balance {
                text-align: center;
                color: var(--text-secondary);
                font-size: 13px;
                margin-bottom: 14px;
            }
            .donation-balance strong {
                color: var(--accent-primary);
            }
            .donation-percent-buttons {
                display: flex;
                gap: 8px;
                justify-content: center;
                margin-bottom: 14px;
            }
            .percent-btn {
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                color: var(--text-secondary);
                padding: 8px 14px;
                border-radius: 8px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .percent-btn:hover {
                background: rgba(37, 194, 160, 0.1);
                border-color: rgba(37, 194, 160, 0.3);
            }
            .percent-btn.active {
                background: var(--accent-primary);
                border-color: var(--accent-primary);
                color: #000;
                font-weight: 600;
            }
            .donation-input-row {
                display: flex;
                align-items: center;
                gap: 10px;
                background: rgba(0,0,0,0.3);
                border-radius: 10px;
                padding: 4px;
            }
            .donation-input {
                flex: 1;
                background: transparent;
                border: none;
                color: #fff;
                font-size: 24px;
                font-weight: 600;
                text-align: center;
                padding: 10px;
                outline: none;
            }
            .donation-input::-webkit-inner-spin-button {
                -webkit-appearance: none;
            }
            .donation-currency {
                color: var(--accent-primary);
                font-weight: 600;
                padding-right: 14px;
            }
            .donation-actions {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .donation-btn-send {
                background: linear-gradient(135deg, var(--accent-primary), #1a9a7a);
                border: none;
                color: #000;
                font-size: 16px;
                font-weight: 600;
                padding: 14px 24px;
                border-radius: 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            }
            .donation-btn-send:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(37, 194, 160, 0.4);
            }
            .donation-btn-skip {
                background: transparent;
                border: none;
                color: var(--text-muted);
                font-size: 13px;
                padding: 10px;
                cursor: pointer;
                transition: color 0.2s;
            }
            .donation-btn-skip:hover {
                color: var(--text-secondary);
            }
            .donation-footer {
                text-align: center;
                margin-top: 16px;
                color: var(--text-muted);
                font-size: 12px;
            }
        `;
        document.head.appendChild(styles);
    }

    document.body.appendChild(popup);
}

function setDonationPercent(percent) {
    const beamAsset = walletData.assets?.find(a => a.id === 0);
    const availableGroth = beamAsset?.available || 0;
    const availableBeam = availableGroth / 100000000;
    const amount = (availableBeam * percent / 100).toFixed(4);

    document.getElementById('donation-amount').value = amount;

    // Update active button
    document.querySelectorAll('.percent-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function closeDonationPopup() {
    const popup = document.getElementById('donation-popup');
    if (popup) {
        popup.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => popup.remove(), 200);
    }
}

async function sendDonation() {
    const amountStr = document.getElementById('donation-amount').value;
    const amount = parseFloat(amountStr);

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    const amountGroth = Math.round(amount * 100000000);

    // Check balance
    const beamAsset = walletData.assets?.find(a => a.id === 0);
    const availableGroth = beamAsset?.available || 0;

    if (amountGroth > availableGroth - 100000) { // Leave room for fee
        showToast('Insufficient balance', 'error');
        return;
    }

    closeDonationPopup();

    showToastAdvanced('Sending Donation', `${amount} BEAM to developers...`, 'pending');

    try {
        await apiCall('tx_send', {
            address: DONATION_ADDRESS,
            value: amountGroth,
            fee: 100000,
            asset_id: 0,
            comment: 'BEAM Light Wallet Donation - Thank you!',
            offline: true
        });

        showToastAdvanced('Thank You! 💝', `Your ${amount} BEAM donation was sent!`, 'success');

        // Refresh data
        await loadWalletData();
        renderAssetCards();
        renderBalancesTable();

    } catch (e) {
        showToastAdvanced('Donation Failed', e.message, 'error');
    }
}

// ============================================
// DONATE PAGE FUNCTIONS
// ============================================

function copyDonateAddress() {
    const address = document.getElementById('donate-address')?.textContent || DONATION_ADDRESS;
    navigator.clipboard.writeText(address).then(() => {
        showToast('Address copied to clipboard', 'success');
    }).catch(() => {
        showToast('Failed to copy address', 'error');
    });
}

async function sendDonationAmount(amount) {
    // Check if wallet is connected
    if (!walletData.isConnected) {
        showToast('Wallet not connected', 'error');
        return;
    }

    const amountGroth = Math.round(amount * 100000000);

    // Check balance
    const beamAsset = walletData.assets?.find(a => a.id === 0);
    const availableGroth = beamAsset?.available || 0;

    if (amountGroth > availableGroth - 100000) { // Leave room for fee
        showToast('Insufficient balance', 'error');
        return;
    }

    showToastAdvanced('Sending Donation', `${amount} BEAM to developers...`, 'pending');

    try {
        await apiCall('tx_send', {
            address: DONATION_ADDRESS,
            value: amountGroth,
            fee: 100000,
            asset_id: 0,
            comment: 'BEAM Light Wallet Donation - Thank you!',
            offline: true
        });

        showToastAdvanced('Thank You!', `Your ${amount} BEAM donation was sent!`, 'success');

        // Refresh data
        await loadWalletData();
        renderAssetCards();
        renderBalancesTable();

    } catch (e) {
        showToastAdvanced('Donation Failed', e.message, 'error');
    }
}
