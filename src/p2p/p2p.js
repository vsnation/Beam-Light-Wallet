/**
 * BEAM P2P Marketplace
 * Decentralized peer-to-peer trading platform
 * Uses real wallet data via postMessage communication
 */

// ============================================
// CONFIGURATION (matches main wallet config)
// ============================================

const BEAM_LOGO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 40"><defs><linearGradient id="a" x1=".03%" x2="54.79%" y1="50.23%" y2="50.23%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#FFF"/></linearGradient><linearGradient id="b" x1="99.38%" x2="35.8%" y1="49.83%" y2="49.83%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#FF51FF"/></linearGradient><linearGradient id="c" x1="100.43%" x2="48.94%" y1="50.11%" y2="50.11%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#A18CFF"/></linearGradient><linearGradient id="d" x1="99.91%" x2="41.06%" y1="50.24%" y2="50.24%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#AB38E6"/></linearGradient></defs><g fill="none"><path fill="#0B76FF" d="M28.47 33.21H40.3L28.48 12.58V.08l23.15 39.77H28.47z"/><path fill="#24C1FF" d="M28.47 33.21H16.66l11.8-20.63V.08L5.32 39.86h23.16z"/><path fill="#39FFF2" d="M28.47 17.8v13.33l-7.23.01z"/><path fill="#00E2C2" d="M28.47 17.8v13.33l7.24.01z"/><path fill="url(#a)" d="m.1 12.53 28.37 13.14v1.37L.11 20.82z"/><path fill="url(#b)" d="M56.9 8.7 28.47 25.68v.46L56.9 14.18z"/><path fill="url(#c)" d="m56.9 25.13-28.43 1.91v-.45l28.43-6.93z"/><path fill="url(#d)" d="M56.9 14.18 28.47 26.13v.46l28.43-6.93z"/></g></svg>');

const ASSET_ICONS = {
    0: BEAM_LOGO,
    4: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/crown.ico',
    7: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/beamx.png',
    9: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/tico.ico',
    47: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/47_nph.svg',
    174: 'https://73ecj7qctz4nrza4bbbqmgriv4gh5uwwf65izu7wjdvrmozhbvbq.arweave.net/_sgk_gKeeNjkHAhDBhoorwx-0tYvuozT9kjrFjsnDUM'
};

const ASSET_CONFIG = {
    0: { name: 'BEAM', symbol: 'BEAM', color: '#25c2a0', decimals: 8 },
    47: { name: 'Nephrit', symbol: 'NPH', color: '#3498db', decimals: 8 },
    174: { name: 'FOMO', symbol: 'FOMO', color: '#60a5fa', decimals: 8 }
};

const GROTH = 100000000;
const DEFAULT_FEE = 100000;
const CONTRACT_FEE = 2000000;  // Higher fee for contract calls (0.02 BEAM)

// P2P Escrow Contract ID (deployed on mainnet)
// CONTRACT V7 - Deployed 2026-01-30 (LLVM 16 + -fno-builtin)
// Features: SetZero fix for cancel_order, confirm_payment & claim_trade require rating (1-5)
const P2P_ESCROW_CID = '2145205e91c3c0a68b0f439b8afd7a0b4729fb232768dfdf5ab421da864d76f7';

// Display contract info for verification
console.log(`P2P Escrow Contract: ${P2P_ESCROW_CID}`);

// Contract Method Numbers (from contract.h)
const ContractMethods = {
    // Method 0 = Ctor (constructor), Method 1 = Dtor (destructor)
    REGISTER_TRADER: 2,    // RegisterTrader
    CREATE_ORDER: 3,       // CreateOrder
    CANCEL_ORDER: 4,       // CancelOrder
    ACCEPT_ORDER: 5,       // AcceptOrder
    MARK_PAYMENT_SENT: 6,  // MarkPaymentSent
    CONFIRM_PAYMENT: 7,    // ConfirmPayment - seller confirms, releases seller deposit
    OPEN_DISPUTE: 8,       // OpenDispute
    ESCROW_VOTE: 9,        // EscrowVote
    SUBMIT_FEEDBACK: 10,   // SubmitFeedback
    STAKE_ESCROW: 11,      // StakeEscrow
    UNSTAKE_ESCROW: 12,    // UnstakeEscrow
    CLAIM_REWARDS: 13,     // ClaimRewards
    // NEW in v2: Two-step trade completion
    CLAIM_TRADE: 20,       // Buyer claims after seller confirms
    CLAIM_DISPUTE_WIN: 21  // Winner claims after dispute resolved
};

// ============================================
// P2P SYNC - DECENTRALIZED ORDER BOOK
// ============================================

/**
 * P2PSync stub - DEPRECATED
 * All data now comes from the smart contract directly.
 * This stub is kept for backward compatibility only.
 */
const P2PSync = {
    isConnected: false,

    // Stub methods - all operations now go through smart contract
    async init() {
        console.log('P2PSync disabled - using smart contract as single source of truth');
        return true;
    },

    publishOrder(order) {
        console.log('P2PSync.publishOrder disabled - use contract instead');
        return order.id || 'contract_order';
    },

    registerTrader(address, nickname) {
        console.log('P2PSync.registerTrader disabled - use contract instead');
        return true;
    },

    getStatus() {
        return { connected: false, gunLoaded: false };
    },

    async loadAllOrders() {
        return []; // Contract is source of truth
    },

    async getTrader() {
        return null; // Contract is source of truth
    }
};

