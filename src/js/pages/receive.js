/**
 * BEAM Wallet - Receive Page Module
 * Handles receiving transactions and address generation
 */

import { ASSET_CONFIG } from '../config.js';
import { apiCall } from '../api.js';
import { getState } from '../state.js';
import { shortenAddress, copyToClipboard } from '../utils.js';
import { showToast } from '../components/toasts.js';

let currentReceiveAddress = null;
let currentAddressType = 'regular';

/**
 * Render receive page content
 */
export async function renderReceivePage() {
    const container = document.getElementById('receive-content');
    if (!container) return;

    container.innerHTML = `
        <div class="receive-card">
            <div class="address-type-tabs">
                <button class="tab-btn active" data-type="regular" onclick="selectAddressType('regular')">
                    Regular
                </button>
                <button class="tab-btn" data-type="max_privacy" onclick="selectAddressType('max_privacy')">
                    Max Privacy
                </button>
                <button class="tab-btn" data-type="offline" onclick="selectAddressType('offline')">
                    Offline
                </button>
            </div>

            <div class="qr-section" id="qr-section">
                <div class="qr-placeholder">
                    <div class="spinner"></div>
                    <span>Generating address...</span>
                </div>
            </div>

            <div class="address-section" id="address-section">
                <label>Your Address</label>
                <div class="address-display">
                    <span class="address-text" id="receive-address">Loading...</span>
                    <button class="copy-btn" onclick="copyReceiveAddress()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="address-actions">
                <button class="action-btn" onclick="generateNewAddress()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M23 4v6h-6M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                    </svg>
                    Generate New
                </button>
                <button class="action-btn" onclick="showAddressList()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                    </svg>
                    My Addresses
                </button>
            </div>

            <div class="address-info">
                <p><strong>Regular:</strong> Standard address for most transactions</p>
                <p><strong>Max Privacy:</strong> Enhanced privacy with longer confirmation time</p>
                <p><strong>Offline:</strong> For receiving when your wallet is offline</p>
            </div>
        </div>
    `;

    await generateNewAddress();
}

/**
 * Select address type
 */
export async function selectAddressType(type) {
    currentAddressType = type;

    // Update tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });

    await generateNewAddress();
}

/**
 * Generate new address
 */
export async function generateNewAddress() {
    const qrSection = document.getElementById('qr-section');
    const addressEl = document.getElementById('receive-address');

    if (qrSection) {
        qrSection.innerHTML = `
            <div class="qr-placeholder">
                <div class="spinner"></div>
                <span>Generating address...</span>
            </div>
        `;
    }

    try {
        const result = await apiCall('create_address', {
            type: currentAddressType,
            expiration: 'auto',
            comment: `Receive - ${new Date().toLocaleDateString()}`
        });

        currentReceiveAddress = result?.address || result;

        if (addressEl) {
            addressEl.textContent = currentReceiveAddress;
        }

        // Generate QR code
        if (qrSection && typeof QRCode !== 'undefined') {
            qrSection.innerHTML = '<div id="qr-code"></div>';
            new QRCode(document.getElementById('qr-code'), {
                text: currentReceiveAddress,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    } catch (e) {
        if (addressEl) {
            addressEl.textContent = 'Failed to generate address';
        }
        if (qrSection) {
            qrSection.innerHTML = `<div class="qr-error">Failed to generate QR code</div>`;
        }
        showToast('Failed to generate address: ' + e.message, 'error');
    }
}

/**
 * Copy receive address
 */
export async function copyReceiveAddress() {
    if (!currentReceiveAddress) return;

    const success = await copyToClipboard(currentReceiveAddress);
    if (success) {
        showToast('Address copied to clipboard', 'success');
    }
}

/**
 * Show address list
 */
export async function showAddressList() {
    try {
        const addresses = await apiCall('addr_list', { own: true });

        const modal = document.getElementById('receive-modal');
        if (!modal) return;

        const sortedAddresses = (addresses || [])
            .filter(a => !a.expired)
            .sort((a, b) => (b.create_time || 0) - (a.create_time || 0))
            .slice(0, 20);

        modal.innerHTML = `
            <div class="modal" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">My Addresses</h2>
                    <button class="modal-close" onclick="closeModal('receive-modal')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="address-list">
                        ${sortedAddresses.length === 0 ? '<p class="empty">No addresses found</p>' :
                            sortedAddresses.map(addr => `
                                <div class="address-item">
                                    <div class="address-item-main">
                                        <span class="address-type-badge">${addr.type || 'regular'}</span>
                                        <span class="address-value">${shortenAddress(addr.address, 12)}</span>
                                    </div>
                                    <div class="address-item-actions">
                                        <button class="icon-btn" onclick="copyAddressFromList('${addr.address}')">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                    </div>
                </div>
            </div>
        `;

        window.openModal('receive-modal');
    } catch (e) {
        showToast('Failed to load addresses: ' + e.message, 'error');
    }
}

/**
 * Copy address from list
 */
export async function copyAddressFromList(address) {
    const success = await copyToClipboard(address);
    if (success) {
        showToast('Address copied', 'success');
    }
}

// Make functions available globally
window.selectAddressType = selectAddressType;
window.generateNewAddress = generateNewAddress;
window.copyReceiveAddress = copyReceiveAddress;
window.showAddressList = showAddressList;
window.copyAddressFromList = copyAddressFromList;
