/**
 * BEAM Wallet - Modal System
 * Reusable modal dialogs
 */

/**
 * Open a modal by ID
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Close a modal by ID
 */
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * Close all open modals
 */
export function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
        modal.classList.remove('active');
    });
    document.body.style.overflow = '';
}

/**
 * Create and show a dynamic modal
 */
export function showModal(options) {
    const {
        id = 'dynamic-modal-' + Date.now(),
        title = '',
        content = '',
        buttons = [],
        closable = true,
        maxWidth = '480px',
        onClose = null
    } = options;

    // Remove existing modal with same ID
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal-overlay';

    const closeBtn = closable ? `
        <button class="modal-close" onclick="window.closeModal('${id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
        </button>
    ` : '';

    const buttonsHtml = buttons.map(btn => `
        <button class="modal-btn ${btn.class || 'modal-btn-secondary'}"
                onclick="${btn.onclick || `window.closeModal('${id}')`}">
            ${btn.text}
        </button>
    `).join('');

    modal.innerHTML = `
        <div class="modal" style="max-width: ${maxWidth};">
            <div class="modal-header">
                <h2 class="modal-title">${title}</h2>
                ${closeBtn}
            </div>
            <div class="modal-body">
                ${typeof content === 'string' ? content : ''}
            </div>
            ${buttonsHtml ? `<div class="modal-footer">${buttonsHtml}</div>` : ''}
        </div>
    `;

    // Handle HTMLElement content
    if (typeof content !== 'string') {
        modal.querySelector('.modal-body').appendChild(content);
    }

    // Close on backdrop click
    if (closable) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(id);
                if (onClose) onClose();
            }
        });
    }

    document.body.appendChild(modal);

    // Show with animation
    requestAnimationFrame(() => modal.classList.add('active'));

    return modal;
}

/**
 * Show a confirmation dialog
 */
export function confirm(message, options = {}) {
    return new Promise((resolve) => {
        const {
            title = 'Confirm',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            confirmClass = 'modal-btn-primary',
            dangerous = false
        } = options;

        const modalId = 'confirm-modal-' + Date.now();

        showModal({
            id: modalId,
            title,
            content: `<p style="color: var(--text-secondary);">${message}</p>`,
            buttons: [
                {
                    text: cancelText,
                    class: 'modal-btn-secondary',
                    onclick: `window.closeModal('${modalId}'); window._confirmResolve && window._confirmResolve(false);`
                },
                {
                    text: confirmText,
                    class: dangerous ? 'modal-btn-danger' : confirmClass,
                    onclick: `window.closeModal('${modalId}'); window._confirmResolve && window._confirmResolve(true);`
                }
            ],
            onClose: () => resolve(false)
        });

        window._confirmResolve = resolve;
    });
}

/**
 * Show an alert dialog
 */
export function alert(message, options = {}) {
    return new Promise((resolve) => {
        const { title = 'Alert', buttonText = 'OK' } = options;
        const modalId = 'alert-modal-' + Date.now();

        showModal({
            id: modalId,
            title,
            content: `<p style="color: var(--text-secondary);">${message}</p>`,
            buttons: [
                {
                    text: buttonText,
                    class: 'modal-btn-primary',
                    onclick: `window.closeModal('${modalId}'); window._alertResolve && window._alertResolve();`
                }
            ],
            onClose: () => resolve()
        });

        window._alertResolve = resolve;
    });
}

/**
 * Show a prompt dialog
 */
export function prompt(message, options = {}) {
    return new Promise((resolve) => {
        const {
            title = 'Input',
            placeholder = '',
            defaultValue = '',
            confirmText = 'OK',
            cancelText = 'Cancel',
            inputType = 'text'
        } = options;

        const modalId = 'prompt-modal-' + Date.now();
        const inputId = 'prompt-input-' + Date.now();

        showModal({
            id: modalId,
            title,
            content: `
                <p style="color: var(--text-secondary); margin-bottom: 16px;">${message}</p>
                <input type="${inputType}" id="${inputId}" class="search-input" style="width: 100%;"
                       placeholder="${placeholder}" value="${defaultValue}">
            `,
            buttons: [
                {
                    text: cancelText,
                    class: 'modal-btn-secondary',
                    onclick: `window.closeModal('${modalId}'); window._promptResolve && window._promptResolve(null);`
                },
                {
                    text: confirmText,
                    class: 'modal-btn-primary',
                    onclick: `
                        const val = document.getElementById('${inputId}').value;
                        window.closeModal('${modalId}');
                        window._promptResolve && window._promptResolve(val);
                    `
                }
            ],
            onClose: () => resolve(null)
        });

        window._promptResolve = resolve;

        // Focus input
        setTimeout(() => {
            const input = document.getElementById(inputId);
            if (input) input.focus();
        }, 100);
    });
}

// Make functions available globally for onclick handlers
window.closeModal = closeModal;
window.openModal = openModal;