const P2P_CONFIG = {
    currencies: [
        // Popular
        { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
        { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
        { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' },
        { code: 'RUB', symbol: '₽', name: 'Russian Ruble', flag: '🇷🇺' },
        { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', flag: '🇨🇳' },
        // Asia Pacific
        { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵' },
        { code: 'KRW', symbol: '₩', name: 'Korean Won', flag: '🇰🇷' },
        { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳' },
        { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', flag: '🇮🇩' },
        { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', flag: '🇲🇾' },
        { code: 'PHP', symbol: '₱', name: 'Philippine Peso', flag: '🇵🇭' },
        { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', flag: '🇻🇳' },
        { code: 'THB', symbol: '฿', name: 'Thai Baht', flag: '🇹🇭' },
        { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬' },
        { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', flag: '🇭🇰' },
        { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺' },
        { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', flag: '🇳🇿' },
        { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', flag: '🇵🇰' },
        { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', flag: '🇧🇩' },
        // Europe
        { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', flag: '🇨🇭' },
        { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', flag: '🇸🇪' },
        { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', flag: '🇳🇴' },
        { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', flag: '🇵🇱' },
        { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna', flag: '🇨🇿' },
        { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', flag: '🇭🇺' },
        { code: 'RON', symbol: 'lei', name: 'Romanian Leu', flag: '🇷🇴' },
        { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia', flag: '🇺🇦' },
        { code: 'TRY', symbol: '₺', name: 'Turkish Lira', flag: '🇹🇷' },
        { code: 'KZT', symbol: '₸', name: 'Kazakhstani Tenge', flag: '🇰🇿' },
        // Middle East & Africa
        { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', flag: '🇦🇪' },
        { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', flag: '🇸🇦' },
        { code: 'ILS', symbol: '₪', name: 'Israeli Shekel', flag: '🇮🇱' },
        { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', flag: '🇪🇬' },
        { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', flag: '🇳🇬' },
        { code: 'ZAR', symbol: 'R', name: 'South African Rand', flag: '🇿🇦' },
        { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', flag: '🇰🇪' },
        { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi', flag: '🇬🇭' },
        // Americas
        { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦' },
        { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', flag: '🇲🇽' },
        { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷' },
        { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso', flag: '🇦🇷' },
        { code: 'COP', symbol: 'CO$', name: 'Colombian Peso', flag: '🇨🇴' },
        { code: 'CLP', symbol: 'CLP$', name: 'Chilean Peso', flag: '🇨🇱' },
        { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol', flag: '🇵🇪' },
        { code: 'VES', symbol: 'Bs', name: 'Venezuelan Bolivar', flag: '🇻🇪' }
    ],
    paymentMethods: {
        // Fiat payment methods
        bank_transfer: {
            name: 'Bank Transfer',
            icon: '🏦',
            type: 'fiat',
            fields: [
                { id: 'bank_name', label: 'Bank Name', placeholder: 'Enter bank name' },
                { id: 'account_number', label: 'Account Number', placeholder: 'Enter account number' },
                { id: 'routing', label: 'Routing/SWIFT', placeholder: 'Routing or SWIFT code' },
                { id: 'holder_name', label: 'Account Holder', placeholder: 'Name on account' }
            ]
        },
        wise: {
            name: 'Wise',
            icon: '💸',
            type: 'fiat',
            fields: [
                { id: 'email', label: 'Email', placeholder: 'Wise email address' },
                { id: 'holder_name', label: 'Name', placeholder: 'Account holder name' }
            ]
        },
        revolut: {
            name: 'Revolut',
            icon: '💳',
            type: 'fiat',
            fields: [
                { id: 'phone_or_tag', label: 'Phone/Tag', placeholder: '@username or phone' },
                { id: 'holder_name', label: 'Name', placeholder: 'Account holder name' }
            ]
        },
        paypal: {
            name: 'PayPal',
            icon: '🅿️',
            type: 'fiat',
            fields: [
                { id: 'email', label: 'PayPal Email', placeholder: 'PayPal email address' },
                { id: 'holder_name', label: 'Name', placeholder: 'PayPal name' }
            ]
        },
        zelle: {
            name: 'Zelle',
            icon: '⚡',
            type: 'fiat',
            fields: [
                { id: 'email_or_phone', label: 'Email/Phone', placeholder: 'Zelle email or phone' },
                { id: 'holder_name', label: 'Name', placeholder: 'Registered name' }
            ]
        },
        // Cryptocurrency payment methods
        btc: {
            name: 'Bitcoin (BTC)',
            icon: '₿',
            type: 'crypto',
            chain: 'bitcoin',
            fields: [
                { id: 'address', label: 'BTC Address', placeholder: 'bc1q... or 1... or 3...' }
            ]
        },
        eth: {
            name: 'Ethereum (ETH)',
            icon: 'Ξ',
            type: 'crypto',
            chain: 'ethereum',
            fields: [
                { id: 'address', label: 'ETH Address', placeholder: '0x...' }
            ]
        },
        usdt_erc20: {
            name: 'USDT (ERC-20)',
            icon: '💲',
            type: 'crypto',
            chain: 'ethereum',
            fields: [
                { id: 'address', label: 'ETH Address', placeholder: '0x... (ERC-20)' }
            ]
        },
        usdt_trc20: {
            name: 'USDT (TRC-20)',
            icon: '💲',
            type: 'crypto',
            chain: 'tron',
            fields: [
                { id: 'address', label: 'TRON Address', placeholder: 'T... (TRC-20)' }
            ]
        },
        usdc: {
            name: 'USDC',
            icon: '💵',
            type: 'crypto',
            chain: 'ethereum',
            fields: [
                { id: 'address', label: 'ETH Address', placeholder: '0x... (ERC-20)' }
            ]
        },
        usdt: {
            name: 'USDT (Any Chain)',
            icon: '💲',
            type: 'crypto',
            fields: [
                { id: 'address', label: 'Address', placeholder: 'Enter address with network' },
                { id: 'network', label: 'Network', placeholder: 'ERC20, TRC20, BEP20, etc.' }
            ]
        },
        lightning: {
            name: 'Lightning Network',
            icon: '⚡',
            type: 'crypto',
            fields: [
                { id: 'address', label: 'Lightning Address/Invoice', placeholder: 'lnbc... or user@domain' }
            ]
        },
        venmo: {
            name: 'Venmo',
            icon: '📱',
            type: 'fiat',
            fields: [
                { id: 'username', label: 'Venmo Username', placeholder: '@username' },
                { id: 'holder_name', label: 'Name', placeholder: 'Name on account' }
            ]
        },
        cash_app: {
            name: 'Cash App',
            icon: '💵',
            type: 'fiat',
            fields: [
                { id: 'cashtag', label: 'Cash Tag', placeholder: '$cashtag' },
                { id: 'holder_name', label: 'Name', placeholder: 'Name on account' }
            ]
        },
        sepa: {
            name: 'SEPA Transfer',
            icon: '🇪🇺',
            type: 'fiat',
            fields: [
                { id: 'iban', label: 'IBAN', placeholder: 'Enter IBAN' },
                { id: 'bic', label: 'BIC/SWIFT', placeholder: 'BIC code' },
                { id: 'holder_name', label: 'Account Holder', placeholder: 'Name on account' }
            ]
        },
        swift: {
            name: 'SWIFT Transfer',
            icon: '🌐',
            type: 'fiat',
            fields: [
                { id: 'account', label: 'Account Number', placeholder: 'Bank account number' },
                { id: 'swift', label: 'SWIFT Code', placeholder: 'SWIFT/BIC code' },
                { id: 'bank_name', label: 'Bank Name', placeholder: 'Name of bank' },
                { id: 'holder_name', label: 'Account Holder', placeholder: 'Name on account' }
            ]
        },
        ach: {
            name: 'ACH Transfer',
            icon: '🏛️',
            type: 'fiat',
            fields: [
                { id: 'routing', label: 'Routing Number', placeholder: '9 digit routing' },
                { id: 'account', label: 'Account Number', placeholder: 'Account number' },
                { id: 'holder_name', label: 'Account Holder', placeholder: 'Name on account' }
            ]
        },
        alipay: {
            name: 'Alipay',
            icon: '🔷',
            type: 'fiat',
            fields: [
                { id: 'account', label: 'Alipay Account', placeholder: 'Phone or email' },
                { id: 'holder_name', label: 'Name', placeholder: 'Real name' }
            ]
        },
        wechat: {
            name: 'WeChat Pay',
            icon: '💬',
            type: 'fiat',
            fields: [
                { id: 'wechat_id', label: 'WeChat ID', placeholder: 'WeChat ID' },
                { id: 'holder_name', label: 'Name', placeholder: 'Real name' }
            ]
        },
        upi: {
            name: 'UPI',
            icon: '🇮🇳',
            type: 'fiat',
            fields: [
                { id: 'upi_id', label: 'UPI ID', placeholder: 'name@upi' },
                { id: 'holder_name', label: 'Name', placeholder: 'Name on UPI' }
            ]
        },
        paytm: {
            name: 'Paytm',
            icon: '📲',
            type: 'fiat',
            fields: [
                { id: 'phone', label: 'Phone Number', placeholder: 'Paytm phone' },
                { id: 'holder_name', label: 'Name', placeholder: 'Name on Paytm' }
            ]
        },
        pix: {
            name: 'PIX',
            icon: '🇧🇷',
            type: 'fiat',
            fields: [
                { id: 'pix_key', label: 'PIX Key', placeholder: 'CPF, email, phone, or random key' },
                { id: 'holder_name', label: 'Name', placeholder: 'Name on PIX' }
            ]
        },
        spei: {
            name: 'SPEI',
            icon: '🇲🇽',
            type: 'fiat',
            fields: [
                { id: 'clabe', label: 'CLABE', placeholder: '18 digit CLABE' },
                { id: 'holder_name', label: 'Name', placeholder: 'Beneficiary name' }
            ]
        },
        m_pesa: {
            name: 'M-Pesa',
            icon: '📱',
            type: 'fiat',
            fields: [
                { id: 'phone', label: 'M-Pesa Phone', placeholder: '+254...' },
                { id: 'holder_name', label: 'Name', placeholder: 'Registered name' }
            ]
        },
        skrill: {
            name: 'Skrill',
            icon: '💳',
            type: 'fiat',
            fields: [
                { id: 'email', label: 'Skrill Email', placeholder: 'Skrill email' },
                { id: 'holder_name', label: 'Name', placeholder: 'Account name' }
            ]
        },
        neteller: {
            name: 'Neteller',
            icon: '💳',
            type: 'fiat',
            fields: [
                { id: 'email', label: 'Neteller Email', placeholder: 'Neteller email' },
                { id: 'holder_name', label: 'Name', placeholder: 'Account name' }
            ]
        },
        western_union: {
            name: 'Western Union',
            icon: '🌍',
            type: 'fiat',
            fields: [
                { id: 'name', label: 'Receiver Name', placeholder: 'Full name as on ID' },
                { id: 'country', label: 'Country', placeholder: 'Receiving country' },
                { id: 'city', label: 'City', placeholder: 'City' }
            ]
        },
        moneygram: {
            name: 'MoneyGram',
            icon: '💸',
            type: 'fiat',
            fields: [
                { id: 'name', label: 'Receiver Name', placeholder: 'Full name as on ID' },
                { id: 'country', label: 'Country', placeholder: 'Receiving country' },
                { id: 'city', label: 'City', placeholder: 'City' }
            ]
        },
        gift_card: {
            name: 'Gift Card',
            icon: '🎁',
            type: 'other',
            fields: [
                { id: 'type', label: 'Gift Card Type', placeholder: 'Amazon, Steam, iTunes, etc.' },
                { id: 'delivery', label: 'Delivery Method', placeholder: 'Code sent via chat' }
            ]
        },
        cash: {
            name: 'Cash (In Person)',
            icon: '💵',
            type: 'cash',
            fields: [
                { id: 'location', label: 'Meeting Location', placeholder: 'City, public place' },
                { id: 'instructions', label: 'Instructions', placeholder: 'How to meet' }
            ]
        }
    },
    securityDepositPct: 10,
    tradeFee: 0.5,
    minEscrowStake: 1,  // TEST: 1 FOMO (will change to 10000 for production)
    paymentTimeout: 30 * 60 * 1000,  // 30 minutes
    confirmTimeout: 2 * 60 * 60 * 1000,  // 2 hours
    disputeTimeout: 24 * 60 * 60 * 1000,  // 24 hours for dispute resolution
    trustScoreConfig: {
        successfulTrade: 2,
        positiveFeedback: 1,
        disputeWon: 3,
        disputeLost: -10,
        cancelAfterAccept: -5
    }
};

// ============================================
// ARWEAVE INTEGRATION
// ============================================

const ARWEAVE_CONFIG = {
    gateway: 'https://arweave.net',
    graphql: 'https://arweave.net/graphql',
    appName: 'BEAM-P2P',
    appVersion: '1.0.0'
};

/**
 * Arweave module for decentralized order storage
 */
const ArweaveStorage = {
    /**
     * Fetch orders from Arweave by tags
     */
    async fetchOrders(filters = {}) {
        const tags = [
            { name: 'App-Name', values: [ARWEAVE_CONFIG.appName] },
            { name: 'Type', values: ['order'] },
            { name: 'Status', values: ['active'] }
        ];

        if (filters.asset) {
            tags.push({ name: 'Asset', values: [String(filters.asset)] });
        }
        if (filters.side) {
            tags.push({ name: 'Side', values: [filters.side] });
        }

        const query = `{
            transactions(
                tags: ${JSON.stringify(tags).replace(/"([^"]+)":/g, '$1:')},
                first: 100,
                sort: HEIGHT_DESC
            ) {
                edges {
                    node {
                        id
                        owner { address }
                        tags { name value }
                    }
                }
            }
        }`;

        try {
            const response = await fetch(ARWEAVE_CONFIG.graphql, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const result = await response.json();

            if (result.data?.transactions?.edges) {
                const orders = await Promise.all(
                    result.data.transactions.edges.map(async edge => {
                        try {
                            const dataRes = await fetch(`${ARWEAVE_CONFIG.gateway}/${edge.node.id}`);
                            const orderData = await dataRes.json();
                            return {
                                arweaveId: edge.node.id,
                                ...orderData
                            };
                        } catch (e) {
                            console.warn('Failed to fetch order data:', edge.node.id, e);
                            return null;
                        }
                    })
                );
                return orders.filter(o => o !== null);
            }
            return [];
        } catch (error) {
            console.error('Arweave query failed:', error);
            return [];
        }
    },

    /**
     * Publish order to Arweave (requires ArConnect wallet)
     */
    async publishOrder(order) {
        if (typeof window.arweaveWallet === 'undefined') {
            console.warn('ArConnect not installed, using local storage only');
            return this.storeOrderLocally(order);
        }

        try {
            const data = JSON.stringify({
                ...order,
                timestamp: Date.now(),
                version: ARWEAVE_CONFIG.appVersion
            });

            // Create transaction using ArConnect
            const tx = await window.arweaveWallet.dispatch({
                type: 'DATA_ITEM',
                data: data,
                tags: [
                    { name: 'App-Name', value: ARWEAVE_CONFIG.appName },
                    { name: 'App-Version', value: ARWEAVE_CONFIG.appVersion },
                    { name: 'Type', value: 'order' },
                    { name: 'Status', value: 'active' },
                    { name: 'Asset', value: String(order.asset) },
                    { name: 'Side', value: order.side },
                    { name: 'Currency', value: order.currency },
                    { name: 'Contract-Order-Id', value: order.onChainId || '' },
                    { name: 'Content-Type', value: 'application/json' }
                ]
            });

            console.log('Order published to Arweave:', tx.id);
            return { success: true, arweaveId: tx.id };
        } catch (error) {
            console.error('Arweave publish failed:', error);
            return this.storeOrderLocally(order);
        }
    },

    /**
     * Cancel order on Arweave (mark as inactive)
     */
    async cancelOrder(arweaveId, orderId) {
        if (typeof window.arweaveWallet === 'undefined') {
            return this.updateLocalOrder(orderId, { status: 'cancelled' });
        }

        try {
            const tx = await window.arweaveWallet.dispatch({
                type: 'DATA_ITEM',
                data: JSON.stringify({ cancelled: true, timestamp: Date.now() }),
                tags: [
                    { name: 'App-Name', value: ARWEAVE_CONFIG.appName },
                    { name: 'Type', value: 'order-cancel' },
                    { name: 'Original-Order', value: arweaveId },
                    { name: 'Content-Type', value: 'application/json' }
                ]
            });
            return { success: true, cancelTxId: tx.id };
        } catch (error) {
            console.error('Arweave cancel failed:', error);
            return this.updateLocalOrder(orderId, { status: 'cancelled' });
        }
    },

    /**
     * Store trade evidence/chat on Arweave
     */
    async storeEvidence(tradeId, evidence) {
        const data = {
            tradeId,
            evidence,
            timestamp: Date.now()
        };

        if (typeof window.arweaveWallet !== 'undefined') {
            try {
                const tx = await window.arweaveWallet.dispatch({
                    type: 'DATA_ITEM',
                    data: JSON.stringify(data),
                    tags: [
                        { name: 'App-Name', value: ARWEAVE_CONFIG.appName },
                        { name: 'Type', value: 'evidence' },
                        { name: 'Trade-Id', value: String(tradeId) },
                        { name: 'Content-Type', value: 'application/json' }
                    ]
                });
                return { success: true, arweaveId: tx.id };
            } catch (error) {
                console.error('Evidence upload failed:', error);
            }
        }
        // Fallback to local storage
        return this.storeEvidenceLocally(tradeId, evidence);
    },

    /**
     * Fetch reputation history from Arweave
     */
    async fetchReputationHistory(address) {
        const query = `{
            transactions(
                tags: [
                    { name: "App-Name", values: ["${ARWEAVE_CONFIG.appName}"] },
                    { name: "Type", values: ["feedback"] },
                    { name: "To", values: ["${address}"] }
                ],
                first: 50,
                sort: HEIGHT_DESC
            ) {
                edges {
                    node {
                        id
                        tags { name value }
                    }
                }
            }
        }`;

        try {
            const response = await fetch(ARWEAVE_CONFIG.graphql, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const result = await response.json();

            if (result.data?.transactions?.edges) {
                return result.data.transactions.edges.map(edge => {
                    const tags = {};
                    edge.node.tags.forEach(t => tags[t.name] = t.value);
                    return {
                        arweaveId: edge.node.id,
                        rating: parseInt(tags.Rating) || 0,
                        from: tags.From,
                        tradeId: tags['Trade-Id']
                    };
                });
            }
            return [];
        } catch (error) {
            console.error('Reputation fetch failed:', error);
            return [];
        }
    },

    // ========== LOCAL STORAGE FALLBACKS ==========

    storeOrderLocally(order) {
        const orders = JSON.parse(localStorage.getItem('p2p_orders') || '[]');
        order.localId = 'local_' + Date.now();
        orders.push(order);
        localStorage.setItem('p2p_orders', JSON.stringify(orders));
        return { success: true, localId: order.localId };
    },

    updateLocalOrder(orderId, updates) {
        const orders = JSON.parse(localStorage.getItem('p2p_orders') || '[]');
        const idx = orders.findIndex(o => o.id === orderId || o.localId === orderId);
        if (idx >= 0) {
            orders[idx] = { ...orders[idx], ...updates };
            localStorage.setItem('p2p_orders', JSON.stringify(orders));
        }
        return { success: true };
    },

    getLocalOrders(filters = {}) {
        const orders = JSON.parse(localStorage.getItem('p2p_orders') || '[]');
        return orders.filter(o => {
            if (filters.asset && o.asset !== filters.asset) return false;
            if (filters.side && o.side !== filters.side) return false;
            if (filters.status && o.status !== filters.status) return false;
            return true;
        });
    },

    storeEvidenceLocally(tradeId, evidence) {
        const key = `p2p_evidence_${tradeId}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push({ evidence, timestamp: Date.now() });
        localStorage.setItem(key, JSON.stringify(existing));
        return { success: true };
    },

    // ========== PAYMENT CREDENTIALS STORAGE ==========

    /**
     * Save payment method credentials
     * Each payment method has its own account details
     */
    savePaymentCredentials(methodId, credentials) {
        const saved = JSON.parse(localStorage.getItem('p2p_payment_credentials') || '{}');
        saved[methodId] = {
            ...credentials,
            updatedAt: Date.now()
        };
        localStorage.setItem('p2p_payment_credentials', JSON.stringify(saved));
        return { success: true };
    },

    /**
     * Get all saved payment credentials
     */
    getPaymentCredentials() {
        return JSON.parse(localStorage.getItem('p2p_payment_credentials') || '{}');
    },

    /**
     * Get credentials for a specific payment method
     */
    getPaymentCredential(methodId) {
        const saved = this.getPaymentCredentials();
        return saved[methodId] || null;
    },

    /**
     * Delete payment credentials for a method
     */
    deletePaymentCredentials(methodId) {
        const saved = this.getPaymentCredentials();
        delete saved[methodId];
        localStorage.setItem('p2p_payment_credentials', JSON.stringify(saved));
        return { success: true };
    },

    /**
     * Get methods that have saved credentials
     */
    getSavedPaymentMethods() {
        const saved = this.getPaymentCredentials();
        return Object.keys(saved);
    }
};

// Make ArweaveStorage available globally
window.ArweaveStorage = ArweaveStorage;

// ============================================
// STATE
// ============================================

let state = {
    // Wallet data (from parent wallet)
    walletConnected: false,
    myAddress: null,
    myPublicKey: null,     // Public key for own order detection (from get_my_key)
    balances: {},          // { assetId: { available, receiving, sending, maturing } }
    assets: {},            // { assetId: { name, symbol, icon, decimals } }

    // P2P state
    side: 'buy',           // 'buy' or 'sell'
    selectedAsset: 174,    // FOMO by default
    currency: 'ALL',       // 'ALL' shows all currencies, or specific currency code
    paymentFilters: [],
    amountFilter: 0,       // Filter by fiat amount (0 = no filter)

    // Data
    orders: [],
    myOrders: [],
    myTrades: [],
    escrowStats: null,

    // Saved payment credentials (loaded from localStorage)
    savedPaymentAccounts: {},

    // UI state
    selectedOrder: null,
    activeTrade: null,
    loading: false,
    isRegistered: false,    // Whether trader is registered in contract

    // Advanced filters
    advancedFilters: {
        enabled: false,
        minTrustScore: 0,       // 0-100
        minTrades: 0,           // Minimum completed trades
        minFeedback: 0,         // Minimum feedback count
        badgeFilters: {         // Required badges
            verified: false,
            fire: false,
            diamond: false,
            escrow: false
        },
        hideOwnOrders: false    // Hide user's own orders
    }
};

// ============================================
// WALLET COMMUNICATION (postMessage API)
// ============================================

const pendingRequests = new Map();

/**
 * Request action from parent wallet
 */
function walletRequest(action, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error('Wallet request timeout'));
        }, 30000);

        pendingRequests.set(id, { resolve, reject, timeout });

        window.parent.postMessage({
            type: 'p2p_request',
            id: id,
            action: action,
            params: params
        }, '*');
    });
}

// Listen for responses from parent wallet
window.addEventListener('message', (event) => {
    if (event.data?.type === 'p2p_response') {
        const { id, result, error } = event.data;
        const pending = pendingRequests.get(id);

        if (pending) {
            clearTimeout(pending.timeout);
            pendingRequests.delete(id);

            if (error) {
                pending.reject(new Error(error));
            } else {
                pending.resolve(result);
            }
        }
    }
});

// ============================================
// WALLET DATA LOADING
// ============================================

/**
 * Load all wallet data
 */
async function loadWalletData() {
    try {
        state.loading = true;
        updateLoadingState(true);

        // IMPORTANT: Reset identity state to ensure fresh detection when wallet changes
        // This prevents stale public keys from marking wrong orders as "own"
        state.myPublicKey = null;
        state.myAddress = null;

        // Get wallet status with all balances
        const walletStatus = await walletRequest('get_wallet_status');

        if (walletStatus?.totals) {
            state.walletConnected = true;

            // Process balances
            state.balances = {};
            for (const asset of walletStatus.totals) {
                state.balances[asset.asset_id] = {
                    available: asset.available || 0,
                    receiving: asset.receiving || 0,
                    sending: asset.sending || 0,
                    maturing: asset.maturing || 0
                };

                // Store asset metadata if available
                if (asset.unit_name || asset.nthUnitName) {
                    state.assets[asset.asset_id] = {
                        name: asset.unit_name || `Asset #${asset.asset_id}`,
                        symbol: asset.unit_name || `A${asset.asset_id}`,
                        decimals: 8
                    };
                }
            }

            // Merge with known asset config
            for (const [id, config] of Object.entries(ASSET_CONFIG)) {
                state.assets[id] = { ...config, ...state.assets[id] };
            }

            console.log('Wallet balances loaded:', state.balances);
        }

        // Get my address for P2P
        try {
            const addrResult = await walletRequest('get_address');
            state.myAddress = addrResult?.address;
            console.log('My P2P address:', state.myAddress);
        } catch (e) {
            console.warn('Could not get address:', e);
        }

        // Get my public key from contract (for own order detection)
        try {
            const pkResult = await walletRequest('invoke_contract', {
                args: `role=user,action=get_my_key,cid=${P2P_ESCROW_CID}`
            });
            // Parse the result - may be nested JSON
            let output = pkResult?.result?.output || pkResult?.output;
            if (typeof output === 'string') {
                try { output = JSON.parse(output); } catch (e) {}
            }
            // The contract returns {"pk": "..."} - use that as the standard identity
            if (output?.pk) {
                state.myPublicKey = output.pk;
                console.log('My P2P public key:', state.myPublicKey);
            } else if (output?.my_key_kid) {
                state.myPublicKey = output.my_key_kid;
                console.log('My P2P public key (KeyID):', state.myPublicKey);
            } else if (output?.my_key) {
                state.myPublicKey = output.my_key;
                console.log('My P2P public key (fallback):', state.myPublicKey);
            } else {
                console.warn('get_my_key returned no valid key, own order detection disabled');
                state.myPublicKey = null;  // Ensure it's null, not stale
            }

            // Check if trader is registered
            if (state.myPublicKey) {
                try {
                    const traderResult = await walletRequest('invoke_contract', {
                        args: `role=user,action=view_trader,cid=${P2P_ESCROW_CID},pk=${state.myPublicKey}`
                    });
                    let traderOutput = traderResult?.result?.output || traderResult?.output;
                    if (typeof traderOutput === 'string') {
                        try { traderOutput = JSON.parse(traderOutput); } catch (e) {}
                    }
                    if (traderOutput?.trader && !traderOutput?.error) {
                        state.isRegistered = true;
                        state.traderInfo = traderOutput.trader;
                        console.log('Trader is registered:', state.traderInfo);
                    } else {
                        state.isRegistered = false;
                        console.log('Trader not registered');
                    }
                } catch (e) {
                    console.warn('Could not check trader registration:', e);
                    state.isRegistered = false;
                }
            }

            // Update UI based on registration status
            updateRegistrationBanner();
        } catch (e) {
            console.warn('Could not get public key:', e);
            state.myPublicKey = null;  // Ensure own order detection is disabled on error
        }

        state.loading = false;
        updateLoadingState(false);
        updateBalanceDisplays();

        return true;

    } catch (e) {
        console.error('Failed to load wallet data:', e);
        state.loading = false;
        state.walletConnected = false;
        updateLoadingState(false);
        showError('Could not connect to wallet');
        return false;
    }
}

/**
 * Get balance for specific asset
 */
function getBalance(assetId) {
    return state.balances[assetId] || { available: 0, receiving: 0, sending: 0, maturing: 0 };
}

/**
 * Get asset info
 */
function getAssetInfo(assetId) {
    return state.assets[assetId] || ASSET_CONFIG[assetId] || {
        name: `Asset #${assetId}`,
        symbol: `A${assetId}`,
        decimals: 8
    };
}

/**
 * Get asset icon URL
 */
function getAssetIcon(assetId) {
    return ASSET_ICONS[assetId] || null;
}

// ============================================
// P2P API CALLS
// ============================================

async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`/api/p2p${endpoint}`, options);
        return await response.json();
    } catch (e) {
        console.error('P2P API error:', e);
        return { error: e.message };
    }
}

// ============================================
// ESCROW CONTRACT INTERACTIONS
// ============================================

/**
 * P2P Escrow Contract Actions:
 *
 * TRADER MANAGEMENT:
 * - register_trader: Register wallet address as P2P trader
 * - get_trader_info: Get trader's on-chain reputation
 * - get_trader_reputation: Get detailed reputation stats
 *
 * ORDER MANAGEMENT:
 * - create_order: Create sell order, lock funds + deposit
 * - cancel_order: Cancel open order, unlock funds
 * - get_orders: Get open orders (filtered)
 *
 * TRADE EXECUTION:
 * - accept_order: Accept order, lock buyer deposit, register both parties
 * - mark_paid: Buyer marks payment sent
 * - confirm_received: Seller confirms, releases funds, enables feedback
 *
 * DISPUTE RESOLUTION:
 * - open_dispute: Open dispute, assign escrows
 * - submit_evidence: Submit evidence for dispute
 * - escrow_vote: Escrow votes on dispute
 *
 * VERIFIED FEEDBACK (requires on-chain trade completion):
 * - submit_feedback: Submit verified feedback for completed trade
 * - view_feedback: Get verified feedbacks for a trader (pk)
 *
 * ESCROW STAKING:
 * - stake_escrow: Stake FOMO to become escrow arbitrator
 * - unstake_escrow: Withdraw escrow stake
 * - claim_rewards: Claim escrow fee earnings
 */

/**
 * Generic contract call helper
 * Uses role=user for user actions, role=manager for admin actions
 */
async function contractCall(action, params = {}, createTx = false, role = 'user') {
    if (!P2P_ESCROW_CID) {
        console.warn(`Escrow contract not deployed - cannot execute ${action}`);
        return { success: false, error: 'Escrow contract not deployed', offchain: true };
    }

    // Build args string with role prefix (required by contract)
    let args = `role=${role},action=${action},cid=${P2P_ESCROW_CID}`;

    // Add user's public key ONLY for view actions (write actions auto-derive pk in shader)
    // Write actions (register_trader, create_order, etc.) now auto-derive pk using Env::DerivePk
    // This is a SECURITY feature - prevents identity spoofing
    const viewActionsNeedingPk = [
        'view_trader', 'view_escrow_stake', 'view_feedback', 'view_trades'
    ];
    if (viewActionsNeedingPk.includes(action) && !params.pk && state.myPublicKey) {
        params.pk = state.myPublicKey;
    }

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            args += `,${key}=${String(value)}`;
        }
    }

    console.log(`Contract call: ${args}`);

    try {
        const result = await walletRequest('invoke_contract', {
            args: args,
            createTx: createTx
        });

        console.log('Contract result:', result);

        if (result?.error) {
            return { success: false, error: result.error };
        }

        // Parse output if it's JSON string (may be double-encoded)
        let output = result?.output;
        console.log('Raw output type:', typeof output, 'First 100 chars:', String(output).substring(0, 100));

        // Keep parsing until we get an object or can't parse anymore
        while (typeof output === 'string' && output.startsWith('{')) {
            try {
                // Fix malformed JSON from contract (e.g., {"feedback": ["total": 0]} -> {"feedback": [], "total": 0})
                let fixedOutput = output;
                // Fix array containing key-value pair instead of proper structure
                fixedOutput = fixedOutput.replace(/\[\s*"(\w+)":\s*(\d+)\s*\]/g, '[], "$1": $2');

                output = JSON.parse(fixedOutput);
                console.log('Parsed to type:', typeof output);
            } catch (e) {
                console.error('JSON parse failed:', e.message, 'String starts with:', output.substring(0, 50));
                break;
            }
        }

        return { success: true, result: output, txid: result?.txid, raw: result };
    } catch (e) {
        console.error(`Contract call ${action} failed:`, e);
        return { success: false, error: e.message };
    }
}

/**
 * Wait for a transaction to reach a terminal state (completed or failed).
 * Polls tx_status every `interval` ms, up to `maxAttempts` times.
 * Returns { success: true, status } or { success: false, error, status }.
 *
 * BEAM tx statuses:
 *   0 = Pending, 1 = InProgress, 2 = Cancelled, 3 = Completed,
 *   4 = Failed, 5 = Registering
 */
async function waitForTxCompletion(txId, { maxAttempts = 60, interval = 2000, onProgress } = {}) {
    if (!txId) {
        console.warn('[waitForTx] No txId provided, skipping status check');
        return { success: true, status: 'unknown', skipped: true };
    }

    console.log(`[waitForTx] Monitoring tx ${txId}...`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            // Use tx_list to find our tx (tx_status not available via postMessage)
            const txListResult = await walletRequest('get_tx_list', {});
            const txArr = Array.isArray(txListResult) ? txListResult : (txListResult?.result || txListResult?.txList || []);
            const tx = txArr.find(t => t.txId === txId || t.tx_id === txId);

            if (tx) {
                const statusNum = tx.status;
                const statusStr = tx.status_string || tx.statusString || '';

                if (onProgress) {
                    onProgress(attempt + 1, maxAttempts, statusNum);
                }

                console.log(`[waitForTx] Attempt ${attempt + 1}/${maxAttempts}: status=${statusNum} (${statusStr})`);

                // Terminal states: 3=Completed, 4=Failed, 2=Cancelled
                if (statusNum === 3) {
                    return { success: true, status: 'completed', raw: tx };
                }
                if (statusNum === 4) {
                    const failReason = tx.failure_reason || statusStr || 'Transaction failed';
                    return { success: false, status: 'failed', error: failReason, raw: tx };
                }
                if (statusNum === 2) {
                    return { success: false, status: 'cancelled', error: 'Transaction was cancelled', raw: tx };
                }
            } else {
                console.log(`[waitForTx] Attempt ${attempt + 1}/${maxAttempts}: tx not found in list yet`);
            }

            // Still pending/in-progress/registering — wait and retry
        } catch (e) {
            console.warn(`[waitForTx] Poll error (attempt ${attempt + 1}):`, e.message);
            // Continue polling — network hiccup
        }

        await new Promise(r => setTimeout(r, interval));
    }

    // Timed out but tx may still be processing
    return { success: false, status: 'timeout', error: 'Transaction status check timed out. It may still complete — check your transaction history.' };
}

/**
 * Execute a contract write operation with tx status verification.
 * Wraps contractCall + waitForTxCompletion into one call.
 * Returns { success, txid, error, txStatus }.
 */
async function contractCallWithVerify(action, params = {}, role = 'user', { onProgress } = {}) {
    const result = await contractCall(action, params, true, role);

    if (!result.success) {
        return { success: false, error: result.error, txStatus: 'submit_failed' };
    }

    const txId = result.txid || result.raw?.txid || result.raw?.txId;
    if (!txId) {
        // No txid returned — contract may have succeeded without creating a tx
        // (some read-like operations), or the wallet didn't return one
        console.warn(`[contractCallWithVerify] No txId returned for ${action}`);
        return { success: true, txid: null, txStatus: 'no_txid', result: result.result };
    }

    // Poll for completion
    const txResult = await waitForTxCompletion(txId, { onProgress });

    return {
        success: txResult.success,
        txid: txId,
        txStatus: txResult.status,
        error: txResult.error || null,
        result: result.result,
        raw: txResult.raw
    };
}

/**
 * Raw invoke_contract wrapper - accepts pre-built args string
 * Used by loadMyTrades, manager panel, escrow functions, etc.
 */
async function invokeContract(args, createTx = false) {
    try {
        const result = await walletRequest('invoke_contract', {
            args: args,
            createTx: createTx
        });

        if (result?.error) {
            return { error: result.error };
        }

        // Parse output
        let output = result?.output;
        while (typeof output === 'string' && output.startsWith('{')) {
            try {
                let fixedOutput = output.replace(/\[\s*"(\w+)":\s*(\d+)\s*\]/g, '[], "$1": $2');
                output = JSON.parse(fixedOutput);
            } catch (e) {
                break;
            }
        }

        return output || {};
    } catch (e) {
        console.error('invokeContract failed:', e);
        return { error: e.message };
    }
}

/**
 * Load orders directly from the smart contract
 */
async function loadOrdersFromContract() {
    console.log('Loading orders from P2P Escrow contract...');

    const result = await contractCall('view_orders', {
        asset_id: 0,  // All assets
        side: 255,    // All sides
        skip: 0,
        limit: 100
    }, false, 'user');

    console.log('Contract view_orders result:', JSON.stringify(result, null, 2));

    // Contract returns {"orders": [...], "total": N} - may be string or object
    let orderData = result.result || {};

    // Parse if it's a JSON string
    if (typeof orderData === 'string') {
        try {
            orderData = JSON.parse(orderData);
            console.log('Parsed orderData from string:', orderData);
        } catch (e) {
            console.error('Failed to parse orderData:', e);
            orderData = {};
        }
    }

    const rawOrders = orderData.orders;
    console.log('Raw orders:', rawOrders?.length, 'items');

    if (result.success && rawOrders) {
        const orders = Array.isArray(rawOrders)
            ? rawOrders.filter(o => typeof o === 'object')
            : [];

        console.log(`Loaded ${orders.length} orders from contract`);
        return orders.map(o => {
            // Parse order status: 0=Open, 1=InTrade, 2=Completed, 3=Cancelled
            const statusMap = {
                0: 'active',      // Open - can accept trades
                1: 'in_trade',    // Has active trade - can't accept new trades
                2: 'completed',   // Fully filled or cancelled
                3: 'cancelled'
            };

            // Use remaining_amount for display (what's actually available)
            const totalAmount = o.amount / GROTH;
            const remainingAmount = (o.remaining_amount !== undefined ? o.remaining_amount : o.amount) / GROTH;
            const filledAmount = totalAmount - remainingAmount;

            // Look up currency code from ISO 4217 ID
            const currencyId = o.currency_id || o.currency || 840;
            const currencyInfo = getCurrencyInfo(currencyId);
            const currencyCode = currencyInfo?.code || 'USD';

            return {
                id: String(o.id),
                type: o.side === 0 ? 'sell' : 'buy',
                asset: o.asset_id,
                // IMPORTANT: 'amount' should be what's AVAILABLE to trade
                amount: remainingAmount,
                amountGroth: o.remaining_amount || o.amount,
                // Keep total for reference
                totalAmount: totalAmount,
                totalAmountGroth: o.amount,
                filledAmount: filledAmount,
                deposit: o.deposit / GROTH,
                price: o.price / 10000,  // Convert from 4-decimal precision
                currency: currencyCode,
                currencyId: currencyId,
                minLimit: o.min_limit / 10000,  // Stored as cents × 100
                maxLimit: o.max_limit / 10000,  // Stored as cents × 100
                paymentMethods: parsePaymentMethods(o.payment_methods),
                paymentMethodCount: o.payment_method_count || 0,
                status: statusMap[o.status] || 'unknown',
                statusCode: o.status,
                activeTradeId: o.active_trade_id,
                createdAt: o.created_at,
                seller: {
                    address: o.seller,
                    name: shortenAddress(o.seller),
                    trust: 50,  // Default, fetch from contract
                    trades: 0
                },
                source: 'contract'
            };
        });
    }

    return [];
}

/**
 * Parse payment methods from contract (array of IDs or comma-separated string)
 * Returns array of method codes for display
 */
function parsePaymentMethods(paymentData) {
    // Handle various input formats
    let methodIds = [];

    if (Array.isArray(paymentData)) {
        methodIds = paymentData;
    } else if (typeof paymentData === 'string') {
        // Comma-separated string of IDs
        methodIds = paymentData.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    } else if (typeof paymentData === 'number') {
        methodIds = [paymentData];
    }

    if (methodIds.length === 0) {
        return ['bank_transfer'];
    }

    // Convert IDs to codes using config
    const idToCode = getPaymentMethodIdMapping();
    const codes = methodIds.map(id => idToCode[id] || `method_${id}`).filter(Boolean);

    return codes.length ? codes : ['bank_transfer'];
}

/**
 * Get payment method by numeric ID
 */
function getPaymentMethodById(id) {
    if (!PAYMENT_METHODS_CONFIG?.paymentMethods) return null;

    for (const category of Object.values(PAYMENT_METHODS_CONFIG.paymentMethods)) {
        for (const method of category.methods || []) {
            if (method.id === id) {
                return method;
            }
        }
    }
    return null;
}

/**
 * Get payment method by code
 */
function getPaymentMethodByCode(code) {
    if (!PAYMENT_METHODS_CONFIG?.paymentMethods) return null;

    for (const category of Object.values(PAYMENT_METHODS_CONFIG.paymentMethods)) {
        for (const method of category.methods || []) {
            if (method.code === code) {
                return method;
            }
        }
    }
    return null;
}

/**
 * Get ID to code mapping for payment methods
 */
function getPaymentMethodIdMapping() {
    if (PAYMENT_METHODS_CONFIG?.paymentMethods) {
        const mapping = {};
        for (const category of Object.values(PAYMENT_METHODS_CONFIG.paymentMethods)) {
            for (const method of category.methods || []) {
                mapping[method.id] = method.code;
            }
        }
        return mapping;
    }

    // Fallback
    return {
        1001: 'bank_transfer', 1002: 'wise', 1003: 'revolut', 1004: 'paypal',
        1005: 'zelle', 1006: 'venmo', 1007: 'cash_app',
        2001: 'btc_onchain', 2002: 'btc_lightning', 2003: 'eth',
        3001: 'sberbank', 3002: 'tinkoff', 3003: 'alfabank', 3009: 'sbp'
    };
}

/**
 * Get code to ID mapping for payment methods
 * Used when creating orders to convert selected codes to IDs for contract
 */
function getPaymentMethodCodeToId() {
    if (PAYMENT_METHODS_CONFIG?.paymentMethods) {
        const mapping = {};
        for (const category of Object.values(PAYMENT_METHODS_CONFIG.paymentMethods)) {
            for (const method of category.methods || []) {
                mapping[method.code] = method.id;
            }
        }
        return mapping;
    }

    // Fallback
    return {
        'bank_transfer': 1001, 'wise': 1002, 'revolut': 1003, 'paypal': 1004,
        'zelle': 1005, 'venmo': 1006, 'cash_app': 1007,
        'btc_onchain': 2001, 'btc_lightning': 2002, 'eth': 2003,
        'usdt_erc20': 2004, 'usdt_trc20': 2005, 'usdc': 2007,
        'sberbank': 3001, 'tinkoff': 3002, 'alfabank': 3003, 'vtb': 3004,
        'sbp': 3009, 'qiwi': 3010, 'yoomoney': 3011,
        'sepa': 4001, 'swift': 4003, 'ach': 5001
    };
}

/**
 * Get all payment methods as flat array
 */
function getAllPaymentMethods() {
    if (!PAYMENT_METHODS_CONFIG?.paymentMethods) return [];

    const methods = [];
    for (const category of Object.values(PAYMENT_METHODS_CONFIG.paymentMethods)) {
        methods.push(...(category.methods || []));
    }
    return methods;
}

function shortenAddress(addr) {
    if (!addr) return 'Unknown';
    return addr.slice(0, 8) + '...' + addr.slice(-6);
}

/**
 * Register as P2P trader (enables verified feedback)
 * Auto-called when creating orders or accepting trades
 */
async function registerTrader() {
    const result = await contractCall('register_trader', {}, true);
    if (result.success) {
        console.log('Trader registered successfully');
        state.isRegistered = true;
        updateRoleBadges();
    }
    return result;
}

/**
 * Get trader info/reputation from contract (single API call)
 * Returns full trader data including reputation, badges, and stats
 */
async function getTraderData(pk) {
    const result = await contractCall('view_trader', { pk: pk }, false);
    if (result.success && result.result) {
        const trader = result.result.trader || result.result;
        return {
            pk: pk,
            registered: trader.registered !== undefined ? trader.registered : true,
            totalTrades: trader.total_trades || 0,
            successfulTrades: trader.successful_trades || 0,
            disputesWon: trader.disputes_won || 0,
            disputesLost: trader.disputes_lost || 0,
            totalVolume: trader.total_volume || 0,
            avgRating: (trader.avg_rating || trader.total_rating || 0) / 100,
            feedbackCount: trader.feedback_count || 0,
            trustScore: trader.trust_score || 50,
            badges: parseBadges(trader.badges || 0),
            registeredAt: trader.registered_at || 0,
            lastActive: trader.last_active || 0,
            joinedAt: trader.registered_at || 0
        };
    }
    return null;
}

// Aliases for backwards compatibility
const getTraderInfo = getTraderData;
const getTraderReputation = getTraderData;

/**
 * Parse badge bitmask into badge array
 */
function parseBadges(bitmask) {
    const badges = [];
    if (bitmask & 1) badges.push('verified');
    if (bitmask & 2) badges.push('fire');        // Top trader
    if (bitmask & 4) badges.push('diamond');     // High volume
    if (bitmask & 8) badges.push('escrow');      // Escrow staker
    if (bitmask & 16) badges.push('star');       // Rising star
    return badges;
}

/**
 * Create order on escrow contract
 * Locks: amount + security deposit
 */
async function createOrderOnChain(order) {
    const amountGroth = Math.floor(order.amount * GROTH);
    const priceInCents = Math.floor(order.price * 10000);  // Store with 4 decimal precision

    // Convert payment method codes to IDs for contract storage
    const codeToId = getPaymentMethodCodeToId();
    const paymentMethodIds = (order.paymentMethods || [])
        .map(code => codeToId[code] || 0)
        .filter(id => id > 0)
        .slice(0, 8);  // Max 8 payment methods per order

    // Ensure at least one payment method
    if (paymentMethodIds.length === 0) {
        paymentMethodIds.push(1001); // Default to bank_transfer
    }

    // Convert to comma-separated string for contract (e.g., "1001,3002,3003")
    const paymentMethodsStr = paymentMethodIds.join(',');

    // Convert side to number: 0=sell, 1=buy
    const sideNum = (order.type === 'buy' || order.side === 'buy') ? 1 : 0;

    // Get currency ID from config (ISO 4217 numeric code)
    const currencyInfo = getCurrencyInfo(order.currency);
    const currencyId = currencyInfo?.id || 840; // Default to USD

    console.log('Creating order with params:', {
        asset_id: order.asset,
        amount: amountGroth,
        price: priceInCents,
        currency_id: currencyId,
        currency_code: order.currency,
        min_limit: Math.floor((order.minLimit || 0.01) * 10000),
        max_limit: Math.floor((order.maxLimit || 10) * 10000),
        payment_methods: paymentMethodsStr,
        side: sideNum
    });

    // Contract parses payment_methods as comma-separated string of IDs
    const result = await contractCallWithVerify('create_order', {
        asset_id: order.asset,
        amount: amountGroth,
        price: priceInCents,
        currency_id: currencyId,  // ISO 4217 numeric code
        min_limit: Math.floor((order.minLimit || 0.01) * 10000),  // In cents
        max_limit: Math.floor((order.maxLimit || 10) * 10000),    // In cents
        payment_methods: paymentMethodsStr,  // Comma-separated IDs: "1001,3002,3003"
        side: sideNum
    });

    if (result.success) {
        console.log('Order created on-chain:', result.txid, 'txStatus:', result.txStatus);
    }
    return result;
}

/**
 * Cancel order on escrow contract
 * Unlocks: amount + security deposit
 */
async function cancelOrderOnChain(orderId) {
    console.log('cancelOrderOnChain called with orderId:', orderId, 'type:', typeof orderId);

    // Ensure order_id is a number (contract expects uint64)
    const orderIdNum = parseInt(orderId, 10);
    if (isNaN(orderIdNum)) {
        console.error('Invalid order ID - not a number:', orderId);
        return { success: false, error: 'Invalid order ID format' };
    }

    console.log('Sending cancel_order with order_id:', orderIdNum);
    return await contractCallWithVerify('cancel_order', { order_id: orderIdNum });
}

/**
 * Cancel order - UI function with confirmation
 */
async function cancelOrder(orderId) {
    const order = state.orders.find(o => o.id === orderId) ||
                  state.myOrders.find(o => o.id === orderId);

    if (!order) {
        showError('Order not found');
        return;
    }

    // Check if order can be canceled (must be Open status)
    if (order.status === 'in_trade') {
        showError('Cannot cancel order - there is an active trade in progress. Wait for the trade to complete or be resolved.');
        return;
    }

    if (order.status !== 'active') {
        showError('This order cannot be canceled - it may be completed or already canceled.');
        return;
    }

    // Show confirmation modal
    const asset = getAssetInfo(order.asset || state.selectedAsset);
    const totalLocked = (order.amountGroth || order.amount * GROTH) +
                        (order.depositGroth || order.deposit * GROTH || (order.amount * GROTH * 0.1));

    const confirmed = confirm(
        `Cancel Order #${orderId}?\n\n` +
        `This will:\n` +
        `- Remove your order from the marketplace\n` +
        `- Unlock ${formatAmountFromGroth(totalLocked)} ${asset.symbol}\n\n` +
        `Are you sure?`
    );

    if (!confirmed) return;

    showLoading('Canceling order...');

    try {
        const result = await cancelOrderOnChain(orderId);

        hideLoading();

        if (result.success) {
            showSuccess(`Order #${orderId} cancelled! Funds unlocked.`);
            await loadOrders();
        } else {
            showError('Cancel failed: ' + (result.error || 'Transaction failed. Please try again.'));
        }
    } catch (e) {
        hideLoading();
        showError('Failed to cancel order: ' + e.message);
    }
}

/**
 * Edit order - UI function to modify order limits/price
 */
function editOrder(orderId) {
    const order = state.orders.find(o => o.id === orderId) ||
                  state.myOrders.find(o => o.id === orderId);

    if (!order) {
        showError('Order not found');
        return;
    }

    // Note: The current contract doesn't support updating orders.
    // User must cancel and create a new order.
    showToast(
        'To modify an order, please cancel it and create a new one with updated details.',
        'info'
    );

    // TODO: If contract adds update_order method, implement here:
    // showEditOrderModal(order);
}

/**
 * Accept order on escrow contract
 * Registers both buyer and seller for verified feedback
 * Locks: buyer security deposit
 */
async function acceptOrderOnChain(orderId, amount) {
    const amountGroth = Math.floor(amount * GROTH);
    const depositGroth = Math.floor(amountGroth * (P2P_CONFIG.securityDepositPct / 100));

    const result = await contractCall('accept_order', {
        order_id: orderId,
        amount: amountGroth,
        deposit: depositGroth
    }, true);

    if (result.success && result.result?.trade_id) {
        return { ...result, tradeId: result.result.trade_id };
    }
    return result;
}

/**
 * Mark payment as sent (buyer action)
 */
async function markPaymentSentOnChain(tradeId, paymentProof = '') {
    return await contractCallWithVerify('mark_payment_sent', {
        trade_id: tradeId,
        proof_hash: paymentProof ? hashString(paymentProof) : ''
    });
}

/**
 * Confirm payment received and release funds (seller action)
 * After this, both parties can submit verified feedback
 */
async function confirmPaymentOnChain(tradeId, rating) {
    // Rating is now REQUIRED (1-5)
    if (!rating || rating < 1 || rating > 5) {
        return { success: false, error: 'Rating required (1-5)' };
    }

    const result = await contractCallWithVerify('confirm_payment', {
        trade_id: tradeId,
        rating: rating
    });

    if (result.success) {
        console.log('Payment confirmed with feedback, funds released.');
    }
    return result;
}

/**
 * Open dispute for a trade
 */
async function openDisputeOnChain(tradeId, reason = '', evidence = '') {
    return await contractCallWithVerify('open_dispute', {
        trade_id: tradeId,
        reason: reason,
        evidence_hash: evidence ? hashString(evidence) : ''
    });
}

/**
 * Submit evidence for dispute
 */
async function submitEvidenceOnChain(disputeId, evidence) {
    return await contractCallWithVerify('submit_evidence', {
        dispute_id: disputeId,
        evidence_hash: hashString(evidence)
    }, 'user');
}

/**
 * Submit verified feedback for a completed trade
 * IMPORTANT: Can only be called by buyer or seller of a COMPLETED trade
 * This ensures all feedback is verified and from actual trading partners
 */
async function submitFeedback(tradeId, targetAddress, rating, comment = '') {
    // Validate rating
    if (rating < 1 || rating > 5) {
        return { success: false, error: 'Rating must be between 1 and 5' };
    }

    // Contract will verify:
    // 1. Trade exists and is COMPLETED
    // 2. Caller is buyer or seller of this trade
    // 3. Target is the OTHER party (not self-review)
    // 4. Caller hasn't already submitted feedback for this trade

    const result = await contractCall('submit_feedback', {
        trade_id: tradeId,
        target: targetAddress,
        rating: rating,
        comment_hash: comment ? hashString(comment) : ''
    }, true);

    if (result.success) {
        console.log(`Verified feedback submitted for trade ${tradeId}: ${rating} stars`);
    }
    return result;
}

/**
 * Get verified feedback for a trader
 * Returns only feedback from actual completed trades
 */
async function getFeedbackForTrader(pk, skip = 0, limit = 20) {
    const result = await contractCall('view_feedback', {
        pk: pk,
        skip: skip,
        limit: limit
    }, false);

    if (result.success && result.result) {
        const data = result.result;
        return {
            feedbacks: (data.feedbacks || []).map(f => ({
                tradeId: f.trade_id,
                from: f.from,
                to: f.to,
                rating: f.rating,
                commentHash: f.comment_hash,
                createdAt: f.created_at
            })),
            totalCount: data.total_count || 0,
            avgRating: (data.avg_rating || 0) / 100
        };
    }
    return { feedbacks: [], totalCount: 0, avgRating: 0 };
}

/**
 * Stake FOMO to become an escrow arbitrator
 */
async function stakeForEscrowOnChain(amount) {
    if (amount < P2P_CONFIG.minEscrowStake) {
        return { success: false, error: `Minimum stake is ${P2P_CONFIG.minEscrowStake} FOMO` };
    }

    const amountGroth = Math.floor(amount * GROTH);
    return await contractCall('stake_escrow', {
        amount: amountGroth
    }, true);
}

/**
 * Unstake escrow FOMO (after lock period)
 */
async function unstakeEscrowOnChain(stakeId) {
    return await contractCall('unstake_escrow', {
        stake_id: stakeId
    }, true);
}

/**
 * Claim accumulated escrow rewards
 */
async function claimEscrowRewards() {
    return await contractCall('claim_escrow_rewards', {}, true);
}

/**
 * Vote on a dispute as an escrow
 */
async function escrowVote(disputeId, decision) {
    // decision: 'buyer' or 'seller'
    return await contractCall('escrow_vote', {
        dispute_id: disputeId,
        decision: decision
    }, true);
}

/**
 * Get escrow pool statistics from contract
 */
async function getEscrowStats() {
    try {
        // Get contract settings/stats
        const viewArgs = `role=manager,action=view,cid=${P2P_ESCROW_CID}`;
        const viewResult = await invokeContract(viewArgs, false);

        // Get escrow stakers list
        const escrowsArgs = `role=manager,action=view_escrows,cid=${P2P_ESCROW_CID}`;
        const escrowsResult = await invokeContract(escrowsArgs, false);

        // Get orders to count active ones
        const ordersArgs = `role=user,action=view_orders,cid=${P2P_ESCROW_CID},asset_id=0,side=255,skip=0,limit=500`;
        const ordersResult = await invokeContract(ordersArgs, false);

        // Calculate stats
        let totalStaked = 0;
        let stakerCount = 0;
        let totalRewards = 0;

        if (escrowsResult && escrowsResult.escrows && Array.isArray(escrowsResult.escrows)) {
            stakerCount = escrowsResult.escrows.length;
            escrowsResult.escrows.forEach(e => {
                totalStaked += (e.amount || e.stake || 0);
                totalRewards += (e.rewards || e.total_rewards || 0);
            });
        }

        // Count active orders
        let activeOrders = 0;
        let totalVolume = 0;
        if (ordersResult && ordersResult.orders && Array.isArray(ordersResult.orders)) {
            ordersResult.orders.forEach(o => {
                if (o.status === 0 || o.status === 'active' || o.status === 'Open') {
                    activeOrders++;
                }
                totalVolume += (o.amount || 0);
            });
        }

        // Get values from contract view
        const totalTrades = viewResult?.total_trades || viewResult?.trades_count || 0;
        const pendingDisputes = viewResult?.pending_disputes || viewResult?.open_disputes || 0;
        const resolvedDisputes = viewResult?.resolved_disputes || 0;
        const totalFees = viewResult?.total_fees || viewResult?.fee_pool || 0;

        // Calculate success rate
        const successRate = totalTrades > 0 ? Math.round(((totalTrades - pendingDisputes) / totalTrades) * 100) : 98;

        return {
            totalVolume: totalVolume,
            totalTrades: totalTrades,
            activeOrders: activeOrders || state.orders.length,
            activeTrades: viewResult?.active_trades || 0,
            successRate: successRate,
            totalStaked: totalStaked,
            stakerCount: stakerCount,
            pendingDisputes: pendingDisputes,
            resolvedDisputes: resolvedDisputes,
            rewardPool: totalFees,
            totalRewardsDistributed: totalRewards,
            estimatedApy: totalStaked > 0 ? Math.min(((totalFees * 12) / totalStaked) * 100, 50) : 0
        };
    } catch (e) {
        console.error('Failed to get escrow stats:', e);
        return null;
    }
}

/**
 * Simple hash function for storing comment/evidence hashes
 * In production, use proper cryptographic hash
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
}

// ============================================
// ORDER MANAGEMENT
// ============================================

/**
 * Load orders from smart contract (PRIMARY) or P2P network (FALLBACK)
 * All data comes from the deployed contract for verification
 */
async function loadOrders() {
    const ordersList = document.getElementById('orders-list');
    ordersList.innerHTML = `
        <div class="loading-orders">
            <div class="spinner"></div>
            <span>Loading orders from smart contract...</span>
        </div>
    `;

    try {
        // Load ALL data from smart contract (verified on-chain)
        console.log('📦 Loading orders from P2P Escrow contract...');
        const contractOrders = await loadOrdersFromContract();

        // Filter by selected asset and opposite side
        const targetSide = state.side === 'buy' ? 'sell' : 'buy';
        const filtered = (contractOrders || []).filter(o => {
            const matchesAsset = state.selectedAsset === 0 || o.asset === state.selectedAsset;
            const matchesSide = o.type === targetSide;
            const isActive = o.status === 'active' || o.status === 'open';
            return matchesAsset && matchesSide && isActive;
        });

        state.orders = filtered;
        console.log(`✅ Loaded ${contractOrders?.length || 0} total orders, ${filtered.length} matching filters`);
        renderOrders();

    } catch (e) {
        console.error('Failed to load orders from contract:', e);
        state.orders = [];
        renderOrders();
    }
}


/**
 * Render order list
 */
function renderOrders() {
    const ordersList = document.getElementById('orders-list');
    const asset = getAssetInfo(state.selectedAsset);
    const assetIcon = getAssetIcon(state.selectedAsset);

    // First, filter by selected asset - this is critical!
    let filteredOrders = state.orders.filter(order => {
        return order.asset === state.selectedAsset;
    });

    // Filter orders by payment methods if filters are active
    if (state.paymentFilters && state.paymentFilters.length > 0) {
        filteredOrders = filteredOrders.filter(order => {
            // Check if order has any of the selected payment methods
            return order.paymentMethods?.some(pm => state.paymentFilters.includes(pm));
        });
    }

    // Filter by currency if selected (e.g., EUR only shows EUR orders)
    if (state.currency && state.currency !== 'ALL') {
        filteredOrders = filteredOrders.filter(order => {
            // Match order currency to selected filter
            return order.currency === state.currency;
        });
    }

    // Filter by amount (fiat value within order limits)
    if (state.amountFilter > 0) {
        filteredOrders = filteredOrders.filter(order => {
            const minLimit = order.minLimit || 0;
            const maxLimit = order.maxLimit || Infinity;
            return state.amountFilter >= minLimit && state.amountFilter <= maxLimit;
        });
    }

    // Apply advanced filters
    if (state.advancedFilters.enabled) {
        filteredOrders = filteredOrders.filter(order => {
            const seller = order.seller || {};
            const sellerAddress = seller.address || '';
            const trustScore = seller.trustScore || seller.trust || 50;
            const totalTrades = seller.totalTrades || seller.trades || 0;
            const feedbackCount = seller.feedbackCount || 0;
            const badges = seller.badges || [];

            // Check if this is user's own order (robust comparison)
            const sellerLower = (sellerAddress || '').toLowerCase();
            const myPkLower = (state.myPublicKey || '').toLowerCase();
            const myAddrLower = (state.myAddress || '').toLowerCase();
            const isOwnOrder = sellerLower && (
                sellerLower === myPkLower ||
                sellerLower === myAddrLower ||
                (myPkLower && sellerLower.substring(0, 16) === myPkLower.substring(0, 16)) ||
                (myAddrLower && sellerLower.substring(0, 16) === myAddrLower.substring(0, 16))
            );

            // Hide own orders if filter is enabled
            if (state.advancedFilters.hideOwnOrders && isOwnOrder) {
                return false;
            }

            // Trust score filter
            if (state.advancedFilters.minTrustScore > 0 && trustScore < state.advancedFilters.minTrustScore) {
                return false;
            }

            // Minimum trades filter
            if (state.advancedFilters.minTrades > 0 && totalTrades < state.advancedFilters.minTrades) {
                return false;
            }

            // Minimum feedback filter
            if (state.advancedFilters.minFeedback > 0 && feedbackCount < state.advancedFilters.minFeedback) {
                return false;
            }

            // Badge filters (if any badge filter is checked, order must have that badge)
            if (state.advancedFilters.badgeFilters.verified && !badges.includes('verified')) {
                return false;
            }
            if (state.advancedFilters.badgeFilters.fire && !badges.includes('fire')) {
                return false;
            }
            if (state.advancedFilters.badgeFilters.diamond && !badges.includes('diamond')) {
                return false;
            }
            if (state.advancedFilters.badgeFilters.escrow && !badges.includes('escrow')) {
                return false;
            }

            return true;
        });
    }

    if (filteredOrders.length === 0) {
        ordersList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18M9 21V9"/>
                </svg>
                <p>No orders available</p>
                <p style="font-size:13px;color:var(--text-muted);">Be the first to create an order!</p>
            </div>
        `;
        return;
    }

    let html = '';

    for (const order of filteredOrders) {
        const seller = order.seller || {};
        const sellerName = seller.nickname || seller.name || 'Anonymous';
        const sellerAddress = seller.address || '';
        const shortId = sellerAddress ? `[${sellerAddress.substring(0, 8)}]` : '';
        const initial = sellerName.charAt(0).toUpperCase();

        // Badges with tooltips
        let badgesHtml = '';
        if (seller.badges?.includes('fire')) badgesHtml += '<span class="badge badge-fire" data-tooltip="Top Trader: 95%+ trust score with 50+ completed trades">🔥</span>';
        if (seller.badges?.includes('verified')) badgesHtml += '<span class="badge badge-verified" data-tooltip="Verified: Identity verified through additional checks">✓</span>';
        if (seller.badges?.includes('diamond')) badgesHtml += '<span class="badge badge-diamond" data-tooltip="Diamond Trader: 500+ completed trades">💎</span>';

        // Payment methods
        let paymentsHtml = (order.paymentMethods || []).map(pm =>
            `<span class="payment-tag">${getPaymentMethodName(pm)}</span>`
        ).join('');

        // Format amount - use enough decimals to show small amounts
        // order.amount is now the REMAINING/AVAILABLE amount
        const availableAmount = order.amount || 0;
        const totalAmount = order.totalAmount || availableAmount;
        const filledAmount = order.filledAmount || 0;
        const decimals = availableAmount < 1 ? 4 : (availableAmount < 100 ? 2 : 0);
        const formattedAmount = formatAmount(availableAmount, decimals);

        // Check order status - can only trade if order is 'active' (Open)
        const isAvailable = order.status === 'active' && availableAmount > 0;
        const isInTrade = order.status === 'in_trade';

        // Status badge
        let statusBadge = '';
        if (isInTrade) {
            statusBadge = '<span class="payment-tag status-badge in-trade">IN TRADE</span>';
        } else if (filledAmount > 0 && availableAmount > 0) {
            // Partially filled
            const fillPct = Math.round((filledAmount / totalAmount) * 100);
            statusBadge = `<span class="payment-tag status-badge partial">${fillPct}% FILLED</span>`;
        }

        // Check if this is user's own order (robust comparison)
        const sellerLower = (sellerAddress || '').toLowerCase();
        const myPkLower = (state.myPublicKey || '').toLowerCase();
        const myAddrLower = (state.myAddress || '').toLowerCase();
        const isOwnOrder = sellerLower && (
            sellerLower === myPkLower ||
            sellerLower === myAddrLower ||
            // Partial match for different key formats (first 16 chars)
            (myPkLower && sellerLower.substring(0, 16) === myPkLower.substring(0, 16)) ||
            (myAddrLower && sellerLower.substring(0, 16) === myAddrLower.substring(0, 16))
        );

        // Own order badge (removed "On-Chain" badge - everything is on-chain)
        const ownBadge = isOwnOrder ? '<span class="payment-tag own-badge">YOUR ORDER</span>' : '';

        // Action buttons based on ownership and availability
        let actionButtons;
        if (isOwnOrder) {
            // Only allow cancel if not in active trade
            const canCancel = order.status === 'active';
            actionButtons = `
                <div class="own-order-actions">
                    <button class="btn-cancel" ${!canCancel ? 'disabled' : ''} onclick="event.stopPropagation(); cancelOrder('${order.id}')" title="${canCancel ? 'Cancel Order' : 'Cannot cancel - trade in progress'}">
                        ${isInTrade ? 'In Trade' : 'Cancel'}
                    </button>
                    <button class="btn-edit" onclick="event.stopPropagation(); editOrder('${order.id}')" title="Edit Order">
                        Edit
                    </button>
                </div>
            `;
        } else if (!isAvailable) {
            // Order not available (in trade or no remaining amount)
            actionButtons = `
                <button class="btn-disabled" disabled title="${isInTrade ? 'Order has active trade' : 'No amount available'}">
                    ${isInTrade ? 'In Trade' : 'Unavailable'}
                </button>
            `;
        } else {
            actionButtons = `
                <button class="${state.side === 'buy' ? 'buy-btn' : 'sell-btn'}" onclick="event.stopPropagation(); openTradeModal('${order.id}')">
                    ${state.side === 'buy' ? 'Buy' : 'Sell'} ${asset.symbol}
                </button>
            `;
        }

        html += `
            <div class="order-row ${isOwnOrder ? 'own-order' : ''}" data-order-id="${order.id}" onclick="showTraderProfile('${sellerAddress}')" style="cursor:pointer;">
                <div class="col-advertiser">
                    <div class="advertiser-info">
                        <div class="advertiser-avatar" style="${isOwnOrder ? 'background:var(--info);' : ''}">${initial}</div>
                        <div class="advertiser-details">
                            <div class="advertiser-name">
                                ${isOwnOrder ? 'You' : sellerName}
                                <span class="short-id" title="Wallet: ${sellerAddress}">${shortId}</span>
                                ${badgesHtml}
                                ${statusBadge}
                            </div>
                            <div class="advertiser-stats">
                                <span class="trust-score">${seller.trustScore || seller.trust || 50}%</span>
                                <span class="separator">|</span>
                                <span>${formatTradeCount(seller.totalTrades || seller.trades || 0)} trades</span>
                                <span class="separator">|</span>
                                <span>~${seller.avgReleaseTime || 15}m</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-price">
                    <span class="price-value">${formatPrice(order.price)}</span>
                    <span class="price-currency">${order.currency}</span>
                </div>
                <div class="col-available">
                    <div class="available-info">
                        <div class="available-amount">${formattedAmount} ${asset.symbol}</div>
                        <div class="available-limits">${order.minLimit} ~ ${order.maxLimit.toLocaleString()} ${order.currency}</div>
                    </div>
                </div>
                <div class="col-payment">
                    <div class="payment-methods">
                        ${paymentsHtml}
                    </div>
                </div>
                <div class="col-action">
                    ${actionButtons}
                </div>
            </div>
        `;
    }

    ordersList.innerHTML = html;
}

// ============================================
// UI UPDATES
// ============================================

/**
 * Update balance displays in modals
 */
function updateBalanceDisplays() {
    // Create order modal balance
    const createBalanceEl = document.getElementById('create-balance');
    if (createBalanceEl) {
        const assetId = parseInt(document.getElementById('create-asset')?.value || state.selectedAsset);
        const balance = getBalance(assetId);
        const asset = getAssetInfo(assetId);
        createBalanceEl.textContent = `Available: ${formatAmountFromGroth(balance.available)} ${asset.symbol}`;
    }

    // Escrow modal balance
    const escrowAvailEl = document.getElementById('escrow-available');
    if (escrowAvailEl) {
        const balance = getBalance(174); // FOMO for escrow
        escrowAvailEl.textContent = formatAmountFromGroth(balance.available);
    }

    // Update asset tabs with balances
    document.querySelectorAll('.asset-tab').forEach(tab => {
        const aid = parseInt(tab.dataset.asset);
        const balance = getBalance(aid);
        const asset = getAssetInfo(aid);
        if (balance.available > 0) {
            tab.title = `${formatAmountFromGroth(balance.available)} ${asset.symbol}`;
        }
    });
}

/**
 * Update loading state
 */
function updateLoadingState(loading) {
    document.body.classList.toggle('loading', loading);
}

/**
 * Update registration banner visibility based on trader status
 */
function updateRegistrationBanner() {
    const banner = document.getElementById('registration-banner');
    if (banner) {
        banner.style.display = state.isRegistered ? 'none' : 'flex';
    }
}

/**
 * Show error message
 */
function showError(message) {
    console.error('P2P Error:', message);
    showToast(message, 'error');
}

/**
 * Show success message
 */
function showSuccess(message) {
    console.log('P2P Success:', message);
    showToast(message, 'success');
}

/**
 * Notification history state
 */
if (!state.notifications) {
    state.notifications = { history: [], unreadCount: 0 };
}

/**
 * Show toast notification (unified system with history log)
 */
function showToast(message, type = 'info', duration = 4000) {
    // Create container if doesn't exist
    let container = document.getElementById('p2p-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'p2p-toast-container';
        container.className = 'toast-container-topright';
        document.body.appendChild(container);
    }

    // Add to notification history
    addNotification(message, type);

    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
        pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
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

function addNotification(message, type) {
    const notification = {
        id: Date.now(),
        message,
        type,
        timestamp: new Date(),
        read: false
    };
    state.notifications.history.unshift(notification);
    if (state.notifications.history.length > 20) {
        state.notifications.history.pop();
    }
    state.notifications.unreadCount++;
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        if (state.notifications.unreadCount > 0) {
            badge.textContent = state.notifications.unreadCount > 9 ? '9+' : state.notifications.unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function showNotificationHistory() {
    // Mark all as read
    state.notifications.history.forEach(n => n.read = true);
    state.notifications.unreadCount = 0;
    updateNotificationBadge();

    const content = state.notifications.history.length === 0
        ? '<p class="empty-msg">No notifications yet</p>'
        : state.notifications.history.map(n => `
            <div class="notification-item notification-${n.type}">
                <span class="notification-time">${formatTimeAgo(n.timestamp)}</span>
                <span class="notification-message">${n.message}</span>
            </div>
        `).join('');

    // Use a simple modal approach
    const modalHtml = `
        <div class="modal show" id="notification-history-modal">
            <div class="modal-backdrop" onclick="closeModal('notification-history-modal')"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Notifications</h2>
                    <button class="modal-close" onclick="closeModal('notification-history-modal')">&times;</button>
                </div>
                <div class="modal-body" style="max-height:400px;overflow-y:auto;">
                    ${content}
                </div>
            </div>
        </div>
    `;
    // Remove existing if any
    const existing = document.getElementById('notification-history-modal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ============================================
// TRANSACTION CONFIRMATION
// ============================================

let pendingTransaction = null;

/**
 * Show transaction confirmation modal
 * @param {Object} txInfo - Transaction info
 * @param {string} txInfo.title - Modal title
 * @param {string} txInfo.action - Action description
 * @param {number} txInfo.amount - Amount to spend
 * @param {string} txInfo.asset - Asset symbol
 * @param {number} txInfo.deposit - Optional security deposit
 * @param {string} txInfo.depositAsset - Deposit asset symbol
 * @param {string} txInfo.warning - Optional warning message
 * @param {Function} txInfo.onConfirm - Callback when confirmed
 */
function showTransactionConfirmation(txInfo) {
    pendingTransaction = txInfo;

    // Set title
    document.getElementById('tx-confirm-title').textContent = txInfo.title || 'Confirm Transaction';

    // Set action description
    document.getElementById('tx-confirm-action').textContent = txInfo.action || '';

    // Set fiat payment row (You will pay: $X.XX via Payment Method)
    const fiatRow = document.getElementById('tx-confirm-fiat-row');
    if (fiatRow) {
        if (txInfo.fiatAmount && txInfo.fiatAmount > 0) {
            const symbol = getCurrencySymbol(txInfo.fiatCurrency || 'USD');
            let fiatStr = `${symbol}${txInfo.fiatAmount.toFixed(2)}`;
            if (txInfo.paymentMethod) {
                fiatStr += ` via ${txInfo.paymentMethod}`;
            }
            document.getElementById('tx-confirm-fiat').textContent = fiatStr;
            fiatRow.style.display = 'flex';
        } else {
            fiatRow.style.display = 'none';
        }
    }

    // Set amount row - hide if amount is 0 or not provided
    const amountRow = document.getElementById('tx-confirm-amount-row');
    if (amountRow) {
        if (txInfo.amount && txInfo.amount > 0) {
            const amountStr = formatAmount(txInfo.amount, 4) + ' ' + (txInfo.asset || 'BEAM');
            document.getElementById('tx-confirm-amount').textContent = amountStr;
            amountRow.style.display = 'flex';
        } else {
            amountRow.style.display = 'none';
        }
    }

    // Set deposit if applicable
    const depositRow = document.getElementById('tx-confirm-deposit-row');
    if (txInfo.deposit && txInfo.deposit > 0) {
        const depositStr = formatAmount(txInfo.deposit, 4) + ' ' + (txInfo.depositAsset || txInfo.asset || 'BEAM');
        document.getElementById('tx-confirm-deposit').textContent = depositStr;
        depositRow.style.display = 'flex';
    } else {
        depositRow.style.display = 'none';
    }

    // Calculate total - only from non-zero values
    const total = (txInfo.amount || 0) + (txInfo.deposit || 0);
    const totalStr = formatAmount(total, 4) + ' ' + (txInfo.asset || 'BEAM');
    document.getElementById('tx-confirm-total').textContent = totalStr;

    // Set warning
    const warningEl = document.getElementById('tx-confirm-warning');
    if (txInfo.warning) {
        warningEl.textContent = txInfo.warning;
        warningEl.style.display = 'block';
    } else {
        warningEl.style.display = 'none';
    }

    // Show modal
    openModal('tx-confirm-modal');
}

/**
 * Called when user confirms transaction
 */
async function confirmTransaction() {
    if (!pendingTransaction || !pendingTransaction.onConfirm) {
        closeModal('tx-confirm-modal');
        return;
    }

    closeModal('tx-confirm-modal');

    try {
        await pendingTransaction.onConfirm();
    } catch (error) {
        console.error('Transaction error:', error);
        showError('Transaction failed: ' + error.message);
    } finally {
        pendingTransaction = null;
    }
}

/**
 * Load my orders from contract
 */
async function loadMyOrdersFromContract() {
    if (!state.myPublicKey) {
        console.log('No public key, skipping my orders load');
        state.myOrders = [];
        return;
    }

    try {
        const result = await contractCall('view_orders', {
            asset_id: 0,
            side: 255,
            skip: 0,
            limit: 100
        }, false, 'user');

        if (result.success && result.result?.orders) {
            // Filter orders that belong to me
            const allOrders = Array.isArray(result.result.orders)
                ? result.result.orders.filter(o => typeof o === 'object')
                : [];

            state.myOrders = allOrders
                .filter(o => o.seller === state.myPublicKey)
                .map(o => ({
                    id: String(o.id),
                    type: o.side === 0 ? 'sell' : 'buy',
                    asset: o.asset_id,
                    amount: o.amount / GROTH,
                    amountGroth: o.amount,
                    price: o.price / 100,
                    currency: o.currency === 840 ? 'USD' : 'EUR',
                    status: o.status === 0 ? 'active' : 'completed',
                    createdAt: o.created_at,
                    source: 'contract'
                }));

            console.log(`Loaded ${state.myOrders.length} of my orders from contract`);
        }
    } catch (e) {
        console.error('Failed to load my orders from contract:', e);
        state.myOrders = [];
    }
}

// ============================================
// UI EVENT HANDLERS
// ============================================

/**
 * Set buy/sell side
 */
function setSide(side) {
    state.side = side;

    document.getElementById('btn-buy').classList.toggle('active', side === 'buy');
    document.getElementById('btn-sell').classList.toggle('active', side === 'sell');

    loadOrders();
}

/**
 * Set selected asset
 */
function setAsset(assetId) {
    state.selectedAsset = assetId;

    document.querySelectorAll('.asset-tab').forEach(tab => {
        tab.classList.toggle('active', parseInt(tab.dataset.asset) === assetId);
    });

    loadOrders();
}

/**
 * Toggle payment dropdown
 */
function togglePaymentDropdown() {
    const dropdown = document.getElementById('payment-dropdown-content');
    dropdown.classList.toggle('show');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('#payment-dropdown')) {
        document.getElementById('payment-dropdown-content')?.classList.remove('show');
    }
});

/**
 * Filter payment methods
 */
function filterPaymentMethods(query, containerId = 'payment-dropdown-content') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const items = container.querySelectorAll('.dropdown-item[data-method]');
    const sections = container.querySelectorAll('.dropdown-section');
    query = query.toLowerCase().trim();

    // If no query, show all items and sections
    if (!query) {
        items.forEach(item => item.style.display = 'flex');
        sections.forEach(section => section.style.display = 'block');
        return;
    }

    // Track which sections have visible items
    const sectionVisibility = new Map();
    sections.forEach(section => sectionVisibility.set(section, false));

    items.forEach(item => {
        // Get the method name from the displayed text (more reliable than config lookup)
        const nameSpan = item.querySelector('span:last-of-type');
        const methodName = nameSpan ? nameSpan.textContent.toLowerCase() : '';
        const methodCode = (item.dataset.method || '').toLowerCase();

        // Also try to get name from config as fallback
        let configName = '';
        const methodInfo = getPaymentMethodByCode(item.dataset.method);
        if (methodInfo) {
            configName = methodInfo.name.toLowerCase();
        }

        const matches = methodName.includes(query) || methodCode.includes(query) || configName.includes(query);
        item.style.display = matches ? 'flex' : 'none';

        // Mark section as visible if any item matches
        if (matches) {
            let prev = item.previousElementSibling;
            while (prev) {
                if (prev.classList.contains('dropdown-section')) {
                    sectionVisibility.set(prev, true);
                    break;
                }
                prev = prev.previousElementSibling;
            }
        }
    });

    // Hide/show sections based on whether they have visible items
    sections.forEach(section => {
        section.style.display = sectionVisibility.get(section) ? 'block' : 'none';
    });
}

function toggleAllPayments(checked) {
    document.querySelectorAll('input[name="payment"]').forEach(cb => cb.checked = checked);
}

function resetPaymentFilters() {
    document.querySelectorAll('input[name="payment"]').forEach(cb => cb.checked = false);
    document.querySelector('.dropdown-item input[type="checkbox"]').checked = true;
}

function applyPaymentFilters() {
    state.paymentFilters = Array.from(document.querySelectorAll('input[name="payment"]:checked')).map(cb => cb.value);
    togglePaymentDropdown();

    const badge = document.getElementById('filter-badge');
    const totalMethods = getAllPaymentMethods().length;
    if (state.paymentFilters.length > 0 && state.paymentFilters.length < totalMethods) {
        badge.textContent = state.paymentFilters.length;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }

    // Re-render orders with the new filter
    renderOrders();
}

// ============================================
// CREATE ORDER PAYMENT METHODS DROPDOWN
// ============================================

/**
 * Toggle Create Order payment methods dropdown
 */
function toggleCreatePaymentDropdown() {
    const dropdown = document.getElementById('create-payment-dropdown-content');
    const container = document.getElementById('create-payment-dropdown');
    dropdown.classList.toggle('show');
    container.classList.toggle('open');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('#create-payment-dropdown')) {
        document.getElementById('create-payment-dropdown-content')?.classList.remove('show');
        document.getElementById('create-payment-dropdown')?.classList.remove('open');
    }
});

/**
 * Filter Create Order payment methods
 */
function filterCreatePaymentMethods(query) {
    const items = document.querySelectorAll('#create-payment-methods-list .dropdown-item[data-method]');
    query = query.toLowerCase();
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? 'flex' : 'none';
    });
}

/**
 * Toggle all Create Order payment methods
 */
function toggleAllCreatePayments(checked) {
    document.querySelectorAll('input[name="create-payment"]').forEach(cb => {
        if (cb.value !== 'all') cb.checked = checked;
    });
    updateCreatePaymentDisplay();
}

/**
 * Reset Create Order payment selections
 */
function resetCreatePayments() {
    document.querySelectorAll('input[name="create-payment"]').forEach(cb => {
        cb.checked = cb.value === 'all';
    });
    updateCreatePaymentDisplay();
}

/**
 * Confirm Create Order payment selections
 */
function confirmCreatePayments() {
    toggleCreatePaymentDropdown();
}

/**
 * Update the payment display in Create Order dropdown trigger and tags
 */
function updateCreatePaymentDisplay() {
    const selected = Array.from(document.querySelectorAll('input[name="create-payment"]:checked'))
        .map(cb => cb.value);

    const trigger = document.getElementById('create-payment-selected');
    const tagsContainer = document.getElementById('create-selected-tags');

    // Update counter
    const counterEl = document.getElementById('create-payment-count');
    if (counterEl) {
        counterEl.textContent = selected.length;
        const counterContainer = document.getElementById('create-payment-counter');
        if (counterContainer) {
            counterContainer.classList.toggle('at-limit', selected.length >= 8);
            counterContainer.classList.toggle('has-selection', selected.length > 0);
        }
    }

    if (!trigger || !tagsContainer) return; // Elements not ready yet

    if (selected.length === 0) {
        trigger.textContent = 'Select payment methods (max 8)';
        tagsContainer.innerHTML = '';
    } else {
        trigger.textContent = `${selected.length} method${selected.length > 1 ? 's' : ''} selected`;

        // Build tags HTML using config for names/colors
        tagsContainer.innerHTML = selected.map(methodCode => {
            const methodInfo = getPaymentMethodByCode(methodCode);
            const name = methodInfo?.name || methodCode;
            const color = methodInfo?.color || '#666';
            return `
                <span class="method-tag" data-method="${methodCode}">
                    <span class="method-color" style="background:${color}"></span>
                    ${name}
                    <span class="remove-tag" onclick="removeCreatePaymentMethod('${methodCode}')">×</span>
                </span>
            `;
        }).join('');
    }
}

/**
 * Remove a selected payment method from Create Order
 */
function removeCreatePaymentMethod(method) {
    const checkbox = document.querySelector(`input[name="create-payment"][value="${method}"]`);
    if (checkbox) {
        checkbox.checked = false;
        updateCreatePaymentDisplay();
    }
}

// Add event listeners to update display when checkboxes change
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('input[name="create-payment"]').forEach(cb => {
        if (cb.value !== 'all') {
            cb.addEventListener('change', updateCreatePaymentDisplay);
        }
    });
});

/**
 * Get selected payment methods for Create Order
 */
function getSelectedCreatePaymentMethods() {
    const selected = Array.from(document.querySelectorAll('input[name="create-payment"]:checked'))
        .filter(cb => cb.value !== 'all')
        .map(cb => cb.value);

    // If none selected or all selected, return empty array (means all methods)
    const totalMethods = document.querySelectorAll('input[name="create-payment"]').length - 1;
    if (selected.length === 0 || selected.length === totalMethods) {
        return [];
    }
    return selected;
}

function refreshOrders() {
    loadOrders();
}

// ============================================
// MODAL HANDLERS
// ============================================

function openModal(id) {
    document.getElementById(id).classList.add('show');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

/**
 * Show create order modal
 */
function showCreateOrder() {
    // Sync state.side with current toggle state (Issue 5: fix stale side)
    const buyBtn = document.getElementById('btn-buy');
    const sellBtn = document.getElementById('btn-sell');
    if (buyBtn && sellBtn) {
        state.side = buyBtn.classList.contains('active') ? 'buy' : 'sell';
    }
    console.log('[DEBUG] showCreateOrder - state.side:', state.side);

    const asset = getAssetInfo(state.selectedAsset);
    const balance = getBalance(state.selectedAsset);
    const isBuy = state.side === 'buy';

    // Set default values
    document.getElementById('create-asset').value = state.selectedAsset;
    document.getElementById('create-balance').textContent = `Available: ${formatAmountFromGroth(balance.available)} ${asset.symbol}`;

    // Update order type label and action text for Buy vs Sell
    const orderTypeEl = document.getElementById('create-order-type');
    if (orderTypeEl) orderTypeEl.textContent = isBuy ? 'BUY' : 'SELL';

    const actionLabel = document.getElementById('create-action-label');
    if (actionLabel) actionLabel.textContent = isBuy ? 'Amount to acquire:' : 'Amount to offer:';

    // Add buy/sell mode class to modal for styling
    const modal = document.getElementById('create-order-modal');
    if (modal) {
        modal.classList.remove('buy-mode', 'sell-mode');
        modal.classList.add(isBuy ? 'buy-mode' : 'sell-mode');
    }

    // Render saved payment methods as selectable options
    renderCreateOrderPaymentMethods();

    updateCreateOrderSummary();
    openModal('create-order-modal');
}

/**
 * Render payment methods in create order modal - shows ALL available methods
 */
function renderCreateOrderPaymentMethods() {
    const container = document.getElementById('create-payment-methods-list');
    if (!container) return;

    const allMethods = getAllPaymentMethods();

    // Group methods by type
    const fiatMethods = allMethods.filter(m => m.type === 'fiat');
    const cryptoMethods = allMethods.filter(m => m.type === 'crypto');
    const otherMethods = allMethods.filter(m => !['fiat', 'crypto'].includes(m.type));

    // NOTE: Payment methods are NOT checked by default
    // Users must explicitly select which payment methods they accept
    let html = `
        <label class="dropdown-item select-all-item">
            <input type="checkbox" name="create-payment-all" onchange="toggleAllCreatePayments(this.checked)">
            <span>All Payment Methods</span>
        </label>
    `;

    if (fiatMethods.length > 0) {
        html += '<div class="dropdown-section">POPULAR</div>';
        for (const method of fiatMethods) {
            html += `
                <label class="dropdown-item" data-method="${method.code}">
                    <span class="method-color-bar" style="background:${method.color || '#3b82f6'}"></span>
                    <input type="checkbox" name="create-payment" value="${method.code}">
                    <span>${method.name}</span>
                </label>
            `;
        }
    }

    if (cryptoMethods.length > 0) {
        html += '<div class="dropdown-section">CRYPTO</div>';
        for (const method of cryptoMethods) {
            html += `
                <label class="dropdown-item crypto-method" data-method="${method.code}">
                    <span class="method-color-bar" style="background:${method.color || '#f59e0b'}"></span>
                    <input type="checkbox" name="create-payment" value="${method.code}">
                    <span>${method.name}</span>
                </label>
            `;
        }
    }

    if (otherMethods.length > 0) {
        html += '<div class="dropdown-section">OTHER</div>';
        for (const method of otherMethods) {
            html += `
                <label class="dropdown-item" data-method="${method.code}">
                    <span class="method-color-bar" style="background:${method.color || '#666'}"></span>
                    <input type="checkbox" name="create-payment" value="${method.code}">
                    <span>${method.name}</span>
                </label>
            `;
        }
    }

    container.innerHTML = html;

    // Add change listeners
    container.querySelectorAll('input[name="create-payment"]').forEach(cb => {
        cb.addEventListener('change', () => {
            updateCreatePaymentDisplay();
            // Update "select all" checkbox
            const allCheckbox = container.querySelector('input[name="create-payment-all"]');
            const methodCheckboxes = container.querySelectorAll('input[name="create-payment"]');
            const allChecked = Array.from(methodCheckboxes).every(c => c.checked);
            if (allCheckbox) allCheckbox.checked = allChecked;
        });
    });

    updateCreatePaymentDisplay();
}

/**
 * Handle payment method selection change in create order
 */
function onCreatePaymentMethodChange() {
    // Update visual selection state
    document.querySelectorAll('.saved-method-option').forEach(option => {
        const checkbox = option.querySelector('input[type="checkbox"]');
        if (checkbox.checked) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
}

/**
 * Open payment methods manager from create order modal
 * Re-renders the create order payment methods when closed
 */
function openPaymentMethodsFromCreateOrder() {
    // Close create order modal temporarily
    closeModal('create-order-modal');

    // Open payment methods manager
    showPaymentMethodsManager();

    // Add a one-time listener to re-open create order when payment methods modal closes
    const paymentModal = document.getElementById('payment-methods-modal');
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.attributeName === 'class' && !paymentModal.classList.contains('show')) {
                // Payment modal closed, re-open create order with updated methods
                observer.disconnect();
                setTimeout(() => {
                    showCreateOrder();
                }, 200);
                break;
            }
        }
    });
    observer.observe(paymentModal, { attributes: true });
}

/**
 * Get payment details from selected saved methods for order creation
 */
function getSelectedPaymentDetails() {
    const paymentMethods = Array.from(document.querySelectorAll('input[name="create-payment"]:checked')).map(cb => cb.value);
    const detailsLines = [];

    paymentMethods.forEach(methodId => {
        const saved = state.savedPaymentAccounts[methodId];
        const methodName = getPaymentMethodName(methodId);
        if (saved && saved.accountInfo) {
            detailsLines.push(`[${methodName}]`);
            detailsLines.push(saved.accountInfo);
            detailsLines.push('');
        }
    });

    return detailsLines.join('\n').trim();
}

/**
 * Save payment credentials from current form
 */
function savePaymentCredentials(methodId, accountInfo) {
    ArweaveStorage.savePaymentCredentials(methodId, {
        accountInfo: accountInfo,
        methodName: getPaymentMethodName(methodId)
    });
    state.savedPaymentAccounts = ArweaveStorage.getPaymentCredentials();
    console.log('Saved payment credentials for:', methodId);
}

// Note: Payment method checkbox listeners are added dynamically in renderCreateOrderPaymentMethods()

/**
 * Update create order summary
 */
function updateCreateOrderSummary() {
    const amount = parseFloat(document.getElementById('create-amount').value) || 0;
    const price = parseFloat(document.getElementById('create-price').value) || 0;
    const assetId = parseInt(document.getElementById('create-asset').value);
    const asset = getAssetInfo(assetId);
    const currency = document.getElementById('create-currency').value;
    const isBuyOrder = state.side === 'buy';

    const total = amount * price;
    const deposit = amount * (P2P_CONFIG.securityDepositPct / 100);

    // Auto-calculate limits when amount and price are set
    if (total > 0) {
        const minLimitEl = document.getElementById('create-min-limit');
        const maxLimitEl = document.getElementById('create-max-limit');
        if (maxLimitEl) maxLimitEl.value = total.toFixed(2);
        if (minLimitEl) {
            const calculatedMin = Math.max(1, total * 0.1);
            minLimitEl.value = calculatedMin.toFixed(2);
        }
    }

    // Update currency addon labels for limits
    document.querySelectorAll('.form-row .addon').forEach(el => {
        el.textContent = currency;
    });

    // Update labels based on order type
    const sellingLabel = document.getElementById('summary-selling-label');
    const receiveLabel = document.getElementById('summary-receive-label');
    const totalLabel = document.getElementById('summary-total-label');

    if (sellingLabel && receiveLabel) {
        if (isBuyOrder) {
            sellingLabel.textContent = 'Acquiring:';
            receiveLabel.textContent = 'Fiat payment:';
        } else {
            sellingLabel.textContent = 'Offering:';
            receiveLabel.textContent = 'You receive:';
        }
    }

    // Update total locked label based on order type
    if (totalLabel) {
        totalLabel.textContent = isBuyOrder ? 'Bond in escrow:' : 'Locked in escrow:';
    }

    document.getElementById('summary-selling').textContent = `${formatAmount(amount, 2)} ${asset.symbol}`;
    document.getElementById('summary-receive').textContent = `${getCurrencySymbol(currency)}${total.toFixed(2)}`;
    document.getElementById('summary-deposit').textContent = `${formatAmount(deposit, 2)} ${asset.symbol}`;

    // For buy orders: only deposit is locked (buyer pays fiat, receives crypto)
    // For sell orders: amount + deposit is locked (seller sells crypto)
    const totalLocked = isBuyOrder ? deposit : (amount + deposit);
    document.getElementById('summary-total').textContent = `${formatAmount(totalLocked, 2)} ${asset.symbol}`;
}

// Add listeners for create order inputs
document.getElementById('create-amount')?.addEventListener('input', updateCreateOrderSummary);
document.getElementById('create-price')?.addEventListener('input', updateCreateOrderSummary);
document.getElementById('create-currency')?.addEventListener('change', updateCreateOrderSummary);
document.getElementById('create-asset')?.addEventListener('change', () => {
    updateBalanceDisplays();
    updateCreateOrderSummary();
});

/**
 * Submit create order
 */
async function submitCreateOrder() {
    const amount = parseFloat(document.getElementById('create-amount').value);
    const price = parseFloat(document.getElementById('create-price').value);
    const assetId = parseInt(document.getElementById('create-asset').value);
    const currency = document.getElementById('create-currency').value;
    const minLimit = parseFloat(document.getElementById('create-min-limit').value);
    const maxLimit = parseFloat(document.getElementById('create-max-limit').value);
    const termsAccepted = document.getElementById('create-terms').checked;

    const asset = getAssetInfo(assetId);
    const balance = getBalance(assetId);

    // Validation
    if (!amount || amount <= 0) {
        showError('Please enter a valid amount');
        return;
    }

    if (!price || price <= 0) {
        showError('Please enter a valid price');
        return;
    }

    const totalNeeded = amount + (amount * P2P_CONFIG.securityDepositPct / 100);
    if (totalNeeded * GROTH > balance.available) {
        showError(`Insufficient balance. You need ${formatAmount(totalNeeded, 2)} ${asset.symbol} (including deposit)`);
        return;
    }

    if (!termsAccepted) {
        showError('Please accept the terms');
        return;
    }

    const paymentMethods = Array.from(document.querySelectorAll('input[name="create-payment"]:checked')).map(cb => cb.value);
    if (paymentMethods.length === 0) {
        showError('Please select at least one payment method');
        return;
    }
    if (paymentMethods.length > 8) {
        showError('Maximum 8 payment methods allowed');
        return;
    }

    // NOTE: Payment details are NOT required at order creation time
    // The seller will share their payment details in the trade chat
    // This ensures privacy - details are only shared with the actual trade counterparty

    // Create order object
    // Note: In P2P, the order creator is the "maker"
    // - For SELL orders: maker is the seller (has crypto, wants fiat)
    // - For BUY orders: maker is the buyer (has fiat, wants crypto)
    const isBuyOrder = state.side === 'buy';
    console.log('[DEBUG] submitCreateOrder - isBuyOrder:', isBuyOrder, 'state.side:', state.side);
    const makerInfo = {
        address: state.myAddress,
        name: state.myAddress ? state.myAddress.substring(0, 8) + '...' : 'Anonymous'
    };

    const order = {
        type: isBuyOrder ? 'buy' : 'sell',
        asset: assetId,
        amount: amount,
        price: price,
        currency: currency,
        minLimit: minLimit,
        maxLimit: maxLimit,
        paymentMethods: paymentMethods,
        // Payment details are shared in chat, not stored with order
        // Set the correct role based on order type
        maker: makerInfo,
        seller: isBuyOrder ? null : makerInfo,  // Sell order: maker is seller
        buyer: isBuyOrder ? makerInfo : null     // Buy order: maker is buyer
    };

    // Calculate deposit
    const depositAmount = amount * (P2P_CONFIG.securityDepositPct / 100);

    // Show confirmation modal before transaction
    const actionText = isBuyOrder
        ? `You want to BUY ${formatAmount(amount, 2)} ${asset.symbol} and will pay ${getCurrencySymbol(currency)}${formatAmount(amount * price, 2)}`
        : `You want to SELL ${formatAmount(amount, 2)} ${asset.symbol} for ${getCurrencySymbol(currency)}${formatAmount(amount * price, 2)}`;

    showTransactionConfirmation({
        title: isBuyOrder ? 'Create Buy Order' : 'Create Sell Order',
        action: actionText,
        amount: isBuyOrder ? 0 : amount,  // Only lock crypto for sell orders
        asset: asset.symbol,
        deposit: depositAmount,  // Security deposit in FOMO
        depositAsset: 'FOMO',
        warning: isBuyOrder
            ? 'Your FOMO security deposit will be locked until the order is filled or cancelled. Blockchain confirmation takes ~60 seconds.'
            : 'Your crypto + security deposit will be locked in escrow. Blockchain confirmation takes ~60 seconds.',
        onConfirm: async () => {
            try {
                // Set order details
                order.side = isBuyOrder ? 'buy' : 'sell';
                order.status = 'active';
                order.createdAt = Date.now();

                // Set maker info with correct role naming
                const makerDetails = {
                    address: state.myAddress,
                    nickname: state.traderNickname || (state.myAddress ? state.myAddress.substring(0, 8) : 'Anonymous'),
                    trustScore: 100,
                    totalTrades: 0
                };
                order.maker = makerDetails;
                order.seller = isBuyOrder ? null : makerDetails;
                order.buyer = isBuyOrder ? makerDetails : null;

                // Show pending notification
                showToast('Submitting order to blockchain... This takes ~60 seconds', 'pending', 0);

                // CREATE ORDER ON SMART CONTRACT (primary source of truth)
                const onChainResult = await createOrderOnChain(order);
                if (onChainResult.success) {
                    order.id = onChainResult.orderId || String(Date.now());
                    order.onChainId = onChainResult.txid;
                    console.log('📤 Order created on-chain:', order.id, onChainResult.txid);
                } else {
                    throw new Error(onChainResult.error || 'Failed to create order on contract');
                }

                // Add to state
                state.myOrders.push(order);

                showSuccess('Order created on smart contract!');
                closeModal('create-order-modal');
                loadOrders();

            } catch (error) {
                console.error('Order creation failed:', error);
                showError(error.message || 'Failed to create order');
            }
        }
    });
}

/**
 * Open trade modal
 */
function openTradeModal(orderId) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) {
        showError('Order not found');
        return;
    }

    // Check if order is available for trading
    if (order.status === 'in_trade') {
        showError('This order already has an active trade. Please wait or choose another order.');
        return;
    }

    if (order.status !== 'active') {
        showError('This order is no longer available.');
        return;
    }

    if (order.amount <= 0) {
        showError('This order has no remaining amount available.');
        return;
    }

    state.selectedOrder = order;
    const asset = getAssetInfo(order.asset);

    // Determine if user is buying or selling
    // order.type === 'sell' means it's a sell order, so user accepting it is BUYING
    // order.type === 'buy' means it's a buy order, so user accepting it is SELLING
    const isUserBuying = order.type === 'sell';
    const counterparty = isUserBuying ? (order.seller || {}) : (order.buyer || {});

    // Get counterparty data with proper fallbacks for contract data
    const counterpartyName = counterparty.name || shortenAddress(counterparty.address) || 'Unknown';
    const trustScore = counterparty.trustScore || counterparty.trust || counterparty.trust_score || 50;
    const totalTrades = counterparty.totalTrades || counterparty.trades || counterparty.total_trades || 0;
    const avgTime = counterparty.avgReleaseTime || counterparty.avg_release_time || 15;

    // Update modal header to show Buy or Sell
    const modalHeader = document.querySelector('#trade-modal .modal-header h2');
    if (modalHeader) {
        modalHeader.innerHTML = `${isUserBuying ? 'Buy' : 'Sell'} <span id="trade-asset-name">${asset.symbol}</span>`;
    }

    // Update input labels based on action
    const payLabel = document.querySelector('#trade-modal .trade-input-group:first-child label');
    const receiveLabel = document.querySelector('#trade-modal .trade-input-group:last-child label');
    if (payLabel) payLabel.textContent = isUserBuying ? 'I want to pay:' : 'I want to receive:';
    if (receiveLabel) receiveLabel.textContent = isUserBuying ? 'I will receive:' : 'I will send:';

    // Populate modal
    document.getElementById('trade-asset-name').textContent = asset.symbol;
    document.getElementById('trade-avatar').textContent = (counterpartyName.charAt(0) || '?').toUpperCase();
    document.getElementById('trade-seller-name').textContent = counterpartyName;
    document.getElementById('trade-trust').textContent = `${trustScore}%`;
    document.getElementById('trade-count').textContent = `${totalTrades} trades`;
    document.getElementById('trade-time').textContent = `~${avgTime}m`;

    document.getElementById('trade-price').textContent = `${getCurrencySymbol(order.currency)}${formatPrice(order.price)} per ${asset.symbol}`;
    document.getElementById('trade-limits').textContent = `${order.minLimit} - ${order.maxLimit.toLocaleString()} ${order.currency}`;
    document.getElementById('trade-payment').textContent = order.paymentMethods.map(pm => getPaymentMethodName(pm)).join(', ');
    document.getElementById('trade-fee').textContent = `${P2P_CONFIG.tradeFee}%`;
    document.getElementById('trade-currency').textContent = order.currency;
    document.getElementById('trade-receive-asset').textContent = asset.symbol;

    // Calculate deposit needed
    const minAmount = order.minLimit / order.price;
    const depositNeeded = minAmount * (P2P_CONFIG.securityDepositPct / 100);
    document.getElementById('trade-deposit').textContent = `${formatAmount(depositNeeded, 2)} ${asset.symbol}`;

    // Clear inputs
    document.getElementById('trade-pay-amount').value = '';
    document.getElementById('trade-receive-amount').value = '';
    document.getElementById('trade-agree-time').checked = false;
    document.getElementById('trade-agree-deposit').checked = false;

    // Update checkbox labels based on buy/sell
    const timeCheckboxLabel = document.querySelector('#trade-agree-time + span');
    const depositCheckboxLabel = document.querySelector('#trade-agree-deposit + span');
    if (timeCheckboxLabel) {
        timeCheckboxLabel.textContent = isUserBuying
            ? 'I agree to complete payment within 30 minutes'
            : 'I agree to release crypto within 30 minutes of payment confirmation';
    }
    if (depositCheckboxLabel) {
        depositCheckboxLabel.textContent = isUserBuying
            ? "I understand my deposit is forfeited if I don't pay"
            : "I understand my deposit is forfeited if I don't release crypto";
    }

    // Update submit button text
    const submitBtn = document.getElementById('trade-submit');
    if (submitBtn) {
        submitBtn.textContent = isUserBuying ? 'Buy Now' : 'Sell Now';
    }

    openModal('trade-modal');
}

function calculateTradeReceive() {
    if (!state.selectedOrder) return;
    const order = state.selectedOrder;
    const asset = getAssetInfo(order.asset);
    const payAmount = parseFloat(document.getElementById('trade-pay-amount').value) || 0;
    const receiveAmount = payAmount / order.price;
    document.getElementById('trade-receive-amount').value = formatAmount(receiveAmount, 2);

    // Update security deposit display (10% of receive amount)
    const depositNeeded = receiveAmount * (P2P_CONFIG.securityDepositPct / 100);
    document.getElementById('trade-deposit').textContent = `${formatAmount(depositNeeded, 4)} ${asset.symbol}`;
}

/**
 * Start trade
 */
async function startTrade() {
    if (!state.selectedOrder) return;

    const payAmount = parseFloat(document.getElementById('trade-pay-amount').value);
    const agreeTime = document.getElementById('trade-agree-time').checked;
    const agreeDeposit = document.getElementById('trade-agree-deposit').checked;
    const order = state.selectedOrder;

    // Validation
    if (!payAmount || payAmount < order.minLimit) {
        showError(`Minimum amount is ${order.minLimit} ${order.currency}`);
        return;
    }

    if (payAmount > order.maxLimit) {
        showError(`Maximum amount is ${order.maxLimit} ${order.currency}`);
        return;
    }

    if (!agreeTime || !agreeDeposit) {
        showError('Please agree to the terms');
        return;
    }

    // Check balance for deposit
    const receiveAmount = payAmount / order.price;
    const depositNeeded = receiveAmount * (P2P_CONFIG.securityDepositPct / 100);
    const balance = getBalance(order.asset);
    const asset = getAssetInfo(order.asset);

    if (depositNeeded * GROTH > balance.available) {
        showError(`Insufficient balance for deposit. Need ${formatAmount(depositNeeded, 2)} ${asset.symbol}`);
        return;
    }

    // Get payment method name
    const paymentMethodName = order.paymentMethods.map(pm =>
        getPaymentMethodName(pm)
    ).join(', ');

    // Show confirmation modal before executing trade
    showTransactionConfirmation({
        title: 'Accept Trade',
        action: `Buy ${formatAmount(receiveAmount, 4)} ${asset.symbol}`,
        fiatAmount: payAmount,
        fiatCurrency: order.currency,
        paymentMethod: paymentMethodName,
        amount: 0, // No direct crypto spend, only deposit
        asset: asset.symbol,
        deposit: depositNeeded,
        depositAsset: asset.symbol,
        warning: `Your ${P2P_CONFIG.securityDepositPct}% security deposit will be locked until the trade completes.`,
        onConfirm: async () => {
            // Accept order on-chain (contract is source of truth)
            const onChainResult = await acceptOrderOnChain(order.id, receiveAmount);

            if (onChainResult.success) {
                closeModal('trade-modal');
                // Show active trade using contract data
                showActiveTrade(order, payAmount, {
                    id: onChainResult.tradeId || Date.now(),
                    orderId: order.id,
                    amount: receiveAmount,
                    payAmount: payAmount,
                    status: 'pending'
                });

                // Send Telegram notification to seller
                sendTelegramNotification('tradeAccepted', {
                    orderId: order.id,
                    amount: receiveAmount,
                    asset: asset.symbol,
                    counterparty: state.myAddress
                });
            } else {
                showError(onChainResult.error || 'Failed to accept trade on contract');
            }
        }
    });
}

/**
 * Show active trade view
 */
function showActiveTrade(order, payAmount, trade) {
    const asset = getAssetInfo(order.asset);
    const receiveAmount = payAmount / order.price;

    state.activeTrade = {
        id: trade?.id || generateTradeId(),
        order: order,
        payAmount: payAmount,
        receiveAmount: receiveAmount,
        status: 'awaiting_payment',
        startedAt: Date.now()
    };

    // Update modal content
    document.getElementById('active-trade-id').textContent = state.activeTrade.id;
    updateTradeStatusUI('awaiting_payment', 'Awaiting Payment');
    document.getElementById('active-trade-role').textContent = 'BUYING';
    document.getElementById('active-trade-amount').textContent = `${formatAmount(receiveAmount, 2)} ${asset.symbol}`;
    document.getElementById('active-trade-fiat').textContent = `${getCurrencySymbol(order.currency)}${payAmount.toFixed(2)} ${order.currency}`;

    document.getElementById('active-trader-avatar').textContent = order.seller.name.charAt(0);
    document.getElementById('active-trader-name').textContent = order.seller.name;
    document.getElementById('active-trader-trust').textContent = `${order.seller.trustScore || order.seller.trust || 50}% | ${order.seller.totalTrades || order.seller.trades || 0} trades`;

    // Payment method name
    const paymentMethodName = order.paymentMethods.map(pm => getPaymentMethodName(pm)).join(', ');
    document.getElementById('active-payment-method').textContent = paymentMethodName;
    document.getElementById('active-pay-amount').textContent = `${getCurrencySymbol(order.currency)}${payAmount.toFixed(2)} ${order.currency}`;
    document.getElementById('active-reference').textContent = `BEAM-${state.activeTrade.id}`;

    // Populate seller's payment details
    // Try to get from order.paymentInfo, order.seller.paymentInfo, or order.paymentDetails
    const paymentInfo = order.paymentInfo || order.seller?.paymentInfo || order.paymentDetails || null;

    if (paymentInfo) {
        // Parse payment info (could be string or object)
        const info = typeof paymentInfo === 'string' ? parsePaymentInfoString(paymentInfo) : paymentInfo;
        document.getElementById('active-bank-name').textContent = info.bankName || info.bank || paymentMethodName;
        document.getElementById('active-account').textContent = info.accountNumber || info.account || 'See instructions below';
        document.getElementById('active-holder-name').textContent = info.holderName || info.name || order.seller.name;
    } else {
        // Fallback - show seller address as reference and method name
        document.getElementById('active-bank-name').textContent = paymentMethodName;
        document.getElementById('active-account').textContent = `Seller: ${order.seller.address.slice(0, 16)}...`;
        document.getElementById('active-holder-name').textContent = order.seller.name;
    }

    startTradeTimer();
    openModal('active-trade-modal');
}

/**
 * Parse payment info string into structured object
 */
function parsePaymentInfoString(infoStr) {
    const info = {};
    const lines = infoStr.split('\n');
    lines.forEach(line => {
        const lower = line.toLowerCase();
        if (lower.includes('bank:')) {
            info.bankName = line.split(':').slice(1).join(':').trim();
        } else if (lower.includes('account') && (lower.includes('name') || lower.includes('holder'))) {
            info.holderName = line.split(':').slice(1).join(':').trim();
        } else if (lower.includes('account') && lower.includes('number')) {
            info.accountNumber = line.split(':').slice(1).join(':').trim();
        } else if (lower.includes('account:')) {
            info.accountNumber = line.split(':').slice(1).join(':').trim();
        } else if (lower.includes('name:')) {
            info.holderName = line.split(':').slice(1).join(':').trim();
        }
    });
    return info;
}

function generateTradeId() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

let timerInterval = null;

function startTradeTimer() {
    if (timerInterval) clearInterval(timerInterval);

    const deadline = Date.now() + P2P_CONFIG.paymentTimeout;

    timerInterval = setInterval(() => {
        const remaining = deadline - Date.now();

        if (remaining <= 0) {
            clearInterval(timerInterval);
            document.getElementById('active-trade-timer').textContent = 'Time expired!';
            document.getElementById('active-trade-progress').style.width = '0%';
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        document.getElementById('active-trade-timer').textContent = `Time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`;

        const progress = (remaining / P2P_CONFIG.paymentTimeout) * 100;
        document.getElementById('active-trade-progress').style.width = `${progress}%`;
    }, 1000);
}

/**
 * Update trade status with proper CSS theming
 * Sets both the text content and data-status attribute for status-specific styling
 */
function updateTradeStatusUI(status, label) {
    const statusEl = document.getElementById('active-trade-status');
    const bannerEl = document.getElementById('trade-status-banner');

    if (statusEl) {
        statusEl.textContent = label || getTradeStatusLabel(status);
    }

    if (bannerEl) {
        // Set data-status for CSS theming
        bannerEl.setAttribute('data-status', status);

        // Update status icon based on status
        const iconEl = bannerEl.querySelector('.status-icon svg');
        if (iconEl) {
            const icons = {
                'awaiting_payment': `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`,
                'payment_sent': `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
                'seller_confirmed': `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
                'completed': `<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>`,
                'disputed': `<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>`
            };
            iconEl.innerHTML = icons[status] || icons['awaiting_payment'];
        }
    }
}

/**
 * Get human-readable label for trade status
 */
function getTradeStatusLabel(status) {
    const labels = {
        'awaiting_payment': '⏳ Awaiting Fiat Transfer',
        'payment_sent': '📤 Payment Sent — Pending Verification',
        'seller_confirmed': '✅ Verified — Releasing from Escrow',
        'completed': '🎉 Trade Complete!',
        'disputed': '⚠️ Under Arbitration',
        'cancelled': '❌ Cancelled',
        'refunded': '↩️ Refunded to Escrow'
    };
    return labels[status] || status;
}

function copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    navigator.clipboard.writeText(el.textContent).then(() => {
        const btn = el.nextElementSibling;
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = orig;
                btn.classList.remove('copied');
            }, 1500);
        }
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = el.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        const btn = el.nextElementSibling;
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = orig;
                btn.classList.remove('copied');
            }, 1500);
        }
    });
}

function copyReference() {
    const el = document.getElementById('active-reference');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
        showToast('Reference code copied!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

async function markPaymentSent() {
    if (!state.activeTrade) {
        showError('No active trade found');
        return;
    }

    const trade = state.activeTrade;
    const tradeId = trade.id;

    console.log('[markPaymentSent] Trade ID:', tradeId, 'Status:', trade.status);

    // Show loading overlay with countdown
    showTransactionLoading({
        title: 'Confirming Payment',
        message: 'Broadcasting transaction to the BEAM blockchain...',
        countdown: 60,
        type: 'payment'
    });

    try {
        // Call contract to mark payment sent
        const result = await markPaymentSentOnChain(tradeId);
        console.log('[markPaymentSent] Contract result:', JSON.stringify(result));

        if (result.success) {
            console.log('[markPaymentSent] TX confirmed:', result.txid);

            // Update local state only after tx verified
            state.activeTrade.status = 'payment_sent';
            const myTrade = state.myTrades.find(t => String(t.id) === String(tradeId));
            if (myTrade) myTrade.status = 'payment_sent';

            updateTradeStatusUI('payment_sent');
            updateTradeTimeline('payment_sent');

            document.getElementById('active-trade-footer').innerHTML = `
                <button class="btn-secondary" onclick="openDispute()">Open Dispute</button>
                <span style="color: var(--text-muted); font-size: 14px;">Waiting for seller to confirm...</span>
            `;

            hideTransactionLoading();
            showSuccess('Payment marked as sent! Waiting for seller to confirm receipt.');

            sendTelegramNotification('paymentSent', {
                tradeId: trade.id,
                fiatAmount: trade.payAmount,
                currency: trade.order?.currency || 'USD',
                buyer: state.myAddress
            });
        } else {
            hideTransactionLoading();
            const errorMsg = result.error || 'Failed to mark payment sent';
            console.error('[markPaymentSent] Failed:', errorMsg);
            showError('Transaction failed: ' + errorMsg);

            // Restore footer button so user can retry
            const footer = document.getElementById('active-trade-footer');
            if (footer) {
                footer.innerHTML = `
                    <button class="btn-primary" onclick="markPaymentSent()">I've Paid - Notify Seller</button>
                    <button class="btn-secondary" onclick="openDispute()">Open Dispute</button>
                `;
            }
        }
    } catch (error) {
        hideTransactionLoading();
        console.error('[markPaymentSent] Exception:', error);
        showError('Transaction failed: ' + error.message);

        // Restore footer button so user can retry
        const footer = document.getElementById('active-trade-footer');
        if (footer) {
            footer.innerHTML = `
                <button class="btn-primary" onclick="markPaymentSent()">I've Paid - Notify Seller</button>
                <button class="btn-secondary" onclick="openDispute()">Open Dispute</button>
            `;
        }
    }
}

/**
 * BlockchainConfirmation - Production-grade loading overlay with countdown
 * Displays transaction processing state during blockchain confirmation
 */
const BlockchainConfirmation = {
    overlay: null,
    countdownInterval: null,

    /**
     * Show the confirmation overlay
     * @param {Object} options - Configuration options
     * @param {string} options.title - Main title text
     * @param {string} options.message - Description text
     * @param {number} options.countdown - Countdown duration in seconds
     * @param {string} options.type - Type: 'payment', 'claim', 'confirm', 'dispute'
     */
    show(options = {}) {
        const {
            title = 'Processing Transaction',
            message = 'Please wait while your transaction is being processed...',
            countdown = 60,
            type = 'default'
        } = options;

        // Create overlay if it doesn't exist
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.id = 'blockchain-confirmation-overlay';
            this.overlay.className = 'blockchain-confirmation';
            document.body.appendChild(this.overlay);
        }

        // Get type-specific icon and color
        const typeConfig = this._getTypeConfig(type);

        this.overlay.innerHTML = `
            <div class="blockchain-confirmation__container">
                <div class="blockchain-confirmation__icon blockchain-confirmation__icon--${type}">
                    ${typeConfig.icon}
                </div>

                <h2 class="blockchain-confirmation__title">${title}</h2>
                <p class="blockchain-confirmation__message">${message}</p>

                <div class="blockchain-confirmation__timer">
                    <div class="blockchain-confirmation__countdown">
                        <span class="blockchain-confirmation__countdown-value" id="bc-countdown-value">${countdown}</span>
                        <span class="blockchain-confirmation__countdown-unit">sec</span>
                    </div>
                    <div class="blockchain-confirmation__progress">
                        <div class="blockchain-confirmation__progress-track">
                            <div class="blockchain-confirmation__progress-bar" id="bc-progress-bar"></div>
                        </div>
                    </div>
                </div>

                <div class="blockchain-confirmation__steps">
                    <div class="blockchain-confirmation__step blockchain-confirmation__step--active">
                        <span class="blockchain-confirmation__step-dot"></span>
                        <span class="blockchain-confirmation__step-label">Signing</span>
                    </div>
                    <div class="blockchain-confirmation__step-connector"></div>
                    <div class="blockchain-confirmation__step">
                        <span class="blockchain-confirmation__step-dot"></span>
                        <span class="blockchain-confirmation__step-label">Broadcasting</span>
                    </div>
                    <div class="blockchain-confirmation__step-connector"></div>
                    <div class="blockchain-confirmation__step">
                        <span class="blockchain-confirmation__step-dot"></span>
                        <span class="blockchain-confirmation__step-label">Confirmed</span>
                    </div>
                </div>

                <p class="blockchain-confirmation__hint">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    Do not close this window during confirmation
                </p>

                <button class="blockchain-confirmation__dismiss" onclick="hideTransactionLoading()">
                    Dismiss
                </button>
            </div>
        `;

        this.overlay.classList.add('blockchain-confirmation--visible');
        this._startCountdown(countdown);
        this._animateSteps();
    },

    /**
     * Hide the confirmation overlay
     */
    hide() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        if (this.overlay) {
            this.overlay.classList.remove('blockchain-confirmation--visible');
        }
    },

    /**
     * Update the current step indicator
     * @param {number} step - Step number (1-3)
     */
    setStep(step) {
        if (!this.overlay) return;
        const steps = this.overlay.querySelectorAll('.blockchain-confirmation__step');
        const connectors = this.overlay.querySelectorAll('.blockchain-confirmation__step-connector');

        steps.forEach((stepEl, idx) => {
            stepEl.classList.remove('blockchain-confirmation__step--active', 'blockchain-confirmation__step--completed');
            if (idx < step - 1) {
                stepEl.classList.add('blockchain-confirmation__step--completed');
            } else if (idx === step - 1) {
                stepEl.classList.add('blockchain-confirmation__step--active');
            }
        });

        connectors.forEach((connector, idx) => {
            connector.classList.toggle('blockchain-confirmation__step-connector--completed', idx < step - 1);
        });
    },

    _getTypeConfig(type) {
        const configs = {
            payment: {
                icon: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>`
            },
            claim: {
                icon: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    <path d="M9 12l2 2 4-4"/>
                </svg>`
            },
            confirm: {
                icon: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>`
            },
            dispute: {
                icon: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>`
            },
            default: {
                icon: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>`
            }
        };
        return configs[type] || configs.default;
    },

    _startCountdown(duration) {
        const startTime = Date.now();

        this.countdownInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = Math.max(0, duration - elapsed);
            const progress = (elapsed / duration) * 100;

            const countdownEl = document.getElementById('bc-countdown-value');
            const progressBar = document.getElementById('bc-progress-bar');

            if (countdownEl) {
                countdownEl.textContent = remaining;
                if (remaining <= 10) {
                    countdownEl.classList.add('blockchain-confirmation__countdown-value--warning');
                }
            }

            if (progressBar) {
                progressBar.style.width = `${Math.min(100, progress)}%`;
            }

            if (remaining <= 0) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
        }, 100);
    },

    _animateSteps() {
        // Auto-advance steps for visual feedback
        setTimeout(() => this.setStep(2), 2000);
        setTimeout(() => this.setStep(3), 5000);
    }
};

// Backward-compatible wrapper functions
function showTransactionLoading(options = {}) {
    BlockchainConfirmation.show(options);
}

function hideTransactionLoading() {
    BlockchainConfirmation.hide();
}

function cancelActiveTrade() {
    if (!confirm('Cancel trade? You will lose your security deposit.')) return;

    if (timerInterval) clearInterval(timerInterval);
    state.activeTrade = null;
    closeModal('active-trade-modal');
    showError('Trade cancelled. Security deposit forfeited.');
}

function showMyTrades() {
    // Load trades data first, then open modal
    loadMyTrades();
    openModal('my-trades-modal');
}

// showTradesTab is defined at line ~6191 with full tab switching logic

function showEscrowStaking() {
    updateEscrowStats();
    openModal('escrow-modal');
}

async function updateEscrowStats() {
    const balance = getBalance(174);
    document.getElementById('escrow-available').textContent = formatAmountFromGroth(balance.available);

    // Set loading state
    document.getElementById('escrow-total-staked').textContent = '...';
    document.getElementById('escrow-stakers').textContent = '...';
    document.getElementById('escrow-apy').textContent = '...';

    try {
        // Fetch escrow stats from contract
        const statsArgs = `role=manager,action=view,cid=${P2P_ESCROW_CID}`;
        const statsResult = await invokeContract(statsArgs, false);

        // Fetch escrow list
        const escrowsArgs = `role=manager,action=view_escrows,cid=${P2P_ESCROW_CID}`;
        const escrowsResult = await invokeContract(escrowsArgs, false);

        // Calculate total staked and staker count
        let totalStaked = 0;
        let stakerCount = 0;

        if (escrowsResult && escrowsResult.escrows && Array.isArray(escrowsResult.escrows)) {
            stakerCount = escrowsResult.escrows.length;
            totalStaked = escrowsResult.escrows.reduce((sum, e) => sum + (e.amount || e.stake || 0), 0);
        }

        // Update UI with real data
        document.getElementById('escrow-total-staked').textContent = formatAmountFromGroth(totalStaked);
        document.getElementById('escrow-stakers').textContent = stakerCount.toString();

        // Calculate estimated APY based on fee pool and total staked
        // APY = (annual_fees / total_staked) * 100
        const totalFees = statsResult?.total_fees || statsResult?.fee_pool || 0;
        if (totalStaked > 0 && totalFees > 0) {
            // Estimate annual based on current fees (rough estimate)
            const estimatedApy = Math.min(((totalFees * 12) / totalStaked) * 100, 100);
            document.getElementById('escrow-apy').textContent = `~${estimatedApy.toFixed(1)}%`;
        } else {
            document.getElementById('escrow-apy').textContent = 'N/A';
        }

        // Check if user has a stake
        if (state.myPublicKey) {
            const myStakeArgs = `role=user,action=view_escrow_stake,cid=${P2P_ESCROW_CID},pk=${state.myPublicKey}`;
            const myStakeResult = await invokeContract(myStakeArgs, false);

            if (myStakeResult && myStakeResult.stake && myStakeResult.stake.amount > 0) {
                document.getElementById('my-stake-info').style.display = 'block';
                document.getElementById('my-staked-amount').textContent = `${formatAmountFromGroth(myStakeResult.stake.amount)} FOMO`;
            } else {
                document.getElementById('my-stake-info').style.display = 'none';
            }
        }

    } catch (e) {
        console.error('Failed to load escrow stats:', e);
        document.getElementById('escrow-total-staked').textContent = '0';
        document.getElementById('escrow-stakers').textContent = '0';
        document.getElementById('escrow-apy').textContent = 'N/A';
    }
}

async function stakeForEscrow() {
    const amount = parseInt(document.getElementById('escrow-stake-amount').value);

    if (!amount || amount < P2P_CONFIG.minEscrowStake) {
        showError(`Minimum stake is ${P2P_CONFIG.minEscrowStake.toLocaleString()} FOMO`);
        return;
    }

    const balance = getBalance(174);
    if (amount * GROTH > balance.available) {
        showError('Insufficient FOMO balance');
        return;
    }

    // Show confirmation modal before staking
    showTransactionConfirmation({
        title: 'Stake as Escrow',
        action: `Stake ${amount.toLocaleString()} FOMO to become an escrow arbitrator`,
        amount: amount,
        asset: 'FOMO',
        deposit: 0,
        warning: `Your FOMO will be locked for ${P2P_CONFIG.escrowLockDays || 180} days. You'll earn rewards from resolved disputes.`,
        onConfirm: async () => {
            // Call escrow contract
            const result = await stakeForEscrowOnChain(amount);

            if (result.success) {
                showSuccess(`Staked ${amount.toLocaleString()} FOMO! You are now an escrow arbitrator.`);
                document.getElementById('my-stake-info').style.display = 'block';
                document.getElementById('my-staked-amount').textContent = `${amount.toLocaleString()} FOMO`;
                closeModal('escrow-modal');
            } else {
                showError(result.error || 'Failed to stake FOMO');
            }
        }
    });
}

function showHelp() {
    openModal('help-modal');
}

/**
 * Toggle FAQ accordion item
 */
function toggleFaq(element) {
    const faqItem = element.closest('.faq-item');
    if (faqItem) {
        faqItem.classList.toggle('open');
    }
}

// ============================================
// PRIVATE E2E ENCRYPTED CHAT SYSTEM
// BEAM Wallet Signature + ECDH + AES-GCM
// ============================================

/**
 * TradeChat - True End-to-End Encrypted P2P Chat
 *
 * Security Architecture:
 * 1. Ephemeral ECDH keypair generated per trade (forward secrecy)
 * 2. ECDH public key signed with BEAM wallet (authentication)
 * 3. Signatures verified via wallet-api verify_signature
 * 4. Shared secret via ECDH → AES-256-GCM encryption
 *
 * Only buyer & seller can:
 * - Generate valid signatures (wallet private key)
 * - Compute shared secret (ECDH private key)
 * - Decrypt messages (AES key from shared secret)
 */
const TradeChat = {
    messages: [],
    tradeId: null,
    myKeyPair: null,
    mySignature: null,     // Wallet signature of my ECDH public key
    peerPublicKey: null,
    peerVerified: false,   // Peer's signature verified
    sharedKey: null,
    gunInstance: null,
    isInitialized: false,

    /**
     * Initialize chat for a trade
     */
    async init(trade) {
        this.tradeId = trade.id;
        this.messages = [];
        this.isInitialized = false;
        this.peerVerified = false;

        // Generate or load ephemeral ECDH keypair
        await this._generateKeyPair();

        // Sign our public key with BEAM wallet
        await this._signPublicKey();

        // Init Gun.js and exchange signed keys
        await this._initKeyExchange();

        // Load messages
        this._loadFromStorage();

        // Render
        this._render();
    },

    /**
     * Generate ephemeral ECDH keypair for this trade
     */
    async _generateKeyPair() {
        const savedKey = localStorage.getItem(`trade_keypair_${this.tradeId}`);
        if (savedKey) {
            try {
                const keyData = JSON.parse(savedKey);
                this.myKeyPair = {
                    privateKey: await crypto.subtle.importKey(
                        'jwk', keyData.privateKey,
                        { name: 'ECDH', namedCurve: 'P-256' },
                        true, ['deriveKey']
                    ),
                    publicKey: await crypto.subtle.importKey(
                        'jwk', keyData.publicKey,
                        { name: 'ECDH', namedCurve: 'P-256' },
                        true, []
                    )
                };
                this.mySignature = keyData.signature || null;
                return;
            } catch (e) {
                console.warn('Failed to load saved keypair:', e);
            }
        }

        // Generate new keypair
        this.myKeyPair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true, ['deriveKey']
        );

        // Save for page refresh
        const privateKeyJwk = await crypto.subtle.exportKey('jwk', this.myKeyPair.privateKey);
        const publicKeyJwk = await crypto.subtle.exportKey('jwk', this.myKeyPair.publicKey);
        localStorage.setItem(`trade_keypair_${this.tradeId}`, JSON.stringify({
            privateKey: privateKeyJwk,
            publicKey: publicKeyJwk
        }));
    },

    /**
     * Sign ECDH public key with BEAM wallet
     * This proves the key belongs to the real trader
     */
    async _signPublicKey() {
        if (this.mySignature) return; // Already signed

        try {
            const publicKeyJwk = await crypto.subtle.exportKey('jwk', this.myKeyPair.publicKey);
            const message = `BEAM-P2P-CHAT:${this.tradeId}:${JSON.stringify(publicKeyJwk)}`;

            // Call wallet-api sign_message
            // Note: key_material comes from trader's contract registration
            const response = await fetch('/api/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'sign_message',
                    params: {
                        message: message,
                        key_material: state.myKeyMaterial || state.myAddress // Fallback to address
                    }
                })
            });

            const result = await response.json();
            if (result.result?.signature) {
                this.mySignature = result.result.signature;

                // Save signature with keypair
                const saved = JSON.parse(localStorage.getItem(`trade_keypair_${this.tradeId}`));
                saved.signature = this.mySignature;
                localStorage.setItem(`trade_keypair_${this.tradeId}`, JSON.stringify(saved));
            }
        } catch (e) {
            console.warn('Failed to sign public key:', e);
            // Continue without signature - less secure but functional
        }
    },

    /**
     * Verify peer's signature on their ECDH public key
     */
    async _verifyPeerSignature(peerPublicKeyJwk, peerSignature, peerAddress) {
        if (!peerSignature) return false;

        try {
            const message = `BEAM-P2P-CHAT:${this.tradeId}:${JSON.stringify(peerPublicKeyJwk)}`;

            const response = await fetch('/api/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'verify_signature',
                    params: {
                        message: message,
                        public_key: peerAddress, // Peer's wallet public key
                        signature: peerSignature
                    }
                })
            });

            const result = await response.json();
            return result.result === true;
        } catch (e) {
            console.warn('Failed to verify peer signature:', e);
            return false;
        }
    },

    /**
     * Initialize Gun.js and exchange signed public keys
     */
    async _initKeyExchange() {
        if (typeof Gun === 'undefined') {
            console.warn('Gun.js not loaded');
            this.isInitialized = true;
            return;
        }

        try {
            this.gunInstance = Gun(['https://gun-manhattan.herokuapp.com/gun']);

            // Prepare my signed public key
            const myPublicKeyJwk = await crypto.subtle.exportKey('jwk', this.myKeyPair.publicKey);

            // Share signed public key
            const keyRoom = this.gunInstance.get(`beam-p2p-keys-${this.tradeId}`);
            keyRoom.get(state.myAddress).put({
                publicKey: JSON.stringify(myPublicKeyJwk),
                signature: this.mySignature || '',
                timestamp: Date.now()
            });

            // Listen for peer's signed public key
            keyRoom.map().on(async (data, senderAddress) => {
                if (!data || !data.publicKey || senderAddress === state.myAddress) return;
                if (this.peerPublicKey) return; // Already have peer key

                try {
                    const peerPublicKeyJwk = JSON.parse(data.publicKey);

                    // Verify signature if present
                    if (data.signature) {
                        this.peerVerified = await this._verifyPeerSignature(
                            peerPublicKeyJwk,
                            data.signature,
                            senderAddress
                        );
                    }

                    // Import peer's ECDH public key
                    this.peerPublicKey = await crypto.subtle.importKey(
                        'jwk', peerPublicKeyJwk,
                        { name: 'ECDH', namedCurve: 'P-256' },
                        true, []
                    );

                    // Derive shared secret
                    await this._deriveSharedKey();
                    this.isInitialized = true;
                    this._render();
                    this._loadFromStorage();
                    this._render();
                } catch (e) {
                    console.warn('Failed to process peer key:', e);
                }
            });

            // Listen for messages
            const chatRoom = this.gunInstance.get(`beam-p2p-chat-${this.tradeId}`);
            chatRoom.map().on(async (data, key) => {
                if (!data || !data.encrypted || !data.iv) return;
                if (this.messages.find(m => m.id === key)) return;

                try {
                    const decrypted = await this._decrypt(data.encrypted, data.iv);
                    if (decrypted) {
                        this.messages.push({
                            id: key,
                            sender: data.sender,
                            text: decrypted,
                            timestamp: data.timestamp,
                            type: data.type || 'text'
                        });
                        this.messages.sort((a, b) => a.timestamp - b.timestamp);
                        this._saveToStorage();
                        this._render();
                        this._scrollToBottom();
                    }
                } catch (e) {
                    // Waiting for key exchange
                }
            });

        } catch (e) {
            console.warn('Gun.js init failed:', e);
            this.isInitialized = true;
        }
    },

    /**
     * Derive AES key from ECDH shared secret
     */
    async _deriveSharedKey() {
        if (!this.myKeyPair || !this.peerPublicKey) return;

        this.sharedKey = await crypto.subtle.deriveKey(
            { name: 'ECDH', public: this.peerPublicKey },
            this.myKeyPair.privateKey,
            { name: 'AES-GCM', length: 256 },
            true,  // extractable - needed for dispute escrow access
            ['encrypt', 'decrypt']
        );
    },

    /**
     * Export chat encryption key for dispute resolution
     * Only call this when sharing with assigned escrows
     * @returns {string|null} Base64-encoded AES key
     */
    async exportChatKey() {
        if (!this.sharedKey) {
            console.warn('No shared key available to export');
            return null;
        }
        try {
            const keyData = await crypto.subtle.exportKey('raw', this.sharedKey);
            return btoa(String.fromCharCode(...new Uint8Array(keyData)));
        } catch (e) {
            console.error('Failed to export chat key:', e);
            return null;
        }
    },

    /**
     * Import chat encryption key (for escrows reviewing disputes)
     * @param {string} base64Key - Base64-encoded AES key from trader
     * @returns {boolean} Success
     */
    async importChatKey(base64Key) {
        try {
            const keyData = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
            this.sharedKey = await crypto.subtle.importKey(
                'raw',
                keyData,
                { name: 'AES-GCM', length: 256 },
                false,  // non-extractable after import
                ['encrypt', 'decrypt']
            );
            this.isInitialized = true;
            return true;
        } catch (e) {
            console.error('Failed to import chat key:', e);
            return false;
        }
    },

    /**
     * Fetch and decrypt full chat history from Gun.js
     * Used by escrows after importing the chat key
     * @param {string} tradeId - Trade ID to fetch messages for
     * @returns {Promise<Array>} Decrypted messages sorted by timestamp
     */
    async fetchChatHistory(tradeId) {
        return new Promise((resolve) => {
            if (!this.sharedKey) {
                console.warn('No shared key - cannot decrypt chat history');
                resolve([]);
                return;
            }

            if (typeof Gun === 'undefined') {
                console.warn('Gun.js not loaded');
                resolve([]);
                return;
            }

            const messages = [];
            const gun = this.gunInstance || Gun(['https://gun-manhattan.herokuapp.com/gun']);
            const chatRoom = gun.get(`beam-p2p-chat-${tradeId}`);

            chatRoom.map().once(async (data, key) => {
                if (!data || !data.encrypted || !data.iv) return;

                try {
                    const decrypted = await this._decrypt(data.encrypted, data.iv);
                    if (decrypted) {
                        messages.push({
                            id: key,
                            sender: data.sender,
                            text: decrypted,
                            timestamp: data.timestamp,
                            type: data.type || 'text'
                        });
                    }
                } catch (e) {
                    console.warn('Failed to decrypt message:', key, e);
                }
            });

            // Give Gun.js time to fetch all messages
            setTimeout(() => {
                messages.sort((a, b) => a.timestamp - b.timestamp);
                resolve(messages);
            }, 2000);
        });
    },

    /**
     * Encrypt with AES-GCM
     */
    async _encrypt(text) {
        if (!this.sharedKey) return { encrypted: btoa(text), iv: '' };

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = new TextEncoder().encode(text);

        const encryptedBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            this.sharedKey,
            data
        );

        return {
            encrypted: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
            iv: btoa(String.fromCharCode(...iv))
        };
    },

    /**
     * Decrypt with AES-GCM
     */
    async _decrypt(encryptedBase64, ivBase64) {
        if (!this.sharedKey) {
            try { return atob(encryptedBase64); } catch { return null; }
        }

        try {
            const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
            const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                this.sharedKey,
                encrypted
            );

            return new TextDecoder().decode(decryptedBuffer);
        } catch (e) {
            return null;
        }
    },

    _loadFromStorage() {
        const key = `trade_chat_${this.tradeId}`;
        const stored = localStorage.getItem(key);
        if (stored) {
            try { this.messages = JSON.parse(stored); }
            catch { this.messages = []; }
        }
    },

    _saveToStorage() {
        localStorage.setItem(`trade_chat_${this.tradeId}`, JSON.stringify(this.messages));
    },

    /**
     * Send a message
     */
    async send(text, type = 'text') {
        if (!text.trim()) return;

        const msg = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            sender: state.myAddress,
            text: text.trim(),
            timestamp: Date.now(),
            type
        };

        this.messages.push(msg);
        this._saveToStorage();
        this._render();
        this._scrollToBottom();

        if (this.gunInstance && this.sharedKey) {
            const { encrypted, iv } = await this._encrypt(msg.text);
            const chatRoom = this.gunInstance.get(`beam-p2p-chat-${this.tradeId}`);
            chatRoom.get(msg.id).put({
                sender: msg.sender,
                encrypted,
                iv,
                timestamp: msg.timestamp,
                type: msg.type
            });
        }

        const input = document.getElementById('chat-input');
        if (input) input.value = '';
    },

    /**
     * Render chat UI
     */
    _render() {
        const container = document.getElementById('trade-chat-messages');
        if (!container) return;

        let statusHtml;
        if (this.sharedKey && this.peerVerified) {
            statusHtml = '<span style="color:var(--success)">🔐 Verified & Encrypted</span>';
        } else if (this.sharedKey) {
            statusHtml = '<span style="color:var(--warning)">🔒 Encrypted (unverified peer)</span>';
        } else {
            statusHtml = '<span style="color:var(--text-muted)">⏳ Establishing secure connection...</span>';
        }

        // Show export key button when trade is in dispute
        const isDisputed = state.activeTrade?.status === 'Disputed';
        const exportKeyBtn = isDisputed && this.sharedKey ? `
            <button onclick="showExportKeyModal()" class="export-key-btn"
                style="margin-left: 8px; padding: 4px 10px; background: var(--warning); color: #000;
                       border: none; border-radius: 4px; font-size: 11px; font-weight: 500; cursor: pointer;
                       display: inline-flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
                Export Key for Escrow
            </button>
        ` : '';

        let html = `
            <div class="chat-system-msg" style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                ${statusHtml} — Private chat between trader wallets.
                ${exportKeyBtn}
            </div>
        `;

        // Add role-based system messages
        const isBuyer = state.activeTrade?.role === 'buyer';
        if (isBuyer) {
            html += `
                <div class="chat-message system-message">
                    <div class="message-content">
                        <span class="system-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="16" x2="12" y2="12"/>
                                <line x1="12" y1="8" x2="12.01" y2="8"/>
                            </svg>
                        </span>
                        📝 The seller should provide their payment details in this chat. Wait for their message before sending payment.
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="chat-message system-message">
                    <div class="message-content">
                        <span class="system-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="16" x2="12" y2="12"/>
                                <line x1="12" y1="8" x2="12.01" y2="8"/>
                            </svg>
                        </span>
                        📝 Please send your payment details to the buyer. They will complete the fiat transfer once they receive your instructions.
                    </div>
                </div>
            `;
        }

        for (const msg of this.messages) {
            const isMe = msg.sender === state.myAddress;
            const isSystem = msg.type === 'system';
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (isSystem) {
                html += `<div class="chat-system-msg">${escapeHtml(msg.text)}</div>`;
            } else {
                const senderLabel = isMe ? 'You' :
                    (msg.sender === state.activeTrade?.seller ? 'Seller' :
                    (msg.sender === state.activeTrade?.buyer ? 'Buyer' : 'Escrow'));

                html += `
                    <div class="chat-message ${isMe ? 'chat-mine' : 'chat-theirs'}">
                        <div class="chat-sender">${senderLabel}</div>
                        <div class="chat-bubble">
                            <p>${escapeHtml(msg.text).replace(/\n/g, '<br>')}</p>
                            <span class="chat-time">${time}</span>
                        </div>
                    </div>
                `;
            }
        }

        container.innerHTML = html;
    },

    _scrollToBottom() {
        const container = document.getElementById('trade-chat-messages');
        if (container) {
            setTimeout(() => container.scrollTop = container.scrollHeight, 100);
        }
    },

    destroy(removeKeys = false) {
        if (removeKeys) {
            localStorage.removeItem(`trade_keypair_${this.tradeId}`);
            localStorage.removeItem(`trade_chat_${this.tradeId}`);
        }
        this.messages = [];
        this.tradeId = null;
        this.myKeyPair = null;
        this.mySignature = null;
        this.peerPublicKey = null;
        this.peerVerified = false;
        this.sharedKey = null;
        this.isInitialized = false;
    }
};

// Simple wrapper functions
let chatMessages = [];
let chatPollingInterval = null;

function initTradeChat(tradeId) {
    if (state.activeTrade) {
        TradeChat.init(state.activeTrade);
    }
}

function renderChatMessages() {
    TradeChat._render();
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (input && input.value.trim()) {
        await TradeChat.send(input.value);
    }
}

function handleChatKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
}

function scrollChatToBottom() {
    TradeChat._scrollToBottom();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// ESCROW KEY SHARING FOR DISPUTES
// ============================================

/**
 * Show modal for exporting chat key (traders only)
 * Only shown when trade is in dispute
 */
async function showExportKeyModal() {
    if (!state.activeTrade || state.activeTrade.status !== 'Disputed') {
        showError('Chat key export is only available during active disputes');
        return;
    }

    const chatKey = await TradeChat.exportChatKey();
    if (!chatKey) {
        showError('Unable to export chat key. Chat may not be fully initialized.');
        return;
    }

    const modalHtml = `
        <div class="modal-overlay active" id="export-key-modal" onclick="if(event.target===this)closeModal('export-key-modal')">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                        </svg>
                        Export Chat Key for Dispute
                    </h3>
                    <button class="modal-close" onclick="closeModal('export-key-modal')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="warning-box" style="background: rgba(245, 158, 11, 0.1); border: 1px solid var(--warning); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                        <p style="color: var(--warning); font-weight: 500; margin: 0 0 8px 0;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 6px;">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            Security Warning
                        </p>
                        <p style="color: var(--text-secondary); margin: 0; font-size: 13px;">
                            This key allows decryption of all chat messages in this trade.
                            <strong>Only share this with the assigned escrow resolvers.</strong>
                            Never share publicly or with untrusted parties.
                        </p>
                    </div>

                    <label style="display: block; margin-bottom: 8px; color: var(--text-secondary); font-size: 13px;">
                        Chat Encryption Key (Base64)
                    </label>
                    <div style="position: relative;">
                        <textarea id="export-key-value" readonly
                            style="width: 100%; height: 80px; font-family: var(--font-mono); font-size: 12px;
                                   background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px;
                                   padding: 10px; color: var(--text-primary); resize: none; word-break: break-all;"
                        >${chatKey}</textarea>
                        <button onclick="copyExportedKey()"
                            style="position: absolute; top: 8px; right: 8px; background: var(--accent-primary);
                                   border: none; border-radius: 4px; padding: 6px 12px; color: white; cursor: pointer;
                                   font-size: 12px; font-weight: 500;">
                            Copy Key
                        </button>
                    </div>

                    <div style="margin-top: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: 6px;">
                        <p style="color: var(--text-secondary); font-size: 13px; margin: 0;">
                            <strong>Instructions:</strong><br>
                            1. Copy this key securely<br>
                            2. Share it only with the escrow assigned to your dispute<br>
                            3. The escrow can use this key to decrypt and review the chat history
                        </p>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeModal('export-key-modal')">Close</button>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if present
    const existing = document.getElementById('export-key-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Copy exported key to clipboard
 */
function copyExportedKey() {
    const textarea = document.getElementById('export-key-value');
    if (textarea) {
        navigator.clipboard.writeText(textarea.value).then(() => {
            showSuccess('Chat key copied to clipboard');
        }).catch(() => {
            // Fallback for older browsers
            textarea.select();
            document.execCommand('copy');
            showSuccess('Chat key copied to clipboard');
        });
    }
}

/**
 * Show modal for importing chat key (escrows only)
 * Only shown in escrow dispute resolution view
 */
function showImportKeyModal(tradeId) {
    const modalHtml = `
        <div class="modal-overlay active" id="import-key-modal" onclick="if(event.target===this)closeModal('import-key-modal')">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        Import Chat Key - Dispute Review
                    </h3>
                    <button class="modal-close" onclick="closeModal('import-key-modal')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="info-box" style="background: rgba(59, 130, 246, 0.1); border: 1px solid var(--info); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                        <p style="color: var(--info); font-size: 13px; margin: 0;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 6px;">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="16" x2="12" y2="12"/>
                                <line x1="12" y1="8" x2="12.01" y2="8"/>
                            </svg>
                            As an assigned escrow, you can import the chat encryption key
                            provided by one of the traders to review their conversation history.
                        </p>
                    </div>

                    <label style="display: block; margin-bottom: 8px; color: var(--text-secondary); font-size: 13px;">
                        Paste Chat Key from Trader
                    </label>
                    <textarea id="import-key-input" placeholder="Paste the Base64 chat key here..."
                        style="width: 100%; height: 80px; font-family: var(--font-mono); font-size: 12px;
                               background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px;
                               padding: 10px; color: var(--text-primary); resize: none;"
                    ></textarea>

                    <input type="hidden" id="import-key-trade-id" value="${tradeId}">
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeModal('import-key-modal')">Cancel</button>
                    <button class="btn-primary" onclick="importKeyAndDecrypt()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                        </svg>
                        Decrypt Chat History
                    </button>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if present
    const existing = document.getElementById('import-key-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Import key and decrypt chat history for escrow review
 */
async function importKeyAndDecrypt() {
    const keyInput = document.getElementById('import-key-input');
    const tradeIdInput = document.getElementById('import-key-trade-id');

    if (!keyInput || !keyInput.value.trim()) {
        showError('Please paste the chat encryption key');
        return;
    }

    const chatKey = keyInput.value.trim();
    const tradeId = tradeIdInput ? tradeIdInput.value : state.activeTrade?.id;

    if (!tradeId) {
        showError('No trade ID specified');
        return;
    }

    // Show loading state
    const submitBtn = document.querySelector('#import-key-modal .btn-primary');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin-right:8px;"></div> Decrypting...';
    }

    try {
        // Import the key
        const success = await TradeChat.importChatKey(chatKey);
        if (!success) {
            showError('Invalid chat key format. Please check and try again.');
            return;
        }

        // Initialize tradeId for fetching
        TradeChat.tradeId = tradeId;

        // Fetch and decrypt chat history
        const messages = await TradeChat.fetchChatHistory(tradeId);

        closeModal('import-key-modal');

        if (messages.length === 0) {
            showToast('No messages found in chat history', 'info');
            return;
        }

        // Display decrypted chat history in a new modal
        showDecryptedChatModal(tradeId, messages);
        showSuccess(`Successfully decrypted ${messages.length} messages`);

    } catch (e) {
        console.error('Failed to import key and decrypt:', e);
        showError('Failed to decrypt chat history: ' + e.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
                Decrypt Chat History
            `;
        }
    }
}

/**
 * Show decrypted chat history modal for escrow review
 */
function showDecryptedChatModal(tradeId, messages) {
    let messagesHtml = '';

    for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleString();
        const isSystem = msg.type === 'system';

        if (isSystem) {
            messagesHtml += `
                <div class="chat-system-msg" style="text-align: center; padding: 8px; color: var(--text-muted); font-size: 12px;">
                    ${escapeHtml(msg.text)}
                </div>
            `;
        } else {
            // Truncate sender address for display
            const senderShort = msg.sender ?
                `${msg.sender.substring(0, 8)}...${msg.sender.substring(msg.sender.length - 6)}` :
                'Unknown';

            messagesHtml += `
                <div class="escrow-chat-message" style="margin-bottom: 12px; padding: 10px; background: var(--bg-tertiary); border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: var(--accent-primary); font-size: 12px; font-family: var(--font-mono);">
                            ${senderShort}
                        </span>
                        <span style="color: var(--text-muted); font-size: 11px;">
                            ${time}
                        </span>
                    </div>
                    <p style="margin: 0; color: var(--text-primary); white-space: pre-wrap; word-break: break-word;">
                        ${escapeHtml(msg.text)}
                    </p>
                </div>
            `;
        }
    }

    const modalHtml = `
        <div class="modal-overlay active" id="decrypted-chat-modal" onclick="if(event.target===this)closeModal('decrypted-chat-modal')">
            <div class="modal-content" style="max-width: 600px; max-height: 80vh; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <h3>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        Decrypted Chat History - Trade #${tradeId}
                    </h3>
                    <button class="modal-close" onclick="closeModal('decrypted-chat-modal')">&times;</button>
                </div>
                <div class="modal-body" style="flex: 1; overflow-y: auto; max-height: 50vh;">
                    <div class="info-box" style="background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success); border-radius: 8px; padding: 10px; margin-bottom: 16px;">
                        <p style="color: var(--success); font-size: 12px; margin: 0;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                <polyline points="22 4 12 14.01 9 11.01"/>
                            </svg>
                            ${messages.length} messages decrypted successfully. Review the conversation below.
                        </p>
                    </div>
                    <div class="decrypted-messages" style="padding: 4px;">
                        ${messagesHtml}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="exportChatTranscript('${tradeId}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Export Transcript
                    </button>
                    <button class="btn-primary" onclick="closeModal('decrypted-chat-modal')">Close</button>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if present
    const existing = document.getElementById('decrypted-chat-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Store messages for export
    window._decryptedChatMessages = messages;
}

/**
 * Export chat transcript as text file
 */
function exportChatTranscript(tradeId) {
    const messages = window._decryptedChatMessages || [];
    if (messages.length === 0) {
        showError('No messages to export');
        return;
    }

    let transcript = `BEAM P2P Trade Chat Transcript\n`;
    transcript += `Trade ID: ${tradeId}\n`;
    transcript += `Exported: ${new Date().toISOString()}\n`;
    transcript += `${'='.repeat(50)}\n\n`;

    for (const msg of messages) {
        const time = new Date(msg.timestamp).toISOString();
        const sender = msg.sender || 'System';
        transcript += `[${time}] ${sender}\n`;
        transcript += `${msg.text}\n\n`;
    }

    // Create and download file
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade_${tradeId}_chat_transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showSuccess('Chat transcript exported');
}

// ============================================
// MY TRADES MANAGEMENT
// ============================================

/**
 * Load my trades from smart contract
 */
async function loadMyTrades() {
    const activeList = document.getElementById('active-trades-list');

    // Show loading state (Issue 8)
    if (activeList) {
        activeList.innerHTML = `
            <div class="loading-trades">
                <div class="spinner"></div>
                <span>Loading your trades...</span>
            </div>
        `;
    }

    try {
        // Load from contract using view_trades action
        const args = `role=user,action=view_trades,cid=${P2P_ESCROW_CID},pk=${state.myPublicKey},skip=0,limit=50`;
        const result = await invokeContract(args, false);

        if (!result || result.error) {
            showError('Failed to load trades: ' + (result?.error || 'Connection error'));
            if (activeList) {
                activeList.innerHTML = `
                    <div class="error-state">
                        <p>Failed to load trades</p>
                        <button class="btn-secondary" onclick="loadMyTrades()">Retry</button>
                    </div>
                `;
            }
            state.myTrades = [];
            return;
        }

        if (result && result.trades && Array.isArray(result.trades)) {
            // Map contract trade format to UI format
            state.myTrades = result.trades.map(t => ({
                id: t.id || t.trade_id,
                orderId: t.order_id,
                assetId: t.asset_id || 174,
                amount: (t.amount || 0) / GROTH,
                payAmount: (t.pay_amount || 0) / 100, // cents to dollars
                currency: t.currency || 'USD',
                buyer: t.buyer_pk || t.buyer,
                seller: t.seller_pk || t.seller,
                status: mapContractTradeStatus(t.status),
                startedAt: t.started_at ? t.started_at * 1000 : Date.now(),
                createdAt: t.created_at || t.started_at
            }));
            console.log(`Loaded ${state.myTrades.length} trades from contract`);
            renderMyTrades();
        } else {
            console.log('No trades found or empty response');
            state.myTrades = [];
            renderMyTrades();
        }
    } catch (e) {
        console.error('loadMyTrades error:', e);
        showError('Failed to load trades: ' + e.message);
        if (activeList) {
            activeList.innerHTML = `
                <div class="error-state">
                    <p>Failed to load trades</p>
                    <button class="btn-secondary" onclick="loadMyTrades()">Retry</button>
                </div>
            `;
        }
        state.myTrades = [];
    }
}

/**
 * Map contract trade status to UI status
 */
function mapContractTradeStatus(contractStatus) {
    const statusMap = {
        0: 'pending',
        1: 'accepted',
        2: 'payment_sent',
        3: 'seller_confirmed',
        4: 'completed',
        5: 'disputed',
        6: 'refunded',
        7: 'cancelled',
        8: 'buyer_won_dispute',
        9: 'seller_won_dispute'
    };
    return statusMap[contractStatus] || contractStatus || 'pending';
}

/**
 * Render my trades list
 */
function renderMyTrades() {
    const activeList = document.getElementById('active-trades-list');
    const completedList = document.getElementById('completed-trades-list');

    if (!activeList || !completedList) return;

    // Active trades include pending, in-progress, and claimable statuses
    const activeStatuses = ['pending', 'accepted', 'payment_sent', 'disputed', 'seller_confirmed', 'buyer_won_dispute', 'seller_won_dispute'];
    const activeTrades = state.myTrades.filter(t => activeStatuses.includes(t.status));

    // Completed trades are fully finalized
    const completedTrades = state.myTrades.filter(t =>
        ['completed', 'cancelled', 'refunded'].includes(t.status)
    );

    // Render active trades
    if (activeTrades.length === 0) {
        activeList.innerHTML = '<p class="empty-msg">No active trades</p>';
    } else {
        activeList.innerHTML = activeTrades.map(trade => renderTradeCard(trade)).join('');
    }

    // Render completed trades
    if (completedTrades.length === 0) {
        completedList.innerHTML = '<p class="empty-msg">No completed trades yet</p>';
    } else {
        completedList.innerHTML = completedTrades.map(trade => renderTradeCard(trade)).join('');
    }
}

/**
 * Render single trade card
 * Handles both string and object buyer/seller formats
 */
function renderTradeCard(trade) {
    const asset = getAssetInfo(trade.assetId !== undefined ? trade.assetId : 174);

    // Handle buyer/seller as string or object - normalize to compare
    const buyerAddress = (typeof trade.buyer === 'string' ? trade.buyer : trade.buyer?.address) || '';
    const sellerAddress = (typeof trade.seller === 'string' ? trade.seller : trade.seller?.address) || '';

    // Check if user is buyer by comparing with both address and public key (case-insensitive, partial match)
    const myAddr = (state.myAddress || '').toLowerCase();
    const myPk = (state.myPublicKey || '').toLowerCase();
    const buyerLower = buyerAddress.toLowerCase();
    const sellerLower = sellerAddress.toLowerCase();

    // Determine role - check seller first since order creators are sellers
    const isSeller = sellerLower === myAddr || sellerLower === myPk ||
                     (sellerLower && (sellerLower.includes(myAddr.substring(0, 16)) || myAddr.includes(sellerLower.substring(0, 16))));
    const isBuyer = !isSeller && (buyerLower === myAddr || buyerLower === myPk ||
                    (buyerLower && (buyerLower.includes(myAddr.substring(0, 16)) || myAddr.includes(buyerLower.substring(0, 16)))));

    // Get other party info
    const otherPartyData = isBuyer ? trade.seller : trade.buyer;
    const otherPartyName = typeof otherPartyData === 'string'
        ? shortenAddress(otherPartyData)
        : (otherPartyData?.name || shortenAddress(otherPartyData?.address || ''));

    const statusInfo = getTradeStatusInfo(trade.status);

    // Safely format trade ID for display and data attribute
    const tradeId = String(trade.id || trade.trade_id || '');
    const shortId = tradeId.length > 12 ? tradeId.substring(0, 8) + '...' : tradeId;

    return `
        <div class="trade-card clickable" data-trade-id="${tradeId}" onclick="openTradeDetails(this.dataset.tradeId)">
            <div class="trade-card-header">
                <span class="trade-id">#${shortId}</span>
                <span class="trade-status ${statusInfo.class}">${statusInfo.label}</span>
            </div>
            <div class="trade-card-body">
                <div class="trade-info-row">
                    <span class="label">${isBuyer ? 'Buying' : 'Selling'}</span>
                    <span class="value">${formatAmount(trade.amount || 0, 2)} ${asset.symbol}</span>
                </div>
                <div class="trade-info-row">
                    <span class="label">For</span>
                    <span class="value">${getCurrencySymbol(trade.currency)}${(trade.payAmount || 0).toFixed(2)}</span>
                </div>
                <div class="trade-info-row">
                    <span class="label">${isBuyer ? 'From' : 'To'}</span>
                    <span class="value">${otherPartyName || 'Unknown'}</span>
                </div>
            </div>
            <div class="trade-card-footer">
                <span class="trade-time">${formatTimeAgo(trade.startedAt || (trade.createdAt ? trade.createdAt * 1000 : Date.now()))}</span>
                ${getTradeCardAction(trade)}
                <span class="view-trade-hint">View Details &rarr;</span>
            </div>
        </div>
    `;
}

/**
 * Get appropriate action button for trade card based on status
 */
function getTradeCardAction(trade) {
    const tradeId = trade.id;

    // Claimable statuses - show Claim button
    const claimableStatuses = ['seller_confirmed', 'buyer_won_dispute', 'seller_won_dispute'];
    if (claimableStatuses.includes(trade.status)) {
        return `<button class="btn-small btn-claim" onclick="event.stopPropagation(); showClaimModal('${tradeId}')">Claim</button>`;
    }

    // Completed - no action needed (deposit already claimed)
    if (trade.status === 'completed') {
        return '<span class="trade-complete-badge">✓ Complete</span>';
    }

    // Cancelled or refunded - show status
    if (trade.status === 'cancelled') {
        return '<span class="trade-cancelled-badge">Cancelled</span>';
    }
    if (trade.status === 'refunded') {
        return '<span class="trade-refunded-badge">Refunded</span>';
    }

    // Active trades - show "View" to open active trade modal
    return '';
}

/**
 * Show claim modal for trades that need to claim deposit
 */
function showClaimModal(tradeId) {
    const trade = getTrade(tradeId);
    if (!trade) return;

    const asset = getAssetInfo(trade.assetId !== undefined ? trade.assetId : 174);
    const isBuyer = trade.buyer?.address === state.myAddress || trade.buyer === state.myAddress;

    let claimInfo = '';
    let claimAction = null;

    if (trade.status === 'seller_confirmed') {
        // Buyer claims crypto + deposit
        if (isBuyer) {
            claimInfo = `
                <p>The seller has confirmed receiving your payment!</p>
                <div class="claim-summary">
                    <div class="claim-row">
                        <span>Crypto:</span>
                        <span class="claim-amount">${formatAmount(trade.amount, 2)} ${asset.symbol}</span>
                    </div>
                    <div class="claim-row">
                        <span>Your deposit:</span>
                        <span class="claim-amount">${formatAmount(trade.buyerDeposit || trade.amount * 0.1, 2)} ${asset.symbol}</span>
                    </div>
                </div>
                <p class="claim-note">Please rate your experience with this trade (required):</p>
            `;
            claimAction = () => claimTradeWithRating(tradeId);
        } else {
            claimInfo = `<p>Waiting for buyer to claim. Your deposit was returned when you confirmed.</p>`;
        }
    } else if (trade.status === 'buyer_won_dispute') {
        claimInfo = `
            <p>You won the dispute! Claim your funds:</p>
            <div class="claim-summary">
                <div class="claim-row">
                    <span>Your deposit:</span>
                    <span class="claim-amount">${formatAmount(trade.buyerDeposit || trade.amount * 0.1, 2)} ${asset.symbol}</span>
                </div>
                <div class="claim-row">
                    <span>Seller's deposit:</span>
                    <span class="claim-amount">${formatAmount(trade.sellerDeposit || trade.amount * 0.1, 2)} ${asset.symbol}</span>
                </div>
            </div>
        `;
        claimAction = () => claimDisputeWin(tradeId);
    } else if (trade.status === 'seller_won_dispute') {
        claimInfo = `
            <p>You won the dispute! Claim your funds:</p>
            <div class="claim-summary">
                <div class="claim-row">
                    <span>Your crypto:</span>
                    <span class="claim-amount">${formatAmount(trade.amount, 2)} ${asset.symbol}</span>
                </div>
                <div class="claim-row">
                    <span>Your deposit:</span>
                    <span class="claim-amount">${formatAmount(trade.sellerDeposit || trade.amount * 0.1, 2)} ${asset.symbol}</span>
                </div>
                <div class="claim-row">
                    <span>Buyer's deposit:</span>
                    <span class="claim-amount">${formatAmount(trade.buyerDeposit || trade.amount * 0.1, 2)} ${asset.symbol}</span>
                </div>
            </div>
        `;
        claimAction = () => claimDisputeWin(tradeId);
    }

    // Build rating UI for seller_confirmed (buyer claiming)
    const ratingHtml = trade.status === 'seller_confirmed' && isBuyer ? `
        <div class="rating-selector" id="claim-rating-selector">
            ${[1,2,3,4,5].map(star => `
                <button class="star-btn" data-rating="${star}" onclick="selectClaimRating(${star})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                </button>
            `).join('')}
        </div>
    ` : '';

    // Build modal content
    const modalContent = `
        <div class="claim-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
        </div>
        <h3>Claim Your Funds</h3>
        ${claimInfo}
        ${ratingHtml}
    `;

    // Store claim action for later
    state.pendingClaimAction = claimAction;
    state.pendingClaimTradeId = tradeId;
    state.claimRating = trade.status === 'seller_confirmed' ? 0 : 5; // Rating only required for seller_confirmed

    // Populate and show the claim modal
    document.getElementById('claim-modal-body').innerHTML = modalContent;
    openModal('claim-modal');
}

/**
 * Confirm claim button handler
 */
function confirmClaim() {
    const tradeId = state.pendingClaimTradeId;
    const trade = getTrade(tradeId);

    if (trade && trade.status === 'seller_confirmed' && state.claimRating === 0) {
        showError('Please select a rating');
        return;
    }

    if (state.pendingClaimAction) {
        state.pendingClaimAction();
    }
}

/**
 * Select rating for claim
 */
function selectClaimRating(rating) {
    state.claimRating = rating;

    // Update star display
    const stars = document.querySelectorAll('#claim-rating-selector .star-btn');
    stars.forEach((star, idx) => {
        if (idx < rating) {
            star.classList.add('selected');
            star.querySelector('svg').setAttribute('fill', '#fbbf24');
        } else {
            star.classList.remove('selected');
            star.querySelector('svg').setAttribute('fill', 'none');
        }
    });
}

/**
 * Claim trade with rating (for seller_confirmed status)
 */
async function claimTradeWithRating(tradeId) {
    if (!state.claimRating || state.claimRating < 1) {
        showError('Please select a rating');
        return;
    }

    showLoading('Claiming your funds...');

    try {
        const result = await claimTradeOnChain(tradeId, state.claimRating);
        hideLoading();

        if (result.success) {
            showSuccess('Funds claimed successfully!');
            closeModal('claim-modal');
            await loadMyTrades();
        } else {
            showError(result.error || 'Failed to claim funds');
        }
    } catch (e) {
        hideLoading();
        showError('Error claiming funds: ' + e.message);
    }
}

/**
 * Claim dispute win
 */
async function claimDisputeWin(tradeId) {
    showLoading('Claiming dispute win...');

    try {
        const result = await claimDisputeWinOnChain(tradeId);
        hideLoading();

        if (result.success) {
            showSuccess('Dispute win claimed successfully!');
            closeModal('claim-modal');
            await loadMyTrades();
        } else {
            showError(result.error || 'Failed to claim dispute win');
        }
    } catch (e) {
        hideLoading();
        showError('Error claiming dispute win: ' + e.message);
    }
}

/**
 * Get trade by ID
 * Handles both string and number ID formats
 */
function getTrade(tradeId) {
    if (!tradeId) return null;
    const idStr = String(tradeId);
    return state.myTrades.find(t => String(t.id) === idStr || String(t.trade_id) === idStr);
}

/**
 * Get trade status display info
 * Updated for v2 two-step completion
 */
function getTradeStatusInfo(status) {
    const statuses = {
        'pending': { label: 'Pending', class: 'status-pending', code: 0 },
        'accepted': { label: 'Accepted', class: 'status-active', code: 1 },
        'payment_sent': { label: 'Payment Sent', class: 'status-active', code: 2 },
        'completed': { label: 'Completed', class: 'status-success', code: 3 },
        'disputed': { label: 'Disputed', class: 'status-warning', code: 4 },
        'refunded': { label: 'Refunded', class: 'status-info', code: 5 },
        'cancelled': { label: 'Cancelled', class: 'status-error', code: 6 },
        // NEW in v2: Two-step completion statuses
        'seller_confirmed': { label: 'Seller Confirmed - Claim Your Crypto!', class: 'status-success', code: 7 },
        'buyer_won_dispute': { label: 'You Won! Claim Your Funds', class: 'status-success', code: 8 },
        'seller_won_dispute': { label: 'You Won! Claim Your Funds', class: 'status-success', code: 9 }
    };
    return statuses[status] || { label: status, class: '' };
}

/**
 * Convert contract status code to status string
 */
function statusCodeToString(code) {
    const codeMap = {
        0: 'pending',
        1: 'accepted',
        2: 'payment_sent',
        3: 'completed',
        4: 'disputed',
        5: 'refunded',
        6: 'cancelled',
        7: 'seller_confirmed',
        8: 'buyer_won_dispute',
        9: 'seller_won_dispute'
    };
    return codeMap[code] || 'unknown';
}

/**
 * Determine user's role in a trade by comparing buyer/seller keys against our identity
 */
function getTradeRole(trade) {
    const myPk = state.myPublicKey;
    const myAddr = state.myAddress;

    // buyer/seller can be a string (public key) or object with .address/.pk
    const buyerKey = typeof trade.buyer === 'string' ? trade.buyer : (trade.buyer?.pk || trade.buyer?.address || '');
    const sellerKey = typeof trade.seller === 'string' ? trade.seller : (trade.seller?.pk || trade.seller?.address || '');

    if (myPk && (buyerKey === myPk || sellerKey !== myPk)) {
        // If buyer key matches our pk, or seller key doesn't match (and we're in the trade), we're buyer
        if (buyerKey === myPk) return 'buyer';
        if (sellerKey === myPk) return 'seller';
    }
    if (myAddr && (buyerKey === myAddr)) return 'buyer';
    if (myAddr && (sellerKey === myAddr)) return 'seller';

    // Fallback: check order side — if we created a buy order, we're the buyer
    if (trade.side === 'buy' || trade.order?.side === 'buy') return 'buyer';
    return 'seller';
}

/**
 * Open trade details
 * Updated for v2 two-step completion
 */
function openTradeDetails(tradeId) {
    const trade = getTrade(tradeId);
    if (!trade) return;

    // Active statuses include pending, in-progress, and claimable states
    const activeStatuses = ['pending', 'accepted', 'payment_sent', 'disputed', 'seller_confirmed', 'buyer_won_dispute', 'seller_won_dispute'];

    // If trade is active, show active trade modal
    if (activeStatuses.includes(trade.status)) {
        state.activeTrade = {
            id: trade.id,
            order: {
                asset: trade.assetId,
                seller: trade.seller,
                paymentMethods: trade.paymentMethods || ['bank_transfer'],
                currency: trade.currency
            },
            payAmount: trade.payAmount,
            receiveAmount: trade.amount,
            status: trade.status,
            startedAt: trade.createdAt * 1000 || Date.now(),
            role: getTradeRole(trade),
            buyerDeposit: trade.buyerDeposit,
            sellerDeposit: trade.sellerDeposit
        };
        showActiveTradeFromData(state.activeTrade);
    } else {
        // Show trade summary
        showTradeSummary(trade);
    }

    closeModal('my-trades-modal');
}

/**
 * Show active trade modal from existing data
 */
function showActiveTradeFromData(trade) {
    const asset = getAssetInfo(trade.order.asset);
    const isBuyer = trade.role === 'buyer';

    document.getElementById('active-trade-id').textContent = trade.id;
    updateTradeStatusUI(trade.status, getTradeStatusInfo(trade.status).label);
    document.getElementById('active-trade-role').textContent = isBuyer ? 'BUYING' : 'SELLING';
    document.getElementById('active-trade-amount').textContent = `${formatAmount(trade.receiveAmount, 2)} ${asset.symbol}`;
    document.getElementById('active-trade-fiat').textContent = `${getCurrencySymbol(trade.order.currency)}${trade.payAmount.toFixed(2)}`;

    const otherParty = isBuyer ? trade.order.seller : trade.buyer;
    document.getElementById('active-trader-avatar').textContent = (otherParty?.name || 'T').charAt(0);
    document.getElementById('active-trader-name').textContent = otherParty?.name || 'Trader';
    document.getElementById('active-trader-trust').textContent = `${otherParty?.trustScore || 0}% | ${otherParty?.totalTrades || 0} trades`;

    const payMethodEl = document.getElementById('active-payment-method');
    if (payMethodEl) payMethodEl.textContent = (trade.order.paymentMethods || []).map(pm => getPaymentMethodName(pm)).join(', ');
    const payAmountEl = document.getElementById('active-pay-amount');
    if (payAmountEl) payAmountEl.textContent = `${getCurrencySymbol(trade.order.currency)}${trade.payAmount.toFixed(2)}`;
    const refEl = document.getElementById('active-reference');
    if (refEl) refEl.textContent = `BEAM-${trade.id}`;

    // Update footer based on role and status
    updateActiveTradeFooter(trade);

    // Initialize chat
    initTradeChat(trade.id);

    // Update timeline based on trade status
    updateTradeTimeline(trade.status);

    startTradeTimer();
    openModal('active-trade-modal');
}

/**
 * Update the timeline UI based on trade status
 * Shows progress through the two-step completion flow
 */
function updateTradeTimeline(status) {
    const timeline = document.querySelector('.timeline');
    if (!timeline) return;

    const items = timeline.querySelectorAll('.timeline-item');
    const statusOrder = ['accepted', 'details', 'payment_sent', 'seller_confirmed', 'completed'];

    // Map status to step
    let currentStep;
    if (status === 'accepted') currentStep = 2; // Waiting for payment
    else if (status === 'payment_sent') currentStep = 3; // Waiting for seller confirm
    else if (status === 'seller_confirmed') currentStep = 4; // Waiting for buyer claim
    else if (status === 'completed') currentStep = 5; // Done
    else if (status === 'buyer_won_dispute' || status === 'seller_won_dispute') currentStep = 5;
    else currentStep = 0;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    items.forEach((item, index) => {
        item.classList.remove('completed', 'active');

        if (index < currentStep - 1) {
            item.classList.add('completed');
            // Set time for completed steps
            if (item.querySelector('.time').textContent === '--:--') {
                item.querySelector('.time').textContent = now;
            }
        } else if (index === currentStep - 1) {
            item.classList.add('active');
        }
    });

    // Special case: dispute statuses
    if (status === 'buyer_won_dispute' || status === 'seller_won_dispute') {
        // Mark all as completed but show dispute result
        items.forEach(item => {
            item.classList.remove('active');
            item.classList.add('completed');
        });
        // Update last item text
        const lastItem = items[items.length - 1];
        if (lastItem) {
            const winner = status === 'buyer_won_dispute' ? 'Buyer' : 'Seller';
            lastItem.querySelector('.text').textContent = `Dispute resolved - ${winner} won`;
        }
    }
}

/**
 * Update active trade footer based on role and status
 * Updated for v2 two-step completion
 */
function updateActiveTradeFooter(trade) {
    const footer = document.getElementById('active-trade-footer');
    const isBuyer = trade.role === 'buyer';

    if (trade.status === 'accepted') {
        if (isBuyer) {
            footer.innerHTML = `
                <button class="btn-secondary" onclick="cancelActiveTrade()">Cancel</button>
                <button class="btn-primary" onclick="markPaymentSent()">I've Paid</button>
            `;
        } else {
            footer.innerHTML = `
                <button class="btn-secondary" onclick="cancelActiveTrade()">Cancel</button>
                <span style="color: var(--text-muted);">Waiting for buyer to pay...</span>
            `;
        }
    } else if (trade.status === 'payment_sent') {
        if (isBuyer) {
            footer.innerHTML = `
                <button class="btn-secondary" onclick="openDispute()">Open Dispute</button>
                <span style="color: var(--text-muted);">Waiting for seller to confirm...</span>
            `;
        } else {
            footer.innerHTML = `
                <button class="btn-secondary" onclick="openDispute()">Dispute</button>
                <button class="btn-primary" onclick="confirmPaymentReceived()">Payment Received</button>
            `;
        }
    } else if (trade.status === 'seller_confirmed') {
        // NEW: Two-step completion - seller confirmed, buyer needs to claim
        if (isBuyer) {
            footer.innerHTML = `
                <div class="claim-info">
                    <div class="claim-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span>Seller confirmed payment!</span>
                    </div>
                </div>
                <button class="btn-primary btn-lg pulse-animation" onclick="claimTrade()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;margin-right:8px;">
                        <path d="M12 2v20M17 7l-5-5-5 5"/>
                    </svg>
                    Claim Your Crypto
                </button>
            `;
        } else {
            footer.innerHTML = `
                <div class="claim-info success-msg">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span>You confirmed! Your deposit has been returned. Waiting for buyer to claim...</span>
                </div>
            `;
        }
    } else if (trade.status === 'buyer_won_dispute') {
        // NEW: Buyer won dispute - buyer claims
        if (isBuyer) {
            footer.innerHTML = `
                <div class="claim-info">
                    <div class="claim-badge winner">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                            <circle cx="12" cy="8" r="7"/>
                            <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
                        </svg>
                        <span>You won the dispute!</span>
                    </div>
                </div>
                <button class="btn-primary btn-lg pulse-animation" onclick="claimDisputeWin()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;margin-right:8px;">
                        <path d="M12 2v20M17 7l-5-5-5 5"/>
                    </svg>
                    Claim Your Funds
                </button>
            `;
        } else {
            footer.innerHTML = `
                <div class="claim-info error-msg">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M15 9l-6 6M9 9l6 6"/>
                    </svg>
                    <span>Dispute resolved in buyer's favor. Your deposit was forfeited.</span>
                </div>
            `;
        }
    } else if (trade.status === 'seller_won_dispute') {
        // NEW: Seller won dispute - seller claims
        if (!isBuyer) {
            footer.innerHTML = `
                <div class="claim-info">
                    <div class="claim-badge winner">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                            <circle cx="12" cy="8" r="7"/>
                            <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
                        </svg>
                        <span>You won the dispute!</span>
                    </div>
                </div>
                <button class="btn-primary btn-lg pulse-animation" onclick="claimDisputeWin()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;margin-right:8px;">
                        <path d="M12 2v20M17 7l-5-5-5 5"/>
                    </svg>
                    Claim Your Funds
                </button>
            `;
        } else {
            footer.innerHTML = `
                <div class="claim-info error-msg">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M15 9l-6 6M9 9l6 6"/>
                    </svg>
                    <span>Dispute resolved in seller's favor. Your deposit was forfeited.</span>
                </div>
            `;
        }
    }
}

/**
 * Seller confirms payment received - releases SELLER's deposit
 * Updated for v2: This is step 1. Buyer must call claimTrade() in step 2.
 * REQUIRES: Feedback must be submitted before confirming
 */
async function confirmPaymentReceived() {
    if (!state.activeTrade) return;

    // Check if feedback has been submitted by seller
    const feedbackKey = `feedback_${state.activeTrade.id}_seller`;
    const hasFeedback = localStorage.getItem(feedbackKey);

    if (!hasFeedback) {
        // Show feedback modal first - required before confirming
        showRequiredFeedbackModal(state.activeTrade, 'seller', () => {
            // After feedback submitted, proceed with confirmation
            proceedWithConfirmPayment();
        });
        return;
    }

    proceedWithConfirmPayment();
}

/**
 * Proceed with payment confirmation after feedback
 * Feedback is now included in the SAME transaction as confirm
 */
async function proceedWithConfirmPayment() {
    // Get seller's feedback rating from localStorage
    const feedbackKey = `feedback_${state.activeTrade.id}_seller`;
    const feedbackData = JSON.parse(localStorage.getItem(feedbackKey) || '{}');

    if (!feedbackData.rating) {
        showError('Feedback is required before confirming payment');
        return;
    }

    if (!confirm('Confirm you have received the payment? Your deposit will be returned minus 0.5% fee. The buyer will then claim their crypto.')) {
        return;
    }

    // Show transaction loading with countdown
    showTransactionLoading({
        title: 'Releasing Funds',
        message: 'Confirming payment with feedback...',
        countdown: 60,
        type: 'confirm'
    });

    try {
        // Call on-chain confirm with rating (feedback included in same tx)
        const onChainResult = await confirmPaymentOnChain(state.activeTrade.id, feedbackData.rating);

        hideTransactionLoading();

        if (onChainResult.success) {
            // Status changes to seller_confirmed - buyer needs to claim
            state.activeTrade.status = 'seller_confirmed';
            updateActiveTradeFooter(state.activeTrade);
            updateTradeTimeline('seller_confirmed');
            updateTradeStatusUI('seller_confirmed');

            showSuccess('✅ Payment verified! Your bond returned. Buyer can now claim crypto from escrow.');

            // Send Telegram notification to buyer
            sendTelegramNotification('paymentConfirmed', {
                tradeId: state.activeTrade.id
            });
        } else {
            showError(onChainResult.error || 'Failed to confirm payment');
        }
    } catch (e) {
        hideTransactionLoading();
        showError('Error confirming payment: ' + e.message);
    }
}

/**
 * Buyer claims trade after seller confirms (NEW in v2)
 * REQUIRES: Feedback must be submitted before claiming
 * Releases trade amount + buyer deposit to buyer
 */
async function claimTrade() {
    if (!state.activeTrade) return;

    if (state.activeTrade.status !== 'seller_confirmed') {
        showError('Trade is not ready to claim. Seller must confirm first.');
        return;
    }

    // Check if feedback has been submitted
    const feedbackKey = `feedback_${state.activeTrade.id}_buyer`;
    const hasFeedback = localStorage.getItem(feedbackKey);

    if (!hasFeedback) {
        // Show feedback modal first - required before claiming
        showRequiredFeedbackModal(state.activeTrade, 'buyer', () => {
            // After feedback submitted, proceed with claim
            proceedWithClaim();
        });
        return;
    }

    proceedWithClaim();
}

/**
 * Proceed with claim after feedback
 * Feedback is now included in the SAME transaction as claim
 */
async function proceedWithClaim() {
    // Get buyer's feedback rating from localStorage
    const feedbackKey = `feedback_${state.activeTrade.id}_buyer`;
    const feedbackData = JSON.parse(localStorage.getItem(feedbackKey) || '{}');

    if (!feedbackData.rating) {
        showError('Feedback is required before claiming');
        return;
    }

    if (!confirm('Claim your crypto and deposit? A 0.5% fee will be deducted from your deposit.')) {
        return;
    }

    // Show transaction loading with countdown
    showTransactionLoading({
        title: 'Claiming Crypto',
        message: 'Claiming with feedback...',
        countdown: 60,
        type: 'claim'
    });

    try {
        // Call on-chain claim_trade with rating (feedback included in same tx)
        const result = await claimTradeOnChain(state.activeTrade.id, feedbackData.rating);

        hideTransactionLoading();

        if (result.success) {
            state.activeTrade.status = 'completed';
            onTradeCompleted(state.activeTrade);
            showSuccess('🎉 Trade complete! Funds released from escrow to your private wallet.');

            // Send Telegram notification to both parties
            sendTelegramNotification('tradeCompleted', {
                tradeId: state.activeTrade.id,
                amount: state.activeTrade.receiveAmount,
                asset: state.activeTrade.order?.asset ? getAssetInfo(state.activeTrade.order.asset)?.symbol : 'BEAM'
            });
        } else {
            showError(result.error || 'Failed to claim trade');
        }
    } catch (e) {
        hideTransactionLoading();
        showError('Error claiming trade: ' + e.message);
    }
}

/**
 * Winner claims after dispute resolved (NEW in v2)
 * Releases trade amount + winner's deposit (no fee for winner)
 */
async function claimDisputeWin() {
    if (!state.activeTrade) return;

    const validStatuses = ['buyer_won_dispute', 'seller_won_dispute'];
    if (!validStatuses.includes(state.activeTrade.status)) {
        showError('No dispute win to claim.');
        return;
    }

    if (!confirm('Claim your funds from the dispute win? You will receive the trade amount plus your full deposit (no fee).')) {
        return;
    }

    showLoading('Claiming dispute win...');

    try {
        // Call on-chain claim_dispute_win (Method 21)
        const result = await claimDisputeWinOnChain(state.activeTrade.id);

        hideLoading();

        if (result.success) {
            const finalStatus = state.activeTrade.status === 'buyer_won_dispute' ? 'completed' : 'refunded';
            state.activeTrade.status = finalStatus;
            closeModal('active-trade-modal');
            showSuccess('Dispute resolved! Funds have been transferred to your wallet.');
            await loadMyTrades();
        } else {
            showError(result.error || 'Failed to claim dispute win');
        }
    } catch (e) {
        hideLoading();
        showError('Error claiming dispute win: ' + e.message);
    }
}

/**
 * On-chain: Claim trade after seller confirms (Method 20)
 * Now includes mandatory feedback rating
 */
async function claimTradeOnChain(tradeId, rating) {
    // Rating is now REQUIRED (1-5)
    if (!rating || rating < 1 || rating > 5) {
        return { success: false, error: 'Rating required (1-5)' };
    }

    try {
        const args = `role=user,action=claim_trade,cid=${P2P_ESCROW_CID},trade_id=${tradeId},rating=${rating}`;
        const result = await invokeContract(args, true);
        return { success: !result.error, txId: result.txid, error: result.error };
    } catch (e) {
        console.error('claimTradeOnChain error:', e);
        return { success: false, error: e.message };
    }
}

/**
 * On-chain: Claim dispute win (Method 21)
 */
async function claimDisputeWinOnChain(tradeId) {
    try {
        const args = `role=user,action=claim_dispute_win,cid=${P2P_ESCROW_CID},trade_id=${tradeId}`;
        const result = await invokeContract(args, true);
        return { success: !result.error, txId: result.txid, error: result.error };
    } catch (e) {
        console.error('claimDisputeWinOnChain error:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Show trade summary for completed/cancelled trades
 * Handles both string and object buyer/seller formats
 */
function showTradeSummary(trade) {
    const asset = getAssetInfo(trade.assetId !== undefined ? trade.assetId : 174);

    // Handle buyer/seller as string or object
    const buyerAddress = typeof trade.buyer === 'string' ? trade.buyer : trade.buyer?.address;
    const sellerAddress = typeof trade.seller === 'string' ? trade.seller : trade.seller?.address;
    const isBuyer = buyerAddress === state.myAddress || buyerAddress === state.myPublicKey;

    // Get other party info
    const otherPartyData = isBuyer ? trade.seller : trade.buyer;
    const otherPartyName = typeof otherPartyData === 'string'
        ? shortenAddress(otherPartyData)
        : (otherPartyData?.name || shortenAddress(otherPartyData?.address || ''));

    const statusInfo = getTradeStatusInfo(trade.status);

    // Format date - handle timestamp in seconds or milliseconds
    const timestamp = trade.completedAt || trade.startedAt || (trade.createdAt * 1000) || Date.now();
    const dateValue = timestamp > 1e12 ? timestamp : timestamp * 1000; // Convert seconds to ms if needed

    const html = `
        <div class="trade-summary">
            <div class="summary-header">
                <h3>Trade #${trade.id}</h3>
                <span class="trade-status ${statusInfo.class}">${statusInfo.label}</span>
            </div>

            <div class="summary-details">
                <div class="detail-row">
                    <span>You ${isBuyer ? 'bought' : 'sold'}</span>
                    <span>${formatAmount(trade.amount, 2)} ${asset.symbol}</span>
                </div>
                <div class="detail-row">
                    <span>For</span>
                    <span>${getCurrencySymbol(trade.currency)}${trade.payAmount?.toFixed(2) || '0.00'}</span>
                </div>
                <div class="detail-row">
                    <span>${isBuyer ? 'From' : 'To'}</span>
                    <span>${otherPartyName || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <span>Date</span>
                    <span>${formatDate(dateValue)}</span>
                </div>
            </div>

            ${trade.status === 'completed' && !hasFeedbackSubmitted(trade.id) ? `
                <div class="summary-actions">
                    <button class="btn-primary" onclick="closeModal('custom-modal'); showFeedbackModal(getTrade('${trade.id}'))">
                        Leave Feedback
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    showCustomModal('Trade Details', html);
}

// ============================================
// LOADING INDICATOR
// ============================================

function showLoading(message = 'Loading...') {
    let loader = document.getElementById('p2p-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'p2p-loader';
        loader.innerHTML = `
            <div class="loader-backdrop"></div>
            <div class="loader-content">
                <div class="loader-spinner"></div>
                <p class="loader-message">${message}</p>
            </div>
        `;
        document.body.appendChild(loader);

        // Add styles
        if (!document.getElementById('loader-styles')) {
            const style = document.createElement('style');
            style.id = 'loader-styles';
            style.textContent = `
                #p2p-loader { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; }
                .loader-backdrop { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); }
                .loader-content { position: relative; text-align: center; color: white; }
                .loader-spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.3); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .loader-message { font-size: 14px; color: var(--text-secondary); }
            `;
            document.head.appendChild(style);
        }
    } else {
        loader.querySelector('.loader-message').textContent = message;
        loader.style.display = 'flex';
    }
}

function hideLoading() {
    const loader = document.getElementById('p2p-loader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// ============================================
// DISPUTE SYSTEM
// ============================================

/**
 * Open dispute for current trade
 */
async function openDispute() {
    if (!state.activeTrade) return;

    // Show dispute modal
    const html = `
        <div class="dispute-form">
            <p class="dispute-warning">
                ⚠️ Opening a dispute will freeze the trade. 3 escrow arbitrators will review the evidence and decide the outcome.
            </p>

            <div class="form-group">
                <label>Reason for Dispute</label>
                <select id="dyn-dispute-reason" class="form-control">
                    <option value="no_payment">Buyer didn't pay</option>
                    <option value="wrong_amount">Wrong amount received</option>
                    <option value="no_release">Seller won't release</option>
                    <option value="scam">Suspected scam</option>
                    <option value="other">Other</option>
                </select>
            </div>

            <div class="form-group">
                <label>Describe the Issue</label>
                <textarea id="dyn-dispute-description" class="form-control" rows="4" placeholder="Provide details about what happened..."></textarea>
            </div>

            <div class="form-group">
                <label>Evidence (optional)</label>
                <p class="help-text">Upload screenshots of payment confirmation, chat logs, etc.</p>
                <input type="file" id="dyn-dispute-evidence" accept="image/*" multiple>
            </div>

            <div class="dispute-actions">
                <button class="btn-secondary" onclick="closeModal('custom-modal')">Cancel</button>
                <button class="btn-primary btn-danger" onclick="submitDispute()">Submit Dispute</button>
            </div>
        </div>
    `;

    showCustomModal('Open Dispute', html);

    // Add dispute form styles
    if (!document.getElementById('dispute-styles')) {
        const style = document.createElement('style');
        style.id = 'dispute-styles';
        style.textContent = `
            .dispute-warning { background: rgba(239, 68, 68, 0.1); border: 1px solid var(--error); padding: 12px; border-radius: 8px; margin-bottom: 20px; color: var(--error); }
            .dispute-form .form-group { margin-bottom: 16px; }
            .dispute-form label { display: block; margin-bottom: 8px; color: var(--text-secondary); }
            .dispute-form .form-control { width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; color: var(--text-primary); }
            .dispute-form textarea.form-control { resize: vertical; min-height: 100px; }
            .dispute-form .help-text { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
            .dispute-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
            .dispute-actions .btn-danger { background: var(--error) !important; color: #fff !important; }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Submit dispute
 */
async function submitDispute() {
    if (!state.activeTrade) return;

    // Check dynamic modal IDs first, then static HTML modal IDs
    const reason = (document.getElementById('dyn-dispute-reason') || document.getElementById('dispute-reason')).value;
    const descEl = document.getElementById('dyn-dispute-description') || document.getElementById('dispute-description');
    const description = descEl ? descEl.value : '';

    if (!description.trim()) {
        showError('Please describe the issue');
        return;
    }

    showLoading('Opening dispute...');

    try {
        console.log('[submitDispute] Trade ID:', state.activeTrade.id, 'Reason:', reason);

        // Open dispute on-chain
        const onChainResult = await openDisputeOnChain(state.activeTrade.id, reason, description);
        console.log('[submitDispute] On-chain result:', JSON.stringify(onChainResult));

        // Try API update (may fail if no backend, that's OK)
        let apiResult = { success: false };
        try {
            apiResult = await apiCall(`/trades/${state.activeTrade.id}/dispute`, 'POST', {
                reason: reason,
                description: description,
                openedBy: state.myAddress
            });
        } catch (apiErr) {
            console.warn('[submitDispute] API call failed (non-critical):', apiErr.message);
        }

        hideLoading();

        if (onChainResult.success || apiResult.success) {
            closeModal('custom-modal');
            state.activeTrade.status = 'disputed';
            updateTradeStatusUI('disputed');
            document.getElementById('active-trade-footer').innerHTML = `
                <div class="dispute-notice">
                    <p>⚖️ Dispute opened. 3 escrow arbitrators will review within 24-48 hours.</p>
                    <p>Dispute ID: ${apiResult.disputeId || 'Pending'}</p>
                </div>
            `;
            showSuccess('Dispute opened. Arbitrators will review the evidence.');

            sendTelegramNotification('disputeOpened', {
                tradeId: state.activeTrade.id,
                reason: reason
            });
        } else {
            // Keep modal open so user can retry
            showError(onChainResult.error || apiResult.error || 'Failed to open dispute. Please try again.');
        }
    } catch (e) {
        hideLoading();
        // Keep modal open so user can retry
        showError('Error opening dispute: ' + e.message);
    }
}

// ============================================
// VERIFIED FEEDBACK UI
// ============================================

/**
 * Show feedback modal after trade completion
 */
function showFeedbackModal(trade) {
    state.feedbackTrade = trade;

    const modal = document.getElementById('feedback-modal');
    if (!modal) {
        // Create feedback modal dynamically if not in HTML
        createFeedbackModalElement();
    }

    // Populate modal
    const traderName = trade.role === 'buyer' ? trade.order.seller.name : trade.buyer?.name || 'Trader';
    document.getElementById('feedback-trader-name').textContent = traderName;
    document.getElementById('feedback-trade-id').textContent = trade.id;
    document.getElementById('feedback-trade-amount').textContent =
        `${formatAmount(trade.receiveAmount, 2)} ${getAssetInfo(trade.order.asset).symbol}`;

    // Reset stars
    document.querySelectorAll('.feedback-star').forEach((star, i) => {
        star.classList.toggle('active', i < 5);  // Default 5 stars
    });
    state.feedbackRating = 5;

    // Clear comment
    document.getElementById('feedback-comment').value = '';

    openModal('feedback-modal');
}

/**
 * Create feedback modal element if not exists
 */
function createFeedbackModalElement() {
    const modalHtml = `
        <div class="modal" id="feedback-modal">
            <div class="modal-backdrop" onclick="closeModal('feedback-modal')"></div>
            <div class="modal-content" style="max-width:440px;">
                <div class="modal-header">
                    <h2>Leave Feedback</h2>
                    <button class="modal-close" onclick="closeModal('feedback-modal')">×</button>
                </div>
                <div class="modal-body">
                    <div class="feedback-trade-info">
                        <p>Trade <strong>#<span id="feedback-trade-id"></span></strong></p>
                        <p>With: <strong id="feedback-trader-name"></strong></p>
                        <p>Amount: <span id="feedback-trade-amount"></span></p>
                    </div>

                    <div class="feedback-rating">
                        <label>Rating</label>
                        <div class="star-rating" id="star-rating">
                            ${[1,2,3,4,5].map(i => `
                                <span class="feedback-star active" data-rating="${i}" onclick="setFeedbackRating(${i})">★</span>
                            `).join('')}
                        </div>
                        <span class="rating-label" id="rating-label">Excellent</span>
                    </div>

                    <div class="feedback-comment">
                        <label>Comment (optional)</label>
                        <textarea id="feedback-comment" rows="3" placeholder="Share your experience with this trader..."></textarea>
                    </div>

                    <div class="feedback-verified-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" style="width:16px;height:16px;">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span>This feedback will be verified on-chain</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="skipFeedback()">Skip</button>
                    <button class="btn-primary" onclick="submitFeedbackFromModal()">Submit Feedback</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Add styles if not present
    if (!document.getElementById('feedback-styles')) {
        const styles = document.createElement('style');
        styles.id = 'feedback-styles';
        styles.textContent = `
            .feedback-trade-info {
                background: var(--bg-tertiary);
                padding: 16px;
                border-radius: 8px;
                margin-bottom: 20px;
            }
            .feedback-trade-info p {
                margin: 4px 0;
                color: var(--text-secondary);
            }
            .feedback-trade-info strong {
                color: var(--text-primary);
            }
            .feedback-rating {
                text-align: center;
                margin-bottom: 20px;
            }
            .feedback-rating label {
                display: block;
                margin-bottom: 12px;
                color: var(--text-secondary);
            }
            .star-rating {
                display: flex;
                justify-content: center;
                gap: 8px;
                margin-bottom: 8px;
            }
            .feedback-star {
                font-size: 32px;
                color: var(--bg-tertiary);
                cursor: pointer;
                transition: all 0.2s;
            }
            .feedback-star.active {
                color: #fbbf24;
            }
            .feedback-star:hover {
                transform: scale(1.2);
            }
            .rating-label {
                color: var(--text-muted);
                font-size: 14px;
            }
            .feedback-comment {
                margin-bottom: 20px;
            }
            .feedback-comment label {
                display: block;
                margin-bottom: 8px;
                color: var(--text-secondary);
            }
            .feedback-comment textarea {
                width: 100%;
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 12px;
                color: var(--text-primary);
                resize: none;
            }
            .feedback-verified-badge {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px;
                background: rgba(16, 185, 129, 0.1);
                border-radius: 8px;
                font-size: 13px;
                color: var(--success);
            }
        `;
        document.head.appendChild(styles);
    }
}

/**
 * Set feedback rating
 */
function setFeedbackRating(rating) {
    state.feedbackRating = rating;

    document.querySelectorAll('.feedback-star').forEach((star, i) => {
        star.classList.toggle('active', i < rating);
    });

    const labels = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
    document.getElementById('rating-label').textContent = labels[rating - 1];
}

/**
 * Submit feedback from modal
 */
async function submitFeedbackFromModal() {
    if (!state.feedbackTrade) {
        showError('No trade selected for feedback');
        return;
    }

    const trade = state.feedbackTrade;
    const rating = state.feedbackRating || 5;
    const comment = document.getElementById('feedback-comment')?.value || '';

    // Determine target address (the other party)
    const targetAddress = trade.role === 'buyer'
        ? trade.order.seller.address
        : trade.buyer?.address;

    if (!targetAddress) {
        showError('Could not determine trading partner address');
        return;
    }

    // Show loading
    const submitBtn = document.querySelector('#feedback-modal .btn-primary');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;

    try {
        const result = await submitFeedback(trade.id, targetAddress, rating, comment);

        if (result.success) {
            showSuccess('Verified feedback submitted successfully!');
            closeModal('feedback-modal');
            state.feedbackTrade = null;

            // Store locally that we've submitted feedback for this trade
            markFeedbackSubmitted(trade.id);

            // Store comment in GunDB for public visibility
            storeFeedbackInGun(targetAddress, { tradeId: trade.id, rating, comment });
        } else {
            showError(result.error || 'Failed to submit feedback');
        }
    } catch (e) {
        showError('Error submitting feedback: ' + e.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

/**
 * Skip feedback submission
 */
function skipFeedback() {
    closeModal('feedback-modal');
    state.feedbackTrade = null;
}

/**
 * Show REQUIRED feedback modal (cannot be skipped)
 * Used before claiming security deposit
 * @param {Object} trade - The trade object
 * @param {string} role - 'buyer' or 'seller'
 * @param {Function} onComplete - Callback after feedback submitted
 */
function showRequiredFeedbackModal(trade, role, onComplete) {
    state.feedbackTrade = trade;
    state.feedbackRole = role;
    state.feedbackCallback = onComplete;
    state.feedbackRating = 5; // Default to 5 stars

    // Determine who we're reviewing - handle both string and object formats
    const isBuyer = role === 'buyer';
    const targetData = isBuyer ? trade.seller : trade.buyer;
    const targetAddress = typeof targetData === 'string' ? targetData : (targetData?.address || targetData?.pk || '');
    const targetName = typeof targetData === 'object' ? targetData?.name : null;
    const targetLabel = isBuyer ? 'Seller' : 'Buyer';

    // Create or get required feedback modal
    let modal = document.getElementById('required-feedback-modal');
    if (!modal) {
        createRequiredFeedbackModalElement();
        modal = document.getElementById('required-feedback-modal');
    }

    // Populate modal
    document.getElementById('req-feedback-trade-id').textContent = String(trade.id).substring(0, 8);
    document.getElementById('req-feedback-trader-name').textContent = `${targetLabel} (${targetName || shortenAddress(targetAddress || '')})`;
    const tradeAssetId = trade.assetId ?? trade.order?.asset ?? 174;
    const asset = getAssetInfo(tradeAssetId);
    // receiveAmount is already in display units, amount may be in groth — handle both
    let displayAmount;
    if (trade.receiveAmount != null) {
        displayAmount = formatAmount(trade.receiveAmount, 2);
    } else if (trade.amount != null) {
        displayAmount = formatAmountFromGroth(trade.amount, 2);
    } else {
        displayAmount = '—';
    }
    document.getElementById('req-feedback-trade-amount').textContent = displayAmount + ' ' + (asset?.symbol || 'FOMO');
    document.getElementById('req-feedback-role').textContent = `As ${role}, please rate your experience with the ${targetLabel.toLowerCase()}`;

    // Reset rating to 5 stars
    setRequiredFeedbackRating(5);

    // Clear comment
    document.getElementById('req-feedback-comment').value = '';

    openModal('required-feedback-modal');
}

/**
 * Create required feedback modal element - PREMIUM REDESIGN
 */
function createRequiredFeedbackModalElement() {
    const modalHtml = `
        <div class="modal" id="required-feedback-modal">
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width:28px;height:28px;color:#FFD700;filter:drop-shadow(0 0 8px rgba(255,215,0,0.5));">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                        Feedback Required
                    </h2>
                </div>
                <div class="modal-body">
                    <div class="required-feedback-notice">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px;height:24px;flex-shrink:0;">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <span>Your feedback is required to complete this trade and claim your security deposit</span>
                    </div>

                    <div class="feedback-trade-info">
                        <p><span style="color:var(--text-muted)">Trade ID</span> <strong>#<span id="req-feedback-trade-id"></span></strong></p>
                        <p><span style="color:var(--text-muted)">Trading with</span> <strong id="req-feedback-trader-name"></strong></p>
                        <p><span style="color:var(--text-muted)">Amount</span> <span id="req-feedback-trade-amount"></span></p>
                    </div>

                    <p class="feedback-instruction" id="req-feedback-role">Please rate your experience</p>

                    <div class="feedback-rating">
                        <label>Your Rating</label>
                        <div class="star-rating" id="req-star-rating">
                            <span class="feedback-star req-star active" data-rating="1" onclick="setRequiredFeedbackRating(1)">★</span>
                            <span class="feedback-star req-star active" data-rating="2" onclick="setRequiredFeedbackRating(2)">★</span>
                            <span class="feedback-star req-star active" data-rating="3" onclick="setRequiredFeedbackRating(3)">★</span>
                            <span class="feedback-star req-star active" data-rating="4" onclick="setRequiredFeedbackRating(4)">★</span>
                            <span class="feedback-star req-star active" data-rating="5" onclick="setRequiredFeedbackRating(5)">★</span>
                        </div>
                        <span class="rating-label" id="req-rating-label">Excellent</span>
                    </div>

                    <div class="feedback-comment">
                        <label>Comment (optional)</label>
                        <textarea id="req-feedback-comment" rows="3" placeholder="Share your experience with this trader..."></textarea>
                    </div>

                    <div class="feedback-verified-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;flex-shrink:0;">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <span>This feedback will be permanently recorded on the BEAM blockchain</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary btn-lg" onclick="submitRequiredFeedback()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;margin-right:8px;">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        Submit Feedback & Continue
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Set rating for required feedback
 */
function setRequiredFeedbackRating(rating) {
    state.feedbackRating = rating;

    document.querySelectorAll('.req-star').forEach((star, i) => {
        star.classList.toggle('active', i < rating);
    });

    const labels = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
    document.getElementById('req-rating-label').textContent = labels[rating - 1];
}

/**
 * Submit required feedback and continue with callback
 */
async function submitRequiredFeedback() {
    const trade = state.feedbackTrade;
    const role = state.feedbackRole;
    const rating = state.feedbackRating || 5;
    const comment = document.getElementById('req-feedback-comment')?.value || '';

    if (!trade) {
        showError('Trade not found');
        return;
    }

    // Determine target - handle both string and object formats
    const isBuyer = role === 'buyer';
    const targetData = isBuyer ? trade.seller : trade.buyer;
    const targetAddress = typeof targetData === 'string' ? targetData : (targetData?.address || targetData?.pk || '');

    // Store feedback locally first (will be submitted on-chain during claim)
    const feedbackKey = `feedback_${trade.id}_${role}`;
    localStorage.setItem(feedbackKey, JSON.stringify({
        tradeId: trade.id,
        target: targetAddress,
        rating: rating,
        comment: comment,
        role: role,
        timestamp: Date.now()
    }));

    // Mark as submitted
    markFeedbackSubmitted(trade.id);

    // Store comment in GunDB for public visibility
    storeFeedbackInGun(targetAddress, { tradeId: trade.id, rating, comment });

    // Close modal
    closeModal('required-feedback-modal');

    showSuccess('Feedback recorded! Processing your claim...');

    // Call the callback if provided
    if (state.feedbackCallback && typeof state.feedbackCallback === 'function') {
        state.feedbackCallback();
    }

    // Cleanup
    state.feedbackTrade = null;
    state.feedbackRole = null;
    state.feedbackCallback = null;
}

/**
 * Submit feedback on-chain (wrapper for contract call)
 */
async function submitFeedbackOnChain(tradeId, targetAddress, rating) {
    try {
        const result = await submitFeedback(tradeId, targetAddress, rating, '');
        return result;
    } catch (e) {
        console.error('submitFeedbackOnChain error:', e);
        // Don't fail the claim if feedback submission fails
        return { success: false, error: e.message };
    }
}

/**
 * Store feedback comment in GunDB (public, unencrypted)
 * so other users can see it on trader profiles
 */
function storeFeedbackInGun(targetPk, feedbackData) {
    if (typeof Gun === 'undefined' || !targetPk) return;
    try {
        const gun = Gun(['https://gun-manhattan.herokuapp.com/gun']);
        const feedbackPath = gun.get(`beam-p2p-feedback-${targetPk}`);
        const entryId = `${feedbackData.tradeId}_${Date.now()}`;
        feedbackPath.get(entryId).put({
            tradeId: String(feedbackData.tradeId),
            from: state.myPublicKey || 'anonymous',
            rating: feedbackData.rating,
            comment: feedbackData.comment || '',
            timestamp: Date.now()
        });
    } catch (e) {
        console.warn('Failed to store feedback in GunDB:', e);
    }
}

/**
 * Fetch feedback comments from GunDB for a trader
 */
function fetchFeedbackFromGun(targetPk) {
    return new Promise((resolve) => {
        if (typeof Gun === 'undefined' || !targetPk) { resolve([]); return; }
        const gun = Gun(['https://gun-manhattan.herokuapp.com/gun']);
        const feedbacks = [];

        gun.get(`beam-p2p-feedback-${targetPk}`).map().once((data, key) => {
            if (data && data.rating && key !== '_') {
                feedbacks.push({
                    tradeId: data.tradeId,
                    from: data.from,
                    rating: data.rating,
                    comment: data.comment || '',
                    timestamp: data.timestamp
                });
            }
        });

        setTimeout(() => {
            feedbacks.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            resolve(feedbacks);
        }, 2000);
    });
}

/**
 * Mark feedback as submitted locally
 */
function markFeedbackSubmitted(tradeId) {
    const submitted = JSON.parse(localStorage.getItem('p2p_feedback_submitted') || '[]');
    if (!submitted.includes(tradeId)) {
        submitted.push(tradeId);
        localStorage.setItem('p2p_feedback_submitted', JSON.stringify(submitted));
    }
}

/**
 * Check if feedback was submitted for a trade
 */
function hasFeedbackSubmitted(tradeId) {
    const submitted = JSON.parse(localStorage.getItem('p2p_feedback_submitted') || '[]');
    return submitted.includes(tradeId);
}

/**
 * Show trader reputation modal
 */
async function showTraderReputation(address) {
    const rep = await getTraderReputation(address);
    const feedback = await getFeedbackForTrader(address, 0, 10);

    if (!rep) {
        showError('Could not load trader reputation');
        return;
    }

    // Build reputation HTML with tooltips
    let badgesHtml = rep.badges.map(b => {
        const badgeInfo = {
            'verified': { icon: '✓', text: 'Verified', class: 'badge-verified', tooltip: 'Identity verified through additional checks' },
            'fire': { icon: '🔥', text: 'Top Trader', class: 'badge-fire', tooltip: '95%+ trust score with 50+ completed trades' },
            'diamond': { icon: '💎', text: 'Diamond', class: 'badge-diamond', tooltip: '500+ completed trades' },
            'escrow': { icon: '🛡️', text: 'Escrow', class: 'badge-escrow', tooltip: 'Active escrow staker who can resolve disputes' },
            'star': { icon: '⭐', text: 'Rising Star', class: 'badge-star', tooltip: 'New trader showing great potential' }
        }[b];
        return badgeInfo ? `<span class="badge ${badgeInfo.class}" data-tooltip="${badgeInfo.tooltip}">${badgeInfo.icon} ${badgeInfo.text}</span>` : '';
    }).join('');

    // Merge on-chain feedback with GunDB comments
    const gunFeedbacks = await fetchFeedbackFromGun(address);
    const gunByTrade = {};
    for (const gf of gunFeedbacks) {
        gunByTrade[gf.tradeId] = gf;
    }

    let feedbackHtml = '';
    for (const f of feedback.feedbacks) {
        const tradeIdStr = f.tradeId.toString();
        const gunEntry = gunByTrade[tradeIdStr];
        const commentText = gunEntry?.comment || '';
        delete gunByTrade[tradeIdStr];

        feedbackHtml += `
            <div class="feedback-item">
                <div class="feedback-header">
                    <span class="feedback-stars">${'★'.repeat(f.rating)}${'☆'.repeat(5-f.rating)}</span>
                    <span class="feedback-date">${formatTimeAgo(f.createdAt * 1000)}</span>
                </div>
                ${commentText ? `<div class="feedback-comment-text">${escapeHtml(commentText)}</div>` : ''}
                <div class="feedback-trade-ref">Trade #${tradeIdStr.substring(0, 8)}</div>
            </div>
        `;
    }
    // GunDB-only entries
    for (const gf of Object.values(gunByTrade)) {
        feedbackHtml += `
            <div class="feedback-item">
                <div class="feedback-header">
                    <span class="feedback-stars">${'★'.repeat(gf.rating)}${'☆'.repeat(5-gf.rating)}</span>
                    <span class="feedback-date">${formatTimeAgo(gf.timestamp)}</span>
                </div>
                ${gf.comment ? `<div class="feedback-comment-text">${escapeHtml(gf.comment)}</div>` : ''}
                <div class="feedback-trade-ref">Trade #${(gf.tradeId || '').toString().substring(0, 8)}</div>
            </div>
        `;
    }
    if (!feedbackHtml) feedbackHtml = '<p style="color:var(--text-muted);text-align:center;">No feedback yet</p>';

    const html = `
        <div class="reputation-modal-content">
            <div class="rep-header">
                <div class="rep-avatar">${address.substring(0, 2).toUpperCase()}</div>
                <div class="rep-info">
                    <h3>${address.substring(0, 12)}...</h3>
                    <div class="rep-badges">${badgesHtml}</div>
                </div>
            </div>

            <div class="rep-stats-grid">
                <div class="rep-stat">
                    <span class="stat-value">${rep.trustScore}%</span>
                    <span class="stat-label">Trust Score</span>
                </div>
                <div class="rep-stat">
                    <span class="stat-value">${rep.totalTrades}</span>
                    <span class="stat-label">Trades</span>
                </div>
                <div class="rep-stat">
                    <span class="stat-value">${rep.avgRating.toFixed(1)}★</span>
                    <span class="stat-label">Avg Rating</span>
                </div>
                <div class="rep-stat">
                    <span class="stat-value">${formatVolume(rep.totalVolume)}</span>
                    <span class="stat-label">Volume</span>
                </div>
            </div>

            <div class="rep-details">
                <div class="detail-row">
                    <span>Successful trades</span>
                    <span>${rep.successfulTrades}/${rep.totalTrades}</span>
                </div>
                <div class="detail-row">
                    <span>Disputes won</span>
                    <span class="success">${rep.disputesWon}</span>
                </div>
                <div class="detail-row">
                    <span>Disputes lost</span>
                    <span class="error">${rep.disputesLost}</span>
                </div>
                <div class="detail-row">
                    <span>Member since</span>
                    <span>${formatDate(rep.registeredAt * 1000)}</span>
                </div>
            </div>

            <div class="rep-feedback-section">
                <h4>Verified Feedback (${feedback.totalCount})</h4>
                <div class="feedback-list">
                    ${feedbackHtml}
                </div>
            </div>
        </div>
    `;

    // Show in a modal
    showCustomModal('Trader Reputation', html);
}

/**
 * Show custom modal with arbitrary content
 */
function showCustomModal(title, content) {
    // Remove existing custom modal
    const existing = document.getElementById('custom-modal');
    if (existing) existing.remove();

    const modalHtml = `
        <div class="modal show" id="custom-modal">
            <div class="modal-backdrop" onclick="closeModal('custom-modal')"></div>
            <div class="modal-content" style="max-width:480px;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="closeModal('custom-modal')">×</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Add reputation styles if not present
    if (!document.getElementById('reputation-styles')) {
        const styles = document.createElement('style');
        styles.id = 'reputation-styles';
        styles.textContent = `
            .rep-header { display: flex; gap: 16px; margin-bottom: 20px; }
            .rep-avatar { width: 60px; height: 60px; background: var(--accent-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 600; color: #000; }
            .rep-info h3 { margin: 0 0 8px 0; }
            .rep-badges { display: flex; gap: 8px; flex-wrap: wrap; }
            .rep-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
            .rep-stat { text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: 8px; }
            .stat-value { display: block; font-size: 18px; font-weight: 600; color: var(--text-primary); }
            .stat-label { font-size: 11px; color: var(--text-muted); }
            .rep-details { margin-bottom: 20px; }
            .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border-color); }
            .detail-row .success { color: var(--success); }
            .detail-row .error { color: var(--error); }
            .rep-feedback-section h4 { margin-bottom: 12px; }
            .feedback-list { max-height: 200px; overflow-y: auto; }
            .feedback-item { padding: 12px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 8px; }
            .feedback-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
            .feedback-stars { color: #fbbf24; }
            .feedback-date { color: var(--text-muted); font-size: 12px; }
            .feedback-trade-ref { color: var(--text-muted); font-size: 12px; }
        `;
        document.head.appendChild(styles);
    }
}

/**
 * Format volume for display
 */
function formatVolume(groth) {
    const beam = groth / GROTH;
    if (beam >= 1000000) return (beam / 1000000).toFixed(1) + 'M';
    if (beam >= 1000) return (beam / 1000).toFixed(1) + 'K';
    return beam.toFixed(0);
}

/**
 * Format date
 */
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString();
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return formatDate(timestamp);
}

/**
 * Trade completed handler - show feedback modal
 */
function onTradeCompleted(trade) {
    // Stop timer if running
    if (timerInterval) clearInterval(timerInterval);

    // Update UI with status-specific theming
    updateTradeStatusUI('completed');
    document.getElementById('active-trade-timer').textContent = '';
    document.getElementById('active-trade-progress').style.width = '100%';
    document.getElementById('active-trade-progress').style.background = 'var(--success)';

    // Update timeline
    const items = document.querySelectorAll('.timeline-item');
    items.forEach(item => {
        item.classList.remove('active');
        item.classList.add('completed');
    });

    // Show completion message
    document.getElementById('active-trade-footer').innerHTML = `
        <div style="text-align:center;padding:20px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" style="width:48px;height:48px;margin-bottom:12px;">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9 12l2 2 4-4"/>
            </svg>
            <h3 style="color:var(--success);margin-bottom:8px;">Trade Completed!</h3>
            <p style="color:var(--text-secondary);margin-bottom:16px;">Funds have been released to your wallet.</p>
            <button class="btn-primary" onclick="closeTradeAndShowFeedback()">Continue</button>
        </div>
    `;
}

/**
 * Close trade modal and show feedback
 */
function closeTradeAndShowFeedback() {
    const trade = state.activeTrade;
    closeModal('active-trade-modal');

    // Show feedback modal if not already submitted
    if (trade && !hasFeedbackSubmitted(trade.id)) {
        setTimeout(() => showFeedbackModal(trade), 300);
    }

    state.activeTrade = null;
}

function showSettings() {
    // Open payment methods manager as part of settings
    showPaymentMethodsManager();
}

function toggleAdvancedFilters() {
    const filterPanel = document.getElementById('advanced-filters-panel');
    if (!filterPanel) {
        createAdvancedFiltersPanel();
        return;
    }
    filterPanel.classList.toggle('show');
}

/**
 * Create advanced filters panel
 */
function createAdvancedFiltersPanel() {
    const filterBtn = document.querySelector('.filter-btn');
    if (!filterBtn) return;

    // Check if panel already exists
    if (document.getElementById('advanced-filters-panel')) {
        document.getElementById('advanced-filters-panel').classList.toggle('show');
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'advanced-filters-panel';
    panel.className = 'advanced-filters-panel show';
    panel.innerHTML = `
        <div class="filter-section">
            <h4>Trust & Reputation</h4>
            <div class="filter-row">
                <label>Min Trust Score</label>
                <div class="filter-slider-group">
                    <input type="range" id="filter-trust-score" min="0" max="100" value="${state.advancedFilters.minTrustScore}"
                           oninput="updateTrustScoreLabel(this.value)">
                    <span id="trust-score-label">${state.advancedFilters.minTrustScore}%</span>
                </div>
            </div>
            <div class="filter-row">
                <label>Min Completed Trades</label>
                <input type="number" id="filter-min-trades" min="0" value="${state.advancedFilters.minTrades}"
                       placeholder="0">
            </div>
            <div class="filter-row">
                <label>Min Feedback Count</label>
                <input type="number" id="filter-min-feedback" min="0" value="${state.advancedFilters.minFeedback}"
                       placeholder="0">
            </div>
        </div>

        <div class="filter-section">
            <h4>Required Badges</h4>
            <div class="badge-filters">
                <label class="badge-filter-item">
                    <input type="checkbox" id="filter-badge-verified" ${state.advancedFilters.badgeFilters.verified ? 'checked' : ''}>
                    <span class="badge badge-verified">✓</span>
                    <span>Verified</span>
                </label>
                <label class="badge-filter-item">
                    <input type="checkbox" id="filter-badge-fire" ${state.advancedFilters.badgeFilters.fire ? 'checked' : ''}>
                    <span class="badge badge-fire">🔥</span>
                    <span>Top Trader</span>
                </label>
                <label class="badge-filter-item">
                    <input type="checkbox" id="filter-badge-diamond" ${state.advancedFilters.badgeFilters.diamond ? 'checked' : ''}>
                    <span class="badge badge-diamond">💎</span>
                    <span>Diamond</span>
                </label>
                <label class="badge-filter-item">
                    <input type="checkbox" id="filter-badge-escrow" ${state.advancedFilters.badgeFilters.escrow ? 'checked' : ''}>
                    <span class="badge badge-escrow">🛡️</span>
                    <span>Escrow Staker</span>
                </label>
            </div>
        </div>

        <div class="filter-section">
            <h4>Display Options</h4>
            <label class="filter-checkbox">
                <input type="checkbox" id="filter-hide-own" ${state.advancedFilters.hideOwnOrders ? 'checked' : ''}>
                <span>Hide my orders</span>
            </label>
        </div>

        <div class="filter-actions">
            <button class="btn-secondary" onclick="resetAdvancedFilters()">Reset All</button>
            <button class="btn-primary" onclick="applyAdvancedFilters()">Apply Filters</button>
        </div>
    `;

    // Insert after filter button's parent
    filterBtn.parentElement.appendChild(panel);
}

/**
 * Update trust score label
 */
function updateTrustScoreLabel(value) {
    document.getElementById('trust-score-label').textContent = value + '%';
}

/**
 * Apply advanced filters
 */
function applyAdvancedFilters() {
    // Read values from form
    state.advancedFilters.minTrustScore = parseInt(document.getElementById('filter-trust-score')?.value || 0);
    state.advancedFilters.minTrades = parseInt(document.getElementById('filter-min-trades')?.value || 0);
    state.advancedFilters.minFeedback = parseInt(document.getElementById('filter-min-feedback')?.value || 0);

    state.advancedFilters.badgeFilters.verified = document.getElementById('filter-badge-verified')?.checked || false;
    state.advancedFilters.badgeFilters.fire = document.getElementById('filter-badge-fire')?.checked || false;
    state.advancedFilters.badgeFilters.diamond = document.getElementById('filter-badge-diamond')?.checked || false;
    state.advancedFilters.badgeFilters.escrow = document.getElementById('filter-badge-escrow')?.checked || false;

    state.advancedFilters.hideOwnOrders = document.getElementById('filter-hide-own')?.checked || false;

    // Check if any filters are active
    const hasActiveFilters =
        state.advancedFilters.minTrustScore > 0 ||
        state.advancedFilters.minTrades > 0 ||
        state.advancedFilters.minFeedback > 0 ||
        state.advancedFilters.badgeFilters.verified ||
        state.advancedFilters.badgeFilters.fire ||
        state.advancedFilters.badgeFilters.diamond ||
        state.advancedFilters.badgeFilters.escrow ||
        state.advancedFilters.hideOwnOrders;

    state.advancedFilters.enabled = hasActiveFilters;

    // Update filter badge
    updateFilterBadge();

    // Close panel
    document.getElementById('advanced-filters-panel')?.classList.remove('show');

    // Re-render orders
    renderOrders();

    if (hasActiveFilters) {
        showSuccess('Filters applied');
    }
}

/**
 * Reset advanced filters
 */
function resetAdvancedFilters() {
    state.advancedFilters = {
        enabled: false,
        minTrustScore: 0,
        minTrades: 0,
        minFeedback: 0,
        badgeFilters: {
            verified: false,
            fire: false,
            diamond: false,
            escrow: false
        },
        hideOwnOrders: false
    };

    // Reset form fields
    const trustScore = document.getElementById('filter-trust-score');
    if (trustScore) trustScore.value = 0;
    document.getElementById('trust-score-label').textContent = '0%';

    const minTrades = document.getElementById('filter-min-trades');
    if (minTrades) minTrades.value = 0;

    const minFeedback = document.getElementById('filter-min-feedback');
    if (minFeedback) minFeedback.value = 0;

    document.querySelectorAll('#advanced-filters-panel input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });

    updateFilterBadge();
    renderOrders();
    showSuccess('Filters reset');
}

/**
 * Update filter badge counter
 */
function updateFilterBadge() {
    const badge = document.getElementById('filter-badge');
    if (!badge) return;

    let count = 0;
    if (state.advancedFilters.minTrustScore > 0) count++;
    if (state.advancedFilters.minTrades > 0) count++;
    if (state.advancedFilters.minFeedback > 0) count++;
    if (state.advancedFilters.badgeFilters.verified) count++;
    if (state.advancedFilters.badgeFilters.fire) count++;
    if (state.advancedFilters.badgeFilters.diamond) count++;
    if (state.advancedFilters.badgeFilters.escrow) count++;
    if (state.advancedFilters.hideOwnOrders) count++;

    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

function openTradeChat() {
    const chatSection = document.getElementById('trade-chat');
    if (chatSection) {
        chatSection.scrollIntoView({ behavior: 'smooth' });
        document.getElementById('chat-input')?.focus();
    }
}

// ============================================
// TRADER REGISTRATION
// ============================================

/**
 * Show registration modal
 */
function showRegistrationModal() {
    // Generate trader ID from wallet address
    const traderId = state.myAddress
        ? state.myAddress.substring(0, 8).toLowerCase()
        : 'xxxxxxxx';

    document.getElementById('register-trader-id').textContent = traderId;
    document.getElementById('register-nickname').value = '';

    openModal('register-modal');
}

/**
 * Submit trader registration to contract
 */
async function submitRegistration() {
    const nickname = document.getElementById('register-nickname').value.trim();

    // Validation
    if (!nickname) {
        showError('Please enter a nickname');
        return;
    }

    if (nickname.length < 3 || nickname.length > 20) {
        showError('Nickname must be 3-20 characters');
        return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(nickname)) {
        showError('Nickname can only contain letters, numbers, underscores and hyphens');
        return;
    }

    showLoading('Registering on smart contract...');

    try {
        // Register on-chain ONLY (contract is the single source of truth)
        const result = await contractCall('register_trader', {
            nickname: nickname
        }, true);

        hideLoading();

        if (result.success) {
            state.isRegistered = true;
            state.traderNickname = nickname;

            // Store locally for quick access
            localStorage.setItem('p2p_trader_nickname', nickname);
            localStorage.setItem('p2p_is_registered', 'true');

            // Hide registration banner and update role badges
            updateRegistrationBanner();
            updateRoleBadges();

            showSuccess(`Registered as "${nickname}" on smart contract!`);
            closeModal('register-modal');
        } else {
            showError(result.error || 'Failed to register on contract');
        }

    } catch (e) {
        hideLoading();
        console.error('Registration failed:', e);
        showError('Failed to register: ' + e.message);
    }
}

/**
 * Check if user is registered
 */
async function checkRegistrationStatus() {
    // First check local storage
    if (localStorage.getItem('p2p_is_registered') === 'true') {
        state.isRegistered = true;
        state.traderNickname = localStorage.getItem('p2p_trader_nickname');
        return true;
    }

    // Then check contract
    if (state.myAddress) {
        const info = await getTraderInfo(state.myAddress);
        if (info && info.registered) {
            state.isRegistered = true;
            return true;
        }
    }

    return false;
}

// ============================================
// PAYMENT METHOD MANAGER
// ============================================

/**
 * Show payment methods manager modal
 */
function showPaymentMethodsManager() {
    renderSavedPaymentMethods();
    openModal('payment-methods-modal');
}

/**
 * Render list of saved payment methods
 */
function renderSavedPaymentMethods() {
    const container = document.getElementById('saved-payment-methods-list');
    if (!container) return;

    const savedMethods = ArweaveStorage.getPaymentCredentials();
    const methodIds = Object.keys(savedMethods);

    if (methodIds.length === 0) {
        container.innerHTML = '<p class="empty-msg">No payment methods saved yet</p>';
        return;
    }

    let html = '';

    for (const methodId of methodIds) {
        const method = getPaymentMethodInfo(methodId);
        const saved = savedMethods[methodId];

        // Use saved methodName if available, otherwise from config
        const displayName = saved?.methodName || method?.name || methodId;
        const icon = method?.icon || '💳';

        // Get preview of credentials
        let preview = '';
        if (saved?.accountInfo) {
            const lines = saved.accountInfo.split('\n');
            preview = lines[0].substring(0, 40) + (lines[0].length > 40 ? '...' : '');
        }

        html += `
            <div class="saved-payment-method" data-method="${methodId}">
                <div class="method-icon">${icon}</div>
                <div class="method-details">
                    <div class="method-name">${displayName}</div>
                    <div class="method-preview">${escapeHtml(preview)}</div>
                </div>
                <div class="method-actions">
                    <button class="btn-small" onclick="editPaymentMethod('${methodId}')">Edit</button>
                    <button class="btn-small btn-danger" onclick="deletePaymentMethod('${methodId}')">Delete</button>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Add styles if not present
    if (!document.getElementById('payment-manager-styles')) {
        const style = document.createElement('style');
        style.id = 'payment-manager-styles';
        style.textContent = `
            .saved-payment-method {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 16px;
                background: var(--bg-tertiary);
                border-radius: 8px;
                margin-bottom: 12px;
            }
            .method-icon {
                font-size: 24px;
                width: 40px;
                text-align: center;
            }
            .method-details {
                flex: 1;
            }
            .method-name {
                font-weight: 500;
                color: var(--text-primary);
            }
            .method-preview {
                font-size: 12px;
                color: var(--text-muted);
                margin-top: 4px;
            }
            .method-actions {
                display: flex;
                gap: 8px;
            }
            .btn-small {
                padding: 6px 12px;
                font-size: 12px;
                border-radius: 4px;
                border: none;
                cursor: pointer;
                background: var(--bg-secondary);
                color: var(--text-primary);
            }
            .btn-small:hover {
                background: var(--accent-primary);
                color: #000;
            }
            .btn-small.btn-danger:hover {
                background: var(--error);
                color: white;
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Show add payment method modal
 */
function showAddPaymentMethod() {
    // Reset form
    document.getElementById('add-payment-type').value = 'bank_transfer';
    updatePaymentFields();

    openModal('add-payment-modal');
}

/**
 * Update payment form fields based on selected type
 */
function updatePaymentFields() {
    const type = document.getElementById('add-payment-type').value;
    const method = getPaymentMethodInfo(type);
    const container = document.getElementById('payment-fields-container');

    if (!container) return;

    // Build fields HTML - use fields from method info if available
    let html = '';

    // method.fields comes from P2P_CONFIG fallback
    if (method?.fields && Array.isArray(method.fields)) {
        for (const field of method.fields) {
            html += `
                <div class="form-group">
                    <label>${field.label}:</label>
                    <input type="text"
                           id="payment-field-${field.id}"
                           placeholder="${field.placeholder || ''}"
                           class="form-input">
                </div>
            `;
        }
    } else {
        // Generic field for methods without defined fields
        html = `
            <div class="form-group">
                <label>Payment Details:</label>
                <textarea id="payment-field-details" rows="4"
                    placeholder="Enter your payment details..."
                    class="form-input"></textarea>
            </div>
        `;
    }

    container.innerHTML = html;

    // Check if we have saved data for this method
    const saved = ArweaveStorage.getPaymentCredential(type);
    if (saved && saved.fields) {
        for (const [fieldId, value] of Object.entries(saved.fields)) {
            const input = document.getElementById(`payment-field-${fieldId}`);
            if (input) input.value = value;
        }
    }
}

/**
 * Edit existing payment method
 */
function editPaymentMethod(methodId) {
    document.getElementById('add-payment-type').value = methodId;
    updatePaymentFields();

    // Load saved data
    const saved = ArweaveStorage.getPaymentCredential(methodId);
    if (saved && saved.fields) {
        for (const [fieldId, value] of Object.entries(saved.fields)) {
            const input = document.getElementById(`payment-field-${fieldId}`);
            if (input) input.value = value;
        }
    }

    closeModal('payment-methods-modal');
    openModal('add-payment-modal');
}

/**
 * Delete payment method
 */
function deletePaymentMethod(methodId) {
    const methodName = getPaymentMethodName(methodId);
    if (!confirm(`Delete ${methodName} payment method?`)) return;

    ArweaveStorage.deletePaymentCredentials(methodId);
    state.savedPaymentAccounts = ArweaveStorage.getPaymentCredentials();

    showSuccess('Payment method deleted');
    renderSavedPaymentMethods();
}

/**
 * Save payment method from form (simplified - just name and details)
 */
function savePaymentMethod() {
    const nameInput = document.getElementById('add-payment-name');
    const detailsInput = document.getElementById('add-payment-details');

    const name = nameInput?.value?.trim() || '';
    const details = detailsInput?.value?.trim() || '';

    if (!name) {
        showError('Please enter a payment method name');
        return;
    }

    if (!details) {
        showError('Please enter payment details');
        return;
    }

    // Generate a unique ID for this payment method
    const methodId = 'custom_' + Date.now();

    // Save to storage
    ArweaveStorage.savePaymentCredentials(methodId, {
        fields: { name, details },
        accountInfo: details,
        methodName: name
    });

    // Update state
    state.savedPaymentAccounts = ArweaveStorage.getPaymentCredentials();

    // Clear form
    if (nameInput) nameInput.value = '';
    if (detailsInput) detailsInput.value = '';

    showSuccess(`${name} saved!`);
    closeModal('add-payment-modal');

    // If payment methods modal is open, refresh it
    if (document.getElementById('payment-methods-modal')?.classList.contains('show')) {
        renderSavedPaymentMethods();
    }
}

// ============================================
// DISPUTE CENTER
// ============================================

/**
 * Show dispute tab
 */
function showDisputeTab(tab) {
    // Update tab buttons using data attribute
    document.querySelectorAll('.dispute-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Show/hide sections
    const myDisputesSection = document.getElementById('my-disputes-section');
    const arbitrationSection = document.getElementById('arbitration-section');

    if (tab === 'my-disputes') {
        myDisputesSection.style.display = 'block';
        arbitrationSection.style.display = 'none';
        loadMyDisputes();
    } else {
        myDisputesSection.style.display = 'none';
        arbitrationSection.style.display = 'block';
        loadArbitrationQueue();
    }
}

/**
 * Load my disputes
 */
async function loadMyDisputes() {
    const container = document.getElementById('my-disputes-list');
    if (!container) return;

    container.innerHTML = '<p class="loading-msg">Loading disputes...</p>';

    try {
        // Try to get from API
        const result = await apiCall(`/disputes?address=${state.myAddress}`);

        if (result.disputes && result.disputes.length > 0) {
            renderDisputesList(container, result.disputes);
        } else {
            container.innerHTML = '<p class="empty-msg">No active disputes</p>';
        }
    } catch (e) {
        container.innerHTML = '<p class="empty-msg">No active disputes</p>';
    }
}

/**
 * Load arbitration queue (for escrow stakers)
 */
async function loadArbitrationQueue() {
    const container = document.getElementById('arbitration-list');
    if (!container) return;

    container.innerHTML = '<p class="loading-msg">Loading arbitration queue...</p>';

    try {
        const result = await apiCall('/disputes?status=pending');

        if (result.disputes && result.disputes.length > 0) {
            renderArbitrationList(container, result.disputes);
            document.getElementById('arb-pending').textContent = result.disputes.length;
        } else {
            container.innerHTML = '<p class="empty-msg">No disputes available for arbitration</p>';
        }
    } catch (e) {
        container.innerHTML = '<p class="empty-msg">No disputes available for arbitration</p>';
    }
}

/**
 * Render disputes list
 */
function renderDisputesList(container, disputes) {
    let html = '';

    for (const dispute of disputes) {
        const statusClass = dispute.status === 'resolved' ? 'status-success' :
                           dispute.status === 'pending' ? 'status-warning' : 'status-active';

        html += `
            <div class="dispute-card" onclick="showDisputeDetails('${dispute.id}')">
                <div class="dispute-header">
                    <span class="dispute-id">#${dispute.id}</span>
                    <span class="dispute-status ${statusClass}">${dispute.status}</span>
                </div>
                <div class="dispute-body">
                    <div class="dispute-row">
                        <span>Trade:</span>
                        <span>#${dispute.tradeId}</span>
                    </div>
                    <div class="dispute-row">
                        <span>Reason:</span>
                        <span>${dispute.reason || 'Not specified'}</span>
                    </div>
                    <div class="dispute-row">
                        <span>Opened:</span>
                        <span>${formatTimeAgo(dispute.createdAt * 1000)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
    addDisputeStyles();
}

/**
 * Render arbitration list
 */
function renderArbitrationList(container, disputes) {
    let html = '';

    for (const dispute of disputes) {
        const tradeId = dispute.trade_id || dispute.tradeId || dispute.id;
        html += `
            <div class="dispute-card arbitration-card">
                <div class="dispute-header">
                    <span class="dispute-id">#${dispute.id}</span>
                    <span class="dispute-amount">${formatAmountFromGroth(dispute.amount)} FOMO</span>
                </div>
                <div class="dispute-body">
                    <div class="dispute-row">
                        <span>Trade ID:</span>
                        <span>#${tradeId}</span>
                    </div>
                    <div class="dispute-row">
                        <span>Buyer claims:</span>
                        <span>${dispute.buyerClaim || 'Payment sent'}</span>
                    </div>
                    <div class="dispute-row">
                        <span>Seller claims:</span>
                        <span>${dispute.sellerClaim || 'No payment received'}</span>
                    </div>
                    <div class="dispute-row">
                        <span>Votes:</span>
                        <span>${dispute.votes || 0}/3</span>
                    </div>
                </div>
                <div class="arbitration-actions">
                    <button class="btn-small btn-chat-decrypt" onclick="showImportKeyModal('${tradeId}')" title="Import chat encryption key from trader">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        Decrypt Chat
                    </button>
                    <button class="btn-small" onclick="viewDisputeEvidence('${dispute.id}')">View Evidence</button>
                    <button class="btn-small btn-success" onclick="voteDispute('${dispute.id}', 'buyer')">Buyer Wins</button>
                    <button class="btn-small btn-warning" onclick="voteDispute('${dispute.id}', 'seller')">Seller Wins</button>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
    addDisputeStyles();
}

/**
 * Add dispute styles
 */
function addDisputeStyles() {
    if (document.getElementById('dispute-card-styles')) return;

    const style = document.createElement('style');
    style.id = 'dispute-card-styles';
    style.textContent = `
        .dispute-card {
            background: var(--bg-tertiary);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .dispute-card:hover {
            background: var(--bg-secondary);
        }
        .dispute-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .dispute-id {
            font-weight: 600;
            color: var(--text-primary);
        }
        .dispute-status {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .dispute-amount {
            color: var(--accent-primary);
            font-weight: 500;
        }
        .dispute-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 14px;
        }
        .dispute-row span:first-child {
            color: var(--text-muted);
        }
        .arbitration-actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--border-color);
        }
        .btn-success {
            background: var(--success) !important;
            color: white !important;
        }
        .btn-warning {
            background: var(--warning) !important;
            color: #000 !important;
        }
        .btn-chat-decrypt {
            background: var(--info) !important;
            color: white !important;
            display: inline-flex !important;
            align-items: center;
            gap: 4px;
        }
        .btn-chat-decrypt svg {
            flex-shrink: 0;
        }
        .loading-msg {
            text-align: center;
            color: var(--text-muted);
            padding: 20px;
        }
        .dispute-detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid var(--border-color);
        }
        .dispute-detail-row:last-of-type {
            border-bottom: none;
        }
        .dispute-detail-row .label {
            color: var(--text-muted);
            font-size: 13px;
        }
        .dispute-detail-row .value {
            color: var(--text-primary);
            font-weight: 500;
            text-align: right;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Show dispute details
 */
async function showDisputeDetails(disputeId) {
    // Fetch dispute details from contract
    try {
        const args = `role=user,action=view_dispute,cid=${P2P_ESCROW_CID},dispute_id=${disputeId}`;
        const result = await invokeContract(args, false);

        if (result && result.dispute) {
            const d = result.dispute;
            const tradeId = d.trade_id || d.tradeId || disputeId;

            const modalHtml = `
                <div class="modal-overlay active" id="dispute-details-modal" onclick="if(event.target===this)closeModal('dispute-details-modal')">
                    <div class="modal-content" style="max-width: 500px;">
                        <div class="modal-header">
                            <h3>Dispute #${disputeId}</h3>
                            <button class="modal-close" onclick="closeModal('dispute-details-modal')">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="dispute-detail-row">
                                <span class="label">Trade ID:</span>
                                <span class="value">#${tradeId}</span>
                            </div>
                            <div class="dispute-detail-row">
                                <span class="label">Amount:</span>
                                <span class="value">${formatAmountFromGroth(d.amount || 0)} FOMO</span>
                            </div>
                            <div class="dispute-detail-row">
                                <span class="label">Buyer:</span>
                                <span class="value" style="font-family: var(--font-mono); font-size: 11px;">
                                    ${d.buyer ? d.buyer.substring(0, 12) + '...' : 'Unknown'}
                                </span>
                            </div>
                            <div class="dispute-detail-row">
                                <span class="label">Seller:</span>
                                <span class="value" style="font-family: var(--font-mono); font-size: 11px;">
                                    ${d.seller ? d.seller.substring(0, 12) + '...' : 'Unknown'}
                                </span>
                            </div>
                            <div class="dispute-detail-row">
                                <span class="label">Reason:</span>
                                <span class="value">${d.reason || 'Not specified'}</span>
                            </div>
                            <div class="dispute-detail-row">
                                <span class="label">Opened:</span>
                                <span class="value">${d.opened_at ? new Date(d.opened_at * 1000).toLocaleString() : 'Unknown'}</span>
                            </div>
                            <div class="dispute-detail-row">
                                <span class="label">Votes:</span>
                                <span class="value">${d.votes || 0}/3</span>
                            </div>

                            ${state.isEscrow ? `
                                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color);">
                                    <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 12px;">
                                        As an escrow, you can request the chat encryption key from traders to review their conversation.
                                    </p>
                                    <button class="btn-primary" onclick="closeModal('dispute-details-modal'); showImportKeyModal('${tradeId}')">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                        </svg>
                                        Import Chat Key & Decrypt
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                        <div class="modal-footer">
                            <button class="btn-secondary" onclick="closeModal('dispute-details-modal')">Close</button>
                        </div>
                    </div>
                </div>
            `;

            const existing = document.getElementById('dispute-details-modal');
            if (existing) existing.remove();
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        } else {
            showError('Could not load dispute details');
        }
    } catch (e) {
        console.error('Error loading dispute:', e);
        showError('Failed to load dispute details');
    }
}

/**
 * View dispute evidence (includes chat history option for escrows)
 */
function viewDisputeEvidence(disputeId) {
    // For now, show a modal that explains how to get chat access
    const modalHtml = `
        <div class="modal-overlay active" id="dispute-evidence-modal" onclick="if(event.target===this)closeModal('dispute-evidence-modal')">
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h3>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                        </svg>
                        Dispute Evidence
                    </h3>
                    <button class="modal-close" onclick="closeModal('dispute-evidence-modal')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="evidence-section">
                        <h4 style="color: var(--text-primary); margin-bottom: 12px;">Available Evidence:</h4>

                        <div class="evidence-item" style="padding: 12px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--info)" stroke-width="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                </svg>
                                <strong style="color: var(--text-primary);">Chat History</strong>
                            </div>
                            <p style="color: var(--text-secondary); font-size: 13px; margin: 0 0 12px 0;">
                                The chat between buyer and seller is end-to-end encrypted.
                                Request the chat key from one of the traders to decrypt and review their conversation.
                            </p>
                            <button class="btn-small btn-primary" onclick="closeModal('dispute-evidence-modal'); showImportKeyModal('${disputeId}')">
                                Import Chat Key
                            </button>
                        </div>

                        <div class="evidence-item" style="padding: 12px; background: var(--bg-tertiary); border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="8" x2="12" y2="12"/>
                                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                                <strong style="color: var(--text-primary);">On-chain Data</strong>
                            </div>
                            <p style="color: var(--text-secondary); font-size: 13px; margin: 0;">
                                Transaction timestamps, amounts, and status changes are recorded on the blockchain and visible in the dispute details.
                            </p>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeModal('dispute-evidence-modal')">Close</button>
                </div>
            </div>
        </div>
    `;

    const existing = document.getElementById('dispute-evidence-modal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Vote on a dispute as escrow
 */
async function voteDispute(disputeId, decision) {
    if (!confirm(`Vote ${decision} wins for dispute #${disputeId}?`)) return;

    showLoading('Submitting vote...');

    try {
        const result = await escrowVote(disputeId, decision);

        hideLoading();

        if (result.success) {
            showSuccess('Vote submitted!');
            loadArbitrationQueue();
        } else {
            showError(result.error || 'Failed to submit vote');
        }
    } catch (e) {
        hideLoading();
        showError('Error: ' + e.message);
    }
}

// ============================================
// TRADER PROFILE
// ============================================

/**
 * Show trader profile modal
 */
async function showTraderProfile(address) {
    openModal('trader-profile-modal');

    // Set loading state
    document.getElementById('profile-nickname').textContent = 'Loading...';
    document.getElementById('profile-short-id').textContent = `[${address.substring(0, 8)}]`;
    document.getElementById('profile-avatar').textContent = address.substring(0, 2).toUpperCase();
    document.getElementById('profile-trust-score').textContent = '...';
    document.getElementById('profile-trades').textContent = '...';
    document.getElementById('profile-success').textContent = '...';
    document.getElementById('profile-volume').textContent = '...';
    document.getElementById('profile-avg-time').textContent = '...';
    document.getElementById('profile-badges').innerHTML = '';
    document.getElementById('profile-feedback-list').innerHTML = '<p class="empty-msg">Loading...</p>';

    // Fetch trader data
    const rep = await getTraderReputation(address);
    const feedback = await getFeedbackForTrader(address, 0, 5);

    if (rep) {
        document.getElementById('profile-nickname').textContent = rep.nickname || `Trader ${address.substring(0, 8)}`;
        document.getElementById('profile-trust-score').textContent = rep.trustScore;
        document.getElementById('profile-trust-arc').setAttribute('stroke-dasharray', `${rep.trustScore}, 100`);
        document.getElementById('profile-trades').textContent = rep.totalTrades;
        document.getElementById('profile-success').textContent =
            rep.totalTrades > 0 ? Math.round(rep.successfulTrades / rep.totalTrades * 100) + '%' : 'N/A';
        document.getElementById('profile-volume').textContent = formatVolume(rep.totalVolume);
        document.getElementById('profile-avg-time').textContent = rep.avgTradeTime ? rep.avgTradeTime + 'm' : '-';

        // Badges
        let badgesHtml = '';
        if (rep.badges.includes('verified')) badgesHtml += '<span class="badge badge-verified">✓ Verified</span>';
        if (rep.badges.includes('fire')) badgesHtml += '<span class="badge badge-fire">🔥 Top</span>';
        if (rep.badges.includes('diamond')) badgesHtml += '<span class="badge badge-diamond">💎 Diamond</span>';
        if (rep.badges.includes('escrow')) badgesHtml += '<span class="badge badge-escrow">🛡️ Escrow</span>';
        document.getElementById('profile-badges').innerHTML = badgesHtml;
    } else {
        document.getElementById('profile-nickname').textContent = `Trader ${address.substring(0, 8)}`;
        document.getElementById('profile-trust-score').textContent = 'New';
        document.getElementById('profile-trades').textContent = '0';
        document.getElementById('profile-success').textContent = 'N/A';
        document.getElementById('profile-volume').textContent = '0';
        document.getElementById('profile-avg-time').textContent = '-';
    }

    // Feedback - merge on-chain and GunDB comments
    const gunFeedbacks = await fetchFeedbackFromGun(address);

    // Build a map of GunDB comments keyed by tradeId for merging
    const gunByTrade = {};
    for (const gf of gunFeedbacks) {
        gunByTrade[gf.tradeId] = gf;
    }

    let feedbackHtml = '';

    // On-chain feedback with merged GunDB comments
    if (feedback.feedbacks.length > 0) {
        for (const f of feedback.feedbacks) {
            const tradeIdStr = f.tradeId.toString();
            const gunEntry = gunByTrade[tradeIdStr];
            const commentText = gunEntry?.comment || '';
            delete gunByTrade[tradeIdStr]; // avoid duplicates

            feedbackHtml += `
                <div class="feedback-item">
                    <div class="feedback-stars">${'★'.repeat(f.rating)}${'☆'.repeat(5-f.rating)}</div>
                    ${commentText ? `<div class="feedback-comment-text">${escapeHtml(commentText)}</div>` : ''}
                    <div class="feedback-meta">Trade #${tradeIdStr.substring(0, 6)} · ${formatTimeAgo(f.createdAt * 1000)}</div>
                </div>
            `;
        }
    }

    // GunDB-only feedback (not yet on-chain)
    for (const gf of Object.values(gunByTrade)) {
        feedbackHtml += `
            <div class="feedback-item">
                <div class="feedback-stars">${'★'.repeat(gf.rating)}${'☆'.repeat(5-gf.rating)}</div>
                ${gf.comment ? `<div class="feedback-comment-text">${escapeHtml(gf.comment)}</div>` : ''}
                <div class="feedback-meta">Trade #${(gf.tradeId || '').toString().substring(0, 6)} · ${formatTimeAgo(gf.timestamp)}</div>
            </div>
        `;
    }

    document.getElementById('profile-feedback-list').innerHTML =
        feedbackHtml || '<p class="empty-msg">No feedback yet</p>';
}

// ============================================
// GLOBAL STATS
// ============================================

/**
 * Show global marketplace statistics
 */
async function showGlobalStats() {
    openModal('global-stats-modal');

    // Set loading state
    document.getElementById('stats-total-volume').textContent = '...';
    document.getElementById('stats-total-trades').textContent = '...';
    document.getElementById('stats-active-orders').textContent = '...';
    document.getElementById('stats-active-trades').textContent = '...';
    document.getElementById('stats-success-rate').textContent = '...';
    document.getElementById('stats-open-disputes').textContent = '...';
    document.getElementById('stats-escrow-stakers').textContent = '...';
    document.getElementById('stats-reward-pool').textContent = '...';
    document.getElementById('stats-leaderboard').innerHTML = '<p class="loading-msg">Loading...</p>';

    // Try to fetch from contract
    const stats = await getEscrowStats();

    if (stats) {
        document.getElementById('stats-total-volume').textContent = formatVolume(stats.totalVolume || 0) + ' FOMO';
        document.getElementById('stats-total-trades').textContent = stats.totalTrades || 0;
        document.getElementById('stats-active-orders').textContent = stats.activeOrders || state.orders.length;
        document.getElementById('stats-active-trades').textContent = stats.activeTrades || 0;
        document.getElementById('stats-success-rate').textContent = (stats.successRate || 98) + '%';
        document.getElementById('stats-open-disputes').textContent = stats.pendingDisputes || 0;
        document.getElementById('stats-escrow-stakers').textContent = stats.stakerCount || 0;
        document.getElementById('stats-reward-pool').textContent = formatVolume(stats.rewardPool || 0) + ' FOMO';
    } else {
        // Show local data if contract unavailable
        const localOrders = ArweaveStorage.getLocalOrders({ status: 'active' });
        document.getElementById('stats-total-volume').textContent = '---';
        document.getElementById('stats-total-trades').textContent = '---';
        document.getElementById('stats-active-orders').textContent = localOrders.length;
        document.getElementById('stats-active-trades').textContent = state.myTrades.filter(t =>
            ['accepted', 'payment_sent'].includes(t.status)
        ).length;
        document.getElementById('stats-success-rate').textContent = '---';
        document.getElementById('stats-open-disputes').textContent = '---';
        document.getElementById('stats-escrow-stakers').textContent = '---';
        document.getElementById('stats-reward-pool').textContent = '---';
    }

    // Try to load leaderboard from contract
    try {
        // Build leaderboard from order creators (sellers) with reputation data
        const tradersMap = new Map();

        // Collect unique sellers from current orders
        state.orders.forEach(order => {
            const sellerPk = order.seller?.pk || order.sellerPk || order.seller;
            if (sellerPk && !tradersMap.has(sellerPk)) {
                const seller = order.seller || {};
                tradersMap.set(sellerPk, {
                    address: sellerPk,
                    nickname: seller.name || seller.nickname,
                    trades: seller.totalTrades || seller.trades || 0,
                    volume: seller.totalVolume || 0,
                    trustScore: seller.trustScore || seller.trust || 50
                });
            }
        });

        // Sort by trades count (descending)
        const topTraders = Array.from(tradersMap.values())
            .sort((a, b) => b.trades - a.trades)
            .slice(0, 10);

        if (topTraders.length > 0) {
            renderLeaderboard(topTraders);
        } else {
            document.getElementById('stats-leaderboard').innerHTML = '<p class="empty-msg">No traders yet</p>';
        }
    } catch (e) {
        console.error('Failed to load leaderboard:', e);
        document.getElementById('stats-leaderboard').innerHTML = '<p class="empty-msg">Leaderboard unavailable</p>';
    }
}

/**
 * Render leaderboard
 */
function renderLeaderboard(traders) {
    let html = '<div class="leaderboard-list">';

    traders.forEach((trader, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;

        html += `
            <div class="leaderboard-item" onclick="showTraderProfile('${trader.address}')">
                <span class="leaderboard-rank">${medal}</span>
                <div class="leaderboard-info">
                    <span class="leaderboard-name">${trader.nickname || trader.address.substring(0, 12) + '...'}</span>
                    <span class="leaderboard-stats">${trader.trades} trades · ${formatVolume(trader.volume)}</span>
                </div>
                <span class="leaderboard-score">${trader.trustScore}%</span>
            </div>
        `;
    });

    html += '</div>';
    document.getElementById('stats-leaderboard').innerHTML = html;

    // Add leaderboard styles
    if (!document.getElementById('leaderboard-styles')) {
        const style = document.createElement('style');
        style.id = 'leaderboard-styles';
        style.textContent = `
            .leaderboard-list { display: flex; flex-direction: column; gap: 8px; }
            .leaderboard-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px; cursor: pointer; transition: background 0.2s; }
            .leaderboard-item:hover { background: var(--bg-secondary); }
            .leaderboard-rank { font-size: 18px; width: 30px; text-align: center; }
            .leaderboard-info { flex: 1; }
            .leaderboard-name { display: block; font-weight: 500; color: var(--text-primary); }
            .leaderboard-stats { font-size: 12px; color: var(--text-muted); }
            .leaderboard-score { font-weight: 600; color: var(--accent-primary); }
        `;
        document.head.appendChild(style);
    }
}

// ============================================
// FORMATTING UTILITIES
// ============================================

function formatAmount(amount, decimals = 2) {
    return amount.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatAmountFromGroth(groth, decimals = 2) {
    return formatAmount(groth / GROTH, decimals);
}

function formatPrice(price) {
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
}

function formatTradeCount(count) {
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return count.toString();
}

function getCurrencySymbol(code) {
    const cur = P2P_CONFIG.currencies.find(c => c.code === code);
    return cur?.symbol || '$';
}

/**
 * Get crypto icon symbol for payment method
 */
function getCryptoIcon(iconCode) {
    const cryptoIcons = {
        btc: '₿',
        lightning: '⚡',
        eth: 'Ξ',
        usdt: '₮',
        usdc: '$',
        dai: '◈',
        bnb: '◆',
        sol: '◎',
        trx: '◊',
        ltc: 'Ł',
        xmr: 'ɱ',
        ton: '◇',
        matic: '⬡'
    };
    return cryptoIcons[iconCode] || '⛓';
}

/**
 * Get payment method info from JSON config (primary) or P2P_CONFIG (fallback)
 * This is the SINGLE SOURCE OF TRUTH for payment method data.
 * @param {string} methodCode - Payment method code (e.g., 'bank_transfer', 'wise')
 * @returns {object|null} Payment method info with name, icon, type, color, etc.
 */
function getPaymentMethodInfo(methodCode) {
    if (!methodCode) return null;

    // First try JSON config (loaded from /config/payment-methods.json)
    if (PAYMENT_METHODS_CONFIG?.paymentMethods) {
        for (const category of Object.values(PAYMENT_METHODS_CONFIG.paymentMethods)) {
            for (const method of category.methods || []) {
                if (method.code === methodCode) {
                    return {
                        name: method.name,
                        icon: method.icon || '💳',
                        type: method.type || 'fiat',
                        color: method.color || '#666',
                        id: method.id
                    };
                }
            }
        }
    }

    // Fallback to inline P2P_CONFIG
    if (P2P_CONFIG.paymentMethods && P2P_CONFIG.paymentMethods[methodCode]) {
        const method = P2P_CONFIG.paymentMethods[methodCode];
        return {
            name: method.name,
            icon: method.icon || '💳',
            type: method.type || 'fiat',
            color: '#666',
            fields: method.fields
        };
    }

    // Return a default for unknown methods (e.g., custom_xxx saved methods)
    return {
        name: methodCode.replace(/^custom_\d+$/, 'Custom').replace(/_/g, ' '),
        icon: '💳',
        type: 'fiat',
        color: '#666'
    };
}

/**
 * Get payment method name (convenience function)
 * @param {string} methodCode - Payment method code
 * @returns {string} Payment method display name
 */
function getPaymentMethodName(methodCode) {
    const info = getPaymentMethodInfo(methodCode);
    return info?.name || methodCode;
}

/**
 * Get all payment methods as flat array (from JSON config or fallback)
 * @returns {Array} Array of payment method objects
 */
function getAllPaymentMethods() {
    const methods = [];

    // First try JSON config
    if (PAYMENT_METHODS_CONFIG?.paymentMethods) {
        for (const [categoryId, category] of Object.entries(PAYMENT_METHODS_CONFIG.paymentMethods)) {
            for (const method of category.methods || []) {
                methods.push({
                    ...method,
                    category: categoryId,
                    categoryLabel: category.label
                });
            }
        }
        return methods;
    }

    // Fallback to P2P_CONFIG
    for (const [code, method] of Object.entries(P2P_CONFIG.paymentMethods || {})) {
        methods.push({
            code,
            name: method.name,
            icon: method.icon,
            type: method.type || 'fiat',
            color: '#666',
            fields: method.fields
        });
    }
    return methods;
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    console.log('Initializing P2P Marketplace...');
    console.log(`Contract CID: ${P2P_ESCROW_CID}`);

    // Display contract CID in UI for verification with nice badge
    const cidElement = document.getElementById('contract-cid');
    if (cidElement) {
        const shortCid = P2P_ESCROW_CID.slice(0, 6) + '...' + P2P_ESCROW_CID.slice(-6);
        cidElement.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
            </svg>
            <span class="contract-label">Contract:</span>
            <span class="contract-value">${shortCid}</span>
            <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;margin-left:4px;">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
        `;
        cidElement.title = `Full Contract ID: ${P2P_ESCROW_CID}\nClick to copy`;
        cidElement.style.cursor = 'pointer';
        cidElement.onclick = () => {
            navigator.clipboard.writeText(P2P_ESCROW_CID);
            showToast('Contract ID copied to clipboard', 'success');
        };
    }

    // Load saved payment credentials
    state.savedPaymentAccounts = ArweaveStorage.getPaymentCredentials();
    console.log('Loaded saved payment accounts:', Object.keys(state.savedPaymentAccounts));

    // Load saved trader info
    state.isRegistered = localStorage.getItem('p2p_is_registered') === 'true';
    state.traderNickname = localStorage.getItem('p2p_trader_nickname');

    // Load wallet data with retry mechanism
    // Small delay to ensure parent window message handler is ready
    await new Promise(resolve => setTimeout(resolve, 500));

    let walletLoaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await loadWalletData();
            walletLoaded = true;
            break;
        } catch (e) {
            console.warn(`Wallet load attempt ${attempt} failed:`, e.message);
            if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    if (!walletLoaded) {
        console.error('Failed to load wallet after 3 attempts');
        showError('Could not connect to wallet. Please refresh the page.');
    }

    // Check registration status from contract if connected
    if (state.walletConnected && state.myAddress && !state.isRegistered) {
        await checkRegistrationStatus();
    }

    // Update registration banner visibility
    updateRegistrationBanner();

    // Detect all user roles (Manager, Escrow, Trader) and update badges
    await detectUserRoles();

    // Load my orders from contract
    await loadMyOrdersFromContract();

    // Load all orders from smart contract (PRIMARY data source)
    await loadOrders();

    // Show contract connection status
    showSyncStatus('Connected to P2P Escrow contract - all data verified on-chain');
}

/**
 * Show sync status notification
 */
function showSyncStatus(message) {
    // Create status indicator if not exists
    let statusEl = document.getElementById('p2p-sync-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'p2p-sync-status';
        statusEl.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(16, 185, 129, 0.9);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 13px;
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(statusEl);

        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    statusEl.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        ${message}
    `;

    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusEl.style.opacity = '0';
        setTimeout(() => statusEl.remove(), 300);
    }, 5000);
}

/**
 * Update registration banner visibility
 */
function updateRegistrationBanner() {
    const banner = document.getElementById('registration-banner');
    if (banner) {
        // Show banner if wallet connected but not registered
        if (state.walletConnected && !state.isRegistered) {
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }
}

/**
 * Show trades tab in My Trades modal
 */
function showTradesTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.trades-tab').forEach(t => {
        const tabText = t.textContent.toLowerCase();
        const isActive =
            (tab === 'active' && tabText.includes('active')) ||
            (tab === 'completed' && tabText.includes('completed')) ||
            (tab === 'my-orders' && tabText.includes('order'));
        t.classList.toggle('active', isActive);
    });

    // Show/hide sections
    const activeSection = document.getElementById('active-trades-section');
    const completedSection = document.getElementById('completed-trades-section');
    const ordersSection = document.getElementById('my-orders-section');

    // Hide all sections first
    if (activeSection) activeSection.style.display = 'none';
    if (completedSection) completedSection.style.display = 'none';
    if (ordersSection) ordersSection.style.display = 'none';

    if (tab === 'my-orders') {
        showMyOrdersSection();
    } else if (tab === 'active') {
        if (activeSection) activeSection.style.display = 'block';
        loadMyTrades();
    } else if (tab === 'completed') {
        if (completedSection) completedSection.style.display = 'block';
        loadMyTrades();
    }
}

/**
 * Show my orders section in trades modal
 */
function showMyOrdersSection() {
    // Find or create my orders section
    let ordersSection = document.getElementById('my-orders-section');

    if (!ordersSection) {
        // Create section
        ordersSection = document.createElement('div');
        ordersSection.id = 'my-orders-section';
        ordersSection.className = 'trades-section';

        // Insert after active-trades-section
        const activeSection = document.getElementById('active-trades-section');
        activeSection.parentNode.insertBefore(ordersSection, activeSection.nextSibling);
    }

    ordersSection.style.display = 'block';

    // Load and render my orders - only orders created by the current user
    const myOrders = ArweaveStorage.getLocalOrders({}).filter(o => {
        // Check if seller address matches current user (handle both string and object formats)
        const sellerAddr = typeof o.seller === 'string' ? o.seller : o.seller?.address;
        return sellerAddr === state.myAddress || sellerAddr === state.myPublicKey;
    });

    if (myOrders.length === 0) {
        ordersSection.innerHTML = `
            <h4 style="margin-bottom:12px;color:var(--text-secondary);">My Orders</h4>
            <p class="empty-msg">No orders created yet</p>
        `;
        return;
    }

    let html = '<h4 style="margin-bottom:12px;color:var(--text-secondary);">My Orders</h4><div class="orders-list">';

    for (const order of myOrders) {
        const asset = getAssetInfo(order.asset);
        const statusClass = order.status === 'active' ? 'status-success' :
                           order.status === 'cancelled' ? 'status-error' : 'status-pending';

        html += `
            <div class="my-order-card">
                <div class="order-card-header">
                    <span class="order-type ${order.side}">${order.side?.toUpperCase() || order.type?.toUpperCase()}</span>
                    <span class="order-status ${statusClass}">${order.status || 'active'}</span>
                </div>
                <div class="order-card-body">
                    <div class="order-amount">${formatAmount(order.amount, 2)} ${asset.symbol}</div>
                    <div class="order-price">@ ${getCurrencySymbol(order.currency)}${formatPrice(order.price)}</div>
                    <div class="order-payments">
                        ${(order.paymentMethods || []).map(pm =>
                            `<span class="payment-tag">${getPaymentMethodName(pm)}</span>`
                        ).join('')}
                    </div>
                </div>
                <div class="order-card-footer">
                    <span class="order-time">${formatTimeAgo(order.createdAt || Date.now())}</span>
                    ${order.status === 'active' ? `
                        <button class="btn-small btn-danger" onclick="cancelMyOrder('${order.localId || order.id}')">Cancel</button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    html += '</div>';
    ordersSection.innerHTML = html;

    // Add order card styles
    if (!document.getElementById('my-order-styles')) {
        const style = document.createElement('style');
        style.id = 'my-order-styles';
        style.textContent = `
            .my-order-card {
                background: var(--bg-tertiary);
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 12px;
            }
            .order-card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }
            .order-type {
                font-weight: 600;
                font-size: 12px;
                padding: 4px 8px;
                border-radius: 4px;
            }
            .order-type.buy { background: rgba(16, 185, 129, 0.2); color: var(--success); }
            .order-type.sell { background: rgba(239, 68, 68, 0.2); color: var(--error); }
            .order-card-body { margin-bottom: 12px; }
            .order-amount { font-size: 18px; font-weight: 600; color: var(--text-primary); }
            .order-price { color: var(--text-muted); margin: 4px 0; }
            .order-payments { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
            .order-card-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-top: 12px;
                border-top: 1px solid var(--border-color);
            }
            .order-time { color: var(--text-muted); font-size: 12px; }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Cancel my order
 */
async function cancelMyOrder(orderId) {
    if (!confirm('Cancel this order?')) return;

    showLoading('Cancelling order...');

    try {
        // Find order to get its contract order ID
        const order = state.myOrders.find(o => o.localId === orderId || o.id === orderId);

        if (!order) {
            hideLoading();
            showError('Order not found');
            return;
        }

        // Cancel on-chain using the order ID (NOT the transaction ID!)
        // The contract expects order_id (numeric), not onChainId (tx hash)
        const contractOrderId = order.id;
        console.log('Cancelling order with contract ID:', contractOrderId);

        const result = await cancelOrderOnChain(contractOrderId);
        console.log('On-chain cancellation result:', result);

        if (!result.success) {
            hideLoading();
            showError(result.error || 'Failed to cancel order on contract');
            return;
        }

        // Update local storage
        ArweaveStorage.updateLocalOrder(orderId, { status: 'cancelled' });

        // Update state
        const idx = state.myOrders.findIndex(o => o.localId === orderId || o.id === orderId);
        if (idx >= 0) {
            state.myOrders[idx].status = 'cancelled';
        }

        hideLoading();
        showSuccess('Order cancelled! Funds unlocked.');

        // Refresh the view
        showMyOrdersSection();
        loadOrders();

    } catch (e) {
        hideLoading();
        console.error('Cancel order error:', e);
        showError('Failed to cancel order: ' + e.message);
    }
}

/**
 * Open dispute center modal
 * @param {string} filter - Optional filter: 'escrow' to show assigned disputes for escrow arbiters
 */
function showDisputeCenter(filter) {
    if (filter === 'escrow' && state.isEscrow) {
        // Show escrow arbitration queue directly
        showDisputeTab('arbitration');
    } else {
        showDisputeTab('my-disputes');
    }
    openModal('dispute-modal');
}

// Setup filter event listeners
function setupFilterListeners() {
    // Amount filter - filter orders by fiat amount within limits
    const amountInput = document.getElementById('amount-input');
    if (amountInput) {
        let debounceTimer;
        amountInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                state.amountFilter = parseFloat(e.target.value) || 0;
                renderOrders();
            }, 300);
        });
    }

    // Currency filter
    const currencySelect = document.getElementById('currency-select');
    if (currencySelect) {
        currencySelect.addEventListener('change', (e) => {
            state.currency = e.target.value;
            renderOrders();
        });
    }
}

// ============================================
// MANAGER PANEL FUNCTIONALITY
// ============================================

// Manager state - extend existing state
if (!state.isManager) state.isManager = false;
if (!state.isOwner) state.isOwner = false;
if (!state.managers) state.managers = [];
if (!state.contractSettings) state.contractSettings = {};

/**
 * Check if current user is a manager
 */
async function checkManagerStatus() {
    try {
        const args = `role=manager,action=view_managers,cid=${P2P_ESCROW_CID}`;
        const result = await invokeContract(args, false);

        if (result && result.managers) {
            state.managers = result.managers;

            // Check if our PK is in the managers list
            const myPk = state.myPk || state.myAddress;
            if (myPk) {
                const manager = result.managers.find(m =>
                    m.pk === myPk || m.pk?.substring(0, 16) === myPk?.substring(0, 16)
                );

                if (manager) {
                    state.isManager = true;
                    state.isOwner = manager.is_owner === 1;
                    console.log('Manager status: Manager=', state.isManager, ', Owner=', state.isOwner);
                    showManagerButton();
                    return true;
                }
            }
        }
    } catch (e) {
        console.log('Not a manager or error checking:', e.message);
    }

    state.isManager = false;
    state.isOwner = false;
    hideManagerButton();
    return false;
}

/**
 * Show manager button in header
 */
function showManagerButton() {
    const btn = document.getElementById('manager-menu-btn');
    if (btn) {
        btn.style.display = 'flex';
        console.log('Manager button shown');
    }
}

/**
 * Hide manager button in header
 */
function hideManagerButton() {
    const btn = document.getElementById('manager-menu-btn');
    if (btn) {
        btn.style.display = 'none';
    }
}

/**
 * Show manager panel modal
 */
async function showManagerPanel() {
    if (!state.isManager) {
        showError('Access denied. You are not a manager.');
        return;
    }

    // Load contract data
    await loadManagerOverview();

    openModal('manager-panel-modal');
}

/**
 * Show specific manager tab
 */
function showManagerTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.manager-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Hide all sections
    document.querySelectorAll('.manager-section').forEach(s => {
        s.style.display = 'none';
    });

    // Show selected section
    const section = document.getElementById(`manager-${tab}-section`);
    if (section) {
        section.style.display = 'block';
    }

    // Load tab-specific data
    switch (tab) {
        case 'overview':
            loadManagerOverview();
            break;
        case 'fees':
            loadManagerFees();
            break;
        case 'disputes':
            loadManagerDisputes();
            break;
        case 'escrows':
            loadManagerEscrows();
            break;
        case 'managers':
            loadManagersList();
            break;
        case 'settings':
            loadManagerSettings();
            break;
    }
}

/**
 * Load manager overview data
 */
async function loadManagerOverview() {
    try {
        const args = `role=manager,action=view_stats,cid=${P2P_ESCROW_CID}`;
        const result = await invokeContract(args, false);

        if (result) {
            document.getElementById('mgr-total-trades').textContent = result.total_trades || 0;
            document.getElementById('mgr-total-volume').textContent = formatAmountFromGroth(result.total_volume || 0) + ' FOMO';
            document.getElementById('mgr-active-orders').textContent = result.active_orders || 0;
            document.getElementById('mgr-open-disputes').textContent = result.open_disputes || 0;

            document.getElementById('mgr-contract-id').textContent = P2P_ESCROW_CID;
            document.getElementById('mgr-trade-fee').textContent = (result.trade_fee_bps || 50) / 100 + '%';
            document.getElementById('mgr-min-stake').textContent = formatAmountFromGroth(result.min_escrow_stake || 0) + ' FOMO';

            state.contractSettings = result;
        }
    } catch (e) {
        console.error('Failed to load overview:', e);
    }
}

/**
 * Load manager fees
 */
async function loadManagerFees() {
    try {
        const args = `role=manager,action=view,cid=${P2P_ESCROW_CID}`;
        const result = await invokeContract(args, false);

        if (result) {
            document.getElementById('mgr-fees-beam').textContent = formatAmountFromGroth(result.accumulated_fees_beam || 0);
            document.getElementById('mgr-fees-fomo').textContent = formatAmountFromGroth(result.accumulated_fees_fomo || 0);
        }
    } catch (e) {
        console.error('Failed to load fees:', e);
    }
}

/**
 * Manager withdraws fees
 */
async function managerWithdrawFees() {
    if (!state.isManager) {
        showError('Access denied');
        return;
    }

    const amount = parseFloat(document.getElementById('mgr-withdraw-amount').value);
    const assetId = parseInt(document.getElementById('mgr-withdraw-asset').value);

    if (!amount || amount <= 0) {
        showError('Enter a valid amount');
        return;
    }

    const amountGroth = Math.floor(amount * GROTH);

    if (!confirm(`Withdraw ${amount} ${assetId === 0 ? 'BEAM' : 'FOMO'} from contract fees?`)) {
        return;
    }

    showLoading('Withdrawing fees...');

    try {
        const args = `role=manager,action=withdraw_fees,cid=${P2P_ESCROW_CID},amount=${amountGroth},asset_id=${assetId}`;
        const result = await invokeContract(args, true);

        hideLoading();

        if (result && !result.error) {
            showSuccess('Fees withdrawn successfully');
            loadManagerFees();
        } else {
            showError(result?.error || 'Failed to withdraw fees');
        }
    } catch (e) {
        hideLoading();
        showError('Error: ' + e.message);
    }
}

/**
 * Load pending disputes for manager
 */
async function loadManagerDisputes() {
    const list = document.getElementById('mgr-disputes-list');
    list.innerHTML = '<p class="loading">Loading disputes...</p>';

    try {
        // Get disputes that need escrow assignment
        const args = `role=manager,action=view_stats,cid=${P2P_ESCROW_CID}`;
        const statsResult = await invokeContract(args, false);

        // Also try to get escrow list for assignment dropdown
        const escrowArgs = `role=manager,action=view_escrows,cid=${P2P_ESCROW_CID}`;
        const escrowResult = await invokeContract(escrowArgs, false);
        const escrows = escrowResult?.escrows || [];

        // Check for pending disputes (status = 4 = disputed)
        const pendingDisputes = statsResult?.pendingDisputes || statsResult?.pending_disputes || [];

        if (pendingDisputes.length === 0) {
            list.innerHTML = `
                <p class="empty-msg">No disputes pending escrow assignment</p>
                <p class="info-text">When a dispute is opened, it will appear here for you to assign escrows.</p>
            `;
            return;
        }

        // Build escrow options HTML
        const escrowOptions = escrows.map(e =>
            `<option value="${e.pk || e.address}">${shortenAddress(e.pk || e.address)} (${e.disputes_resolved || 0} resolved)</option>`
        ).join('');

        let html = '';
        pendingDisputes.forEach(dispute => {
            html += `
                <div class="dispute-card" data-dispute-id="${dispute.id || dispute.trade_id}">
                    <div class="dispute-header">
                        <span class="dispute-id">Dispute #${(dispute.id || dispute.trade_id || '').toString().substring(0, 8)}</span>
                        <span class="dispute-status">Pending Assignment</span>
                    </div>
                    <div class="dispute-info">
                        <div class="dispute-row">
                            <span>Trade ID:</span>
                            <span>${(dispute.trade_id || dispute.id || '').toString().substring(0, 12)}...</span>
                        </div>
                        <div class="dispute-row">
                            <span>Reason:</span>
                            <span>${dispute.reason || 'Not specified'}</span>
                        </div>
                        <div class="dispute-row">
                            <span>Opened:</span>
                            <span>${formatTimeAgo(dispute.opened_at * 1000 || Date.now())}</span>
                        </div>
                    </div>
                    <div class="escrow-assignment">
                        <h5>Assign 3 Escrow Arbiters:</h5>
                        <div class="escrow-selects">
                            <select class="escrow-select" data-index="1">
                                <option value="">Select Escrow 1</option>
                                ${escrowOptions}
                            </select>
                            <select class="escrow-select" data-index="2">
                                <option value="">Select Escrow 2</option>
                                ${escrowOptions}
                            </select>
                            <select class="escrow-select" data-index="3">
                                <option value="">Select Escrow 3</option>
                                ${escrowOptions}
                            </select>
                        </div>
                        <button class="btn-primary btn-sm" onclick="assignEscrowsToDispute('${dispute.id || dispute.trade_id}')">
                            Assign Escrows
                        </button>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html;
    } catch (e) {
        console.error('loadManagerDisputes error:', e);
        list.innerHTML = '<p class="empty-msg">Error loading disputes</p>';
    }
}

/**
 * Assign escrows to a dispute
 */
async function assignEscrowsToDispute(disputeId) {
    const card = document.querySelector(`.dispute-card[data-dispute-id="${disputeId}"]`);
    if (!card) {
        showError('Dispute not found');
        return;
    }

    const selects = card.querySelectorAll('.escrow-select');
    const escrow1 = selects[0]?.value;
    const escrow2 = selects[1]?.value;
    const escrow3 = selects[2]?.value;

    if (!escrow1 || !escrow2 || !escrow3) {
        showError('Please select all 3 escrow arbiters');
        return;
    }

    if (escrow1 === escrow2 || escrow2 === escrow3 || escrow1 === escrow3) {
        showError('Please select 3 different escrow arbiters');
        return;
    }

    showLoading('Assigning escrows...');

    try {
        const args = `role=manager,action=assign_escrows,cid=${P2P_ESCROW_CID},pk=${state.myPublicKey},dispute_id=${disputeId},escrow1=${escrow1},escrow2=${escrow2},escrow3=${escrow3}`;
        const result = await invokeContract(args, true);

        hideLoading();

        if (result && !result.error) {
            showSuccess('Escrows assigned successfully');
            loadManagerDisputes();
        } else {
            showError(result?.error || 'Failed to assign escrows');
        }
    } catch (e) {
        hideLoading();
        showError('Error: ' + e.message);
    }
}

/**
 * Load escrow stakers
 */
async function loadManagerEscrows() {
    const list = document.getElementById('mgr-escrows-list');
    list.innerHTML = '<p class="loading">Loading escrows...</p>';

    try {
        const args = `role=manager,action=view_escrows,cid=${P2P_ESCROW_CID}`;
        const result = await invokeContract(args, false);

        if (result && result.escrows && result.escrows.length > 0) {
            let html = '';
            let totalStaked = 0;

            result.escrows.forEach(escrow => {
                totalStaked += escrow.amount || 0;
                html += `
                    <div class="escrow-card">
                        <div class="escrow-info">
                            <span class="pk">${escrow.pk?.substring(0, 16)}...${escrow.pk?.substring(48)}</span>
                            <span>Staked: ${formatAmountFromGroth(escrow.amount)} FOMO</span>
                            <span>Disputes: ${escrow.disputes_resolved || 0}</span>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;
            document.getElementById('mgr-total-staked').textContent = formatAmountFromGroth(totalStaked) + ' FOMO';
            document.getElementById('mgr-active-escrows').textContent = result.escrows.length;
        } else {
            list.innerHTML = '<p class="empty-msg">No escrow stakers yet</p>';
            document.getElementById('mgr-total-staked').textContent = '0 FOMO';
            document.getElementById('mgr-active-escrows').textContent = '0';
        }
    } catch (e) {
        list.innerHTML = '<p class="empty-msg">Error loading escrows</p>';
    }
}

/**
 * Load managers list
 */
async function loadManagersList() {
    const list = document.getElementById('mgr-managers-list');
    list.innerHTML = '<p class="loading">Loading managers...</p>';

    try {
        const args = `role=manager,action=view_managers,cid=${P2P_ESCROW_CID}`;
        const result = await invokeContract(args, false);

        if (result && result.managers && result.managers.length > 0) {
            let html = '';

            result.managers.forEach(mgr => {
                const roleClass = mgr.is_owner ? 'owner' : '';
                const roleText = mgr.is_owner ? 'Owner' : 'Manager';
                html += `
                    <div class="manager-card">
                        <div class="manager-info">
                            <span class="pk">${mgr.pk?.substring(0, 16)}...${mgr.pk?.substring(48)}</span>
                            <span class="role ${roleClass}">${roleText}</span>
                        </div>
                        ${!mgr.is_owner && state.isOwner ? `
                            <button class="btn-secondary btn-sm" onclick="managerRemoveManager('${mgr.pk}')">Remove</button>
                        ` : ''}
                    </div>
                `;
            });

            list.innerHTML = html;
            state.managers = result.managers;

            // Show add manager form if owner
            const addForm = document.getElementById('add-manager-form');
            if (addForm) {
                addForm.style.display = state.isOwner ? 'block' : 'none';
            }
        } else {
            list.innerHTML = '<p class="empty-msg">No managers found</p>';
        }
    } catch (e) {
        list.innerHTML = '<p class="empty-msg">Error loading managers</p>';
    }
}

/**
 * Add new manager (owner only)
 */
async function managerAddManager() {
    if (!state.isOwner) {
        showError('Only the owner can add managers');
        return;
    }

    const newPk = document.getElementById('mgr-new-manager-pk').value.trim();

    if (!newPk || newPk.length < 64) {
        showError('Enter a valid public key');
        return;
    }

    if (!confirm('Add this address as a manager?')) {
        return;
    }

    showLoading('Adding manager...');

    try {
        const args = `role=manager,action=add_manager,cid=${P2P_ESCROW_CID},new_manager=${newPk}`;
        const result = await invokeContract(args, true);

        hideLoading();

        if (result && !result.error) {
            showSuccess('Manager added successfully');
            document.getElementById('mgr-new-manager-pk').value = '';
            loadManagersList();
        } else {
            showError(result?.error || 'Failed to add manager');
        }
    } catch (e) {
        hideLoading();
        showError('Error: ' + e.message);
    }
}

/**
 * Remove manager (owner only)
 */
async function managerRemoveManager(pk) {
    if (!state.isOwner) {
        showError('Only the owner can remove managers');
        return;
    }

    if (!confirm('Remove this manager?')) {
        return;
    }

    showLoading('Removing manager...');

    try {
        const args = `role=manager,action=remove_manager,cid=${P2P_ESCROW_CID},manager_to_remove=${pk}`;
        const result = await invokeContract(args, true);

        hideLoading();

        if (result && !result.error) {
            showSuccess('Manager removed');
            loadManagersList();
        } else {
            showError(result?.error || 'Failed to remove manager');
        }
    } catch (e) {
        hideLoading();
        showError('Error: ' + e.message);
    }
}

/**
 * Load contract settings
 */
async function loadManagerSettings() {
    try {
        const args = `role=manager,action=view,cid=${P2P_ESCROW_CID}`;
        const result = await invokeContract(args, false);

        if (result) {
            document.getElementById('mgr-setting-fee-bps').value = result.trade_fee_bps || 50;
            document.getElementById('mgr-setting-min-stake').value = Math.floor((result.min_escrow_stake || 0) / GROTH);
            document.getElementById('mgr-setting-deposit-pct').value = result.default_deposit_pct || 10;
            document.getElementById('mgr-setting-payment-timeout').value = result.payment_timeout || 1800;
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

/**
 * Update contract settings (manager only)
 */
async function managerUpdateSettings() {
    if (!state.isManager) {
        showError('Access denied');
        return;
    }

    const feeBps = parseInt(document.getElementById('mgr-setting-fee-bps').value);
    const minStake = parseInt(document.getElementById('mgr-setting-min-stake').value) * GROTH;
    const depositPct = parseInt(document.getElementById('mgr-setting-deposit-pct').value);
    const paymentTimeout = parseInt(document.getElementById('mgr-setting-payment-timeout').value);

    if (!confirm('Update contract settings?')) {
        return;
    }

    showLoading('Updating settings...');

    try {
        const args = `role=manager,action=update_settings,cid=${P2P_ESCROW_CID},min_escrow_stake=${minStake},trade_fee_bps=${feeBps},default_deposit_pct=${depositPct},payment_timeout=${paymentTimeout}`;
        const result = await invokeContract(args, true);

        hideLoading();

        if (result && !result.error) {
            showSuccess('Settings updated');
        } else {
            showError(result?.error || 'Failed to update settings');
        }
    } catch (e) {
        hideLoading();
        showError('Error: ' + e.message);
    }
}

// ============================================
// ROLE-BASED UI SYSTEM
// ============================================

// Escrow state - extend existing state
if (!state.isEscrow) state.isEscrow = false;
if (!state.escrowStake) state.escrowStake = null;
if (!state.pendingDisputes) state.pendingDisputes = [];

/**
 * Check if current user has staked as an escrow arbiter
 */
async function checkEscrowStatus() {
    try {
        if (!state.myPublicKey) {
            console.log('No public key available for escrow check');
            return false;
        }

        const args = `role=user,action=view_escrow_stake,cid=${P2P_ESCROW_CID},pk=${state.myPublicKey}`;
        const result = await invokeContract(args, false);

        if (result && result.stake && result.stake.amount > 0) {
            state.isEscrow = true;
            state.escrowStake = result.stake;
            console.log('Escrow status: Active, staked amount:', result.stake.amount);
            showEscrowButton();
            await loadPendingDisputes();
            return true;
        }
    } catch (e) {
        console.log('Not an escrow or error checking:', e.message);
    }

    state.isEscrow = false;
    state.escrowStake = null;
    hideEscrowButton();
    return false;
}

/**
 * Load pending disputes assigned to this escrow
 * Note: The view_my_disputes action may not exist on all contract versions.
 * Falls back gracefully to empty list if action fails.
 */
async function loadPendingDisputes() {
    try {
        const args = `role=user,action=view_my_disputes,cid=${P2P_ESCROW_CID},pk=${state.myPublicKey}`;
        const result = await invokeContract(args, false);

        if (result && result.disputes) {
            state.pendingDisputes = result.disputes.filter(d => d.status === 'pending' || d.status === 'voting');
            updateEscrowQueueBadge();
        } else if (result?.error) {
            // Action may not exist - disputes will appear when assigned by manager
            console.log('[P2P] view_my_disputes not available, disputes will appear when assigned');
            state.pendingDisputes = [];
        }
    } catch (e) {
        // This action may not exist yet - use fallback
        console.log('[P2P] loadPendingDisputes error (expected if action not deployed):', e.message);
        state.pendingDisputes = [];
    }
}

/**
 * Show escrow queue button in header
 */
function showEscrowButton() {
    const btn = document.getElementById('escrow-queue-btn');
    if (btn) {
        btn.style.display = 'flex';
        console.log('Escrow queue button shown');
    }
}

/**
 * Hide escrow queue button in header
 */
function hideEscrowButton() {
    const btn = document.getElementById('escrow-queue-btn');
    if (btn) {
        btn.style.display = 'none';
    }
}

/**
 * Update escrow queue notification badge
 */
function updateEscrowQueueBadge() {
    const badge = document.getElementById('escrow-queue-count');
    if (badge) {
        const count = state.pendingDisputes.length;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

/**
 * Update all role badges in header based on current user roles
 */
function updateRoleBadges() {
    // Owner badge
    const ownerBadge = document.getElementById('badge-owner');
    if (ownerBadge) {
        ownerBadge.style.display = state.isOwner ? 'inline-flex' : 'none';
    }

    // Manager badge (show if manager but not owner, to avoid duplicate)
    const managerBadge = document.getElementById('badge-manager');
    if (managerBadge) {
        managerBadge.style.display = (state.isManager && !state.isOwner) ? 'inline-flex' : 'none';
    }

    // Escrow badge
    const escrowBadge = document.getElementById('badge-escrow');
    if (escrowBadge) {
        escrowBadge.style.display = state.isEscrow ? 'inline-flex' : 'none';
    }

    // Trader badge (registered trader)
    const traderBadge = document.getElementById('badge-trader');
    if (traderBadge) {
        traderBadge.style.display = state.isRegistered ? 'inline-flex' : 'none';
    }

    console.log('Role badges updated: Owner=', state.isOwner, ', Manager=', state.isManager, ', Escrow=', state.isEscrow, ', Trader=', state.isRegistered);
}

/**
 * Show escrow queue modal
 */
async function showEscrowQueue() {
    if (!state.isEscrow) {
        showError('You must be a staked escrow arbiter to access this');
        return;
    }

    // Open the dispute center with escrow filter
    await showDisputeCenter('escrow');
}

/**
 * Detect all user roles and update UI
 */
async function detectUserRoles() {
    console.log('Detecting user roles...');

    // These run in parallel
    await Promise.all([
        checkManagerStatus(),
        checkEscrowStatus()
    ]);

    // Registration status is already checked in initialization
    // Update all badges
    updateRoleBadges();
}

// ============================================
// PAYMENT METHODS CONFIG LOADER
// ============================================

// Global payment methods config (loaded from JSON)
let PAYMENT_METHODS_CONFIG = null;

/**
 * Load payment methods configuration from JSON file
 */
async function loadPaymentMethodsConfig() {
    try {
        // Try loading from config directory
        const response = await fetch('../config/payment-methods.json');
        if (response.ok) {
            PAYMENT_METHODS_CONFIG = await response.json();
            const paymentCount = Object.values(PAYMENT_METHODS_CONFIG.paymentMethods)
                .reduce((sum, cat) => sum + (cat.methods?.length || 0), 0);
            const currencyCount = Object.values(PAYMENT_METHODS_CONFIG.currencies || {})
                .reduce((sum, cat) => sum + (cat.currencies?.length || 0), 0);
            console.log(`Loaded config: ${paymentCount} payment methods, ${currencyCount} currencies`);
            populatePaymentMethodsDropdowns();
            populateCurrencyDropdowns();
            return true;
        }
    } catch (e) {
        console.warn('Could not load payment-methods.json, using built-in config:', e.message);
    }

    // Fallback to built-in P2P_CONFIG
    console.log('Using built-in payment methods from P2P_CONFIG');
    populatePaymentMethodsFromBuiltin();
    return false;
}

/**
 * Get currency info by code or ID
 */
function getCurrencyInfo(codeOrId) {
    if (!PAYMENT_METHODS_CONFIG?.currencies) return null;

    for (const category of Object.values(PAYMENT_METHODS_CONFIG.currencies)) {
        for (const currency of category.currencies || []) {
            if (currency.code === codeOrId || currency.id === codeOrId) {
                return currency;
            }
        }
    }
    return null;
}

/**
 * Get all currencies as flat array
 */
function getAllCurrencies() {
    if (!PAYMENT_METHODS_CONFIG?.currencies) {
        // Fallback currencies
        return [
            { id: 840, code: 'USD', symbol: '$', name: 'US Dollar', flag: 'US' },
            { id: 978, code: 'EUR', symbol: 'EUR', name: 'Euro', flag: 'EU' },
            { id: 826, code: 'GBP', symbol: 'GBP', name: 'British Pound', flag: 'GB' },
            { id: 643, code: 'RUB', symbol: 'RUB', name: 'Russian Ruble', flag: 'RU' }
        ];
    }

    const currencies = [];
    for (const category of Object.values(PAYMENT_METHODS_CONFIG.currencies)) {
        currencies.push(...(category.currencies || []));
    }
    return currencies;
}

/**
 * Convert country code to flag emoji
 */
function countryCodeToFlag(code) {
    if (!code || code.length !== 2) return '';
    const base = 0x1F1E6 - 65; // Regional indicator A
    return String.fromCodePoint(
        base + code.charCodeAt(0),
        base + code.charCodeAt(1)
    );
}

/**
 * Populate currency dropdowns from config
 */
function populateCurrencyDropdowns() {
    if (!PAYMENT_METHODS_CONFIG?.currencies) return;

    const { currencies } = PAYMENT_METHODS_CONFIG;

    // Build options HTML for currency selects
    let optionsHtml = '<option value="ALL">All Currencies</option>';

    for (const [categoryId, category] of Object.entries(currencies)) {
        optionsHtml += `<optgroup label="${category.label}">`;
        for (const curr of category.currencies || []) {
            const flag = countryCodeToFlag(curr.flag);
            optionsHtml += `<option value="${curr.code}" data-id="${curr.id}">${flag} ${curr.code} - ${curr.name}</option>`;
        }
        optionsHtml += '</optgroup>';
    }

    // Update filter currency dropdown
    const filterCurrency = document.getElementById('currency-filter');
    if (filterCurrency) {
        filterCurrency.innerHTML = optionsHtml;
    }

    // Update create order currency dropdown (without "All" option)
    const createCurrency = document.getElementById('create-order-currency');
    if (createCurrency) {
        let createOptionsHtml = '';
        for (const [categoryId, category] of Object.entries(currencies)) {
            createOptionsHtml += `<optgroup label="${category.label}">`;
            for (const curr of category.currencies || []) {
                const flag = countryCodeToFlag(curr.flag);
                createOptionsHtml += `<option value="${curr.code}" data-id="${curr.id}">${flag} ${curr.code} - ${curr.name}</option>`;
            }
            createOptionsHtml += '</optgroup>';
        }
        createCurrency.innerHTML = createOptionsHtml;
    }
}

/**
 * Populate payment methods dropdowns from loaded config
 */
function populatePaymentMethodsDropdowns() {
    const createList = document.getElementById('create-payment-methods-list');
    const filterDropdown = document.getElementById('payment-dropdown-content');

    if (!PAYMENT_METHODS_CONFIG) return;

    const { paymentMethods } = PAYMENT_METHODS_CONFIG;

    // Build HTML for Create Order dropdown (with search and max 8 limit)
    let createHtml = `
        <input type="text" class="dropdown-search" placeholder="Search payment methods..." oninput="filterPaymentMethods(this.value, 'create-payment-methods-list')">
        <div class="create-payment-counter" id="create-payment-counter">
            <span id="create-payment-count">0</span>/8 selected <span class="counter-hint">(max 8)</span>
        </div>
        <div class="dropdown-divider"></div>
    `;

    // Build HTML for Filter dropdown
    let filterHtml = `
        <input type="text" class="dropdown-search" placeholder="Search payment methods..." oninput="filterPaymentMethods(this.value, 'payment-dropdown-content')">
        <label class="dropdown-item">
            <input type="checkbox" checked onchange="toggleAllPayments(this.checked)">
            <span>All Payment Methods</span>
        </label>
        <div class="dropdown-divider"></div>
    `;

    // Process each category
    for (const [categoryId, category] of Object.entries(paymentMethods)) {
        createHtml += `<div class="dropdown-section">${category.label}</div>`;
        filterHtml += `<div class="dropdown-section">${category.label}</div>`;

        for (const method of category.methods) {
            // Use method.code for value (string) and method.id for data-id (number)
            const isCrypto = method.type === 'crypto';
            const cryptoIcon = getCryptoIcon(method.icon);
            const cryptoBadge = isCrypto ? '<span class="crypto-badge">⛓</span>' : '';

            createHtml += `
                <label class="dropdown-item ${isCrypto ? 'crypto-method' : ''}" data-method="${method.code}" data-id="${method.id}" data-type="${method.type || 'fiat'}">
                    <span class="method-color" style="background:${method.color || '#666'};">${isCrypto ? cryptoIcon : ''}</span>
                    <input type="checkbox" name="create-payment" value="${method.code}" onchange="onCreatePaymentMethodChange(this)">
                    <span>${method.name}</span>
                    ${cryptoBadge}
                </label>
            `;

            filterHtml += `
                <label class="dropdown-item ${isCrypto ? 'crypto-method' : ''}" data-method="${method.code}" data-id="${method.id}" data-type="${method.type || 'fiat'}">
                    <span class="method-color" style="background:${method.color || '#666'};">${isCrypto ? cryptoIcon : ''}</span>
                    <input type="checkbox" name="payment" value="${method.code}">
                    <span>${method.name}</span>
                    ${cryptoBadge}
                </label>
            `;
        }

        createHtml += '<div class="dropdown-divider"></div>';
        filterHtml += '<div class="dropdown-divider"></div>';
    }

    // Update Create Order dropdown
    if (createList) {
        createList.innerHTML = createHtml;
    }

    // Update Filter dropdown
    if (filterDropdown) {
        filterDropdown.innerHTML = filterHtml;
        filterDropdown.innerHTML += `
            <div class="dropdown-actions">
                <button class="btn-secondary" onclick="resetPaymentFilters()">Reset</button>
                <button class="btn-primary" onclick="applyPaymentFilters()">Confirm</button>
            </div>
        `;
    }
}

/**
 * Handle payment method checkbox change in Create Order (with max 8 limit)
 */
function onCreatePaymentMethodChange(checkbox) {
    const MAX_PAYMENT_METHODS = 8;
    const selected = document.querySelectorAll('input[name="create-payment"]:checked');
    const count = selected.length;

    // If trying to select more than 8, prevent it
    if (checkbox.checked && count > MAX_PAYMENT_METHODS) {
        checkbox.checked = false;
        showToast(`Maximum ${MAX_PAYMENT_METHODS} payment methods allowed`, 'warning');
        return;
    }

    // Update counter
    const counterEl = document.getElementById('create-payment-count');
    if (counterEl) {
        counterEl.textContent = count;
        const counterContainer = document.getElementById('create-payment-counter');
        if (counterContainer) {
            counterContainer.classList.toggle('at-limit', count >= MAX_PAYMENT_METHODS);
            counterContainer.classList.toggle('has-selection', count > 0);
        }
    }

    // Check if any crypto methods are selected and show notice
    const selectedItems = document.querySelectorAll('input[name="create-payment"]:checked');
    const hasCrypto = Array.from(selectedItems).some(cb => {
        const item = cb.closest('.dropdown-item');
        return item?.dataset.type === 'crypto';
    });

    const cryptoNotice = document.getElementById('crypto-payment-notice');
    if (cryptoNotice) {
        cryptoNotice.style.display = hasCrypto ? 'block' : 'none';
    }

    // Update display
    updateCreatePaymentDisplay();
}

/**
 * Fallback: Populate from built-in P2P_CONFIG
 */
function populatePaymentMethodsFromBuiltin() {
    const createList = document.getElementById('create-payment-methods-list');
    if (!createList) return;

    const methods = Object.entries(P2P_CONFIG.paymentMethods);

    // NOTE: Payment methods are NOT checked by default
    let html = `
        <label class="dropdown-item">
            <input type="checkbox" name="create-payment" value="all" onchange="toggleAllCreatePayments(this.checked)">
            <span>All Payment Methods</span>
        </label>
        <div class="dropdown-divider"></div>
    `;

    // Group methods by type
    const fiatMethods = methods.filter(([_, m]) => m.type === 'fiat');
    const cryptoMethods = methods.filter(([_, m]) => m.type === 'crypto');
    const otherMethods = methods.filter(([_, m]) => !['fiat', 'crypto'].includes(m.type));

    if (fiatMethods.length > 0) {
        html += '<div class="dropdown-section">Fiat Payment Methods</div>';
        for (const [id, method] of fiatMethods) {
            html += `
                <label class="dropdown-item" data-method="${id}">
                    <span class="method-color" style="background:#22c55e;"></span>
                    <input type="checkbox" name="create-payment" value="${id}">
                    <span>${method.name}</span>
                </label>
            `;
        }
        html += '<div class="dropdown-divider"></div>';
    }

    if (cryptoMethods.length > 0) {
        html += '<div class="dropdown-section">Crypto Payment Methods</div>';
        for (const [id, method] of cryptoMethods) {
            html += `
                <label class="dropdown-item" data-method="${id}">
                    <span class="method-color" style="background:#f7931a;"></span>
                    <input type="checkbox" name="create-payment" value="${id}">
                    <span>${method.name}</span>
                </label>
            `;
        }
        html += '<div class="dropdown-divider"></div>';
    }

    if (otherMethods.length > 0) {
        html += '<div class="dropdown-section">Other</div>';
        for (const [id, method] of otherMethods) {
            html += `
                <label class="dropdown-item" data-method="${id}">
                    <span class="method-color" style="background:#666;"></span>
                    <input type="checkbox" name="create-payment" value="${id}">
                    <span>${method.name}</span>
                </label>
            `;
        }
    }

    createList.innerHTML = html;

    // Re-attach event listeners
    createList.querySelectorAll('input[name="create-payment"]').forEach(cb => {
        if (cb.value !== 'all') {
            cb.addEventListener('change', updateCreatePaymentDisplay);
        }
    });
}

// ============================================
// TELEGRAM NOTIFICATIONS MODULE
// ============================================
// Settings are managed in the LightWallet settings page (/settings)
// This module only handles sending P2P-specific notifications

/**
 * Show a message directing user to LightWallet settings
 */
function showTelegramSettings() {
    showToast('Telegram notification settings have been moved to the main wallet Settings page. Click Settings in the navigation to configure notifications.', 'info');
}

/**
 * Send Telegram notification
 * Uses shared settings from LightWallet settings page (telegramSettings key)
 * @param {string} type - Notification type (tradeAccepted, paymentSent, etc.)
 * @param {object} data - Data for the notification message
 */
async function sendTelegramNotification(type, data) {
    // Load shared settings from LightWallet settings
    let settings;
    try {
        settings = JSON.parse(localStorage.getItem('telegramSettings') || '{}');
    } catch (e) {
        console.log('No Telegram settings configured');
        return;
    }

    // Check if Telegram is configured
    if (!settings.botToken || !settings.userId) {
        return;
    }

    // Check if P2P notifications are enabled
    if (!settings.notifyP2pTrade) {
        return;
    }

    // Build message based on type
    let message = '';
    const emoji = {
        tradeAccepted: '🤝',
        paymentSent: '💸',
        paymentConfirmed: '✅',
        tradeCompleted: '🎉',
        disputeOpened: '⚠️',
        escrowAssigned: '⚖️',
        chatMessage: '💬'
    };

    switch (type) {
        case 'tradeAccepted':
            message = `${emoji[type]} *Trade Accepted!*

Order: \`#${data.orderId?.substring(0, 8)}\`
Amount: *${data.amount} ${data.asset || 'BEAM'}*
Counterparty: \`${data.counterparty?.substring(0, 12)}...\`

_Action needed: Share payment details in chat._`;
            break;

        case 'paymentSent':
            message = `${emoji[type]} *Payment Marked as Sent*

Trade: \`#${data.tradeId?.substring(0, 8)}\`
Amount: *${data.fiatAmount} ${data.currency}*
From: \`${data.buyer?.substring(0, 12)}...\`

_Action needed: Check your payment method and confirm receipt._`;
            break;

        case 'paymentConfirmed':
            message = `${emoji[type]} *Payment Confirmed!*

Trade: \`#${data.tradeId?.substring(0, 8)}\`
Seller has confirmed fiat receipt.

_Action needed: Claim your crypto in the trade modal._`;
            break;

        case 'tradeCompleted':
            message = `${emoji[type]} *Trade Completed!*

Trade: \`#${data.tradeId?.substring(0, 8)}\`
${data.amount} ${data.asset} released.
Both deposits returned.

_Thank you for trading on BEAM P2P!_`;
            break;

        case 'disputeOpened':
            message = `${emoji[type]} *Dispute Opened*

Trade: \`#${data.tradeId?.substring(0, 8)}\`
Reason: ${data.reason || 'Not specified'}

_3 escrow arbiters will review your case._`;
            break;

        case 'escrowAssigned':
            // Check if escrow notifications are enabled
            if (!settings.notifyEscrow) return;
            message = `${emoji[type]} *You've Been Assigned as Arbiter*

Dispute: \`#${data.disputeId?.substring(0, 8)}\`
Trade amount: *${data.amount} ${data.asset}*

_Review the evidence and cast your vote._`;
            break;

        case 'chatMessage':
            message = `${emoji[type]} *New Chat Message*

Trade: \`#${data.tradeId?.substring(0, 8)}\`
From: \`${data.sender?.substring(0, 12)}...\`

_Open the app to view the message._`;
            break;

        default:
            return;
    }

    console.log(`Telegram notification [${type}]:`, message);

    // Send via Telegram Bot API
    try {
        await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: settings.userId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error('Failed to send Telegram notification:', e);
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadPaymentMethodsConfig();
        setupFilterListeners();
        init();
    });
} else {
    loadPaymentMethodsConfig();
    setupFilterListeners();
    init();
}
