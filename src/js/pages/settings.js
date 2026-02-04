/**
 * BEAM Wallet - Settings Page Module
 * Wallet and node configuration
 */

import { VERSION, BEAM_VERSION, DEX_CID } from '../config.js';
import { apiCall, checkServerStatus, switchNodeMode } from '../api.js';
import { showToast, showToastAdvanced } from '../components/toasts.js';

let currentNodeType = 'public';
let storedPassword = null;

/**
 * Set stored password (called from main app)
 */
export function setStoredPassword(pwd) {
    storedPassword = pwd;
}

/**
 * Render settings page
 */
export async function renderSettingsPage() {
    const container = document.getElementById('settings-content');
    if (!container) return;

    container.innerHTML = `
        <div class="settings-card">
            <!-- Connection Status -->
            <div class="settings-section">
                <h3>Connection Status</h3>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Status</span>
                        <span class="status-value" id="settings-status">Checking...</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Block Height</span>
                        <span class="status-value" id="settings-height">-</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Last Update</span>
                        <span class="status-value" id="settings-last-update">-</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Live Status</span>
                        <span class="live-indicator" id="live-indicator">
                            <span class="live-dot"></span>CHECKING
                        </span>
                    </div>
                </div>
            </div>

            <!-- Node Settings -->
            <div class="settings-section">
                <h3>Node Connection</h3>
                <div class="node-selector">
                    <button class="node-type-btn active" id="node-public-btn" onclick="selectNodeType('public', true)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                        </svg>
                        Public Node
                    </button>
                    <button class="node-type-btn" id="node-local-btn" onclick="selectNodeType('local', true)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                            <path d="M6 6h.01M6 18h.01"/>
                        </svg>
                        Local Node
                    </button>
                </div>
                <div class="node-info">
                    <span class="node-label">Current Node:</span>
                    <span class="mono-text" id="settings-node" style="font-size: 12px;">eu-node01.mainnet.beam.mw:8100</span>
                </div>
                <div class="node-type-display">
                    <span id="settings-node-type">Public</span>
                </div>
            </div>

            <!-- Local Node Status -->
            <div class="settings-section" id="local-node-section" style="display:none;">
                <h3>Local Node</h3>
                <div class="node-sync-status" id="node-sync-status">
                    <div class="sync-progress">
                        <div class="sync-bar" id="node-sync-bar" style="width: 0%"></div>
                    </div>
                    <span class="sync-text" id="node-sync-text">Not synced</span>
                </div>
            </div>

            <!-- DEX Support -->
            <div class="settings-section">
                <h3>DEX Support</h3>
                <div class="status-item">
                    <span class="status-label">Smart Contracts</span>
                    <span class="status-value" id="dex-support-status">Checking...</span>
                </div>
                <div class="dex-warning" id="dex-warning" style="display:none;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        <path d="M12 9v4M12 17h.01"/>
                    </svg>
                    <span>DEX requires a local node with shader support for full functionality.</span>
                </div>
            </div>

            <!-- Wallet Maintenance -->
            <div class="settings-section">
                <h3>Wallet Maintenance</h3>
                <div class="maintenance-info">
                    <p style="color: var(--text-secondary); font-size: 13px; margin: 0 0 12px 0;">
                        Rescan blockchain to recover missing balances after restoring a wallet.
                    </p>
                    <button class="rescan-btn" id="rescan-btn" onclick="triggerRescan()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <path d="M23 4v6h-6M1 20v-6h6"/>
                            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                        </svg>
                        Rescan Wallet
                    </button>
                </div>
            </div>

            <!-- About -->
            <div class="settings-section">
                <h3>About</h3>
                <div class="about-info">
                    <div class="about-row">
                        <span>Wallet Version</span>
                        <span>v${VERSION}</span>
                    </div>
                    <div class="about-row">
                        <span>BEAM Core</span>
                        <span>${BEAM_VERSION}</span>
                    </div>
                    <div class="about-row">
                        <span>DEX Contract</span>
                        <span class="mono-text" style="font-size: 11px;">${DEX_CID.substring(0, 16)}...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    await loadSettings();
}

/**
 * Load settings data
 */
export async function loadSettings() {
    const statusEl = document.getElementById('settings-status');
    const heightEl = document.getElementById('settings-height');
    const lastUpdateEl = document.getElementById('settings-last-update');
    const liveIndicator = document.getElementById('live-indicator');
    const nodeEl = document.getElementById('settings-node');

    try {
        const serverStatus = await checkServerStatus();
        const walletStatus = await apiCall('wallet_status');

        if (walletStatus) {
            statusEl.innerHTML = '<span style="color: var(--beam-cyan);">Connected</span>';
            heightEl.textContent = (walletStatus.current_height || 0).toLocaleString();
            lastUpdateEl.textContent = new Date().toLocaleTimeString();
            liveIndicator.className = 'live-indicator';
            liveIndicator.innerHTML = '<span class="live-dot"></span>LIVE';

            if (serverStatus) {
                currentNodeType = serverStatus.node_mode || 'public';
                selectNodeType(currentNodeType, false);

                // Update actual node address display
                if (currentNodeType === 'local') {
                    nodeEl.textContent = '127.0.0.1:10005';
                    document.getElementById('settings-node-type').textContent = 'Local';
                } else {
                    nodeEl.textContent = serverStatus.node_address || 'eu-node01.mainnet.beam.mw:8100';
                    document.getElementById('settings-node-type').textContent = 'Public';
                }

                if (serverStatus.node_running) {
                    document.getElementById('local-node-section').style.display = 'block';
                    updateNodeSyncStatus(serverStatus);

                    // Disable Local Node button when node is already running
                    const localBtn = document.getElementById('node-local-btn');
                    if (localBtn && currentNodeType === 'local') {
                        localBtn.disabled = true;
                        localBtn.title = 'Local node is already running';
                    }
                }
            }

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
    }
}

/**
 * Update node sync status display
 */
function updateNodeSyncStatus(status) {
    const bar = document.getElementById('node-sync-bar');
    const text = document.getElementById('node-sync-text');

    if (status.node_synced) {
        bar.style.width = '100%';
        text.textContent = 'Fully synced';
    } else {
        const progress = status.node_progress || 0;
        bar.style.width = `${progress}%`;
        text.textContent = `Syncing... ${progress}%`;
    }
}

/**
 * Select node type
 */
export async function selectNodeType(type, triggerChange = false) {
    const publicBtn = document.getElementById('node-public-btn');
    const localBtn = document.getElementById('node-local-btn');

    // Early return if already on this node type (prevent duplicate clicks)
    if (triggerChange && type === currentNodeType) {
        return;
    }

    currentNodeType = type;

    publicBtn.classList.toggle('active', type === 'public');
    localBtn.classList.toggle('active', type === 'local');

    // Update button disabled states - disable the active one
    publicBtn.disabled = (type === 'public');
    localBtn.disabled = (type === 'local');

    if (triggerChange) {
        // Disable both buttons during switch operation
        publicBtn.disabled = true;
        localBtn.disabled = true;

        try {
            await changeNode();
        } finally {
            // Re-enable the non-active button after switch completes
            publicBtn.disabled = (currentNodeType === 'public');
            localBtn.disabled = (currentNodeType === 'local');
        }
    }
}

/**
 * Change node connection
 */
async function changeNode() {
    if (!storedPassword) {
        const password = prompt('Enter wallet password to switch node:');
        if (!password) return;
        storedPassword = password;
    }

    showToastAdvanced('Switching Node', `Connecting to ${currentNodeType} node...`, 'pending');

    try {
        const result = await switchNodeMode(currentNodeType, storedPassword);

        if (result.success) {
            showToastAdvanced('Node Switched', `Now using ${currentNodeType} node`, 'success');
            await loadSettings();
        } else {
            throw new Error(result.error || 'Failed to switch node');
        }
    } catch (e) {
        showToastAdvanced('Switch Failed', e.message, 'error');
    }
}

/**
 * Check DEX support
 */
async function checkDexSupport() {
    const dexStatusEl = document.getElementById('dex-support-status');
    const dexWarning = document.getElementById('dex-warning');

    try {
        const result = await apiCall('invoke_contract', {
            args: `action=pools_view,cid=${DEX_CID}`
        });

        if (result && result.output) {
            dexStatusEl.innerHTML = '<span class="status-dot status-ok"></span>Available';
            dexWarning.style.display = 'none';
        } else {
            throw new Error('Not available');
        }
    } catch (e) {
        dexStatusEl.innerHTML = '<span class="status-dot status-error"></span>Not Available';
        dexWarning.style.display = 'flex';
    }
}

/**
 * Trigger wallet rescan
 */
let rescanInProgress = false;

async function triggerRescan() {
    if (rescanInProgress) return;

    if (!storedPassword) {
        const password = prompt('Enter wallet password to rescan wallet:');
        if (!password) return;
        storedPassword = password;
    }

    const btn = document.getElementById('rescan-btn');
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
            body: JSON.stringify({ password: storedPassword })
        });

        const result = await response.json();

        if (result.success) {
            showToastAdvanced('Rescan Complete', 'Wallet balances updated', 'success');
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

// Make functions available globally
window.selectNodeType = selectNodeType;
window.loadSettings = loadSettings;
window.triggerRescan = triggerRescan;
