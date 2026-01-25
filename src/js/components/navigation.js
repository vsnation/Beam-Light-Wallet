/**
 * BEAM Wallet - Navigation Component
 * Sidebar and page navigation
 */

import { getState, setState } from '../state.js';

// Page configurations
const PAGES = {
    dashboard: {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
        tooltip: 'Dashboard',
        loader: null
    },
    'send-page': {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
        tooltip: 'Send',
        loader: null
    },
    'receive-page': {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
        tooltip: 'Receive',
        loader: null
    },
    'transactions-page': {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
        tooltip: 'Transactions',
        loader: 'loadTransactions'
    },
    'dex-page': {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
        tooltip: 'DEX',
        loader: 'loadDexPools'
    },
    'settings-page': {
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
        tooltip: 'Settings',
        loader: 'loadSettings'
    }
};

/**
 * Render the sidebar
 */
export function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const currentPage = getState().ui.currentPage;

    sidebar.innerHTML = `
        <div class="sidebar-logo">
            <svg viewBox="0 0 57 40">
                <g fill="none">
                    <path fill="#0B76FF" d="M28.47 33.21H40.3L28.48 12.58V.08l23.15 39.77H28.47z"/>
                    <path fill="#24C1FF" d="M28.47 33.21H16.66l11.8-20.63V.08L5.32 39.86h23.16z"/>
                    <path fill="#39FFF2" d="M28.47 17.8v13.33l-7.23.01z"/>
                    <path fill="#00E2C2" d="M28.47 17.8v13.33l7.24.01z"/>
                </g>
            </svg>
        </div>
        <nav class="sidebar-nav">
            ${Object.entries(PAGES).map(([id, config]) => `
                <div class="nav-item ${currentPage === id ? 'active' : ''}"
                     data-page="${id}"
                     data-tooltip="${config.tooltip}"
                     onclick="window.showPage('${id}')">
                    ${config.icon}
                </div>
            `).join('')}
        </nav>
        <div class="sidebar-footer">
            <div class="nav-item" data-tooltip="Lock" onclick="window.lockWallet()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
            </div>
        </div>
    `;
}

/**
 * Show a specific page (UI update only - main app.js handles content loading)
 */
export function showPage(pageId) {
    // Update state
    setState('ui.currentPage', pageId);

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageId);
    });

    // Update page visibility
    document.querySelectorAll('.page').forEach(page => {
        page.classList.toggle('active', page.id === pageId);
    });
}

/**
 * Get current active page
 */
export function getCurrentPage() {
    return getState().ui.currentPage;
}
