/**
 * BEAM Wallet - Send Page Module
 * Handles sending transactions
 */

import { ASSET_CONFIG, GROTH, DEFAULT_FEE } from '../config.js';
import { apiCall } from '../api.js';
import { getState } from '../state.js';
import { formatAmount, parseAmount, shortenAddress } from '../utils.js';
import { showToast, showToastAdvanced } from '../components/toasts.js';
import { openModal, closeModal } from '../components/modals.js';

let currentSendAsset = 0;

/**
 * Render send page content
 */
export function renderSendPage() {
    const container = document.getElementById('send-form');
    if (!container) return;

    const state = getState();
    const assets = state.wallet.assets.filter(a => a.balance > 0);

    container.innerHTML = `
        <div class="send-card">
            <div class="send-field">
                <label>From Asset</label>
                <div class="asset-selector" id="send-asset-selector" onclick="openSendAssetSelector()">
                    <div class="selected-asset" id="selected-send-asset">
                        <span class="asset-icon-small" style="background: var(--beam-cyan);">BE</span>
                        <span>BEAM</span>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </div>
            </div>

            <div class="send-field">
                <label>Recipient Address</label>
                <input type="text" id="send-address" class="send-input" placeholder="Enter BEAM address">
            </div>

            <div class="send-field">
                <label>Amount</label>
                <div class="amount-input-wrapper">
                    <input type="text" id="send-amount" class="send-input" placeholder="0.00" oninput="validateSendAmount()">
                    <button class="max-btn" onclick="setSendMax()">MAX</button>
                </div>
                <div class="balance-hint" id="send-balance-hint">Available: 0 BEAM</div>
            </div>

            <div class="send-field">
                <label>Comment (optional)</label>
                <input type="text" id="send-comment" class="send-input" placeholder="Add a note">
            </div>

            <div class="send-fee">
                <span>Network Fee</span>
                <span>${formatAmount(DEFAULT_FEE)} BEAM</span>
            </div>

            <button class="send-btn" id="send-btn" onclick="executeSend()" disabled>
                Send
            </button>
        </div>
    `;

    updateSendAssetDisplay();
}

/**
 * Update the selected asset display
 */
export function updateSendAssetDisplay() {
    const state = getState();
    const asset = state.wallet.assets.find(a => a.id === currentSendAsset);
    const config = ASSET_CONFIG[currentSendAsset] || { symbol: 'CA' + currentSendAsset, color: '#64748b' };

    const display = document.getElementById('selected-send-asset');
    if (display) {
        const iconHtml = config.icon
            ? `<img src="${config.icon}" style="width:20px;height:20px;border-radius:50%;">`
            : config.symbol.substring(0, 2);
        display.innerHTML = `
            <span class="asset-icon-small" style="background: ${config.icon ? 'transparent' : config.color};">${iconHtml}</span>
            <span>${config.symbol}</span>
        `;
    }

    const hint = document.getElementById('send-balance-hint');
    if (hint && asset) {
        hint.textContent = `Available: ${formatAmount(asset.balance)} ${config.symbol}`;
    }
}

/**
 * Open asset selector for send
 */
