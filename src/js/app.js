// ============================================
// Server runs until Ctrl+C - no auto-shutdown
// ============================================

// ============================================
// Version and Auto-Update
// ============================================
const APP_VERSION = '1.0.2';
const GITHUB_REPO = 'vsnation/Beam-Light-Wallet';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// Check for updates on startup
async function checkForUpdates(showNoUpdateMsg = false) {
    try {
        const response = await fetch(GITHUB_API_URL);
        if (!response.ok) {
            console.log('Could not check for updates');
            return null;
        }

        const release = await response.json();
        const latestVersion = release.tag_name.replace(/^v/, '');

        console.log(`Current version: ${APP_VERSION}, Latest: ${latestVersion}`);

        if (compareVersions(latestVersion, APP_VERSION) > 0) {
            showUpdateNotification(latestVersion, release.html_url, release.body);
            return { updateAvailable: true, version: latestVersion, url: release.html_url };
        } else if (showNoUpdateMsg) {
            showToast('You are running the latest version!', 'success');
        }

        return { updateAvailable: false, version: APP_VERSION };
    } catch (e) {
        console.error('Update check failed:', e);
        return null;
    }
}

// Compare semantic versions (returns 1 if a > b, -1 if a < b, 0 if equal)
function compareVersions(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA > numB) return 1;
        if (numA < numB) return -1;
    }
    return 0;
}

// Show update notification banner
async function showUpdateNotification(version, url, releaseNotes) {
    // Remove any existing update banner
    const existing = document.getElementById('update-banner');
    if (existing) existing.remove();

    // Detect installation type
    let installType = 'unknown';
    try {
        const response = await fetch('/api/status');
        const status = await response.json();
        installType = status.install_type || 'unknown';
    } catch (e) {}

    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, var(--beam-green), var(--beam-cyan));
        color: var(--bg-dark);
        padding: 12px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;

    // For git installs, show direct update button
    // For DMG, show download link
    const actionButton = installType === 'git'
        ? `<button onclick="bannerAutoUpdate('${version}')" id="banner-update-btn" style="
                background: var(--bg-dark);
                color: var(--text-primary);
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
            ">Update Now</button>`
        : `<a href="https://github.com/${GITHUB_REPO}/releases/download/v${version}/BEAM-LightWallet-${version}.dmg" style="
                background: var(--bg-dark);
                color: var(--text-primary);
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                text-decoration: none;
            ">Download v${version}</a>`;

    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span id="banner-text">New version <strong>v${version}</strong> available!</span>
        </div>
        <div style="display: flex; gap: 10px;">
            ${actionButton}
            <button onclick="dismissUpdateBanner()" style="
                background: transparent;
                color: var(--bg-dark);
                border: 1px solid var(--bg-dark);
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            ">Later</button>
        </div>
    `;

    document.body.prepend(banner);

    // Adjust body padding to account for banner
    document.body.style.paddingTop = '56px';
}

// Update directly from banner
async function bannerAutoUpdate(version) {
    const btn = document.getElementById('banner-update-btn');
    const text = document.getElementById('banner-text');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span style="display: flex; align-items: center; gap: 6px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="animation: spin 1s linear infinite;">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Updating...
        </span>`;
    }
    if (text) text.innerHTML = 'Downloading update...';

    try {
        const response = await fetch('/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version })
        });

        const result = await response.json();

        if (result.success) {
            if (text) text.innerHTML = result.updated ? 'Update complete! Restarting...' : 'Already up to date!';

            if (result.updated) {
                // Wait for server restart
                setTimeout(() => {
                    if (text) text.innerHTML = 'Refreshing page...';
                    waitForServerAndReload();
                }, 2000);
            } else {
                // No update needed
                setTimeout(() => dismissUpdateBanner(), 2000);
            }
        } else {
            throw new Error(result.error || 'Update failed');
        }
    } catch (e) {
        if (text) text.innerHTML = `Update failed: ${e.message}`;
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Retry';
        }
    }
}

function dismissUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) {
        banner.remove();
        document.body.style.paddingTop = '0';
    }
}

// Perform automatic update
async function performAutoUpdate(version) {
    const modal = document.getElementById('update-modal');
    const contentEl = modal?.querySelector('.modal-body');

    if (contentEl) {
        contentEl.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <div style="margin-bottom: 20px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--beam-cyan)" stroke-width="2" width="48" height="48" style="animation: spin 1s linear infinite;">
                        <path d="M23 4v6h-6M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                    </svg>
                </div>
                <h3 style="margin-bottom: 8px;">Updating to v${version}...</h3>
                <p id="update-status" style="color: var(--text-muted);">Downloading updates...</p>
            </div>
        `;
    }

    try {
        // Call server to perform update
        const response = await fetch('/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version })
        });

        const result = await response.json();

        if (result.success) {
            // Update successful - server will restart
            if (contentEl) {
                document.getElementById('update-status').textContent = 'Update complete! Restarting server...';
            }

            // Wait for server to restart, then reload
            setTimeout(() => {
                document.getElementById('update-status').textContent = 'Refreshing page...';
                waitForServerAndReload();
            }, 2000);
        } else {
            throw new Error(result.error || 'Update failed');
        }
    } catch (e) {
        console.error('Update failed:', e);
        if (contentEl) {
            contentEl.innerHTML = `
                <div class="info-section warning">
                    <h4>⚠️ Update Failed</h4>
                    <p>${e.message}</p>
                </div>
                <div class="info-section" style="margin-top: 16px;">
                    <h4>Manual Update</h4>
                    <p>Run this command in your terminal:</p>
                    <code style="display: block; background: var(--bg-dark); padding: 12px; border-radius: 6px; margin-top: 8px; font-family: var(--font-mono); font-size: 13px;">
                        cd ~/Desktop/Beam/LightWallet && git pull origin main
                    </code>
                </div>
            `;
        }
    }
}

// Wait for server to come back online and reload page
async function waitForServerAndReload(attempts = 0) {
    if (attempts > 30) {
        // Give up after 30 seconds
        document.getElementById('update-status').textContent = 'Server taking too long. Please refresh manually.';
        return;
    }

    try {
        const response = await fetch('/api/status', { cache: 'no-store' });
        if (response.ok) {
            // Server is back - reload page
            window.location.reload();
        } else {
            throw new Error('Server not ready');
        }
    } catch (e) {
        // Server not ready yet, try again
        setTimeout(() => waitForServerAndReload(attempts + 1), 1000);
    }
}

async function showUpdateModal(version, url) {
    // Detect installation type from server
    let installType = 'unknown';
    try {
        const response = await fetch('/api/status');
        const status = await response.json();
        installType = status.install_type || 'unknown';
    } catch (e) {
        console.log('Could not detect install type');
    }

    const modal = document.createElement('div');
    modal.id = 'update-modal';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';

    // Different content based on installation type
    let modalContent = '';

    if (installType === 'git') {
        // Git installation - fully automatic update
        modalContent = `
            <div class="modal" style="max-width: 450px;">
                <div class="modal-header">
                    <h2 class="modal-title">Update Available</h2>
                    <button class="modal-close" onclick="closeUpdateModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center; padding: 20px 0;">
                        <div style="font-size: 48px; margin-bottom: 16px;">🚀</div>
                        <h3 style="margin-bottom: 8px;">Version ${version} is available!</h3>
                        <p style="color: var(--text-muted); margin-bottom: 24px;">
                            Click the button below to automatically download and install the update.
                            The app will restart automatically.
                        </p>
                        <button onclick="performAutoUpdate('${version}')" class="quick-btn quick-btn-primary" style="padding: 14px 32px; font-size: 15px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="margin-right: 8px;">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Update Now
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn modal-btn-secondary" onclick="closeUpdateModal()">Later</button>
                </div>
            </div>
        `;
    } else if (installType === 'dmg') {
        // DMG installation - download new DMG
        const dmgUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${version}/BEAM-LightWallet-${version}.dmg`;
        modalContent = `
            <div class="modal" style="max-width: 450px;">
                <div class="modal-header">
                    <h2 class="modal-title">Update Available</h2>
                    <button class="modal-close" onclick="closeUpdateModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center; padding: 20px 0;">
                        <div style="font-size: 48px; margin-bottom: 16px;">📦</div>
                        <h3 style="margin-bottom: 8px;">Version ${version} is available!</h3>
                        <p style="color: var(--text-muted); margin-bottom: 24px;">
                            Download the new version and install it to update.
                        </p>
                        <a href="${dmgUrl}" class="quick-btn quick-btn-primary" style="display: inline-block; padding: 14px 32px; font-size: 15px; text-decoration: none;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="margin-right: 8px;">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Download DMG
                        </a>
                        <p style="margin-top: 16px; font-size: 12px; color: var(--text-muted);">
                            After downloading, quit this app and open the new DMG to install.
                        </p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn modal-btn-secondary" onclick="closeUpdateModal()">Later</button>
                </div>
            </div>
        `;
    } else {
        // Unknown installation - show both options
        modalContent = `
            <div class="modal" style="max-width: 480px;">
                <div class="modal-header">
                    <h2 class="modal-title">Update Available: v${version}</h2>
                    <button class="modal-close" onclick="closeUpdateModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="info-section">
                        <h4>🔄 Automatic Update (Git Installation)</h4>
                        <p>If you installed via <code>./install.sh</code> or git clone:</p>
                        <button onclick="performAutoUpdate('${version}')" class="quick-btn quick-btn-primary" style="width: 100%; margin-top: 12px;">
                            Update Automatically
                        </button>
                    </div>

                    <div class="info-section" style="margin-top: 16px;">
                        <h4>📦 Manual Download (DMG Installation)</h4>
                        <p>If you installed from DMG:</p>
                        <a href="${url}" target="_blank" class="quick-btn" style="display: block; text-align: center; margin-top: 12px; text-decoration: none;">
                            Go to GitHub Releases
                        </a>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn modal-btn-secondary" onclick="closeUpdateModal()">Later</button>
                </div>
            </div>
        `;
    }

    modal.innerHTML = modalContent;
    document.body.appendChild(modal);
}

function closeUpdateModal() {
    const modal = document.getElementById('update-modal');
    if (modal) modal.remove();
}

function copyUpdateCommand(cmd) {
    navigator.clipboard.writeText(cmd).then(() => {
        showToast('Command copied to clipboard!', 'success');
    });
}

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

// DEX Contract ID
const DEX_CONTRACT_ID = '729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf';

// Wallet data - will be fetched from API
let walletData = {
    assets: [],
    utxos: [],
    isConnected: false
};

// BEAM price in USD (fetched from CoinGecko via server)
let beamPriceUsd = 0;
let priceUpdateInterval = null;

// Fetch BEAM price from server
async function fetchBeamPrice() {
    try {
        const response = await fetch('/api/price');
        const data = await response.json();
        if (data.beam_usd) {
            beamPriceUsd = data.beam_usd;
            updateUsdDisplays();
        }
    } catch (e) {
        console.log('Price fetch error:', e);
    }
}

// Start price updates (every 60 seconds)
function startPriceUpdates() {
    fetchBeamPrice(); // Initial fetch
    if (priceUpdateInterval) clearInterval(priceUpdateInterval);
    priceUpdateInterval = setInterval(fetchBeamPrice, 60000);
}

// Update all USD displays on the page
function updateUsdDisplays() {
    // Re-render asset cards and balances to show USD values
    if (document.getElementById('asset-cards')) {
        renderAssetCards();
    }
    if (document.getElementById('balances-tbody')) {
        renderBalancesTable();
    }
}

// Format USD value
function formatUsd(value) {
    if (value === 0 || !beamPriceUsd) return '';
    if (value < 0.01) return '< $0.01';
    if (value < 1) return '$' + value.toFixed(4);
    if (value < 100) return '$' + value.toFixed(2);
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Calculate USD value for any asset (using DEX pool rates)
function getAssetUsdValue(assetId, amount) {
    if (!beamPriceUsd || amount <= 0) return 0;

    // BEAM direct conversion
    if (assetId === 0) {
        return (amount / GROTH) * beamPriceUsd;
    }

    // For other assets, find BEAM pool and calculate rate
    const pool = dexPools.find(p =>
        (p.aid1 === 0 && p.aid2 === assetId) ||
        (p.aid1 === assetId && p.aid2 === 0)
    );

    if (pool && pool.tok1 > 0 && pool.tok2 > 0) {
        // Calculate price in BEAM terms
        let priceInBeam;
        if (pool.aid1 === 0) {
            // BEAM is aid1, asset is aid2
            priceInBeam = pool.tok1 / pool.tok2; // 1 asset = X BEAM
        } else {
            // asset is aid1, BEAM is aid2
            priceInBeam = pool.tok2 / pool.tok1; // 1 asset = X BEAM
        }
        const assetBalance = amount / GROTH; // Assuming same decimals
        return assetBalance * priceInBeam * beamPriceUsd;
    }

    return 0; // No BEAM pool found
}

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

        // Load DEX pools for rate calculations (needed for USD values)
        loadDexPools().catch(e => console.log('DEX pools not available:', e));

        // Start price updates for USD display
        startPriceUpdates();

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

function showPage(pageId, updateUrl = true) {
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
        explorer: 'Explorer',
        donate: 'Support Development',
        settings: 'Settings'
    };
    document.getElementById('page-title').textContent = titles[pageId] || pageId;

    // Update URL
    if (updateUrl) {
        const urlMap = {
            dashboard: '/',
            assets: '/assets',
            transactions: '/transactions',
            addresses: '/addresses',
            dex: '/dex',
            explorer: '/explorer',
            donate: '/donate',
            settings: '/settings'
        };
        const url = urlMap[pageId] || '/';
        history.pushState({ page: pageId }, '', url);
    }

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
        loadDexActivity(); // Load recent activity feed
    } else if (pageId === 'explorer') {
        initExplorerPage();
    } else if (pageId === 'settings') {
        loadSettings();
    }
}

// Handle browser back/forward navigation
window.addEventListener('popstate', (event) => {
    if (event.state?.page) {
        showPage(event.state.page, false);

        // Handle explorer sub-routes
        if (event.state.page === 'explorer' && event.state.tab) {
            showExplorerTab(event.state.tab);
        }
    } else {
        // Parse URL path
        const path = window.location.pathname;
        const pageFromUrl = parseUrlToPage(path);
        if (pageFromUrl) {
            showPage(pageFromUrl, false);
        }
    }
});

// Parse URL path to page ID
function parseUrlToPage(path) {
    if (path === '/' || path === '/index.html') return 'dashboard';
    if (path.startsWith('/explorer')) return 'explorer';
    if (path.startsWith('/assets')) return 'assets';
    if (path.startsWith('/transactions')) return 'transactions';
    if (path.startsWith('/addresses')) return 'addresses';
    if (path.startsWith('/dex')) return 'dex';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/donate')) return 'donate';
    return 'dashboard';
}

