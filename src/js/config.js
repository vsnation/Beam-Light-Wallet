/**
 * BEAM Wallet - Configuration Module
 * All constants, asset configs, and global settings
 */

// Official BEAM logo as data URI (avoids CORS issues)
export const BEAM_LOGO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 40"><defs><linearGradient id="a" x1=".03%" x2="54.79%" y1="50.23%" y2="50.23%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#FFF"/></linearGradient><linearGradient id="b" x1="99.38%" x2="35.8%" y1="49.83%" y2="49.83%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#FF51FF"/></linearGradient><linearGradient id="c" x1="100.43%" x2="48.94%" y1="50.11%" y2="50.11%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#A18CFF"/></linearGradient><linearGradient id="d" x1="99.91%" x2="41.06%" y1="50.24%" y2="50.24%"><stop offset="0%" stop-opacity="0"/><stop offset="100%" stop-color="#AB38E6"/></linearGradient></defs><g fill="none"><path fill="#0B76FF" d="M28.47 33.21H40.3L28.48 12.58V.08l23.15 39.77H28.47z"/><path fill="#24C1FF" d="M28.47 33.21H16.66l11.8-20.63V.08L5.32 39.86h23.16z"/><path fill="#39FFF2" d="M28.47 17.8v13.33l-7.23.01z"/><path fill="#00E2C2" d="M28.47 17.8v13.33l7.24.01z"/><path fill="url(#a)" d="m.1 12.53 28.37 13.14v1.37L.11 20.82z"/><path fill="url(#b)" d="M56.9 8.7 28.47 25.68v.46L56.9 14.18z"/><path fill="url(#c)" d="m56.9 25.13-28.43 1.91v-.45l28.43-6.93z"/><path fill="url(#d)" d="M56.9 14.18 28.47 26.13v.46l28.43-6.93z"/></g></svg>');

// Asset icons from ca_assets_updates.json
export const ASSET_ICONS = {
    0: BEAM_LOGO,
    4: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/crown.ico',
    7: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/beamx.png',
    9: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/tico.ico',
    47: 'https://raw.githubusercontent.com/vsnation/BeamPay/master/assets/47_nph.svg',
    174: 'https://73ecj7qctz4nrza4bbbqmgriv4gh5uwwf65izu7wjdvrmozhbvbq.arweave.net/_sgk_gKeeNjkHAhDBhoorwx-0tYvuozT9kjrFjsnDUM'
};

// Priority token config with metadata
export const ASSET_CONFIG = {
    0: { name: 'BEAM', symbol: 'BEAM', color: '#25c2a0', class: 'beam', icon: ASSET_ICONS[0], decimals: 8 },
    4: { name: 'Crown', symbol: 'CROWN', color: '#ffd700', class: 'warning', icon: ASSET_ICONS[4], decimals: 8 },
    6: { name: 'Rangers Fan Token', symbol: 'RFC', color: '#0066cc', class: 'fomo', icon: null, decimals: 8 },
    7: { name: 'BeamX', symbol: 'BEAMX', color: '#da70d6', class: 'beamx', icon: ASSET_ICONS[7], decimals: 8 },
    9: { name: 'Tico', symbol: 'TICO', color: '#e91e63', class: 'fomo', icon: ASSET_ICONS[9], decimals: 8 },
    47: { name: 'Nephrit', symbol: 'NPH', color: '#3498db', class: 'fomo', icon: ASSET_ICONS[47], decimals: 8 },
    174: { name: 'FOMO', symbol: 'FOMO', color: '#60a5fa', class: 'fomo', icon: ASSET_ICONS[174], decimals: 8 }
};

// API Configuration
export const API_URL = '/api/wallet';
export const GROTH = 100000000;  // 1 BEAM = 100,000,000 groth
export const DEFAULT_FEE = 100000;  // 0.001 BEAM

// DEX Contract ID (AMM)
export const DEX_CID = '729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf';

// Airdrop Contract ID (Voucher-based token distribution)
// Set after deployment
export const AIRDROP_CID = '';

// Pool types (affects fees)
export const POOL_KINDS = {
    0: { name: 'Volatile', fee: '0.3%' },
    1: { name: 'Stable', fee: '0.05%' },
    2: { name: 'Standard', fee: '1%' }
};

// Transaction status codes
export const TX_STATUS = {
    0: { name: 'Pending', cls: 'warning' },
    1: { name: 'In Progress', cls: 'info' },
    2: { name: 'Cancelled', cls: 'error' },
    3: { name: 'Completed', cls: 'success' },
    4: { name: 'Failed', cls: 'error' },
    5: { name: 'Registering', cls: 'info' }
};

// Transaction types
export const TX_TYPES = {
    0: 'Simple',
    1: 'AtomicSwap',
    2: 'AssetIssue',
    3: 'AssetConsume',
    4: 'AssetReg',
    5: 'AssetUnreg',
    6: 'AssetInfo',
    7: 'PushTransaction',
    8: 'PullTransaction',
    9: 'VoucherRequest',
    10: 'VoucherResponse',
    11: 'UnlinkFunds',
    12: 'MaxPrivacy',
    13: 'Contract'
};

// Wallet version
export const VERSION = '1.0.0';
export const BEAM_VERSION = '7.5.13882';

// Debug configuration
export const MAX_DEBUG_LOGS = 100;