export function openSendAssetSelector() {
    const state = getState();
    const assets = state.wallet.assets.filter(a => a.balance > 0);

    const content = document.createElement('div');
    content.innerHTML = `
        <div class="token-list">
            ${assets.map(asset => {
                const config = ASSET_CONFIG[asset.id] || {
                    name: `Asset #${asset.id}`,
                    symbol: 'CA' + asset.id,
                    color: '#64748b'
                };
                const iconHtml = config.icon
                    ? `<img src="${config.icon}" style="width:32px;height:32px;">`
                    : config.symbol.substring(0, 2);
                return `
                    <div class="token-item ${asset.id === currentSendAsset ? 'selected' : ''}"
                         onclick="selectSendAsset(${asset.id})">
                        <div class="token-icon" style="background: ${config.icon ? 'transparent' : config.color};">
                            ${iconHtml}
                        </div>
                        <div class="token-info">
                            <div class="token-name">${config.name}</div>
                            <div class="token-balance">${formatAmount(asset.balance)} ${config.symbol}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    const modal = document.getElementById('token-select-modal');
    if (modal) {
        modal.innerHTML = `
            <div class="modal" style="max-width: 400px;">
                <div class="modal-header">
                    <h2 class="modal-title">Select Asset</h2>
                    <button class="modal-close" onclick="closeModal('token-select-modal')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">${content.innerHTML}</div>
            </div>
        `;
        openModal('token-select-modal');
    }
}

/**
 * Select asset for sending
 */
export function selectSendAsset(assetId) {
    currentSendAsset = assetId;
    closeModal('token-select-modal');
    updateSendAssetDisplay();
    validateSendAmount();
}

/**
 * Set max amount
 */
export function setSendMax() {
    const state = getState();
    const asset = state.wallet.assets.find(a => a.id === currentSendAsset);
    if (!asset) return;

    let maxAmount = asset.balance;
    if (currentSendAsset === 0) {
        maxAmount = Math.max(0, asset.balance - DEFAULT_FEE);
    }

    const input = document.getElementById('send-amount');
    if (input) {
        input.value = formatAmount(maxAmount);
        validateSendAmount();
    }
}

/**
 * Validate send amount
 */
export function validateSendAmount() {
    const state = getState();
    const asset = state.wallet.assets.find(a => a.id === currentSendAsset);
    const amountInput = document.getElementById('send-amount');
    const addressInput = document.getElementById('send-address');
    const btn = document.getElementById('send-btn');

    if (!asset || !amountInput || !btn) return;

    const amount = parseFloat(amountInput.value.replace(',', '.')) || 0;
    const amountGroth = Math.round(amount * GROTH);
    const address = addressInput?.value?.trim() || '';

    let isValid = true;
    let maxAvailable = asset.balance;
    if (currentSendAsset === 0) {
        maxAvailable = Math.max(0, asset.balance - DEFAULT_FEE);
    }

    if (amount <= 0) isValid = false;
    if (amountGroth > maxAvailable) isValid = false;
    if (address.length < 20) isValid = false;

    btn.disabled = !isValid;
}

/**
 * Execute send transaction
 */
export async function executeSend() {
    const amountInput = document.getElementById('send-amount');
    const addressInput = document.getElementById('send-address');
    const commentInput = document.getElementById('send-comment');
    const btn = document.getElementById('send-btn');

    const amount = parseFloat(amountInput.value.replace(',', '.')) || 0;
    const amountGroth = Math.round(amount * GROTH);
    const address = addressInput.value.trim();
    const comment = commentInput?.value?.trim() || '';

    const config = ASSET_CONFIG[currentSendAsset] || { symbol: 'CA' + currentSendAsset };

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        const params = {
            address,
            value: amountGroth,
            fee: DEFAULT_FEE,
            comment
        };

        if (currentSendAsset !== 0) {
            params.asset_id = currentSendAsset;
        }

        const result = await apiCall('tx_send', params);

        if (result?.txId || result?.txid) {
            showToastAdvanced(
                'Transaction Sent!',
                `${amount} ${config.symbol} to ${shortenAddress(address)}`,
                'success'
            );

            // Clear form
            amountInput.value = '';
            addressInput.value = '';
            if (commentInput) commentInput.value = '';

            // Refresh data
            if (window.BeamWallet?.loadWalletData) {
                await window.BeamWallet.loadWalletData();
            }
        } else {
            throw new Error(result?.error?.message || 'Transaction failed');
        }
    } catch (e) {
        showToastAdvanced('Send Failed', e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send';
        validateSendAmount();
    }
}

// Make functions available globally
window.openSendAssetSelector = openSendAssetSelector;
window.selectSendAsset = selectSendAsset;
window.setSendMax = setSendMax;
window.validateSendAmount = validateSendAmount;
window.executeSend = executeSend;