// Initialize page from URL on load
function initPageFromUrl() {
    // Check for route injected by server
    const appRoute = window.APP_ROUTE;

    if (appRoute && appRoute.page) {
        // Handle explorer sub-routes that should go directly to detail pages
        if (appRoute.page === 'explorer' && appRoute.subType && appRoute.subId) {
            if (appRoute.subType === 'asset') {
                // Go directly to asset detail page
                showAssetDetail(parseInt(appRoute.subId));
                return;
            } else if (appRoute.subType === 'contract') {
                // Go directly to contract detail page
                showContractDetail(appRoute.subId);
                return;
            } else {
                // Other explorer routes - show explorer page and set route for handling
                showPage(appRoute.page, false);
                window.EXPLORER_ROUTE = { type: appRoute.subType, id: appRoute.subId };
            }
        } else {
            // Use server-injected route
            showPage(appRoute.page, false);
        }
    } else {
        // Fallback: parse URL manually
        const path = window.location.pathname;
        const pageId = parseUrlToPage(path);

        // Handle explorer sub-routes
        if (pageId === 'explorer' && path.includes('/explorer/')) {
            const parts = path.split('/');
            if (parts.length >= 4) {
                const type = parts[2];
                const id = parts[3];
                if (type === 'asset' && id) {
                    // Go directly to asset detail page
                    showAssetDetail(parseInt(id));
                    return;
                } else if (type === 'contract' && id) {
                    // Go directly to contract detail page
                    showContractDetail(id);
                    return;
                } else if (type && id) {
                    window.EXPLORER_ROUTE = { type, id };
                }
            }
        }
        showPage(pageId, false);
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

        // Calculate USD value for this asset
        const totalBalance = asset.balance + asset.locked;
        const usdValue = getAssetUsdValue(asset.id, totalBalance);
        const usdDisplay = usdValue > 0 ? formatUsd(usdValue) : '';

        return `
            <div class="asset-card asset-card-${config.class || ''}${isLpToken ? ' lp-token-card' : ''}" onclick="selectAsset(${asset.id})">
                <div class="asset-card-header">
                    ${isLpToken
                        ? renderLpDualIcon(asset.id, 28)
                        : `<div class="asset-icon asset-icon-${config.class || ''}" style="${displayIcon ? '' : `background: ${displayColor}`}">
                            ${displayIcon ? `<img src="${displayIcon}" style="width:28px;height:28px;" onerror="this.style.display='none';this.parentNode.style.background='${displayColor}';this.parentNode.textContent='${displaySymbol.substring(0,2)}'">` : displaySymbol.substring(0, 2)}
                          </div>`
                    }
                    <span class="asset-id">${isLpToken ? '<span style="font-size:9px;padding:1px 4px;background:linear-gradient(135deg, #25c2a0, #60a5fa);border-radius:3px;">LP</span>' : '#' + asset.id}</span>
                </div>
                <div class="asset-balance">
                    ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}<span class="asset-balance-decimal">.${decimal.substring(0,4) || '0000'}</span>
                </div>
                ${usdDisplay ? `<div class="asset-usd-below">${usdDisplay}</div>` : ''}
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

        // Calculate USD value
        const totalBalance = asset.balance + asset.locked;
        const usdValue = getAssetUsdValue(asset.id, totalBalance);
        const usdDisplay = usdValue > 0 ? formatUsd(usdValue) : '-';

        // LP Token special display
        const lpBadge = isLpToken ? '<span style="font-size:9px;padding:2px 6px;background:linear-gradient(135deg, #25c2a0, #60a5fa);color:#fff;border-radius:4px;margin-left:6px;vertical-align:middle;">LP</span>' : '';
        const lpTooltip = isLpToken ? `title="Liquidity Provider Token - Represents your share in the ${info.lpPair ? info.name.replace(' LP Token', '') : 'DEX'} pool. Withdraw to get back your tokens + earned fees."` : '';

        // Action button for LP tokens vs regular assets - opens popup modals
        const actionButton = isLpToken
            ? `<button class="action-btn trade-btn" onclick="event.stopPropagation(); openQuickWithdrawLPModal(${asset.id})" style="background:linear-gradient(135deg, #f59e0b, #ef4444);color:#fff;">Withdraw LP</button>`
            : `<button class="action-btn trade-btn" onclick="event.stopPropagation(); openQuickTradeModal(${asset.id})">Trade</button>`;

        return `
            <tr onclick="selectAsset(${asset.id})" style="cursor:pointer;" ${lpTooltip}>
                <td>
                    <div class="asset-cell">
                        ${isLpToken
                            ? renderLpDualIcon(asset.id, 32)
                            : `<div class="asset-cell-icon" style="${config.icon ? '' : `background: ${config.color}; color: ${textColor}`}">
                                ${config.icon ? `<img src="${config.icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${config.color}';this.parentNode.style.color='${textColor}';this.parentNode.textContent='${config.symbol.substring(0,2)}'">` : config.symbol.substring(0, 2)}
                              </div>`
                        }
                        <div class="asset-cell-info">
                            <span class="asset-cell-name">${info.name || config.name}${lpBadge}</span>
                            <span class="asset-cell-symbol">${info.symbol || config.symbol} <span style="color:var(--text-muted);font-size:10px;">#${asset.id}</span></span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="balance-cell">${balance}</div>
                    ${usdDisplay !== '-' ? `<div style="font-size:11px;opacity:0.5;margin-top:2px;">${usdDisplay}</div>` : ''}
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

    // Render dual LP icon
    document.getElementById('qw-lp-icon').innerHTML = renderLpDualIcon(lpAssetId, 44);

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
        console.error('Address type was:', currentReceiveType);
        console.error('Full error object:', JSON.stringify(e, Object.getOwnPropertyNames(e)));

        // Show meaningful error message instead of demo addresses
        const errorMsg = e.message || String(e) || 'Failed to create address';
        let userMessage = 'Unable to generate address';
        let userHint = '';

        if (errorMsg.includes('locked') || errorMsg.includes('-5')) {
            userMessage = 'Wallet is locked';
            userHint = 'Please unlock your wallet first';
        } else if (errorMsg.includes('connect') || errorMsg.includes('network') || errorMsg.includes('fetch')) {
            userMessage = 'Wallet not connected';
            userHint = 'Please start wallet-api and refresh';
        } else if (errorMsg.includes('not supported') || errorMsg.includes('Invalid address type')) {
            userMessage = `${currentReceiveType} addresses not supported`;
            userHint = 'Your wallet version may not support this address type';
        } else if (errorMsg.includes('shielded') || errorMsg.includes('lelantus')) {
            userMessage = 'Shielded pool not available';
            userHint = 'Please wait for wallet to sync shielded UTXOs';
        } else if (currentReceiveType === 'max_privacy') {
            userMessage = 'Max Privacy address unavailable';
            userHint = 'Requires connection to your own node with owner key';
        } else if (currentReceiveType === 'offline' || currentReceiveType === 'public_offline') {
            userMessage = `${currentReceiveType === 'offline' ? 'Offline' : 'Donation'} address error`;
            userHint = errorMsg.length < 100 ? errorMsg : 'Check console for details';
        } else {
            userHint = errorMsg.length < 100 ? errorMsg : 'Check console for details';
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

// Address info popup content for special address types
const ADDRESS_INFO_POPUPS = {
    offline: {
        title: 'Offline Address (Lelantus)',
        content: `
            <div class="info-section">
                <h4>Enhanced Privacy</h4>
                <p>Uses Lelantus shielded pool for improved transaction privacy. Your funds go through a privacy layer that breaks the link between sender and receiver.</p>
            </div>
            <div class="info-section">
                <h4>Sender Convenience</h4>
                <p>The sender doesn't need you to be online. They can send anytime, and you'll receive the funds when you sync.</p>
            </div>
            <div class="info-section">
                <h4>Reusable Address</h4>
                <p>Can receive multiple payments to the same address. Great for invoices or recurring payments.</p>
            </div>
            <div class="info-section warning">
                <h4>Note</h4>
                <p>Transactions may take slightly longer to confirm due to Lelantus processing. The address can receive up to 30 payments by default.</p>
            </div>
        `
    },
    max_privacy: {
        title: 'Maximum Privacy Address',
        content: `
            <div class="info-section">
                <h4>Maximum Privacy</h4>
                <p>Provides the highest level of transaction privacy available on BEAM. Uses multiple layers of encryption and anonymization.</p>
            </div>
            <div class="info-section">
                <h4>One-Time Use</h4>
                <p>This address can only be used <strong>ONCE</strong>. After receiving a payment, you must generate a new address for additional transactions.</p>
            </div>
            <div class="info-section">
                <h4>Best For</h4>
                <p>High-value transactions where maximum privacy is essential. Also useful when you don't want any transactions to be linkable.</p>
            </div>
            <div class="info-section warning">
                <h4>Requires Own Node</h4>
                <p>Max Privacy addresses require connection to your own BEAM node for full functionality. Using a public node may result in reduced privacy or connection errors.</p>
            </div>
        `
    }
};

// Show address info popup
function showAddressInfoPopup(type) {
    const info = ADDRESS_INFO_POPUPS[type];
    if (!info) return;

    document.getElementById('address-info-title').textContent = info.title;
    document.getElementById('address-info-content').innerHTML = info.content;
    openModal('address-info-modal');
}

// Track if user has seen address info popups
let addressInfoShown = {};

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

    // Show info popup for special address types (first time only per session)
    if ((type === 'offline' || type === 'max_privacy') && !addressInfoShown[type]) {
        addressInfoShown[type] = true;
        showAddressInfoPopup(type);
        return; // Don't generate yet - user clicks "Create Address" in popup
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
    // Display app version
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
        versionEl.textContent = `v${APP_VERSION}`;
    }

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

    // Check current node type
    const serverStatus = await checkServerStatus();
    const isPublicNode = !serverStatus?.node_mode || serverStatus.node_mode === 'public';

    if (isPublicNode) {
        // Show warning modal for public node
        showRescanWarningModal();
        return;
    }

    // Proceed with rescan on local node
    await performRescan();
}

// Show warning that rescan requires local node
function showRescanWarningModal() {
    const modal = document.createElement('div');
    modal.id = 'rescan-warning-modal';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';

    modal.innerHTML = `
        <div class="modal" style="max-width: 500px;">
            <div class="modal-header">
                <h2 class="modal-title">Rescan Requires Local Node</h2>
                <button class="modal-close" onclick="closeRescanWarningModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="info-section warning">
                    <h4>⚠️ Public Node Limitation</h4>
                    <p>You're connected to a public node. Full balance recovery requires a local node with your owner key.</p>
                </div>

                <div class="info-section">
                    <h4>Option 1: Switch to Local Node (Recommended)</h4>
                    <p>Start a local node which will automatically scan for your transactions. This provides full balance recovery.</p>
                    <button class="quick-btn quick-btn-primary" onclick="closeRescanWarningModal(); switchToLocalAndRescan();" style="width: 100%; margin-top: 12px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <rect x="2" y="3" width="20" height="14" rx="2"/>
                            <path d="M8 21h8M12 17v4"/>
                        </svg>
                        Switch to Local Node & Rescan
                    </button>
                </div>

                <div class="info-section">
                    <h4>Option 2: Quick Rescan (Limited)</h4>
                    <p>Rescan known addresses only. This may not find all historical transactions but works with public nodes.</p>
                    <button class="quick-btn" onclick="closeRescanWarningModal(); performQuickRescan();" style="width: 100%; margin-top: 12px;">
                        Quick Rescan
                    </button>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn modal-btn-secondary" onclick="closeRescanWarningModal()">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeRescanWarningModal() {
    const modal = document.getElementById('rescan-warning-modal');
    if (modal) modal.remove();
}

// Switch to local node and perform rescan
async function switchToLocalAndRescan() {
    const password = storedWalletPassword || sessionStorage.getItem('walletPassword');
    if (!password) {
        showToastAdvanced('Error', 'No password available. Please re-unlock your wallet.', 'error');
        return;
    }

    showToast('Starting local node...', 'info');

    try {
        // Switch to local node (this exports owner key and starts node)
        const response = await fetch('/api/node/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'local', password })
        });

        const result = await response.json();

        if (result.success) {
            showToastAdvanced('Local Node Started', 'Rescan will begin automatically as node syncs', 'success');
            // Update UI
            currentNodeType = 'local';
            selectNodeType('local');
            // Start monitoring sync progress
            startNodeSyncMonitoring();
        } else {
            throw new Error(result.error || 'Failed to switch to local node');
        }
    } catch (e) {
        showToastAdvanced('Switch Failed', e.message, 'error');
    }
}

// Quick rescan using wallet-api (works with public nodes but limited)
async function performQuickRescan() {
    const btn = document.getElementById('rescan-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="animation: spin 1s linear infinite;">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Rescanning...
        `;
    }

    showToastAdvanced('Quick Rescan', 'Scanning known addresses...', 'pending');

    try {
        // Use wallet-api's rescan method (scans known UTXOs)
        const result = await apiCall('rescan', {});

        showToastAdvanced('Quick Rescan Complete', 'Check your balances', 'success');
        await loadWalletData();
    } catch (e) {
        // If rescan method not supported, try refreshing wallet status
        try {
            await apiCall('wallet_status');
            showToastAdvanced('Refresh Complete', 'Wallet data updated', 'success');
            await loadWalletData();
        } catch (e2) {
            showToastAdvanced('Rescan Failed', e2.message, 'error');
        }
    }

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Rescan Wallet
        `;
    }
}

// Full rescan with local node
async function performRescan() {
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
                    // Load DEX pools in background for LP dual icons
                    loadDexPools().catch(e => console.log('DEX pools not available:', e.message));
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
                // Try to load DEX pools in background (may not work on public nodes)
                loadDexPools().catch(e => console.log('DEX pools not available on public node:', e.message));
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
    // Check for updates (async, non-blocking)
    checkForUpdates().catch(e => console.log('Update check skipped:', e.message));

    // Show loading state
    document.getElementById('asset-cards').innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading...</div>';
    document.getElementById('balances-tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">Loading...</td></tr>';

    // Check if we're on an explorer route - explorer works without wallet API
    const appRoute = window.APP_ROUTE;
    const isExplorerRoute = appRoute && appRoute.page === 'explorer';

    // Check server status first
    const serverStatus = await checkServerStatus();

    if (serverStatus) {
        console.log('Server status:', serverStatus);

        if (!serverStatus.wallet_api_running) {
            // Explorer routes can work without wallet API
            if (isExplorerRoute) {
                initExplorerSettings();
                initPageFromUrl();
                return;
            }
            showLockedOverlay('Wallet API is not running. Please unlock your wallet first.');
            return;
        }
    }

    // Try to load data from API
    const connected = await loadWalletData();

    if (!connected) {
        // Check if it's because wallet is locked
        if (serverStatus && !serverStatus.wallet_api_running) {
            // Explorer routes can work without wallet API
            if (isExplorerRoute) {
                initExplorerSettings();
                initPageFromUrl();
                return;
            }
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

    // Initialize Explorer settings
    initExplorerSettings();
    renderBalancesTable();
    renderUtxos();

    // Initialize page from URL route (e.g., /explorer/block/123, /dex, /settings)
    initPageFromUrl();

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
    const showMyAssets = document.getElementById('show-my-assets')?.checked || false;

    // Apply "My Created Assets" filter first
    let baseAssets = assets;
    if (showMyAssets && ownedAssets.length > 0) {
        const ownedIds = ownedAssets.map(a => a.aid);
        baseAssets = assets.filter(a => ownedIds.includes(a.asset_id));
    }

    const filtered = baseAssets.filter(a => {
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

        // Calculate USD value for this asset
        const totalBalance = userAsset ? (userAsset.balance + userAsset.locked) : 0;
        const usdValue = totalBalance > 0 ? getAssetUsdValue(aid, totalBalance) : 0;
        const usdDisplay = usdValue > 0 ? formatUsd(usdValue) : '';

        // Format supply (emission value)
        const supply = a.value ? formatAmount(a.value) : '-';

        const isHidden = hiddenAssets.has(aid);

        // LP Token badge
        const lpBadge = isLpToken ? '<span style="font-size:9px;padding:2px 6px;background:linear-gradient(135deg, #25c2a0, #60a5fa);color:#fff;border-radius:4px;margin-left:6px;">LP</span>' : '';

        // Check if this asset is owned (created by user)
        const isOwned = ownedAssets.some(oa => oa.aid === aid);

        // Action button - Withdraw LP for LP tokens, Trade for regular - opens popup modals
        const actionButton = isLpToken
            ? `<button class="action-btn trade-btn" onclick="event.stopPropagation();openQuickWithdrawLPModal(${aid})" style="background:linear-gradient(135deg, #f59e0b, #ef4444);color:#fff;">Withdraw LP</button>`
            : `<button class="action-btn trade-btn" onclick="event.stopPropagation();openQuickTradeModal(${aid})">Trade</button>`;

        // Mint button for owned assets
        const mintButton = isOwned
            ? `<button class="action-btn" onclick="event.stopPropagation();openMintModal(${aid})" style="background:linear-gradient(135deg, #8b5cf6, #6366f1);color:#fff;">Mint</button>`
            : '';

        // Owned badge
        const ownedBadge = isOwned ? '<span style="font-size:9px;padding:2px 6px;background:linear-gradient(135deg, #8b5cf6, #6366f1);color:#fff;border-radius:4px;margin-left:6px;">OWNER</span>' : '';

        return `
            <tr style="${hasBalance ? 'background:var(--beam-cyan-dim);' : ''}${isHidden ? 'opacity:0.5;' : ''}" ${isLpToken ? 'title="Liquidity Provider Token - Represents your share in a DEX pool"' : ''}>
                <td>
                    <div class="asset-cell">
                        ${isLpToken
                            ? renderLpDualIcon(aid, 32)
                            : `<div class="asset-cell-icon" style="${icon ? '' : `background: ${color}; color: #fff`}">
                                ${icon ? `<img src="${icon}" style="width:100%;height:100%;" onerror="this.style.display='none';this.parentNode.style.background='${color}';this.parentNode.style.color='#fff';this.parentNode.textContent='${symbol.substring(0,2)}'">` : symbol.substring(0, 2).toUpperCase()}
                              </div>`
                        }
                        <div class="asset-cell-info">
                            <span class="asset-cell-name">${name}${lpBadge}${ownedBadge}${isHidden ? ' <span style="color:var(--text-muted);font-size:11px;">(hidden)</span>' : ''}</span>
                            <span class="asset-cell-symbol">${symbol}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="balance-cell" style="${hasBalance ? 'color:var(--beam-cyan);font-weight:600;' : ''}">${userBalance} ${symbol}</div>
                    ${usdDisplay ? `<div style="font-size:11px;opacity:0.5;margin-top:2px;">${usdDisplay}</div>` : ''}
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
                        ${mintButton}
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
            // Calculate USD values for swap
            const paidRaw = tx.invoke_data[0].amounts.find(a => a.amount > 0)?.amount || 0;
            const swapPaidUsd = getAssetUsdValue(swapDetails.paidAssetId, paidRaw);
            const swapPaidUsdDisplay = swapPaidUsd > 0 ? formatUsd(swapPaidUsd) : '';

            detailHtml = '<div class="tx-swap-detail" style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:4px;">' +
                '<span style="color:var(--warning);">' + swapDetails.paidSymbol + '</span>' +
                '<span>→</span>' +
                '<span style="color:var(--success);">' + swapDetails.receivedSymbol + '</span>' +
            '</div>';
            amountHtml = '<div class="tx-amount" style="color:var(--warning);font-size:12px;">-' + swapDetails.paidAmount + ' ' + swapDetails.paidSymbol + '</div>' +
                (swapPaidUsdDisplay ? '<div style="font-size:10px;opacity:0.5;">' + swapPaidUsdDisplay + '</div>' : '') +
                '<div class="tx-amount" style="color:var(--success);font-size:12px;">+' + swapDetails.receivedAmount + ' ' + swapDetails.receivedSymbol + '</div>';
        } else {
            // Calculate USD value for this transaction
            const txUsdValue = getAssetUsdValue(aid, tx.value || 0);
            const txUsdDisplay = txUsdValue > 0 ? formatUsd(txUsdValue) : '';

            detailHtml = '<div class="tx-asset">' +
                '<span class="tx-asset-icon" style="background:' + iconBg + '">' + iconHtml + '</span>' +
                '<span>' + config.symbol + '</span>' +
                '<span class="tx-asset-id">#' + aid + '</span>' +
            '</div>';
            amountHtml = '<div class="tx-amount" style="color:' + (isReceive ? 'var(--success)' : 'var(--warning)') + '">' + (isReceive ? '+' : '-') + amount + '</div>' +
                (txUsdDisplay ? '<div style="font-size:10px;opacity:0.5;">' + txUsdDisplay + '</div>' : '') +
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
const MINTER_CID = '295fe749dc12c55213d1bd16ced174dc8780c020f59cb17749e900bb0c15d868';
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

// Load activity feed when showing swap tab
function loadActivityOnSwap() {
    if (document.getElementById('dex-activity-feed')) {
        loadDexActivity();
    }
}

// =============================================
// DEX ACTIVITY FEED
// =============================================
let dexActivity = [];
let activityUpdateInterval = null;

async function loadDexActivity() {
    const feed = document.getElementById('dex-activity-feed');
    const status = document.getElementById('activity-status');
    if (!feed) return;

    try {
        // Fetch DEX contract calls history from explorer
        const url = `${EXPLORER_API}/contract?id=${DEX_CID}&state=0&nMaxTxs=20`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Explorer API error');

        const data = await response.json();
        const callsHistory = data['Calls history'];

        if (!callsHistory || !callsHistory.value) {
            feed.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">No activity found</div>';
            return;
        }

        dexActivity = parseActivityFromHistory(callsHistory);
        renderActivityFeed();

        if (status) status.textContent = `${dexActivity.length} recent`;

        // Auto-update every 30 seconds
        if (!activityUpdateInterval) {
            activityUpdateInterval = setInterval(loadDexActivity, 30000);
        }
    } catch (error) {
        console.error('Failed to load activity:', error);
        feed.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">Failed to load activity</div>`;
    }
}

function parseActivityFromHistory(callsHistory) {
    const activities = [];
    const rows = callsHistory.value || [];

    // Skip header row
    for (let i = 1; i < rows.length && activities.length < 15; i++) {
        const row = rows[i];

        // Handle grouped items
        if (row.type === 'group') {
            for (const item of (row.value || [])) {
                const activity = parseActivityRow(item);
                if (activity) activities.push(activity);
            }
        } else if (Array.isArray(row)) {
            const activity = parseActivityRow(row);
            if (activity) activities.push(activity);
        }
    }

    return activities;
}

function parseActivityRow(row) {
    if (!Array.isArray(row) || row.length < 5) return null;

    // Row structure: [Height, Cid, Kind, Action, Args, Funds]
    const height = row[0]?.value !== undefined ? row[0].value : row[0];
    const action = row[3]?.value !== undefined ? row[3].value : row[3];
    const fundsTable = row[5];

    // Include Trade, AddLiquidity, Withdraw
    if (!action || !['Trade', 'AddLiquidity', 'Withdraw'].includes(action)) {
        return null;
    }

    // Parse funds: +value = user spent (sent to LP), -value = user received (from LP)
    const funds = [];
    if (fundsTable && fundsTable.value) {
        for (const fundRow of fundsTable.value) {
            if (!Array.isArray(fundRow) || fundRow.length < 2) continue;
            const assetId = fundRow[0]?.value !== undefined ? fundRow[0].value : fundRow[0];
            const amount = fundRow[1]?.value !== undefined ? fundRow[1].value : fundRow[1];
            funds.push({ assetId, amount });
        }
    }

    return { height, action, funds };
}

function renderActivityFeed() {
    const feed = document.getElementById('dex-activity-feed');
    if (!feed || dexActivity.length === 0) {
        if (feed) feed.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">No activity found</div>';
        return;
    }

    feed.innerHTML = dexActivity.map(act => {
        // Determine activity type and styling
        let icon, bgColor, label;

        if (act.action === 'Trade') {
            // Find spent and received
            const spent = act.funds.find(f => f.amount > 0);  // +value = user sent
            const received = act.funds.find(f => f.amount < 0);  // -value = user got

            if (!spent || !received) return '';

            const spentInfo = getAssetInfo(spent.assetId);
            const recvInfo = getAssetInfo(Math.abs(received.assetId));
            const spentAmt = Math.abs(spent.amount);
            const recvAmt = Math.abs(received.amount);

            // Is this a buy (receiving BEAM) or sell (spending BEAM)?
            const isBuy = received.assetId === 0;
            bgColor = isBuy ? 'var(--success)' : 'var(--error)';
            label = isBuy ? 'BUY' : 'SELL';
            icon = '<path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>';

            // USD values
            const spentUsd = getAssetUsdValue(spent.assetId, spentAmt);
            const recvUsd = getAssetUsdValue(Math.abs(received.assetId), recvAmt);

            return `
                <div class="activity-item" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--void);border-radius:10px;margin-bottom:8px;">
                    <div style="width:32px;height:32px;border-radius:8px;background:${bgColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="16" height="16">${icon}</svg>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                            <span style="font-size:11px;font-weight:600;color:${bgColor};text-transform:uppercase;">${label}</span>
                            <span style="font-size:11px;color:var(--text-muted);">#${act.height}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:4px;font-size:12px;">
                            ${renderTokenIcon(spentInfo, 16)}
                            <span style="color:var(--error);">-${formatAmount(spentAmt, 4)}</span>
                            <span style="color:var(--text-muted);">${spentInfo.symbol}</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" width="12" height="12" style="margin:0 2px;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                            ${renderTokenIcon(recvInfo, 16)}
                            <span style="color:var(--success);">+${formatAmount(recvAmt, 4)}</span>
                            <span style="color:var(--text-muted);">${recvInfo.symbol}</span>
                        </div>
                    </div>
                    <div style="text-align:right;font-size:11px;color:var(--text-muted);">
                        ${spentUsd > 0 ? formatUsd(spentUsd) : ''}
                    </div>
                </div>
            `;

        } else if (act.action === 'AddLiquidity') {
            bgColor = 'var(--beam-cyan)';
            label = 'ADD LIQ';
            icon = '<path d="M12 5v14M5 12h14"/>';

            // Find the two assets sent (both positive)
            const sent = act.funds.filter(f => f.amount > 0);
            if (sent.length < 2) return '';

            const asset1 = getAssetInfo(sent[0].assetId);
            const asset2 = getAssetInfo(sent[1].assetId);
            const amt1 = sent[0].amount;
            const amt2 = sent[1].amount;
            const usd1 = getAssetUsdValue(sent[0].assetId, amt1);

            return `
                <div class="activity-item" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--void);border-radius:10px;margin-bottom:8px;">
                    <div style="width:32px;height:32px;border-radius:8px;background:${bgColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="16" height="16">${icon}</svg>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                            <span style="font-size:11px;font-weight:600;color:${bgColor};">${label}</span>
                            <span style="font-size:11px;color:var(--text-muted);">#${act.height}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:4px;font-size:12px;flex-wrap:wrap;">
                            ${renderTokenIcon(asset1, 16)}
                            <span style="color:var(--warning);">-${formatAmount(amt1, 4)} ${asset1.symbol}</span>
                            <span style="color:var(--text-muted);">+</span>
                            ${renderTokenIcon(asset2, 16)}
                            <span style="color:var(--warning);">-${formatAmount(amt2, 4)} ${asset2.symbol}</span>
                        </div>
                    </div>
                    <div style="text-align:right;font-size:11px;color:var(--text-muted);">
                        ${usd1 > 0 ? formatUsd(usd1 * 2) : ''}
                    </div>
                </div>
            `;

        } else if (act.action === 'Withdraw') {
            bgColor = 'var(--warning)';
            label = 'WITHDRAW';
            icon = '<path d="M5 12h14"/>';

            // Find received assets (negative = user got)
            const received = act.funds.filter(f => f.amount < 0);
            if (received.length < 2) return '';

            const asset1 = getAssetInfo(Math.abs(received[0].assetId));
            const asset2 = getAssetInfo(Math.abs(received[1].assetId));
            const amt1 = Math.abs(received[0].amount);
            const amt2 = Math.abs(received[1].amount);
            const usd1 = getAssetUsdValue(Math.abs(received[0].assetId), amt1);

            return `
                <div class="activity-item" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--void);border-radius:10px;margin-bottom:8px;">
                    <div style="width:32px;height:32px;border-radius:8px;background:${bgColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="16" height="16">${icon}</svg>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                            <span style="font-size:11px;font-weight:600;color:${bgColor};">${label}</span>
                            <span style="font-size:11px;color:var(--text-muted);">#${act.height}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:4px;font-size:12px;flex-wrap:wrap;">
                            ${renderTokenIcon(asset1, 16)}
                            <span style="color:var(--success);">+${formatAmount(amt1, 4)} ${asset1.symbol}</span>
                            <span style="color:var(--text-muted);">+</span>
                            ${renderTokenIcon(asset2, 16)}
                            <span style="color:var(--success);">+${formatAmount(amt2, 4)} ${asset2.symbol}</span>
                        </div>
                    </div>
                    <div style="text-align:right;font-size:11px;color:var(--text-muted);">
                        ${usd1 > 0 ? formatUsd(usd1 * 2) : ''}
                    </div>
                </div>
            `;
        }

        return '';
    }).join('');
}

// Load activity when DEX page loads
function startActivityUpdates() {
    loadDexActivity();
}

// Load DEX pools
let dexAvailable = false;

async function loadDexPools() {
    const container = document.getElementById('pools-list');
    if (container) {
        container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);">Loading pools...</div>';
    }

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

        // Re-render asset cards to show LP dual icons (if on dashboard)
        if (document.getElementById('asset-cards')) {
            renderAssetCards();
        }
        // Also re-render balances table for LP icons
        if (document.getElementById('balances-tbody')) {
            renderBalancesTable();
        }
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

// Render dual LP token icons (shows both assets in the pool)
function renderLpDualIcon(lpTokenId, size = 28) {
    // Get LP token info which includes lpPair with aid1/aid2
    const lpInfo = getAssetInfo(lpTokenId);

    // If we have lpPair info from metadata, use it
    if (lpInfo.lpPair && lpInfo.lpPair.aid1 !== undefined && lpInfo.lpPair.aid2 !== undefined) {
        const a1 = getAssetInfo(lpInfo.lpPair.aid1);
        const a2 = getAssetInfo(lpInfo.lpPair.aid2);

        // Render overlapping dual icons
        const iconSize = Math.floor(size * 0.75);
        const overlap = Math.floor(size * 0.25);

        return `<div class="lp-dual-icon" style="display:flex;align-items:center;width:${size + iconSize - overlap}px;height:${size}px;">
            ${renderTokenIcon(a1, iconSize)}
            <div style="margin-left:-${overlap}px;border:2px solid var(--bg-secondary);border-radius:50%;">${renderTokenIcon(a2, iconSize)}</div>
        </div>`;
    }

    // Fallback: try to find pool in dexPools
    const pool = dexPools.find(p => p['lp-token'] === lpTokenId);
    if (!pool) {
        // Final fallback to LP text
        return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg, #25c2a0, #60a5fa);display:flex;align-items:center;justify-content:center;font-size:${size * 0.35}px;font-weight:600;">LP</div>`;
    }

    // Get asset info for both pool assets
    const a1 = getAssetInfo(pool.aid1);
    const a2 = getAssetInfo(pool.aid2);

    // Render overlapping dual icons
    const iconSize = Math.floor(size * 0.75);
    const overlap = Math.floor(size * 0.25);

    return `<div class="lp-dual-icon" style="display:flex;align-items:center;width:${size + iconSize - overlap}px;height:${size}px;">
        ${renderTokenIcon(a1, iconSize)}
        <div style="margin-left:-${overlap}px;border:2px solid var(--bg-secondary);border-radius:50%;">${renderTokenIcon(a2, iconSize)}</div>
    </div>`;
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

        // Calculate USD values for swap amounts
        const payUsd = getAssetUsdValue(dexFromAsset.aid, payAmount);
        const receiveUsd = getAssetUsdValue(dexToAsset.aid, buyAmount);
        const payUsdDisplay = payUsd > 0 ? ` (${formatUsd(payUsd)})` : '';
        const receiveUsdDisplay = receiveUsd > 0 ? ` (${formatUsd(receiveUsd)})` : '';

        // Update swap info display - matching AllDapps format with USD
        document.getElementById('dex-rate').textContent = buyAmount > 0
            ? `1 ${dexToAsset.symbol} = ${formatForInput(payFormatted / buyFormatted, 6)} ${dexFromAsset.symbol}`
            : '-';
        document.getElementById('dex-pay').innerHTML = `${formatForInput(payFormatted, 6)} ${dexFromAsset.symbol}${payUsdDisplay ? `<span style="opacity:0.5;font-size:11px;margin-left:4px;">${payUsdDisplay}</span>` : ''}`;
        document.getElementById('dex-receive').innerHTML = `${formatForInput(buyFormatted, 6)} ${dexToAsset.symbol}${receiveUsdDisplay ? `<span style="opacity:0.5;font-size:11px;margin-left:4px;">${receiveUsdDisplay}</span>` : ''}`;
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

// ============================================
// TOKEN MINTER (CONFIDENTIAL ASSETS)
// ============================================
let ownedAssets = []; // User's created assets
let currentMintAsset = null; // Currently selected asset for minting

// Open Create Token modal
function openCreateTokenModal() {
    // Reset form
    document.getElementById('ct-name').value = '';
    document.getElementById('ct-symbol').value = '';
    document.getElementById('ct-short-name').value = '';
    document.getElementById('ct-supply').value = '';
    document.getElementById('ct-decimals').value = '8';
    document.getElementById('ct-unit-name').value = '';
    document.getElementById('ct-logo-url').value = '';
    document.getElementById('ct-short-desc').value = '';
    document.getElementById('ct-long-desc').value = '';
    document.getElementById('ct-color').value = '#25c2a0';
    document.getElementById('ct-color-hex').value = '#25c2a0';
    document.getElementById('ct-color-preview').style.background = '#25c2a0';

    // Reset button
    const btn = document.getElementById('ct-create-btn');
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="vertical-align: middle; margin-right: 8px;"><path d="M12 5v14M5 12h14"/></svg> Create Token (60 BEAM)`;

    openModal('create-token-modal');
}

// Sync color from hex input
function syncColorFromHex() {
    const hexInput = document.getElementById('ct-color-hex');
    const colorPicker = document.getElementById('ct-color');
    const preview = document.getElementById('ct-color-preview');

    let hex = hexInput.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;

    // Validate hex
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        colorPicker.value = hex;
        preview.style.background = hex;
    }
}

// Sync color picker to hex input
function syncColorToHex() {
    const colorPicker = document.getElementById('ct-color');
    const hexInput = document.getElementById('ct-color-hex');
    const preview = document.getElementById('ct-color-preview');

    hexInput.value = colorPicker.value;
    preview.style.background = colorPicker.value;
}

// Create new token
async function createToken() {
    const name = document.getElementById('ct-name').value.trim();
    const symbol = document.getElementById('ct-symbol').value.trim().toUpperCase();
    const shortName = document.getElementById('ct-short-name').value.trim() || symbol;
    const supply = document.getElementById('ct-supply').value;
    const decimals = parseInt(document.getElementById('ct-decimals').value);
    const unitName = document.getElementById('ct-unit-name').value.trim() || 'groth';
    const logoUrl = document.getElementById('ct-logo-url').value.trim();
    const shortDesc = document.getElementById('ct-short-desc').value.trim();
    const longDesc = document.getElementById('ct-long-desc').value.trim();
    const color = document.getElementById('ct-color').value;

    // Validation
    if (!name) {
        showToast('Please enter a token name', 'error');
        return;
    }
    if (!symbol || symbol.length > 8) {
        showToast('Symbol is required (max 8 characters)', 'error');
        return;
    }

    const supplyNum = parseInt(supply);
    if (!supplyNum || supplyNum <= 0) {
        showToast('Please enter a valid max supply', 'error');
        return;
    }

    // Check BEAM balance (need 60 BEAM + fee)
    const beamAsset = walletData.assets?.find(a => a.id === 0);
    const beamAvailable = (beamAsset?.available || 0) / GROTH;
    if (beamAvailable < 61) {
        showToast('Insufficient BEAM balance. You need at least 61 BEAM (60 fee + 1 for tx)', 'error');
        return;
    }

    // Build metadata string
    const ratio = Math.pow(10, decimals);
    let metadata = `STD:SCH_VER=1;N=${name};SN=${shortName};UN=${symbol};NTHUN=${unitName};NTH_RATIO=${ratio}`;
    if (logoUrl) metadata += `;OPT_LOGO_URL=${logoUrl}`;
    if (shortDesc) metadata += `;OPT_SHORT_DESC=${shortDesc}`;
    if (longDesc) metadata += `;OPT_LONG_DESC=${longDesc}`;
    if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) metadata += `;OPT_COLOR=${color}`;

    // Calculate limit in smallest units
    const limit = BigInt(supplyNum) * BigInt(ratio);

    // Update button
    const btn = document.getElementById('ct-create-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-small"></span> Creating Token...';

    showToastAdvanced('Creating Token', `Creating ${symbol} on BEAM blockchain...`, 'pending');

    try {
        // Call Minter contract
        const createResult = await apiCall('invoke_contract', {
            args: `action=create_token,cid=${MINTER_CID},metadata=${metadata},limit=${limit}`,
            createTx: true
        });

        if (createResult.error) {
            throw new Error(createResult.error.message || 'Contract call failed');
        }

        // Check for raw_data to process
        if (createResult.raw_data) {
            const txResult = await apiCall('process_invoke_data', {
                data: createResult.raw_data
            });

            if (txResult.error) {
                throw new Error(txResult.error.message || 'Transaction failed');
            }

            showToastAdvanced('Token Created!', `${symbol} has been created. TX: ${(txResult.txid || '').slice(0, 16)}...`, 'success');
        } else {
            showToastAdvanced('Token Created!', `${symbol} creation initiated`, 'success');
        }

        closeModal('create-token-modal');

        // Refresh wallet data
        await loadWalletData();
        renderAssetCards();

    } catch (e) {
        showToastAdvanced('Creation Failed', e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="vertical-align: middle; margin-right: 8px;"><path d="M12 5v14M5 12h14"/></svg> Create Token (60 BEAM)`;
    }
}

// Toggle "My Created Assets" filter
async function toggleMyAssets() {
    const checkbox = document.getElementById('show-my-assets');
    const isChecked = checkbox.checked;

    if (isChecked) {
        // Load owned assets from Minter contract
        showToastAdvanced('Loading', 'Loading your created assets...', 'pending');

        try {
            const result = await apiCall('invoke_contract', {
                args: `action=view_owned,cid=${MINTER_CID}`
            });

            let output = result;
            if (result?.output) {
                try { output = JSON.parse(result.output); } catch(e) {}
            }

            ownedAssets = output?.assets || [];

            if (ownedAssets.length === 0) {
                showToast('You haven\'t created any tokens yet', 'info');
            } else {
                showToastAdvanced('Loaded', `Found ${ownedAssets.length} owned assets`, 'success');
            }

        } catch (e) {
            showToast('Failed to load owned assets: ' + e.message, 'error');
            ownedAssets = [];
        }
    }

    // Re-render all assets with filter
    renderAllAssets();
}

// Render all assets (with optional "My Assets" filter)
function renderAllAssetsFiltered(assets) {
    const showMyAssets = document.getElementById('show-my-assets')?.checked || false;

    if (showMyAssets && ownedAssets.length > 0) {
        // Filter to only show owned assets
        const ownedIds = ownedAssets.map(a => a.aid);
        return assets.filter(a => ownedIds.includes(a.id));
    }

    return assets;
}

// Open Mint Token modal for a specific asset
async function openMintModal(assetId) {
    // Get asset info
    const asset = getAssetInfo(assetId);

    // Find owned asset data
    let ownedData = ownedAssets.find(a => a.aid === assetId);

    // If not in cache, try to load
    if (!ownedData) {
        try {
            const result = await apiCall('invoke_contract', {
                args: `action=view_owned,cid=${MINTER_CID}`
            });

            let output = result;
            if (result?.output) {
                try { output = JSON.parse(result.output); } catch(e) {}
            }

            ownedAssets = output?.assets || [];
            ownedData = ownedAssets.find(a => a.aid === assetId);
        } catch (e) {
            console.error('Failed to load owned assets:', e);
        }
    }

    if (!ownedData) {
        showToast('You don\'t own this asset or it wasn\'t created with Minter contract', 'error');
        return;
    }

    currentMintAsset = {
        aid: assetId,
        symbol: asset.symbol,
        name: asset.name,
        icon: asset.icon,
        color: asset.color,
        supply: ownedData.supply || 0,
        limit: ownedData.limit || 0,
        remaining: (ownedData.limit || 0) - (ownedData.supply || 0),
        decimals: asset.decimals || 8
    };

    // Update modal UI
    const iconEl = document.getElementById('mint-token-icon');
    const initials = (asset.symbol || '??').slice(0, 2).toUpperCase();
    if (asset.icon) {
        iconEl.innerHTML = `<img src="${asset.icon}" style="width:100%;height:100%;border-radius:50%;" onerror="this.parentElement.innerHTML='${initials}'">`;
    } else {
        iconEl.innerHTML = initials;
        iconEl.style.background = asset.color || 'var(--beam-cyan)';
    }

    document.getElementById('mint-token-name').textContent = `${asset.symbol} (ID: ${assetId})`;

    const remainingDisplay = currentMintAsset.remaining / Math.pow(10, currentMintAsset.decimals);
    document.getElementById('mint-remaining').textContent = formatAmount(currentMintAsset.remaining, currentMintAsset.decimals);

    document.getElementById('mint-amount').value = '';

    // Reset button
    const btn = document.getElementById('mint-btn');
    btn.disabled = false;
    btn.textContent = 'Mint Tokens';

    openModal('mint-token-modal');
}

// Set mint amount based on percentage
function setMintPercent(percent) {
    if (!currentMintAsset) return;

    const remaining = currentMintAsset.remaining / Math.pow(10, currentMintAsset.decimals);
    const amount = (remaining * percent / 100).toFixed(currentMintAsset.decimals);

    document.getElementById('mint-amount').value = parseFloat(amount);
}

// Execute mint tokens
async function executeMintToken() {
    if (!currentMintAsset) {
        showToast('No asset selected', 'error');
        return;
    }

    const amountStr = document.getElementById('mint-amount').value;
    const amount = parseFloat(amountStr);

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    // Convert to smallest units
    const amountSmall = Math.floor(amount * Math.pow(10, currentMintAsset.decimals));

    if (amountSmall > currentMintAsset.remaining) {
        showToast('Amount exceeds remaining mintable supply', 'error');
        return;
    }

    // Update button
    const btn = document.getElementById('mint-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-small"></span> Minting...';

    showToastAdvanced('Minting', `Minting ${amount} ${currentMintAsset.symbol}...`, 'pending');

    try {
        // Call Minter contract withdraw action
        const mintResult = await apiCall('invoke_contract', {
            args: `action=withdraw,cid=${MINTER_CID},aid=${currentMintAsset.aid},amount=${amountSmall}`,
            createTx: true
        });

        if (mintResult.error) {
            throw new Error(mintResult.error.message || 'Mint call failed');
        }

        // Process transaction
        if (mintResult.raw_data) {
            const txResult = await apiCall('process_invoke_data', {
                data: mintResult.raw_data
            });

            if (txResult.error) {
                throw new Error(txResult.error.message || 'Transaction failed');
            }

            showToastAdvanced('Tokens Minted!', `${amount} ${currentMintAsset.symbol} minted to your wallet`, 'success');
        } else {
            showToastAdvanced('Minting Initiated', `${amount} ${currentMintAsset.symbol}`, 'success');
        }

        closeModal('mint-token-modal');

        // Refresh wallet data
        await loadWalletData();
        renderAssetCards();

    } catch (e) {
        showToastAdvanced('Minting Failed', e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Mint Tokens';
    }
}

// Add event listener for color picker
document.addEventListener('DOMContentLoaded', () => {
    const colorPicker = document.getElementById('ct-color');
    if (colorPicker) {
        colorPicker.addEventListener('input', syncColorToHex);
    }
});

// ============================================
// EXPLORER PAGE
// ============================================
let EXPLORER_NODES = []; // Loaded from config/nodes.json
let EXPLORER_API = localStorage.getItem('explorerApi') || 'https://explorer.0xmx.net/api';
let explorerConnected = false;
let currentExplorerTab = 'overview';
let explorerData = {
    status: null,
    blocks: [],
    assets: [],
    contracts: [],
    dexPools: [],
    dexTrades: [],
    lastUpdate: 0,
    blocksMaxHeight: null,
    // Timestamps for cache TTL
    assetsTimestamp: 0,
    contractsTimestamp: 0,
    dexTimestamp: 0
};

// Cache TTL in milliseconds (60 seconds)
const EXPLORER_CACHE_TTL = 60000;

// Pagination state
let explorerPagination = {
    assets: { page: 0, perPage: 50 },
    contracts: { page: 0, perPage: 50 },
    trades: { page: 0, perPage: 30 }
};

// Load Explorer nodes from config
async function loadExplorerNodesConfig() {
    try {
        const resp = await fetch('/config/nodes.json');
        const config = await resp.json();
        EXPLORER_NODES = config.mainnet?.explorerNodes || [];

        // Populate the selector in Settings
        const selector = document.getElementById('explorer-node-selector');
        if (selector && EXPLORER_NODES.length > 0) {
            selector.innerHTML = EXPLORER_NODES.map(node =>
                `<option value="${node.url}">${node.name}</option>`
            ).join('');
            selector.value = EXPLORER_API;
        }
    } catch (e) {
        console.error('Failed to load explorer nodes config:', e);
        // Fallback to default
        EXPLORER_NODES = [
            { name: 'explorer.0xmx.net (Primary)', url: 'https://explorer.0xmx.net/api' }
        ];
    }
}

// Show Explorer tab
function showExplorerTab(tabName, updateUrl = true) {
    currentExplorerTab = tabName;

    // Update URL
    if (updateUrl) {
        history.pushState({ page: 'explorer', tab: tabName }, '', `/explorer/${tabName}`);
    }

    // Update tab buttons
    document.querySelectorAll('.explorer-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.explorerTab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.explorer-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `explorer-tab-${tabName}`);
    });

    // Load data for the tab if needed
    switch (tabName) {
        case 'overview':
            loadExplorerOverview();
            break;
        case 'blocks':
            loadExplorerBlocks();
            break;
        case 'assets':
            loadExplorerAssets();
            break;
        case 'dex':
            loadExplorerDexPools();
            break;
        case 'contracts':
            loadExplorerContracts();
            break;
        case 'swaps':
            loadExplorerAtomicSwaps();
            break;
    }
}

// Initialize Explorer page when it becomes active
function initExplorerPage() {
    // Check for URL route (set by serve.py)
    const route = window.EXPLORER_ROUTE;

    // Check connection first
    if (!explorerConnected) {
        testExplorerConnectionForPage().then(() => {
            handleExplorerRoute(route);
        });
    } else {
        handleExplorerRoute(route);
    }
}

// Handle Explorer route from URL
function handleExplorerRoute(route) {
    if (!route || !route.type) {
        showExplorerTab('overview');
        return;
    }

    switch (route.type) {
        case 'block':
            showExplorerTab('blocks');
            if (route.id) {
                setTimeout(() => showBlockDetail(parseInt(route.id)), 500);
            }
            break;
        case 'asset':
            // Asset detail is now a full page, go directly to it
            if (route.id) {
                showAssetDetail(parseInt(route.id));
            } else {
                showExplorerTab('assets');
            }
            break;
        case 'contract':
            // Contract detail is now a full page, go directly to it
            if (route.id) {
                showContractDetail(route.id);
            } else {
                showExplorerTab('contracts');
            }
            break;
        case 'dex':
            showExplorerTab('dex');
            break;
        case 'blocks':
            showExplorerTab('blocks');
            break;
        case 'assets':
            showExplorerTab('assets');
            break;
        case 'contracts':
            showExplorerTab('contracts');
            break;
        case 'swaps':
            showExplorerTab('swaps');
            break;
        default:
            showExplorerTab('overview');
    }

    // Clear the route after handling
    window.EXPLORER_ROUTE = null;
}

// Test Explorer connection for page
async function testExplorerConnectionForPage() {
    try {
        const resp = await fetch(`${EXPLORER_API}/status`, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
            explorerConnected = true;
            updateExplorerPageConnection(true);
            showExplorerTab('overview');
        } else {
            throw new Error('HTTP ' + resp.status);
        }
    } catch (e) {
        explorerConnected = false;
        updateExplorerPageConnection(false);
    }
}

// Update Explorer page connection status
function updateExplorerPageConnection(connected) {
    const badge = document.getElementById('explorer-api-badge');
    const notConnected = document.getElementById('explorer-not-connected');
    const contentArea = document.querySelector('.explorer-content-area');

    if (connected) {
        if (badge) {
            badge.classList.add('connected');
            const nodeName = EXPLORER_NODES.find(n => n.url === EXPLORER_API)?.name || 'Connected';
            document.getElementById('explorer-api-name').textContent = nodeName;
        }
        if (notConnected) notConnected.style.display = 'none';
        if (contentArea) contentArea.style.display = 'block';
    } else {
        if (badge) {
            badge.classList.remove('connected');
            document.getElementById('explorer-api-name').textContent = 'Not connected';
        }
        if (notConnected) notConnected.style.display = 'flex';
        if (contentArea) contentArea.style.display = 'none';
    }
}

// Load Explorer overview data
async function loadExplorerOverview() {
    try {
        // cols: H=Height, T=Timestamp, k=Txs, f=Fee, i=MW.Inputs, o=MW.Outputs
        const [status, blocks] = await Promise.all([
            fetchExplorerAPI('/status'),
            fetchExplorerAPI('/hdrs', { nMax: 10, exp_am: 1, cols: 'HTkfio' })
        ]);

        explorerConnected = true;
        explorerData.status = status;
        explorerData.lastUpdate = Date.now();

        // Render stats - using new element IDs
        const setTextSafe = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setTextSafe('explorer-height', (status.height || 0).toLocaleString());
        setTextSafe('explorer-peers', status.peers_count || 0);

        // Format chainwork nicely
        const chainwork = status.chainwork || '';
        const cwNum = parseFloat(chainwork.replace(/,/g, ''));
        if (cwNum >= 1e12) {
            setTextSafe('explorer-chainwork', (cwNum / 1e12).toFixed(2) + 'T');
        } else {
            setTextSafe('explorer-chainwork', chainwork);
        }

        setTextSafe('explorer-shielded-24h', status.shielded_outputs_per_24h || 0);
        setTextSafe('explorer-shielded-total', (status.shielded_outputs_total || 0).toLocaleString());

        // Shielded ready hours - display as integer (no decimals)
        const shieldedReady = status.shielded_possible_ready_in_hours || 0;
        setTextSafe('explorer-shielded-ready', shieldedReady > 0 ? Math.round(shieldedReady).toLocaleString() : '--');

        // Last block time
        if (status.timestamp) {
            const date = new Date(status.timestamp * 1000);
            setTextSafe('explorer-last-block', date.toLocaleString());
        }

        // Block hash (truncated)
        if (status.hash) {
            setTextSafe('explorer-block-hash', status.hash.substring(0, 10) + '...');
        }

        updateExplorerPageConnection(true);

        // Parse and render recent blocks
        if (blocks?.value && blocks.value.length > 1) {
            const headers = blocks.value[0].map(h => h.value || h);
            explorerData.blocks = blocks.value.slice(1).map(row => {
                const obj = {};
                headers.forEach((h, i) => {
                    const cell = row[i];
                    obj[h] = (cell?.value !== undefined) ? cell.value : cell;
                });
                return obj;
            });
            renderExplorerRecentBlocks(explorerData.blocks);
        }

    } catch (e) {
        console.error('Explorer overview error:', e);
        explorerConnected = false;
        updateExplorerPageConnection(false);
    }
}

// Format block time for table
function formatBlockDateTime(ts) {
    if (!ts) return '-';
    const date = new Date(ts * 1000);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    const secs = date.getSeconds().toString().padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${mins}:${secs}`;
}

// Render recent blocks on overview (table format)
function renderExplorerRecentBlocks(blocks) {
    const container = document.getElementById('explorer-recent-blocks');
    if (!container) return;

    if (!blocks || blocks.length === 0) {
        container.innerHTML = '<tr><td colspan="6" class="loading-state">No blocks found</td></tr>';
        return;
    }

    container.innerHTML = blocks.map(block => `
        <tr onclick="showBlockDetail(${block.Height})">
            <td class="highlight">${(block.Height || 0).toLocaleString()}</td>
            <td>${formatBlockDateTime(block.Timestamp)}</td>
            <td>${block.Txs || 0}</td>
            <td>${block['MW.Inputs'] || block.MWInputs || 0}</td>
            <td>${block['MW.Outputs'] || block.MWOutputs || 0}</td>
            <td>${formatAmount(block.Fee || 0)}</td>
        </tr>
    `).join('');
}

// Column definitions for blocks table
const BLOCK_COLUMNS = {
    'Height': { code: 'H', label: 'HEIGHT', render: (v) => `<td class="highlight">${(v || 0).toLocaleString()}</td>` },
    'Timestamp': { code: 'T', label: 'TIME', render: (v) => `<td>${formatBlockDateTime(v)}</td>` },
    'Txs': { code: 'k', label: 'TXS', render: (v) => `<td>${v || 0}</td>` },
    'MW.Inputs': { code: 'i', label: 'MW IN', render: (v) => `<td>${v || 0}</td>` },
    'MW.Outputs': { code: 'o', label: 'MW OUT', render: (v) => `<td>${v || 0}</td>` },
    'Fee': { code: 'f', label: 'FEE (BEAM)', render: (v) => `<td>${formatAmount(v || 0)}</td>` },
    'SH.Inputs': { code: 'y', label: 'SH IN', render: (v) => `<td>${v || 0}</td>` },
    'SH.Outputs': { code: 'z', label: 'SH OUT', render: (v) => `<td>${v || 0}</td>` },
    'Difficulty': { code: 'd', label: 'DIFFICULTY', render: (v) => `<td>${formatLargeNumber(v || 0)}</td>` },
    'Chainwork': { code: 'D', label: 'CHAINWORK', render: (v) => `<td>${formatLargeNumber(v || 0)}</td>` },
    'Contracts': { code: 'b', label: 'CONTRACTS', render: (v) => `<td>${v || 0}</td>` },
    'ContractCalls': { code: 'p', label: 'CALLS', render: (v) => `<td>${v || 0}</td>` }
};

// Get selected columns from checkboxes
function getSelectedBlockColumns() {
    const checkboxes = document.querySelectorAll('#block-column-filters input[type="checkbox"]:checked');
    const selected = [];
    checkboxes.forEach(cb => {
        const col = cb.dataset.col;
        if (col && BLOCK_COLUMNS[col]) {
            selected.push(col);
        }
    });
    return selected.length ? selected : ['Height', 'Timestamp', 'Txs', 'MW.Inputs', 'MW.Outputs', 'Fee'];
}

// Update block columns and reload
function updateBlockColumns() {
    const selectedCols = getSelectedBlockColumns();

    // Update table header
    const header = document.getElementById('blocks-table-header');
    if (header) {
        header.innerHTML = `<tr>${selectedCols.map(col => `<th>${BLOCK_COLUMNS[col].label}</th>`).join('')}</tr>`;
    }

    // Store last blocks and re-render
    if (explorerData.blocks && explorerData.blocks.length > 0) {
        renderExplorerBlocksList(explorerData.blocks, true);
    } else {
        // Reload blocks with new columns
        loadExplorerBlocks();
    }
}

// Load full blocks list
async function loadExplorerBlocks(startHeight = null) {
    const container = document.getElementById('explorer-blocks-list');
    if (!container) return;

    const selectedCols = getSelectedBlockColumns();
    const colCount = selectedCols.length;
    container.innerHTML = `<tr><td colspan="${colCount}" class="loading-state">Loading blocks...</td></tr>`;

    try {
        // Build column codes from selected columns
        const colCodes = selectedCols.map(col => BLOCK_COLUMNS[col].code).join('');
        const params = { nMax: 50, exp_am: 1, cols: colCodes };
        if (startHeight) params.hMax = startHeight;

        const blocks = await fetchExplorerAPI('/hdrs', params);

        if (blocks?.value && blocks.value.length > 1) {
            const headers = blocks.value[0].map(h => h.value || h);
            const blockList = blocks.value.slice(1).map(row => {
                const obj = {};
                headers.forEach((h, i) => {
                    const cell = row[i];
                    obj[h] = (cell?.value !== undefined) ? cell.value : cell;
                });
                return obj;
            });

            // Store blocks for column updates
            explorerData.blocks = startHeight ? [...(explorerData.blocks || []), ...blockList] : blockList;

            // Store max height for pagination
            if (blockList.length > 0) {
                explorerData.blocksMaxHeight = blockList[blockList.length - 1].Height - 1;
            }

            renderExplorerBlocksList(blockList, !startHeight);
            document.getElementById('blocks-pagination').style.display = 'block';
        }
    } catch (e) {
        console.error('Explorer blocks error:', e);
        container.innerHTML = `<tr><td colspan="${selectedCols.length}" class="loading-state">Failed to load blocks</td></tr>`;
    }
}

// Render blocks list (table format)
function renderExplorerBlocksList(blocks, replace = true) {
    const container = document.getElementById('explorer-blocks-list');
    if (!container) return;

    const selectedCols = getSelectedBlockColumns();

    const rows = blocks.map(block => {
        const cells = selectedCols.map(col => {
            const colDef = BLOCK_COLUMNS[col];
            const value = block[col] !== undefined ? block[col] : block[col.replace('.', '')];
            return colDef.render(value);
        }).join('');
        return `<tr onclick="showBlockDetail(${block.Height})">${cells}</tr>`;
    }).join('');

    if (replace) {
        container.innerHTML = rows;
    } else {
        container.innerHTML += rows;
    }
}

// Load more blocks
function loadMoreBlocks() {
    if (explorerData.blocksMaxHeight) {
        loadExplorerBlocks(explorerData.blocksMaxHeight);
    }
}

// Show block detail (full page view like assets/contracts)
async function showBlockDetail(height) {
    // Update URL
    history.pushState({ page: 'explorer-block-detail', height }, '', `/explorer/block/${height}`);

    // Show the block detail page (must set both class AND inline style)
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });
    const detailPage = document.getElementById('page-explorer-block-detail');
    detailPage.classList.add('active');
    detailPage.style.display = 'block';
    window.scrollTo(0, 0);

    const content = document.getElementById('block-detail-content');
    content.innerHTML = '<div class="loading-state">Loading block...</div>';

    try {
        // Fetch block data
        const block = await fetchExplorerAPI('/block', { height });

        if (!block || !block.found) {
            content.innerHTML = '<div class="error-state">Block not found</div>';
            return;
        }

        // Format timestamp
        const date = new Date(block.timestamp * 1000);
        const timeStr = date.toLocaleString();

        // Build detail view
        content.innerHTML = `
            <div class="detail-header">
                <div class="detail-icon" style="background: linear-gradient(135deg, var(--beam-cyan), var(--beam-green));">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <path d="M3 9h18M9 21V9"/>
                    </svg>
                </div>
                <div class="detail-title">
                    <h2>Block #${height.toLocaleString()}</h2>
                    <div class="subtitle">${timeStr}</div>
                </div>
            </div>

            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Height</div>
                    <div class="detail-value highlight">${block.height?.toLocaleString() || height}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Timestamp</div>
                    <div class="detail-value">${timeStr}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Difficulty</div>
                    <div class="detail-value">${block.difficulty?.toLocaleString() || '--'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Subsidy</div>
                    <div class="detail-value">${block.subsidy ? (block.subsidy / 100000000).toFixed(8) + ' BEAM' : '--'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Chainwork</div>
                    <div class="detail-value">${block.chainwork ? formatLargeNumber(parseInt(block.chainwork.replace(/,/g, ''))) : '--'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">USD Rate</div>
                    <div class="detail-value">${block.rate_usd != null ? '$' + Number(block.rate_usd).toFixed(4) : '--'}</div>
                </div>
                <div class="detail-item full-width">
                    <div class="detail-label">Hash</div>
                    <div class="detail-value mono-text" style="font-size: 12px; word-break: break-all;">${block.hash || '--'}</div>
                </div>
                <div class="detail-item full-width">
                    <div class="detail-label">Previous Hash</div>
                    <div class="detail-value mono-text" style="font-size: 12px; word-break: break-all;">${block.prev || '--'}</div>
                </div>
            </div>

            ${block.inputs?.length ? `
                <div class="detail-section">
                    <h3>Inputs (${block.inputs.length})</h3>
                    <div class="table-wrapper">
                        <table class="explorer-table">
                            <thead><tr><th>Commitment</th><th>Value</th><th>Height</th><th>Maturity</th></tr></thead>
                            <tbody>
                                ${block.inputs.slice(0, 20).map(inp => `
                                    <tr>
                                        <td class="mono-text" style="font-size: 11px;">${inp.commitment?.substring(0, 24) || '--'}...</td>
                                        <td>${inp.Value ? (inp.Value / 100000000).toFixed(8) + ' BEAM' : '--'}</td>
                                        <td>${inp.height || '--'}</td>
                                        <td>${inp.Maturity || '--'}</td>
                                    </tr>
                                `).join('')}
                                ${block.inputs.length > 20 ? `<tr><td colspan="4" class="text-muted">...and ${block.inputs.length - 20} more inputs</td></tr>` : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}

            ${block.outputs?.length ? `
                <div class="detail-section">
                    <h3>Outputs (${block.outputs.length})</h3>
                    <div class="table-wrapper">
                        <table class="explorer-table">
                            <thead><tr><th>Commitment</th><th>Asset</th><th>Status</th></tr></thead>
                            <tbody>
                                ${block.outputs.slice(0, 20).map(out => `
                                    <tr>
                                        <td class="mono-text" style="font-size: 11px;">${out.commitment?.substring(0, 24) || '--'}...</td>
                                        <td>${out.Asset ? `ID: ${out.Asset.min}${out.Asset.min !== out.Asset.max ? '-' + out.Asset.max : ''}` : 'BEAM'}</td>
                                        <td><span class="${out.spent ? 'text-muted' : 'text-success'}">${out.spent ? 'Spent' : 'Unspent'}</span></td>
                                    </tr>
                                `).join('')}
                                ${block.outputs.length > 20 ? `<tr><td colspan="3" class="text-muted">...and ${block.outputs.length - 20} more outputs</td></tr>` : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}

            ${block.kernels?.length ? `
                <div class="detail-section">
                    <h3>Kernels (${block.kernels.length})</h3>
                    <div class="table-wrapper">
                        <table class="explorer-table">
                            <thead><tr><th>ID</th><th>Fee</th><th>Min Height</th><th>Max Height</th></tr></thead>
                            <tbody>
                                ${block.kernels.slice(0, 20).map(k => `
                                    <tr>
                                        <td class="mono-text" style="font-size: 11px;">${k.id?.substring(0, 24) || '--'}...</td>
                                        <td>${k.fee ? (k.fee / 100000000).toFixed(8) + ' BEAM' : '0'}</td>
                                        <td>${k.minHeight || '--'}</td>
                                        <td>${k.maxHeight || '--'}</td>
                                    </tr>
                                `).join('')}
                                ${block.kernels.length > 20 ? `<tr><td colspan="4" class="text-muted">...and ${block.kernels.length - 20} more kernels</td></tr>` : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
        `;
    } catch (e) {
        console.error('Block detail error:', e);
        content.innerHTML = `<div class="error-state">Failed to load block: ${e.message}</div>`;
    }
}

// Parse metadata from BEAM STD format
function parseAssetMetadata(metaStr) {
    if (!metaStr) return {};
    if (typeof metaStr === 'object') return metaStr;
    const result = {};
    String(metaStr).replace('STD:', '').split(';').forEach(p => {
        const [k, ...v] = p.split('=');
        if (k) result[k] = v.join('=');
    });
    return result;
}

// Get decimals from NTHUN field
function getAssetDecimals(nthun) {
    if (!nthun) return 8;
    const units = { Groth: 8, Cent: 6, Satoshi: 8, fomo: 8, Flicker: 8, MiniB: 8 };
    return units[nthun] || 8;
}

// Format asset amount with proper decimals
function formatAssetAmount(amt, decimals = 8) {
    const v = Math.abs(Number(amt)) / Math.pow(10, decimals);
    if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(Math.min(decimals, 4));
}

// Parse table value from Explorer API response
function parseTableValue(cell) {
    if (cell == null) return null;
    if (typeof cell !== 'object') return cell;
    if (cell.type === 'table') return cell;
    if (cell.type === 'amount') return cell.value;
    if ('value' in cell) return cell.value;
    return cell;
}

// Parse table rows from Explorer API response
function parseExplorerTableRows(data) {
    if (!data?.value || !Array.isArray(data.value) || data.value.length < 2) return [];
    const headerRow = data.value[0];
    if (!Array.isArray(headerRow)) return [];
    const headers = headerRow.map(h => parseTableValue(h) || String(h));
    return data.value.slice(1).map(row => {
        if (!Array.isArray(row)) return row;
        const obj = {};
        headers.forEach((h, i) => obj[h] = parseTableValue(row[i]));
        return obj;
    });
}

// Escape HTML
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// Copy button HTML
function copyBtnHtml(text) {
    return `<button class="copy-btn" onclick="event.stopPropagation(); copyToClipboard('${text}', this)" title="Copy">Copy</button>`;
}

// Copy to clipboard
function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        if (btn) {
            btn.classList.add('copied');
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.textContent = 'Copy';
            }, 2000);
        }
    });
}

// Show asset detail (full page, like BeamExplorer.html)
async function showAssetDetail(assetId) {
    // Update URL
    history.pushState({ page: 'explorer-asset-detail', assetId }, '', `/explorer/asset/${assetId}`);

    // Show the asset detail page (must set both class AND inline style)
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });
    const detailPage = document.getElementById('page-explorer-asset-detail');
    detailPage.classList.add('active');
    detailPage.style.display = 'block';
    window.scrollTo(0, 0);

    const content = document.getElementById('asset-detail-content');
    content.innerHTML = '<div class="loading-state">Loading asset...</div>';

    try {
        // BEAM (asset 0) is totally private - no detail page
        if (assetId === 0) {
            showExplorerTab('assets');
            return;
        }

        // Get asset info from our cache (has proper names, symbols, icons)
        const assetInfo = getExplorerAssetInfo(assetId);

        // Fetch Confidential Asset data from explorer
        const asset = await fetchExplorerAPI('/asset', { id: assetId, nMaxOps: 100 });

        // Parse metadata from explorer (fallback)
        const meta = parseAssetMetadata(asset?.metadata);

        // Use assetInfo first (from ASSET_CONFIG/allAssetsCache), then metadata fallback
        const symbol = assetInfo.symbol || meta.UN || meta.SN || meta.N || `CA-${assetId}`;
        const name = assetInfo.name || meta.N || `Asset ${assetId}`;
        const decimals = assetInfo.decimals || getAssetDecimals(meta.NTHUN);
        const icon = assetInfo.icon;
        const color = assetInfo.color || '#25c2a0';

        // Parse distribution
        const distribution = parseExplorerTableRows(asset?.['Asset distribution'] || {});

        // Parse history
        const history = parseExplorerTableRows(asset?.['Asset history'] || {});

        // Build icon HTML with proper logo
        let iconHtml;
        if (icon) {
            iconHtml = `<img src="${icon}" alt="${symbol}" class="detail-icon-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="detail-icon-fallback" style="display:none; background:${color}">${symbol.slice(0,2).toUpperCase()}</div>`;
        } else {
            iconHtml = `<div class="detail-icon-fallback" style="background:${color}">${symbol.slice(0,2).toUpperCase()}</div>`;
        }

        // Find pools containing this asset
        let poolsHtml = '';
        try {
            const dexResp = await fetchExplorerAPI('/contract', { id: DEX_CONTRACT_ID, state: 1 });
            const poolsTable = dexResp?.State?.Pools;
            if (poolsTable?.value) {
                const pools = parseExplorerTableRows(poolsTable).filter(p =>
                    (p.Aid1 == assetId || p.Aid2 == assetId) && ((p['Amount1'] || 0) > 0 || (p['Amount2'] || 0) > 0)
                );
                if (pools.length) {
                    poolsHtml = `
                        <div class="detail-section">
                            <h3>Liquidity Pools (${pools.length})</h3>
                            <div class="card-grid">
                                ${pools.map(p => {
                                    const a1 = getExplorerAssetInfo(p.Aid1);
                                    const a2 = getExplorerAssetInfo(p.Aid2);
                                    const vol = (p.Volatility || 'High').toLowerCase();
                                    const volClass = vol === 'high' ? 'vol-high' : vol === 'medium' ? 'vol-medium' : 'vol-low';
                                    const rate = p['Rate 1:2'] || '';
                                    const otherAssetId = p.Aid1 == assetId ? p.Aid2 : p.Aid1;
                                    return `
                                        <div class="pool-card" onclick="showAssetDetail(${otherAssetId})">
                                            <div class="pool-pair">
                                                <div class="pool-pair-icons">
                                                    ${renderAssetBadge(p.Aid1)}
                                                    ${renderAssetBadge(p.Aid2)}
                                                </div>
                                                <span class="pool-pair-name">${a1.symbol} / ${a2.symbol}</span>
                                                <span class="volatility-badge ${volClass}">${p.Volatility || 'High'}</span>
                                            </div>
                                            <div class="pool-stats">
                                                <div class="pool-stat">
                                                    <div class="pool-stat-label">${a1.symbol} Reserve</div>
                                                    <div class="pool-stat-value">${formatAssetAmount(p['Amount1'] || 0, a1.decimals || 8)}</div>
                                                </div>
                                                <div class="pool-stat">
                                                    <div class="pool-stat-label">${a2.symbol} Reserve</div>
                                                    <div class="pool-stat-value">${formatAssetAmount(p['Amount2'] || 0, a2.decimals || 8)}</div>
                                                </div>
                                                <div class="pool-stat">
                                                    <div class="pool-stat-label">LP Token ID</div>
                                                    <div class="pool-stat-value">#${p['LP-Token'] || 'N/A'}</div>
                                                </div>
                                                <div class="pool-stat">
                                                    <div class="pool-stat-label">LP Supply</div>
                                                    <div class="pool-stat-value">${formatAssetAmount(p['Amount-LP-Token'] || 0, 8)}</div>
                                                </div>
                                                ${rate ? `<div class="pool-stat full-width"><div class="pool-stat-label">Rate</div><div class="pool-stat-value">1 ${a2.symbol} = ${rate} ${a1.symbol}</div></div>` : ''}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
            }
        } catch (e) { console.error('Failed to load pools:', e); }

        // Build distribution section
        let distributionHtml = '';
        if (distribution.length > 0) {
            distributionHtml = `
                <div class="detail-section">
                    <h3>Distribution (${distribution.length})</h3>
                    <div class="table-container">
                        <table class="data-table">
                            <thead><tr><th>Location</th><th>Type</th><th>Amount</th></tr></thead>
                            <tbody>${distribution.map(d => `
                                <tr ${d.Cid ? `onclick="showContractDetail('${d.Cid}')" class="clickable"` : ''}>
                                    <td class="mono-text">${d.Cid ? `<span class="hash truncate" title="${d.Cid}">${d.Cid.slice(0,12)}...${d.Cid.slice(-8)}</span>` : 'Unlocked'}</td>
                                    <td>${d.Kind || '-'}</td>
                                    <td class="mono-text">${formatAssetAmount(d['Locked Value'] || 0, decimals)} ${symbol}</td>
                                </tr>
                            `).join('')}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Build history section
        let historyHtml = '';
        if (history.length > 0) {
            historyHtml = `
                <div class="detail-section">
                    <h3>History (${history.length})</h3>
                    <div class="table-container">
                        <table class="data-table">
                            <thead><tr><th>Block</th><th>Event</th><th>Amount</th><th>Total Supply</th></tr></thead>
                            <tbody>${history.map(h => {
                                const eventClass = h.Event === 'Mint' ? 'trade-type-mint' : h.Event === 'Burn' ? 'trade-type-burn' : 'trade-type-create';
                                const amountStr = h.Amount != null ? String(h.Amount) : '';
                                const amountClass = amountStr.includes('+') ? 'amount-positive' : amountStr.includes('-') ? 'amount-negative' : '';
                                const parsedAmount = parseInt(String(h.Amount || '').replace(/[+,]/g, '')) || 0;
                                return `
                                    <tr onclick="showBlockDetail(${h.Height})" class="clickable">
                                        <td><span class="mono-text highlight">${h.Height?.toLocaleString?.() || h.Height}</span></td>
                                        <td><span class="trade-type ${eventClass}">${h.Event || '-'}</span></td>
                                        <td class="mono-text ${amountClass}">${h.Amount != null ? formatAssetAmount(parsedAmount, decimals) : '-'}</td>
                                        <td class="mono-text">${h['Total Amount'] != null ? formatAssetAmount(h['Total Amount'], decimals) : '-'}</td>
                                    </tr>
                                `;
                            }).join('')}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Render full page content
        content.innerHTML = `
            <div class="detail-header">
                <div class="detail-icon">
                    ${iconHtml}
                </div>
                <div class="detail-title">
                    <h2>${escapeHtml(symbol)}</h2>
                    <div class="subtitle">${escapeHtml(name)} <span class="asset-id-badge">#${assetId}</span></div>
                </div>
            </div>

            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Total Supply</div>
                    <div class="detail-value">${formatAssetAmount(asset?.value || 0, decimals)} ${symbol}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Decimals</div>
                    <div class="detail-value">${decimals}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Lock Height</div>
                    <div class="detail-value">${asset?.lock_height ? asset.lock_height.toLocaleString() : 'None'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Owner Contract</div>
                    <div class="detail-value">${asset?.owner ? `<span class="hash truncate clickable" onclick="showContractDetail('${asset.owner}')" title="${asset.owner}">${asset.owner.slice(0,12)}...${asset.owner.slice(-8)}</span>` : 'None'}</div>
                </div>
                ${meta.OPT_SITE_URL ? `<div class="detail-item"><div class="detail-label">Website</div><div class="detail-value"><a href="${escapeHtml(meta.OPT_SITE_URL)}" target="_blank">${escapeHtml(meta.OPT_SITE_URL.slice(0,40))}...</a></div></div>` : ''}
                ${meta.OPT_SHORT_DESC ? `<div class="detail-item full-width"><div class="detail-label">Description</div><div class="detail-value">${escapeHtml(meta.OPT_SHORT_DESC)}</div></div>` : ''}
            </div>

            ${distributionHtml}
            ${poolsHtml}
            ${historyHtml}
        `;
    } catch (e) {
        console.error('Asset detail error:', e);
        content.innerHTML = `<div class="error-state">Failed to load asset: ${e.message}</div>`;
    }
}

// Show contract detail (full page, like BeamExplorer.html)
async function showContractDetail(cid) {
    // Update URL
    history.pushState({ page: 'explorer-contract-detail', cid }, '', `/explorer/contract/${cid}`);

    // Show the contract detail page (must set both class AND inline style)
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });
    const detailPage = document.getElementById('page-explorer-contract-detail');
    detailPage.classList.add('active');
    detailPage.style.display = 'block';
    window.scrollTo(0, 0);

    const content = document.getElementById('contract-detail-content');
    content.innerHTML = '<div class="loading-state">Loading contract...</div>';

    try {
        // Fetch contract data
        const contract = await fetchExplorerAPI('/contract', { id: cid, state: 1, nMaxTxs: 50 });

        const kind = contract?.kind || 'Unknown';
        const height = contract?.h || '--';
        const isDex = cid === DEX_CONTRACT_ID;

        // Build locked funds section
        let lockedHtml = '';
        const lockedFunds = contract?.['Locked Funds'];
        if (lockedFunds?.value && Array.isArray(lockedFunds.value) && lockedFunds.value.length > 1) {
            const rows = lockedFunds.value.slice(1);
            lockedHtml = `
                <div class="detail-section">
                    <h3>Locked Funds (${rows.length})</h3>
                    <div class="table-container">
                        <table class="data-table">
                            <thead><tr><th>Asset</th><th>Amount</th></tr></thead>
                            <tbody>${rows.map(r => {
                                const aid = parseTableValue(r[0]);
                                const amount = parseTableValue(r[1]);
                                const assetInfo = getExplorerAssetInfo(aid);
                                return `
                                    <tr onclick="showAssetDetail(${aid})" class="clickable">
                                        <td>
                                            <div class="asset-info-cell">
                                                ${renderAssetBadge(aid)}
                                                <span class="asset-aid">(ID: ${aid})</span>
                                            </div>
                                        </td>
                                        <td class="mono-text">${formatAssetAmount(amount || 0, assetInfo.decimals || 8)}</td>
                                    </tr>
                                `;
                            }).join('')}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Build owned assets section
        let ownedHtml = '';
        const ownedAssets = contract?.['Owned assets'];
        if (ownedAssets?.value && Array.isArray(ownedAssets.value) && ownedAssets.value.length > 1) {
            const rows = ownedAssets.value.slice(1);
            ownedHtml = `
                <div class="detail-section">
                    <h3>Owned Assets (${rows.length})</h3>
                    <div class="table-container">
                        <table class="data-table">
                            <thead><tr><th>Asset</th><th>Supply</th></tr></thead>
                            <tbody>${rows.map(r => {
                                const aid = parseTableValue(r[0]);
                                const supply = parseTableValue(r[1]);
                                const assetInfo = getExplorerAssetInfo(aid);
                                return `
                                    <tr onclick="showAssetDetail(${aid})" class="clickable">
                                        <td>
                                            <div class="asset-info-cell">
                                                ${renderAssetBadge(aid)}
                                                <span class="asset-aid">(ID: ${aid})</span>
                                            </div>
                                        </td>
                                        <td class="mono-text">${formatAssetAmount(supply || 0, assetInfo.decimals || 8)}</td>
                                    </tr>
                                `;
                            }).join('')}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Build calls history section
        let historyHtml = '';
        const callsHistory = contract?.['Calls history'];
        if (callsHistory?.value && callsHistory.value.length > 1) {
            const calls = [];
            callsHistory.value.slice(1).forEach(item => {
                const rows = item.type === 'group' ? item.value : [item];
                rows.forEach(row => {
                    if (!Array.isArray(row)) return;
                    calls.push({
                        height: row[0],
                        kind: row[3] || '-'
                    });
                });
            });

            if (calls.length) {
                historyHtml = `
                    <div class="detail-section">
                        <h3>Recent Calls (${calls.length})</h3>
                        <div class="table-container">
                            <table class="data-table">
                                <thead><tr><th>Block</th><th>Action</th></tr></thead>
                                <tbody>${calls.slice(0, 50).map(c => {
                                    const actionClass = c.kind === 'Trade' ? 'trade-type-trade' :
                                                       c.kind === 'Withdraw' ? 'trade-type-withdraw' :
                                                       String(c.kind).includes('Liquidity') ? 'trade-type-liquidity' : '';
                                    return `
                                        <tr onclick="showBlockDetail(${c.height})" class="clickable">
                                            <td><span class="mono-text highlight">${typeof c.height === 'number' ? c.height.toLocaleString() : c.height}</span></td>
                                            <td><span class="trade-type ${actionClass}">${c.kind}</span></td>
                                        </tr>
                                    `;
                                }).join('')}</tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
        }

        // Build state section (for DEX, show pools)
        let stateHtml = '';
        if (contract?.State?.Pools?.value) {
            const pools = parseExplorerTableRows(contract.State.Pools).filter(p =>
                (p['Amount1'] || 0) > 0 || (p['Amount2'] || 0) > 0
            );
            if (pools.length) {
                stateHtml = `
                    <div class="detail-section">
                        <h3>Liquidity Pools (${pools.length})</h3>
                        <div class="card-grid">
                            ${pools.slice(0, 12).map(p => {
                                const a1 = getExplorerAssetInfo(p.Aid1);
                                const a2 = getExplorerAssetInfo(p.Aid2);
                                return `
                                    <div class="pool-card" onclick="showAssetDetail(${p.Aid2})">
                                        <div class="pool-pair">
                                            <div class="pool-pair-icons">
                                                ${renderAssetBadge(p.Aid1)}
                                                ${renderAssetBadge(p.Aid2)}
                                            </div>
                                            <span class="pool-pair-name">${a1.symbol}/${a2.symbol}</span>
                                        </div>
                                        <div class="pool-stats">
                                            <div class="pool-stat">
                                                <div class="pool-stat-label">${a1.symbol}</div>
                                                <div class="pool-stat-value">${formatAssetAmount(p['Amount1'] || 0, a1.decimals || 8)}</div>
                                            </div>
                                            <div class="pool-stat">
                                                <div class="pool-stat-label">${a2.symbol}</div>
                                                <div class="pool-stat-value">${formatAssetAmount(p['Amount2'] || 0, a2.decimals || 8)}</div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        }

        // Render full page content
        content.innerHTML = `
            <div class="detail-header">
                <div class="detail-icon contract-icon">SC</div>
                <div class="detail-title">
                    <h2>${escapeHtml(kind)}${isDex ? ' (DEX)' : ''}</h2>
                    <div class="subtitle">Smart Contract</div>
                </div>
            </div>

            <div class="detail-grid">
                <div class="detail-item full-width">
                    <div class="detail-label">Contract ID</div>
                    <div class="detail-value mono-text">${cid} ${copyBtnHtml(cid)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Type</div>
                    <div class="detail-value">${escapeHtml(kind)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Current Height</div>
                    <div class="detail-value">${typeof height === 'number' ? height.toLocaleString() : height}</div>
                </div>
            </div>

            ${lockedHtml}
            ${ownedHtml}
            ${stateHtml}
            ${historyHtml}
        `;
    } catch (e) {
        console.error('Contract detail error:', e);
        content.innerHTML = `<div class="error-state">Failed to load contract: ${e.message}</div>`;
    }
}

// Close modal and restore URL (for explorer modal-container)
function closeExplorerModal() {
    const modal = document.getElementById('modal-container');
    modal.classList.remove('active');
    modal.innerHTML = '';

    // Restore URL to explorer tab
    if (currentExplorerTab) {
        history.pushState({ page: 'explorer', tab: currentExplorerTab }, '', `/explorer/${currentExplorerTab}`);
    }
}

// Load Explorer assets (with caching)
async function loadExplorerAssets(force = false) {
    const container = document.getElementById('explorer-assets-grid');
    if (!container) return;

    // Check cache freshness
    if (!force && explorerData.assets?.length > 0) {
        const age = Date.now() - explorerData.assetsTimestamp;
        if (age < EXPLORER_CACHE_TTL) {
            console.log('Using cached assets data');
            explorerPagination.assets.page = 0;
            renderExplorerAssets(explorerData.assets);
            return;
        }
    }

    container.innerHTML = '<div class="loading-state">Loading assets...</div>';

    try {
        const assets = await fetchExplorerAPI('/assets');

        if (assets?.value && assets.value.length > 1) {
            const headers = assets.value[0].map(h => h.value || h);
            explorerData.assets = assets.value.slice(1).map(row => {
                const obj = {};
                headers.forEach((h, i) => {
                    const cell = row[i];
                    obj[h] = (cell?.value !== undefined) ? cell.value : cell;
                });
                return obj;
            });
            explorerData.assetsTimestamp = Date.now();
            explorerPagination.assets.page = 0;

            renderExplorerAssets(explorerData.assets);
        }
    } catch (e) {
        console.error('Explorer assets error:', e);
        container.innerHTML = '<div class="loading-state">Failed to load assets</div>';
    }
}

// Render Explorer assets (with pagination)
function renderExplorerAssets(assets, append = false) {
    const container = document.getElementById('explorer-assets-grid');
    if (!container) return;

    if (!assets || assets.length === 0) {
        container.innerHTML = '<div class="loading-state">No assets found</div>';
        hideLoadMoreAssets();
        return;
    }

    // Parse metadata
    const parseMetadata = (metaStr) => {
        const meta = {};
        if (!metaStr) return meta;
        const pairs = metaStr.split(';');
        pairs.forEach(pair => {
            const [key, ...vals] = pair.split('=');
            if (key && vals.length) meta[key] = vals.join('=');
        });
        return meta;
    };

    const { page, perPage } = explorerPagination.assets;
    const startIdx = page * perPage;
    const endIdx = startIdx + perPage;
    const pageAssets = assets.slice(startIdx, endIdx);

    const html = pageAssets.map(asset => {
        const meta = parseMetadata(asset.Metadata);
        const name = meta.N || meta.SN || `Asset ${asset.Aid}`;
        const symbol = meta.UN || meta.SN || '??';
        const icon = ASSET_ICONS[asset.Aid] || null;
        const iconHtml = icon
            ? `<img src="${icon}" alt="${symbol}" onerror="this.parentElement.innerHTML='${symbol.substring(0,2).toUpperCase()}'">`
            : symbol.substring(0, 2).toUpperCase();

        return `
            <div class="explorer-asset-card" onclick="showAssetDetail(${asset.Aid})">
                <div class="asset-header">
                    <div class="asset-icon">${iconHtml}</div>
                    <div class="asset-info">
                        <h4>${name}</h4>
                        <div class="asset-id">ID: ${asset.Aid}</div>
                    </div>
                </div>
                <div class="asset-stats">
                    <div class="asset-stat">
                        <div class="asset-stat-label">Supply</div>
                        <div class="asset-stat-value">${formatLargeNumber(asset.Supply || 0)}</div>
                    </div>
                    <div class="asset-stat">
                        <div class="asset-stat-label">Deposit</div>
                        <div class="asset-stat-value">${formatAmount(asset.Deposit || 0)} BEAM</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }

    // Show/hide load more button
    const hasMore = assets.length > endIdx;
    showLoadMoreAssets(hasMore, assets.length, endIdx);
}

// Load more assets
function loadMoreAssets() {
    explorerPagination.assets.page++;
    renderExplorerAssets(explorerData.assets, true);
}

// Show/hide load more assets button
function showLoadMoreAssets(show, total, loaded) {
    let btn = document.getElementById('load-more-assets-btn');
    if (!btn) {
        // Create button if doesn't exist
        const container = document.getElementById('explorer-assets-grid');
        if (container) {
            btn = document.createElement('button');
            btn.id = 'load-more-assets-btn';
            btn.className = 'load-more-btn';
            btn.onclick = loadMoreAssets;
            container.parentElement.appendChild(btn);
        }
    }
    if (btn) {
        btn.style.display = show ? 'block' : 'none';
        btn.textContent = `Load More Assets (${loaded}/${total})`;
    }
}

function hideLoadMoreAssets() {
    const btn = document.getElementById('load-more-assets-btn');
    if (btn) btn.style.display = 'none';
}

// Filter Explorer assets
function filterExplorerAssets() {
    const query = document.getElementById('explorer-asset-search').value.toLowerCase().trim();
    if (!explorerData.assets) return;

    const parseMetadata = (metaStr) => {
        const meta = {};
        if (!metaStr) return meta;
        const pairs = metaStr.split(';');
        pairs.forEach(pair => {
            const [key, ...vals] = pair.split('=');
            if (key && vals.length) meta[key] = vals.join('=');
        });
        return meta;
    };

    const filtered = explorerData.assets.filter(asset => {
        if (!query) return true;
        const meta = parseMetadata(asset.Metadata);
        const name = (meta.N || meta.SN || '').toLowerCase();
        const symbol = (meta.UN || meta.SN || '').toLowerCase();
        return name.includes(query) || symbol.includes(query) || String(asset.Aid).includes(query);
    });

    // Reset pagination when filtering
    explorerPagination.assets.page = 0;
    renderExplorerAssets(filtered);
}

// Format large number
function formatLargeNumber(num) {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toLocaleString();
}

// Load Explorer contracts (with caching)
async function loadExplorerContracts(force = false) {
    const container = document.getElementById('explorer-contracts-list');
    if (!container) return;

    // Check cache freshness
    if (!force && explorerData.contracts?.length > 0) {
        const age = Date.now() - explorerData.contractsTimestamp;
        if (age < EXPLORER_CACHE_TTL) {
            console.log('Using cached contracts data');
            explorerPagination.contracts.page = 0;
            renderExplorerContracts(explorerData.contracts);
            return;
        }
    }

    container.innerHTML = '<tr><td colspan="5" class="loading-state">Loading contracts...</td></tr>';

    try {
        const contracts = await fetchExplorerAPI('/contracts');

        if (contracts?.value && contracts.value.length > 1) {
            const headers = contracts.value[0].map(h => h.value || h);
            explorerData.contracts = contracts.value.slice(1).map(row => {
                const obj = {};
                headers.forEach((h, i) => {
                    const cell = row[i];
                    // Keep nested tables as-is (they have type: "table")
                    if (cell && typeof cell === 'object' && cell.type === 'table') {
                        obj[h] = cell; // Keep the full table object
                    } else if (cell?.value !== undefined) {
                        obj[h] = cell.value;
                    } else {
                        obj[h] = cell;
                    }
                });
                return obj;
            });
            explorerData.contractsTimestamp = Date.now();
            explorerPagination.contracts.page = 0;

            renderExplorerContracts(explorerData.contracts);
        }
    } catch (e) {
        console.error('Explorer contracts error:', e);
        container.innerHTML = '<tr><td colspan="5" class="loading-state">Failed to load contracts</td></tr>';
    }
}

// Count items in a nested table from Explorer API
function countNestedTableItems(cell) {
    if (!cell) return 0;
    // If it's a table object with value array
    if (cell.type === 'table' && Array.isArray(cell.value)) {
        return cell.value.length;
    }
    // If it's directly an array (shouldn't happen after fix, but handle anyway)
    if (Array.isArray(cell)) {
        return cell.length;
    }
    return 0;
}

// Render Explorer contracts (table format with pagination)
function renderExplorerContracts(contracts, append = false) {
    const container = document.getElementById('explorer-contracts-list');
    if (!container) return;

    if (!contracts || contracts.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="loading-state">No contracts found</td></tr>';
        hideLoadMoreContracts();
        return;
    }

    const { page, perPage } = explorerPagination.contracts;
    const startIdx = page * perPage;
    const endIdx = startIdx + perPage;
    const pageContracts = contracts.slice(startIdx, endIdx);

    const html = pageContracts.map(contract => {
        const cid = contract.Cid || '';
        // Handle complex Kind objects like {Wrapper: "upgradable2", subtype: {...}}
        let kind = contract.Kind || 'Unknown';
        if (typeof kind === 'object') {
            kind = kind.Wrapper || kind.value || JSON.stringify(kind).slice(0, 30);
        }
        const height = contract['Deploy Height'] || contract.Height || 0;

        // Count locked funds and owned assets from nested tables
        const lockedCount = countNestedTableItems(contract['Locked Funds']);
        const ownedCount = countNestedTableItems(contract['Owned Assets']);

        // Highlight DEX contract
        const isDex = cid === DEX_CONTRACT_ID;
        const cidShort = cid ? (cid.substring(0, 16) + '...' + cid.substring(cid.length - 8)) : '--';

        return `
            <tr onclick="showContractDetail('${cid}')" class="clickable ${isDex ? 'dex-contract' : ''}">
                <td class="mono-text" title="${cid}">${cidShort}</td>
                <td><span class="highlight">${kind}${isDex ? ' (DEX)' : ''}</span></td>
                <td>${typeof height === 'number' ? height.toLocaleString() : height}</td>
                <td>${lockedCount} assets</td>
                <td>${ownedCount} assets</td>
            </tr>
        `;
    }).join('');

    if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }

    // Show/hide load more button
    const hasMore = contracts.length > endIdx;
    showLoadMoreContracts(hasMore, contracts.length, endIdx);
}

// Load more contracts
function loadMoreContracts() {
    explorerPagination.contracts.page++;
    renderExplorerContracts(explorerData.contracts, true);
}

// Show/hide load more contracts button
function showLoadMoreContracts(show, total, loaded) {
    let btn = document.getElementById('load-more-contracts-btn');
    if (!btn) {
        // Create button if doesn't exist
        const table = document.getElementById('explorer-contracts-list')?.closest('table');
        if (table) {
            btn = document.createElement('button');
            btn.id = 'load-more-contracts-btn';
            btn.className = 'load-more-btn';
            btn.onclick = loadMoreContracts;
            table.parentElement.appendChild(btn);
        }
    }
    if (btn) {
        btn.style.display = show ? 'block' : 'none';
        btn.textContent = `Load More Contracts (${loaded}/${total})`;
    }
}

function hideLoadMoreContracts() {
    const btn = document.getElementById('load-more-contracts-btn');
    if (btn) btn.style.display = 'none';
}

// Load Explorer DEX Pools (with caching)
async function loadExplorerDexPools(force = false) {
    const poolsContainer = document.getElementById('explorer-dex-pools');
    const tradesContainer = document.getElementById('explorer-dex-trades');

    // Check cache freshness
    if (!force && explorerData.dexTrades?.length > 0) {
        const age = Date.now() - explorerData.dexTimestamp;
        if (age < EXPLORER_CACHE_TTL) {
            console.log('Using cached DEX data');
            explorerPagination.trades.page = 0;
            // Re-render from cache
            if (poolsContainer && explorerData.dexPools) {
                renderExplorerDexPools(explorerData.dexPools);
            }
            if (tradesContainer && explorerData.dexTrades) {
                renderExplorerDexTradesFromCache();
            }
            return;
        }
    }

    if (poolsContainer) {
        poolsContainer.innerHTML = '<tr><td colspan="9" class="loading-state">Loading pools...</td></tr>';
    }
    if (tradesContainer) {
        tradesContainer.innerHTML = '<tr><td colspan="6" class="loading-state">Loading trades...</td></tr>';
    }

    try {
        // Fetch DEX contract state
        const contract = await fetchExplorerAPI('/contract', { id: DEX_CONTRACT_ID, state: 1, nMaxTxs: 50 });

        // Render pools from state
        if (contract?.State?.Pools?.value && contract.State.Pools.value.length > 1) {
            const headers = contract.State.Pools.value[0].map(h => h.value || h);
            const pools = contract.State.Pools.value.slice(1).map(row => {
                const obj = {};
                headers.forEach((h, i) => {
                    const cell = row[i];
                    obj[h] = (cell?.value !== undefined) ? cell.value : cell;
                });
                return obj;
            });

            explorerData.dexPools = pools;
            renderExplorerDexPools(pools);
        } else {
            if (poolsContainer) {
                poolsContainer.innerHTML = '<tr><td colspan="9" class="loading-state">No pools found</td></tr>';
            }
        }

        // Render trades from calls history
        if (contract?.['Calls history']?.value && contract['Calls history'].value.length > 1) {
            explorerPagination.trades.page = 0;
            renderExplorerDexTrades(contract['Calls history']);
            explorerData.dexTimestamp = Date.now();
        } else {
            if (tradesContainer) {
                tradesContainer.innerHTML = '<tr><td colspan="6" class="loading-state">No recent trades</td></tr>';
            }
        }

    } catch (e) {
        console.error('Explorer DEX error:', e);
        if (poolsContainer) {
            poolsContainer.innerHTML = '<tr><td colspan="9" class="loading-state">Failed to load pools</td></tr>';
        }
        if (tradesContainer) {
            tradesContainer.innerHTML = '<tr><td colspan="6" class="loading-state">Failed to load trades</td></tr>';
        }
    }
}

// Render DEX pools (table format)
// Get asset display info for Explorer (uses same data as wallet assets)
function getExplorerAssetInfo(aid) {
    // Use the existing getAssetInfo function which already handles all cases
    const info = getAssetInfo(Number(aid));
    return {
        name: info.name || `Asset ${aid}`,
        symbol: info.symbol || `#${aid}`,
        icon: info.icon || ASSET_ICONS[aid] || null,
        color: info.color || '#25c2a0',
        decimals: info.decimals || 8
    };
}

// Render asset badge with icon (optionally show aid)
function renderAssetBadge(aid, showAid = false) {
    // Extract numeric aid from object if needed (e.g., {type: 'aid', value: 174})
    if (aid && typeof aid === 'object') {
        aid = aid.value !== undefined ? aid.value : aid;
    }
    aid = Number(aid) || 0;

    const info = getExplorerAssetInfo(aid);
    const iconHtml = info.icon
        ? `<img src="${info.icon}" alt="${info.symbol}" class="asset-badge-icon" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"><span class="asset-badge-initials" style="background:${info.color}; display:none">${info.symbol.substring(0, 2)}</span>`
        : `<span class="asset-badge-initials" style="background:${info.color}">${info.symbol.substring(0, 2)}</span>`;

    const aidDisplay = showAid ? `<span class="asset-badge-aid">(${aid})</span>` : '';

    return `
        <div class="asset-badge" onclick="showAssetDetail(${aid})" title="${info.name} (ID: ${aid})">
            ${iconHtml}
            <span class="asset-badge-symbol">${info.symbol}</span>
            ${aidDisplay}
        </div>
    `;
}

// Render asset badge with full info (logo, ticker, aid)
function renderAssetBadgeFull(aid) {
    // Extract numeric aid from object if needed
    if (aid && typeof aid === 'object') {
        aid = aid.value !== undefined ? aid.value : aid;
    }
    aid = Number(aid) || 0;

    const info = getExplorerAssetInfo(aid);
    const iconHtml = info.icon
        ? `<img src="${info.icon}" alt="${info.symbol}" class="asset-badge-icon" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"><span class="asset-badge-initials" style="background:${info.color}; display:none">${info.symbol.substring(0, 2)}</span>`
        : `<span class="asset-badge-initials" style="background:${info.color}">${info.symbol.substring(0, 2)}</span>`;

    return `
        <div class="asset-badge-full" onclick="showAssetDetail(${aid})" title="${info.name}">
            ${iconHtml}
            <div class="asset-badge-info">
                <span class="asset-badge-symbol">${info.symbol}</span>
                <span class="asset-badge-aid">#${aid}</span>
            </div>
        </div>
    `;
}

// Calculate USD value for a reserve (uses global beamPriceUsd from top of file)
function calculateReserveUsd(amount, aid) {
    const beamAmount = amount / 100000000; // Convert from groth
    if (aid === 0) {
        // BEAM - direct price
        return beamAmount * beamPriceUsd;
    }
    // For other assets, we'd need their specific price
    // For now, return 0 for non-BEAM assets
    return 0;
}

// Format USD value
function formatUsdValue(value) {
    if (value <= 0) return '';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
}

function renderExplorerDexPools(pools) {
    const container = document.getElementById('explorer-dex-pools');
    if (!container) return;

    // Sort pools by BEAM reserve (highest first)
    // Aid1=0 means BEAM is the first asset, use Amount1
    // Otherwise check if Aid2=0 (BEAM is second asset)
    const sortedPools = [...pools].sort((a, b) => {
        const beamA = (a.Aid1 === 0 || a.aid1 === 0) ? (a.Amount1 || a.tok1 || 0) :
                      (a.Aid2 === 0 || a.aid2 === 0) ? (a.Amount2 || a.tok2 || 0) : 0;
        const beamB = (b.Aid1 === 0 || b.aid1 === 0) ? (b.Amount1 || b.tok1 || 0) :
                      (b.Aid2 === 0 || b.aid2 === 0) ? (b.Amount2 || b.tok2 || 0) : 0;
        return beamB - beamA; // Descending order
    });

    container.innerHTML = sortedPools.map(pool => {
        const aid1 = pool.Aid1 || pool.aid1 || 0;
        const aid2 = pool.Aid2 || pool.aid2 || 0;
        const volatility = pool.Volatility || pool.kind || 2;
        const lpToken = pool['LP-Token'] || pool['lp-token'] || '--';
        const amount1 = pool.Amount1 || pool.tok1 || 0;
        const amount2 = pool.Amount2 || pool.tok2 || 0;
        const rate12 = pool['Rate 1:2'] || pool.k1_2 || '--';
        const rate21 = pool['Rate 2:1'] || pool.k2_1 || '--';

        const info1 = getExplorerAssetInfo(aid1);
        const info2 = getExplorerAssetInfo(aid2);

        const volLabel = volatility == 0 ? 'High' : volatility == 1 ? 'Medium' : 'Low';
        const volClass = volatility == 0 ? 'vol-high' : volatility == 1 ? 'vol-medium' : 'vol-low';

        // Format reserves with proper decimals (8 for BEAM-like assets)
        const reserve1Num = amount1 / 100000000;
        const reserve2Num = amount2 / 100000000;
        const reserve1 = reserve1Num.toLocaleString(undefined, { maximumFractionDigits: 2 });
        const reserve2 = reserve2Num.toLocaleString(undefined, { maximumFractionDigits: 2 });

        // Calculate USD values
        const usd1 = calculateReserveUsd(amount1, aid1);
        const usd2 = calculateReserveUsd(amount2, aid2);
        const usd1Str = formatUsdValue(usd1);
        const usd2Str = formatUsdValue(usd2);

        // Calculate total pool TVL (both reserves in USD if possible)
        let tvlStr = '';
        if (usd1 > 0 || usd2 > 0) {
            // If one is BEAM, estimate other asset's value using the rate
            let tvl = usd1 + usd2;
            if (aid1 === 0 && usd2 === 0 && typeof rate12 === 'number') {
                // aid2 price = aid1 price / rate12
                tvl = usd1 * 2; // Approximate: both sides roughly equal in AMM
            } else if (aid2 === 0 && usd1 === 0 && typeof rate21 === 'number') {
                tvl = usd2 * 2;
            }
            tvlStr = formatUsdValue(tvl);
        }

        return `
            <tr class="pool-row">
                <td class="pool-pair">
                    <div class="pair-assets">
                        ${renderAssetBadgeFull(aid1)}
                        <span class="pair-separator">/</span>
                        ${renderAssetBadgeFull(aid2)}
                    </div>
                </td>
                <td>
                    <div class="reserve-cell">
                        <span class="reserve-amount">${reserve1}</span>
                        <span class="reserve-symbol">${info1.symbol}</span>
                        ${usd1Str ? `<span class="reserve-usd">${usd1Str}</span>` : ''}
                    </div>
                </td>
                <td>
                    <div class="reserve-cell">
                        <span class="reserve-amount">${reserve2}</span>
                        <span class="reserve-symbol">${info2.symbol}</span>
                        ${usd2Str ? `<span class="reserve-usd">${usd2Str}</span>` : ''}
                    </div>
                </td>
                <td>
                    <div class="rate-cell">
                        <span class="rate-value">1 ${info1.symbol} = ${typeof rate12 === 'number' ? rate12.toFixed(4) : rate12} ${info2.symbol}</span>
                        ${tvlStr ? `<span class="tvl-value">TVL: ${tvlStr}</span>` : ''}
                    </div>
                </td>
                <td><span class="volatility-badge ${volClass}">${volLabel}</span></td>
                <td class="lp-token-cell">#${lpToken}</td>
            </tr>
        `;
    }).join('');
}

// Render DEX trades (table format with pagination)
function renderExplorerDexTrades(callsHistory) {
    const container = document.getElementById('explorer-dex-trades');
    if (!container) return;

    const trades = [];

    // Parse calls history (may have grouped rows)
    callsHistory.value.slice(1).forEach(row => {
        if (row?.type === 'group') {
            // Grouped trades
            row.value.forEach(trade => {
                if (trade[3] === 'Trade') {
                    trades.push(parseTrade(trade));
                }
            });
        } else if (row[3] === 'Trade') {
            trades.push(parseTrade(row));
        }
    });

    function parseTrade(row) {
        const height = row[0]?.value || row[0] || 0;
        const action = row[3] || 'Trade';
        const funds = row[5];

        let assetIn = 0, amountIn = 0, assetOut = 0, amountOut = 0;

        if (funds?.value) {
            funds.value.forEach(f => {
                // Extract numeric aid - handle nested objects like {type: 'aid', value: 174}
                let aid = f[0];
                if (aid && typeof aid === 'object') {
                    aid = aid.value !== undefined ? aid.value : 0;
                }
                aid = Number(aid) || 0;

                // Extract amount
                let amt = f[1];
                if (amt && typeof amt === 'object') {
                    amt = amt.value !== undefined ? amt.value : 0;
                }
                amt = Number(amt) || 0;

                if (amt < 0) {
                    assetIn = aid;
                    amountIn = Math.abs(amt);
                } else if (amt > 0) {
                    assetOut = aid;
                    amountOut = amt;
                }
            });
        }

        return { height, action, assetIn, amountIn, assetOut, amountOut };
    }

    // Store trades in explorerData for pagination
    explorerData.dexTrades = trades;

    if (trades.length === 0) {
        container.innerHTML = '<tr><td colspan="4" class="loading-state">No recent trades</td></tr>';
        hideLoadMoreTrades();
        return;
    }

    renderDexTradesPage(trades, false);
}

// Render from cached trades
function renderExplorerDexTradesFromCache() {
    if (!explorerData.dexTrades) return;
    renderDexTradesPage(explorerData.dexTrades, false);
}

// Render a page of trades
function renderDexTradesPage(trades, append = false) {
    const container = document.getElementById('explorer-dex-trades');
    if (!container) return;

    const { page, perPage } = explorerPagination.trades;
    const startIdx = page * perPage;
    const endIdx = startIdx + perPage;
    const pageTrades = trades.slice(startIdx, endIdx);

    const html = pageTrades.map(t => {
        const inInfo = getExplorerAssetInfo(t.assetIn);
        const outInfo = getExplorerAssetInfo(t.assetOut);
        const amtIn = (t.amountIn / 100000000).toLocaleString(undefined, { maximumFractionDigits: 4 });
        const amtOut = (t.amountOut / 100000000).toLocaleString(undefined, { maximumFractionDigits: 4 });

        return `
            <tr>
                <td class="highlight">${t.height.toLocaleString()}</td>
                <td><span class="trade-type">Swap</span></td>
                <td>
                    <div class="trade-asset">
                        ${renderAssetBadge(t.assetIn)}
                        <span class="trade-amount negative">-${amtIn}</span>
                    </div>
                </td>
                <td>
                    <div class="trade-asset">
                        ${renderAssetBadge(t.assetOut)}
                        <span class="trade-amount positive">+${amtOut}</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }

    // Show/hide load more button
    const hasMore = trades.length > endIdx;
    showLoadMoreTrades(hasMore, trades.length, endIdx);
}

// Load more trades
function loadMoreTrades() {
    explorerPagination.trades.page++;
    renderDexTradesPage(explorerData.dexTrades, true);
}

// Show/hide load more trades button
function showLoadMoreTrades(show, total, loaded) {
    let btn = document.getElementById('load-more-trades-btn');
    if (!btn) {
        // Create button if doesn't exist
        const table = document.getElementById('explorer-dex-trades')?.closest('table');
        if (table) {
            btn = document.createElement('button');
            btn.id = 'load-more-trades-btn';
            btn.className = 'load-more-btn';
            btn.onclick = loadMoreTrades;
            table.parentElement.appendChild(btn);
        }
    }
    if (btn) {
        btn.style.display = show ? 'block' : 'none';
        btn.textContent = `Load More Trades (${loaded}/${total})`;
    }
}

function hideLoadMoreTrades() {
    const btn = document.getElementById('load-more-trades-btn');
    if (btn) btn.style.display = 'none';
}

// Load Atomic Swaps data
async function loadExplorerAtomicSwaps() {
    const totalsContainer = document.getElementById('swap-totals-grid');
    const offersContainer = document.getElementById('explorer-swap-offers');

    if (totalsContainer) {
        totalsContainer.innerHTML = '<div class="loading-state">Loading swap data...</div>';
    }
    if (offersContainer) {
        offersContainer.innerHTML = '<tr><td colspan="5" class="loading-state">Loading offers...</td></tr>';
    }

    try {
        // Fetch swap totals
        const totals = await fetchExplorerAPI('/swap_totals');

        if (totals && totalsContainer) {
            const swapAssets = [
                { name: 'Total Swaps', value: totals.total_swaps_count || 0, icon: null },
                { name: 'Bitcoin', symbol: 'BTC', value: totals.bitcoin_offered || '0', icon: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg' },
                { name: 'Ethereum', symbol: 'ETH', value: totals.ethereum_offered || '0', icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg' },
                { name: 'Litecoin', symbol: 'LTC', value: totals.litecoin_offered || '0', icon: 'https://cryptologos.cc/logos/litecoin-ltc-logo.svg' },
                { name: 'Dogecoin', symbol: 'DOGE', value: totals.dogecoin_offered || '0', icon: 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg' },
                { name: 'Dash', symbol: 'DASH', value: totals.dash_offered || '0', icon: 'https://cryptologos.cc/logos/dash-dash-logo.svg' },
                { name: 'USDT', symbol: 'USDT', value: totals.usdt_offered || '0', icon: 'https://cryptologos.cc/logos/tether-usdt-logo.svg' },
                { name: 'DAI', symbol: 'DAI', value: totals.dai_offered || '0', icon: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.svg' },
                { name: 'WBTC', symbol: 'WBTC', value: totals.wbtc_offered || '0', icon: 'https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.svg' },
                { name: 'QTUM', symbol: 'QTUM', value: totals.qtum_offered || '0', icon: 'https://cryptologos.cc/logos/qtum-qtum-logo.svg' },
                { name: 'BEAM Offered', symbol: 'BEAM', value: totals.beams_offered || '0', icon: BEAM_LOGO }
            ];

            totalsContainer.innerHTML = `
                <div class="swap-stat-card total-swaps">
                    <div class="swap-stat-value">${totals.total_swaps_count || 0}</div>
                    <div class="swap-stat-label">Total Atomic Swaps</div>
                </div>
                <div class="swap-assets-grid">
                    ${swapAssets.slice(1).map(asset => `
                        <div class="swap-asset-card">
                            <div class="swap-asset-icon">
                                ${asset.icon ? `<img src="${asset.icon}" alt="${asset.symbol}" onerror="this.style.display='none'">` : ''}
                            </div>
                            <div class="swap-asset-info">
                                <div class="swap-asset-value">${asset.value}</div>
                                <div class="swap-asset-name">${asset.symbol} Offered</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Fetch active offers
        const offers = await fetchExplorerAPI('/swap_offers');

        if (offersContainer) {
            if (!offers || offers.length === 0) {
                offersContainer.innerHTML = '<tr><td colspan="5" class="loading-state">No active swap offers</td></tr>';
            } else {
                offersContainer.innerHTML = offers.map(offer => `
                    <tr>
                        <td class="mono-text">${offer.id?.substring(0, 16) || '--'}...</td>
                        <td>${offer.send_amount || '--'} ${offer.send_currency || ''}</td>
                        <td>${offer.receive_amount || '--'} ${offer.receive_currency || ''}</td>
                        <td>${offer.rate || '--'}</td>
                        <td><span class="status-badge active">Active</span></td>
                    </tr>
                `).join('');
            }
        }

    } catch (e) {
        console.error('Explorer Atomic Swaps error:', e);
        if (totalsContainer) {
            totalsContainer.innerHTML = '<div class="error-state">Failed to load swap data</div>';
        }
        if (offersContainer) {
            offersContainer.innerHTML = '<tr><td colspan="5" class="loading-state">Failed to load offers</td></tr>';
        }
    }
}

// Change Explorer node
function changeExplorerNode() {
    const selector = document.getElementById('explorer-node-selector');
    if (selector) {
        EXPLORER_API = selector.value;
        localStorage.setItem('explorerApi', EXPLORER_API);
        testExplorerConnection();
    }
}

// Test Explorer connection
async function testExplorerConnection() {
    const statusEl = document.getElementById('explorer-connection-status');
    if (statusEl) {
        statusEl.innerHTML = '<span class="status-dot status-checking"></span> Testing...';
    }

    try {
        const resp = await fetch(`${EXPLORER_API}/status`, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
            const data = await resp.json();
            explorerConnected = true;
            updateExplorerConnectionStatus(true);
            showToast(`Connected to Explorer (Height: ${data.height?.toLocaleString()})`, 'success');

            // Reload explorer page if active
            if (document.getElementById('page-explorer')?.classList.contains('active')) {
                showExplorerTab(currentExplorerTab);
            }
        } else {
            throw new Error('HTTP ' + resp.status);
        }
    } catch (e) {
        explorerConnected = false;
        updateExplorerConnectionStatus(false);
        showToast('Explorer connection failed: ' + e.message, 'error');
    }
}

// Update Explorer connection status in Settings
function updateExplorerConnectionStatus(connected) {
    const statusEl = document.getElementById('explorer-connection-status');
    if (statusEl) {
        if (connected) {
            statusEl.innerHTML = '<span class="status-dot status-connected"></span> Connected';
            statusEl.querySelector('.status-dot').style.background = 'var(--success)';
        } else {
            statusEl.innerHTML = '<span class="status-dot status-error"></span> Disconnected';
            statusEl.querySelector('.status-dot').style.background = 'var(--error)';
        }
    }
}

// Initialize Explorer settings on page load
async function initExplorerSettings() {
    await loadExplorerNodesConfig();
    const selector = document.getElementById('explorer-node-selector');
    if (selector) {
        selector.value = EXPLORER_API;
    }
    // Test connection on init
    testExplorerConnection();
}

// Fetch from Explorer API
async function fetchExplorerAPI(endpoint, params = {}) {
    const url = new URL(`${EXPLORER_API}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.append(k, v));
    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}

// Search Explorer main (in-app search) - block height, hash, or kernel only
function searchExplorerMain() {
    const query = document.getElementById('explorer-main-search')?.value.trim();
    if (!query) return;

    // Detect query type
    if (/^\d+$/.test(query)) {
        // Pure number = Block height
        const height = parseInt(query);
        showBlockDetail(height);
    } else if (query.length === 64 && /^[a-fA-F0-9]+$/.test(query)) {
        // 64 hex chars = Block hash - search for block with this hash
        searchBlockByHash(query);
    } else {
        // Assume it's a kernel ID - search for kernel
        searchKernel(query);
    }

    // Clear search input
    document.getElementById('explorer-main-search').value = '';
}

// Search for block by hash
async function searchBlockByHash(hash) {
    try {
        showToast('Searching for block...', 'info');

        // Try to find block in recent blocks first
        if (explorerData.blocks && explorerData.blocks.length > 0) {
            const block = explorerData.blocks.find(b =>
                (b.Hash || b.hash || '').toLowerCase() === hash.toLowerCase()
            );
            if (block) {
                showBlockDetail(block.Height || block.height);
                return;
            }
        }

        // If not found locally, we'd need an API endpoint to search by hash
        // For now, show a message
        showToast('Block hash search requires checking the blockchain. Try searching by height.', 'warning');
    } catch (e) {
        console.error('Error searching block by hash:', e);
        showToast('Failed to search for block', 'error');
    }
}

// Search for kernel by ID
async function searchKernel(kernelId) {
    try {
        showToast('Searching for kernel...', 'info');

        // Kernel search would require an API endpoint
        // For now, show informative message
        showToast('Kernel search: ' + kernelId.substring(0, 16) + '...', 'info');

        // TODO: Implement kernel search when API endpoint is available
        // The explorer API may have a /kernel?id={kernelId} endpoint
    } catch (e) {
        console.error('Error searching kernel:', e);
        showToast('Failed to search for kernel', 'error');
    }
}

// Filter contracts by search term
function filterExplorerContracts() {
    const query = document.getElementById('explorer-contract-search')?.value.trim().toLowerCase() || '';

    if (!explorerData.contracts) return;

    const filtered = query
        ? explorerData.contracts.filter(c => {
            const cid = (c.Cid || '').toLowerCase();
            let kind = c.Kind || '';
            if (typeof kind === 'object') {
                kind = kind.Wrapper || kind.value || JSON.stringify(kind);
            }
            kind = String(kind).toLowerCase();
            return cid.includes(query) || kind.includes(query);
        })
        : explorerData.contracts;

    renderExplorerContracts(filtered);
}

// Auto-refresh explorer data when page is active
setInterval(() => {
    const explorerPage = document.getElementById('page-explorer');
    if (explorerPage?.classList.contains('active') && Date.now() - explorerData.lastUpdate > 30000) {
        if (currentExplorerTab === 'overview') {
            loadExplorerOverview();
        }
    }
}, 30000);
