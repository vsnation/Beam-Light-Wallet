/**
 * BEAM Wallet - Transactions Page Module
 * Displays transaction history
 */

import { ASSET_CONFIG, TX_STATUS, DEX_CID } from '../config.js';
import { apiCall } from '../api.js';
import { getState, loadTransactions as loadTxState } from '../state.js';
import { formatAmount, formatTimeAgo, shortenAddress } from '../utils.js';
import { showToast } from '../components/toasts.js';

/**
 * Render transactions page
 */
export async function renderTransactionsPage() {
    const container = document.getElementById('transactions-list');
    if (!container) return;

    container.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <span>Loading transactions...</span>
        </div>
    `;

    await loadTransactions();
}

/**
 * Load and render transactions
 */
export async function loadTransactions() {
    const container = document.getElementById('transactions-list');
    if (!container) return;

    try {
        const txs = await loadTxState(100);
        renderTransactionsList(txs);
    } catch (e) {
        container.innerHTML = `
            <div class="error-state">
                <p>Failed to load transactions</p>
                <button class="retry-btn" onclick="loadTransactions()">Retry</button>
            </div>
        `;
    }
}

/**
 * Render transactions list
 */
function renderTransactionsList(transactions) {
    const container = document.getElementById('transactions-list');
    if (!container) return;

    if (!transactions || transactions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                </svg>
                <p>No transactions yet</p>
            </div>
        `;
        return;
    }

    container.innerHTML = transactions.map(tx => renderTransactionItem(tx)).join('');
}

/**
 * Render a single transaction item
 */
function renderTransactionItem(tx) {
    const isReceive = tx.income;
    const aid = tx.asset_id || 0;
    const config = ASSET_CONFIG[aid] || { symbol: 'CA' + aid, color: '#64748b', icon: null };
    const amount = formatAmount(tx.value || 0);
    const fee = tx.fee ? formatAmount(tx.fee) : '0';
    const status = TX_STATUS[tx.status] || { name: 'Unknown', cls: 'muted' };
    const time = formatTimeAgo(tx.create_time);

    // Check for swap/DEX transaction
    const isSwap = tx.tx_type === 13 || (tx.invoke_data && tx.invoke_data.length > 0);
    let swapDetails = null;

    if (isSwap && tx.invoke_data && tx.invoke_data.length > 0) {
        const amounts = tx.invoke_data[0].amounts || [];
        const paid = amounts.find(a => a.amount > 0);
        const received = amounts.find(a => a.amount < 0);

        if (paid && received) {
            const paidConfig = ASSET_CONFIG[paid.asset_id] || { symbol: 'CA' + paid.asset_id };
            const recvConfig = ASSET_CONFIG[Math.abs(received.asset_id)] || { symbol: 'CA' + Math.abs(received.asset_id) };
            swapDetails = {
                paidAmount: formatAmount(paid.amount),
                paidSymbol: paidConfig.symbol,
                receivedAmount: formatAmount(Math.abs(received.amount)),
                receivedSymbol: recvConfig.symbol,
            };
        }
    }

    // Icon HTML
    const iconBg = config.icon ? 'transparent' : config.color;
    const iconHtml = config.icon
        ? `<img src="${config.icon}" style="width:16px;height:16px;border-radius:50%;">`
        : config.symbol.substring(0, 2);

    // Direction and styling
    const directionIcon = isReceive
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M17 14l-5-5-5 5"/><path d="M12 9v12"/></svg>';

    const amountClass = isReceive ? 'amount-receive' : 'amount-send';
    const amountPrefix = isReceive ? '+' : '-';

    return `
        <div class="tx-item" data-txid="${tx.txId}">
            <div class="tx-icon ${isSwap ? 'tx-swap' : (isReceive ? 'tx-receive' : 'tx-send')}">
                ${isSwap ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>' : directionIcon}
            </div>
            <div class="tx-details">
                <div class="tx-type">
                    ${isSwap ? 'Swap' : (isReceive ? 'Received' : 'Sent')}
                    ${swapDetails ? `<span class="tx-swap-detail">${swapDetails.paidSymbol} → ${swapDetails.receivedSymbol}</span>` : ''}
                </div>
                <div class="tx-meta">
                    <span class="tx-time">${time}</span>
                    <span class="tx-status status-${status.cls}">${status.name}</span>
                </div>
            </div>
            <div class="tx-amount">
                ${swapDetails ? `
                    <div class="swap-amounts">
                        <span class="amount-send">-${swapDetails.paidAmount} ${swapDetails.paidSymbol}</span>
                        <span class="amount-receive">+${swapDetails.receivedAmount} ${swapDetails.receivedSymbol}</span>
                    </div>
                ` : `
                    <div class="tx-asset">
                        <span class="tx-asset-icon" style="background:${iconBg}">${iconHtml}</span>
                        <span>${config.symbol}</span>
                        <span class="tx-asset-id">#${aid}</span>
                    </div>
                    <div class="${amountClass}">${amountPrefix}${amount}</div>
                `}
            </div>
        </div>
    `;
}

// Make functions available globally
window.loadTransactions = loadTransactions;
