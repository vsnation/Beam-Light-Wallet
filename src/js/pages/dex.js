/**
 * BEAM Wallet - DEX Page Module
 * Decentralized exchange / token swap functionality
 */

import { ASSET_CONFIG, DEX_CID, GROTH } from '../config.js';
import { apiCall } from '../api.js';
import { getState, loadDexPools, getAssetInfo } from '../state.js';
import { formatAmount, formatForInput, debounce } from '../utils.js';
import { showToast, showToastAdvanced } from '../components/toasts.js';
import { openModal, closeModal } from '../components/modals.js';

// DEX state
let dexPools = [];
let dexFromAsset = null;
let dexToAsset = null;
let dexQuote = null;

/**
 * Render DEX page
 */
export async function renderDexPage() {
    const container = document.getElementById('dex-content');
    if (!container) return;

    container.innerHTML = `
        <div class="dex-card">
            <!-- Swap Card -->
            <div class="swap-container">
                <div class="swap-field">
                    <label>You Pay</label>
                    <div class="swap-input-row">
                        <input type="text" id="dex-from-amount" class="swap-input"
                               placeholder="0.00" oninput="debouncedGetQuote()">
                        <button class="token-select-btn" id="dex-from-btn" onclick="openDexTokenSelector('from')">
                            <span>Select token</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M6 9l6 6 6-6"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="swap-arrow" onclick="swapTokens()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                        <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"/>
                    </svg>
                </div>

                <div class="swap-field">
                    <label>You Receive</label>
                    <div class="swap-input-row">
                        <input type="text" id="dex-to-amount" class="swap-input"
                               placeholder="0.00" readonly>
                        <button class="token-select-btn" id="dex-to-btn" onclick="openDexTokenSelector('to')">
                            <span>Select token</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M6 9l6 6 6-6"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Swap Info -->
                <div class="swap-info" id="dex-swap-info" style="display:none;">
                    <div class="swap-info-row">
                        <span>Rate</span>
                        <span id="dex-rate">-</span>
                    </div>
                    <div class="swap-info-row">
                        <span>You Pay</span>
                        <span id="dex-pay">-</span>
                    </div>
                    <div class="swap-info-row">
                        <span>You Receive</span>
                        <span id="dex-receive">-</span>
                    </div>
                    <div class="swap-info-row">
                        <span>Pool Fee</span>
                        <span id="dex-fee">-</span>
                    </div>
                    <div class="swap-info-row">
                        <span>Min. Received</span>
                        <span id="dex-min-receive">-</span>
                    </div>
                </div>

                <button class="swap-btn" id="dex-swap-btn" onclick="executeSwap()" disabled>
                    Select tokens
                </button>
            </div>

            <!-- Pools Section -->
            <div class="pools-section">
                <h3>Liquidity Pools</h3>
                <div class="pools-grid" id="dex-pools-grid">
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <span>Loading pools...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    await loadPools();
}

/**
 * Load DEX pools
 */
async function loadPools() {
    const grid = document.getElementById('dex-pools-grid');
    if (!grid) return;

    try {
        dexPools = await loadDexPools();
        renderPoolsGrid();
    } catch (e) {
        grid.innerHTML = `
            <div class="error-state">
                <p>Failed to load pools</p>
                <button class="retry-btn" onclick="loadPools()">Retry</button>
            </div>
        `;
    }
}

/**
 * Render pools grid
 */
function renderPoolsGrid() {
    const grid = document.getElementById('dex-pools-grid');
    if (!grid) return;

    if (!dexPools || dexPools.length === 0) {
        grid.innerHTML = '<div class="empty-state">No pools available</div>';
        return;
    }

    grid.innerHTML = dexPools.slice(0, 12).map(pool => {
        const a1 = getAssetInfo(pool.aid1);
        const a2 = getAssetInfo(pool.aid2);
        const rate = pool.tok1 > 0 ? (pool.tok2 / pool.tok1).toFixed(4).replace(/,/g, '.') : '-';

        return `
            <div class="pool-card" onclick="selectPoolForSwap(${pool.aid1}, ${pool.aid2})">
                <div class="pool-tokens">
                    <span class="pool-token">${a1.symbol}</span>
                    <span class="pool-separator">/</span>
                    <span class="pool-token">${a2.symbol}</span>
                </div>
                <div class="pool-rate">1 ${a1.symbol} = ${rate} ${a2.symbol}</div>
                <div class="pool-liquidity">
                    <span>${formatAmount(pool.tok1)} ${a1.symbol}</span>
                    <span>${formatAmount(pool.tok2)} ${a2.symbol}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Select pool for swap
 */
export function selectPoolForSwap(aid1, aid2) {
    selectDexToken('from', aid1);
    selectDexToken('to', aid2);
}

/**
 * Open token selector
 */
export function openDexTokenSelector(side) {
    const state = getState();
    const assets = state.wallet.assets;

    // Get all unique assets from pools + wallet
    const allAssets = new Set([0]); // Always include BEAM
    assets.forEach(a => allAssets.add(a.id));
    dexPools.forEach(p => {
        allAssets.add(p.aid1);
        allAssets.add(p.aid2);
    });

    const modal = document.getElementById('token-select-modal');
    if (!modal) return;

    modal.innerHTML = `
        <div class="modal" style="max-width: 400px;">
            <div class="modal-header">
                <h2 class="modal-title">Select Token</h2>
                <button class="modal-close" onclick="closeModal('token-select-modal')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="token-list">
                    ${[...allAssets].map(aid => {
                        const info = getAssetInfo(aid);
                        const walletAsset = assets.find(a => a.id === aid);
                        const balance = walletAsset ? formatAmount(walletAsset.balance) : '0';
                        const config = ASSET_CONFIG[aid] || { color: '#64748b' };
                        const iconHtml = config.icon
                            ? `<img src="${config.icon}" style="width:32px;height:32px;">`
                            : info.symbol.substring(0, 2);

                        return `
                            <div class="token-item" onclick="selectDexToken('${side}', ${aid})">
                                <div class="token-icon" style="background: ${config.icon ? 'transparent' : config.color};">
                                    ${iconHtml}
                                </div>
                                <div class="token-info">
                                    <div class="token-name">${info.name}</div>
                                    <div class="token-symbol">${info.symbol} #${aid}</div>
                                </div>
                                <div class="token-balance">${balance}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;

    openModal('token-select-modal');
}

/**
 * Select DEX token
 */
export function selectDexToken(side, aid) {
    closeModal('token-select-modal');

    const info = getAssetInfo(aid);
    const config = ASSET_CONFIG[aid] || { color: '#64748b' };
    const iconHtml = config.icon
        ? `<img src="${config.icon}" style="width:20px;height:20px;border-radius:50%;">`
        : info.symbol.substring(0, 2);

    const btn = document.getElementById(side === 'from' ? 'dex-from-btn' : 'dex-to-btn');
    if (btn) {
        btn.innerHTML = `
            <span class="token-icon-small" style="background: ${config.icon ? 'transparent' : config.color};">${iconHtml}</span>
            <span>${info.symbol}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M6 9l6 6 6-6"/>
            </svg>
        `;
    }

    if (side === 'from') {
        dexFromAsset = info;
    } else {
        dexToAsset = info;
    }

    updateSwapButton();
    getQuote();
}

/**
 * Swap tokens (reverse direction)
 */
export function swapTokens() {
    const temp = dexFromAsset;
    dexFromAsset = dexToAsset;
    dexToAsset = temp;

    // Update UI
    if (dexFromAsset) selectDexToken('from', dexFromAsset.aid);
    if (dexToAsset) selectDexToken('to', dexToAsset.aid);

    // Swap amounts
    const fromInput = document.getElementById('dex-from-amount');
    const toInput = document.getElementById('dex-to-amount');
    if (fromInput && toInput) {
        fromInput.value = toInput.value;
        toInput.value = '';
    }

    getQuote();
}

/**
 * Update swap button state
 */
function updateSwapButton() {
    const btn = document.getElementById('dex-swap-btn');
    if (!btn) return;

    btn.onclick = executeSwap;

    if (!dexFromAsset || !dexToAsset) {
        btn.textContent = 'Select tokens';
        btn.disabled = true;
    } else if (!dexQuote) {
        btn.textContent = 'Enter amount';
        btn.disabled = true;
    } else {
        btn.textContent = `Swap ${dexFromAsset.symbol} for ${dexToAsset.symbol}`;
        btn.disabled = false;
    }
}

/**
 * Debounced quote fetcher
 */
const debouncedGetQuote = debounce(getQuote, 500);

/**
 * Get swap quote
 */
async function getQuote() {
    if (!dexFromAsset || !dexToAsset) return;

    const fromInput = document.getElementById('dex-from-amount');
    const toInput = document.getElementById('dex-to-amount');
    const infoEl = document.getElementById('dex-swap-info');

    const amount = parseFloat(fromInput?.value?.replace(',', '.') || 0);
    if (!amount || amount <= 0) {
        toInput.value = '';
        infoEl.style.display = 'none';
        dexQuote = null;
        updateSwapButton();
        return;
    }

    try {
        // Find pool
        const pool = dexPools.find(p =>
            (p.aid1 === dexFromAsset.aid && p.aid2 === dexToAsset.aid) ||
            (p.aid2 === dexFromAsset.aid && p.aid1 === dexToAsset.aid)
        );

        if (!pool) {
            toInput.value = 'No pool';
            dexQuote = null;
            updateSwapButton();
            return;
        }

        // Determine swap direction
        let callAid1, callAid2;
        if (dexFromAsset.aid === pool.aid2) {
            callAid1 = pool.aid1;
            callAid2 = pool.aid2;
        } else {
            callAid1 = pool.aid2;
            callAid2 = pool.aid1;
        }

        const amountSmall = Math.round(amount * GROTH);
        const args = `action=pool_trade,aid1=${callAid1},aid2=${callAid2},kind=${pool.kind},val1_buy=0,val2_pay=${amountSmall},bPredictOnly=1,cid=${DEX_CID}`;

        const result = await apiCall('invoke_contract', { args });

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
        const minReceive = buyFormatted * 0.995;

        toInput.value = formatForInput(buyFormatted, 6);

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
        toInput.value = 'Error';
        dexQuote = null;
        updateSwapButton();
    }
}

/**
 * Show swap confirmation
 */
export function executeSwap() {
    if (!dexQuote) return;

    const fromAmount = document.getElementById('dex-from-amount').value;
    const toAmount = document.getElementById('dex-to-amount').value;
    const rate = dexQuote.buyAmount > 0
        ? (dexQuote.amountSmall / dexQuote.buyAmount).toFixed(6)
        : '-';
    const fee = (dexQuote.fee / GROTH).toFixed(6);

    const fromConfig = ASSET_CONFIG[dexFromAsset.aid] || { symbol: dexFromAsset.symbol, color: '#64748b' };
    const toConfig = ASSET_CONFIG[dexToAsset.aid] || { symbol: dexToAsset.symbol, color: '#64748b' };

    const fromIconHtml = fromConfig.icon
        ? `<img src="${fromConfig.icon}">`
        : fromConfig.symbol.substring(0, 2);
    const toIconHtml = toConfig.icon
        ? `<img src="${toConfig.icon}">`
        : toConfig.symbol.substring(0, 2);

    const modal = document.getElementById('swap-confirm-modal');
    if (!modal) return;

    modal.innerHTML = `
        <div class="modal" style="max-width: 420px;">
            <div class="modal-header">
                <h2 class="modal-title">Confirm Swap</h2>
                <button class="modal-close" onclick="closeModal('swap-confirm-modal')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="confirm-swap-container">
                    <div class="confirm-swap-asset spending">
                        <div class="confirm-asset-icon" style="background: ${fromConfig.icon ? 'transparent' : fromConfig.color}">
                            ${fromIconHtml}
                        </div>
                        <div class="confirm-asset-info">
                            <div class="confirm-asset-label spending">You're Spending</div>
                            <div class="confirm-asset-name">${fromConfig.name || dexFromAsset.symbol}</div>
                            <div class="confirm-asset-id">${dexFromAsset.symbol} - ID #${dexFromAsset.aid}</div>
                        </div>
                        <div class="confirm-asset-amount spending">
                            <span class="amount">-${fromAmount}</span>
                            <span class="symbol">${dexFromAsset.symbol}</span>
                        </div>
                    </div>

                    <div class="confirm-swap-arrow">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 5v14M5 12l7 7 7-7"/>
                        </svg>
                    </div>

                    <div class="confirm-swap-asset receiving">
                        <div class="confirm-asset-icon" style="background: ${toConfig.icon ? 'transparent' : toConfig.color}">
                            ${toIconHtml}
                        </div>
                        <div class="confirm-asset-info">
                            <div class="confirm-asset-label receiving">You're Receiving</div>
                            <div class="confirm-asset-name">${toConfig.name || dexToAsset.symbol}</div>
                            <div class="confirm-asset-id">${dexToAsset.symbol} - ID #${dexToAsset.aid}</div>
                        </div>
                        <div class="confirm-asset-amount receiving">
                            <span class="amount">+${toAmount}</span>
                            <span class="symbol">${dexToAsset.symbol}</span>
                        </div>
                    </div>

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
                            <span class="confirm-swap-label">Slippage</span>
                            <span class="confirm-swap-value">0.5%</span>
                        </div>
                    </div>

                    <div class="confirm-buttons">
                        <button class="btn btn-cancel" onclick="closeModal('swap-confirm-modal')">Cancel</button>
                        <button class="btn btn-confirm" onclick="confirmAndExecuteSwap()">Confirm Swap</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    openModal('swap-confirm-modal');
}

/**
 * Confirm and execute swap
 */
export async function confirmAndExecuteSwap() {
    closeModal('swap-confirm-modal');

    if (!dexQuote) return;

    const btn = document.getElementById('dex-swap-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Swapping...';

    showToastAdvanced('Swap Initiated', `${dexFromAsset.symbol} → ${dexToAsset.symbol}`, 'pending');

    try {
        const { pool, amountSmall, callAid1, callAid2 } = dexQuote;
        const args = `action=pool_trade,aid1=${callAid1},aid2=${callAid2},kind=${pool.kind},val1_buy=0,val2_pay=${amountSmall},bPredictOnly=0,cid=${DEX_CID}`;

        const result = await apiCall('invoke_contract', { args, create_tx: true });

        if (result?.raw_data) {
            await apiCall('process_invoke_data', { data: result.raw_data });

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

            // Refresh data
            if (window.BeamWallet?.loadWalletData) {
                await window.BeamWallet.loadWalletData();
            }
        } else if (result?.error) {
            throw new Error(result.error.message || 'Contract error');
        } else {
            throw new Error('No transaction data returned');
        }
    } catch (e) {
        showToastAdvanced('Swap Failed', e.message, 'error');
    }

    updateSwapButton();
}

// Make functions available globally
window.openDexTokenSelector = openDexTokenSelector;
window.selectDexToken = selectDexToken;
window.selectPoolForSwap = selectPoolForSwap;
window.swapTokens = swapTokens;
window.debouncedGetQuote = debouncedGetQuote;
window.executeSwap = executeSwap;
window.confirmAndExecuteSwap = confirmAndExecuteSwap;
window.loadPools = loadPools;
