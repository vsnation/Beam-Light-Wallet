/**
 * BEAM Wallet - Toast Notifications
 * Non-blocking notifications for user feedback
 */

/**
 * Show a basic toast notification
 */
export function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container') || createToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));

    // Auto-remove
    if (duration > 0) {
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    return toast;
}

/**
 * Show an advanced toast with title and subtitle
 */
export function showToastAdvanced(title, subtitle, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container') || createToastContainer();

    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
        pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-advanced toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${subtitle ? `<div class="toast-subtitle">${subtitle}</div>` : ''}
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    if (duration > 0) {
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    return toast;
}

/**
 * Create toast container if it doesn't exist
 */
function createToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Clear all toasts
 */
export function clearToasts() {
    const container = document.getElementById('toast-container');
    if (container) {
        container.innerHTML = '';
    }
}

// CSS for toasts (injected once)
const toastStyles = `
    .toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 400px;
    }

    .toast {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 18px;
        background: var(--void-lighter);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        box-shadow: var(--shadow-card);
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    }

    .toast.show {
        opacity: 1;
        transform: translateX(0);
    }

    .toast-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
    }

    .toast-icon svg {
        width: 100%;
        height: 100%;
    }

    .toast-content {
        flex: 1;
        min-width: 0;
    }

    .toast-title {
        font-weight: 500;
        color: var(--text-primary);
    }

    .toast-subtitle {
        font-size: 13px;
        color: var(--text-secondary);
        margin-top: 2px;
    }

    .toast-message {
        color: var(--text-primary);
    }

    .toast-close {
        background: none;
        border: none;
        color: var(--text-muted);
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
    }

    .toast-close:hover {
        color: var(--text-primary);
    }

    .toast-success { border-color: var(--success); }
    .toast-success .toast-icon { color: var(--success); }

    .toast-error { border-color: var(--error); }
    .toast-error .toast-icon { color: var(--error); }

    .toast-warning { border-color: var(--warning); }
    .toast-warning .toast-icon { color: var(--warning); }

    .toast-info { border-color: var(--beam-cyan); }
    .toast-info .toast-icon { color: var(--beam-cyan); }

    .toast-pending { border-color: var(--text-muted); }
    .toast-pending .toast-icon { color: var(--text-muted); }
`;

// Inject styles
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = toastStyles;
    document.head.appendChild(style);
}
