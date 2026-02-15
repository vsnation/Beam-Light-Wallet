// =============================================================================
// Fuddle v5 - On-Chain Wordle with Round-Locked Token Tournaments
// =============================================================================
// 3 tournament tiers by TOKEN: BEAM, FOMO, BEAMX
// Player picks tournament (token) + word difficulty (4/5/6) independently
// Prize pools funded by entry fees + donations, 50% distributed proportionally
// v5: Settings changes are round-locked — active rounds use asset/cost stored
//     at creation. Pre-transaction balance checks with helpful modals.
// =============================================================================

// Contract ID - set after deployment
const FUDDLE_CID = '54b22372836b853cf61f87e657fbdd60455f2eee6b91c73f4dbf0a2df887a9d7';

// Constants
const FUDDLE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const KEYBOARD_ROWS = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['ENTER','Z','X','C','V','B','N','M','DEL']
];

// Tournament tiers keyed by CONTRACT tier (0/1/2) — token-based naming
const TIER_CSS = { 0: 'tier-beam', 1: 'tier-fomo', 2: 'tier-beamx' };
let TIER_NAMES = { 0: 'BEAM', 1: 'FOMO', 2: 'BEAMX' };
let TIER_ASSETS = {
    0: { id: 0, name: 'BEAM', decimals: 8 },
    1: { id: 174, name: 'FOMO', decimals: 8 },
    2: { id: 7, name: 'BEAMX', decimals: 8 }
};

// TIER_ENTRY_ASSETS = what the contract CHARGES (from settings, may differ from active tournament)
let TIER_ENTRY_ASSETS = {
    0: { id: 0, name: 'BEAM', decimals: 8 },
    1: { id: 174, name: 'FOMO', decimals: 8 },
    2: { id: 7, name: 'BEAMX', decimals: 8 }
};

function fuddleResolveAssetName(aid) {
    const cfg = (typeof ASSET_CONFIG !== 'undefined') ? ASSET_CONFIG[aid] : null;
    return cfg ? cfg.symbol : (aid === 0 ? 'BEAM' : `CA#${aid}`);
}

function fuddleUpdateTierNames() {
    const s = fuddleState.settings;
    if (!s) return;
    for (let tier = 0; tier < 3; tier++) {
        // Entry asset = from settings (what contract will charge for FUTURE rounds)
        const settingsAid = s[`tier${tier}_asset`];
        if (settingsAid != null) {
            const name = fuddleResolveAssetName(settingsAid);
            const cfg = (typeof ASSET_CONFIG !== 'undefined') ? ASSET_CONFIG[settingsAid] : null;
            TIER_ENTRY_ASSETS[tier] = { id: settingsAid, name: name, decimals: cfg?.decimals || 8 };
        }

        // v5: Display asset = from active tournament (round-locked snapshot)
        // Falls back to settings if no tournament exists
        const tournament = fuddleState.tournaments?.[tier];
        const displayAid = (tournament && tournament.asset != null) ? tournament.asset : settingsAid;
        if (displayAid != null) {
            const name = fuddleResolveAssetName(displayAid);
            const cfg = (typeof ASSET_CONFIG !== 'undefined') ? ASSET_CONFIG[displayAid] : null;
            TIER_NAMES[tier] = name;
            TIER_ASSETS[tier] = { id: displayAid, name: name, decimals: cfg?.decimals || 8 };
        }

        // v5: Store tournament's round-locked entry cost (if available)
        // entry_cost from tournament overrides tier_entry_cost from settings
        if (tournament && tournament.entry_cost != null && !tournament.finalized) {
            tournament._roundEntryCost = tournament.entry_cost;
        }
    }
}

// Difficulty labels (word length)
const DIFF_NAMES = { 4: '4-Letter', 5: '5-Letter', 6: '6-Letter' };

// Score formula: (1000 + (7-attempts)*150) * multiplier/100
const DIFF_MULTIPLIER = { 4: 100, 5: 125, 6: 150 };

// Game state
let fuddleState = {
    view: 'lobby',       // lobby | game | shop | leaderboard | admin
    games: [],
    letters: {},         // { 0: count, 1: count, ... } (0=A, 1=B, ...)
    currentGameId: null,
    currentDifficulty: 5,
    currentTier: 0,      // Contract tier (0/1/2) for current game
    guesses: [],         // Array of { guess: [0-25], feedback: [0-2] }
    currentGuess: [],    // Current typed letters (0-25 values)
    attemptsUsed: 0,
    playerStatus: 0,     // 0=playing, 1=won, 2=lost
    score: 0,
    isConfirming: false,
    pollTimer: null,
    countdownTimer: null,
    settings: null,      // Contract settings
    myStats: null,
    leaderboard: [],
    // Tournament v2
    tournaments: {},     // { 0: {...}, 1: {...}, 2: {...} } keyed by contract tier
    myTournaments: {},   // { 0: {score, claimed, ...}, 1: ..., 2: ... }
    pastMyTournaments: {},  // Keyed by "tier_round" for past round data
    pastTournaments: {},    // Keyed by "tier_round" for past round tournament data
    unclaimedRewards: [],   // [{tier, round, score, estimated_reward, tournament}]
    roundHistory: [],       // [{tier, round, prize_pool, total_players, ...}]
    roundHistoryTierFilter: -1, // -1=all tiers, 0/1/2=specific tier
    allGames: [],           // All games (not filtered by status)
    currentHeight: 0,
    wordCounts: null,
    txPollTimer: null,
    isAdmin: false,
};

// =========================================================================
// Contract helpers
// =========================================================================

async function fuddleCall(action, role, extraArgs) {
    const args = `role=${role},action=${action},cid=${FUDDLE_CID}${extraArgs ? ',' + extraArgs : ''}`;
    try {
        const params = { args };
        if (typeof FUDDLE_SHADER !== 'undefined') params.contract = FUDDLE_SHADER;
        const resp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'invoke_contract',
                params
            })
        });
        const data = await resp.json();
        if (data.result && data.result.output) {
            try {
                const output = JSON.parse(data.result.output);
                if (output.error) {
                    console.error('Fuddle shader error:', output.error);
                    return { error: output.error };
                }
                return output;
            } catch (e) {
                return data.result;
            }
        }
        if (data.error) {
            console.error('Fuddle contract error:', data.error);
            return { error: data.error.message || 'Contract call failed' };
        }
        return data.result || data;
    } catch (e) {
        console.error('Fuddle API error:', e);
        return { error: e.message };
    }
}

async function fuddleTx(action, role, extraArgs, txLabel) {
    const args = `role=${role},action=${action},cid=${FUDDLE_CID}${extraArgs ? ',' + extraArgs : ''}`;
    try {
        const params = { args, create_tx: true };
        if (typeof FUDDLE_SHADER !== 'undefined') params.contract = FUDDLE_SHADER;
        const resp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'invoke_contract',
                params
            })
        });
        const data = await resp.json();
        // Check for shader-level error in output
        if (data.result && data.result.output) {
            try {
                const output = JSON.parse(data.result.output);
                if (output.error) {
                    console.error('Fuddle shader error:', output.error);
                    return { error: output.error };
                }
            } catch (e) { /* output is not JSON, ignore */ }
        }
        if (data.result && data.result.raw_data) {
            const resp2 = await fetch('/api/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'process_invoke_data',
                    params: { data: data.result.raw_data }
                })
            });
            const result = await resp2.json();
            // Refresh tx table after submitting
            fuddleLoadTxTable();
            return result;
        }
        if (data.error) {
            console.error('Fuddle tx error:', data.error);
            return { error: data.error.message || 'Transaction failed' };
        }
        return data.result || data;
    } catch (e) {
        console.error('Fuddle tx error:', e);
        return { error: e.message };
    }
}

// =========================================================================
// Data loading
// =========================================================================

async function loadFuddleSettings() {
    const result = await fuddleCall('view', 'manager');
    if (result && result.settings) {
        fuddleState.settings = result.settings;
        fuddleState.isAdmin = !!(result.settings.is_admin);
    }
    return fuddleState.settings;
}

async function loadFuddleGames() {
    const result = await fuddleCall('view_games', 'user');
    if (result && result.games) {
        fuddleState.allGames = result.games;
        fuddleState.games = result.games.filter(g => g.status === 0);
    }
    return fuddleState.games;
}

function getMyFuddleGames() {
    const myPk = fuddleState.myStats?.pk;
    if (!myPk) return fuddleState.games;
    return fuddleState.games.filter(g => g.creator === myPk);
}

function getMyActiveGames() {
    const myPk = fuddleState.myStats?.pk;
    if (!myPk) return [];
    const height = fuddleState.currentHeight;
    return (fuddleState.allGames || []).filter(g => {
        if (g.creator !== myPk) return false;
        if (g.status !== 0) return false;
        // Skip time-expired games
        if (height && g.expires_at && g.expires_at < height) return false;
        // Skip games from previous tournament rounds
        const cTier = g.tier != null ? g.tier : 0;
        const currentRound = fuddleState.tournaments[cTier]?.round || 0;
        if (g.tournament_round && currentRound && g.tournament_round < currentRound) return false;
        return true;
    });
}

function getMyCompletedGames() {
    const myPk = fuddleState.myStats?.pk;
    if (!myPk || !fuddleState.allGames) return [];
    const height = fuddleState.currentHeight;
    return fuddleState.allGames.filter(g => {
        if (g.creator !== myPk) return false;
        // Won (status=1) or explicitly lost/expired (status=2)
        if (g.status === 1 || g.status === 2) return true;
        // Time-expired active game
        if (g.status === 0 && height && g.expires_at && g.expires_at < height) return true;
        // Game from a previous tournament round (no longer playable)
        if (g.status === 0 && g.tournament_round) {
            const cTier = g.tier != null ? g.tier : 0;
            const currentRound = fuddleState.tournaments[cTier]?.round || 0;
            if (currentRound && g.tournament_round < currentRound) return true;
        }
        return false;
    });
}

async function loadFuddleLetters() {
    const result = await fuddleCall('view_letters', 'user');
    fuddleState.letters = {};
    if (result && result.letters) {
        for (const l of result.letters) {
            fuddleState.letters[l.char] = l.count;
        }
    }
    return fuddleState.letters;
}

async function loadAllTournaments() {
    const result = await fuddleCall('view_all_tournaments', 'user');
    if (result) {
        if (result.tournament_duration) {
            fuddleState.tournamentDuration = result.tournament_duration;
        }
        if (result.tournaments) {
            fuddleState.tournaments = {};
            for (const t of result.tournaments) {
                fuddleState.tournaments[t.tier] = t;
            }
        }
    }
    return fuddleState.tournaments;
}

async function loadMyTournament(contractTier, round) {
    const roundArg = round ? `,round=${round}` : '';
    const result = await fuddleCall('view_my_tournament', 'user', `tier=${contractTier}${roundArg}`);
    if (result && result.my_tournament) {
        if (round) {
            fuddleState.pastMyTournaments[`${contractTier}_${round}`] = result.my_tournament;
        } else {
            fuddleState.myTournaments[contractTier] = result.my_tournament;
        }
    }
    return round
        ? fuddleState.pastMyTournaments[`${contractTier}_${round}`]
        : fuddleState.myTournaments[contractTier];
}

async function loadAllMyTournaments() {
    // Pass contract tier numbers (0, 1, 2)
    await Promise.all([
        loadMyTournament(0),
        loadMyTournament(1),
        loadMyTournament(2),
    ]);
}

async function loadUnclaimedRewards() {
    fuddleState.unclaimedRewards = [];
    for (const cTier of [0, 1, 2]) {
        const currentRound = fuddleState.tournaments[cTier]?.round || 0;
        // Check previous 5 rounds for unclaimed rewards
        for (let r = currentRound - 1; r >= Math.max(1, currentRound - 5); r--) {
            const my = await loadMyTournament(cTier, r);
            if (my && my.score > 0 && !my.claimed) {
                // We need the tournament data for this past round to estimate reward
                // Use view_tournament with round param if available, else estimate
                const tierAsset = TIER_ASSETS[cTier] || TIER_ASSETS[0];
                fuddleState.unclaimedRewards.push({
                    tier: cTier,
                    round: r,
                    score: my.score,
                    estimated_reward: my.estimated_reward || 0,
                    tierName: TIER_NAMES[cTier] || 'BEAM',
                    assetName: tierAsset.name,
                });
            }
        }
    }
    return fuddleState.unclaimedRewards;
}

async function loadPastTournament(cTier, round) {
    const key = `${cTier}_${round}`;
    if (fuddleState.pastTournaments[key]) return fuddleState.pastTournaments[key];
    const result = await fuddleCall('view_tournament', 'user', `tier=${cTier},round=${round}`);
    if (result && result.tournament) {
        fuddleState.pastTournaments[key] = result.tournament;
    }
    return fuddleState.pastTournaments[key];
}

async function loadRoundHistory(limit) {
    limit = limit || 5;
    fuddleState.roundHistory = [];
    const promises = [];

    for (const cTier of [0, 1, 2]) {
        const currentRound = fuddleState.tournaments[cTier]?.round || 0;
        for (let r = currentRound - 1; r >= Math.max(1, currentRound - limit); r--) {
            promises.push((async () => {
                const t = await loadPastTournament(cTier, r);
                const my = await loadMyTournament(cTier, r);
                if (t) {
                    const tierAsset = TIER_ASSETS[cTier] || TIER_ASSETS[0];
                    fuddleState.roundHistory.push({
                        tier: cTier,
                        round: r,
                        tierName: TIER_NAMES[cTier] || 'BEAM',
                        tierClass: TIER_CSS[cTier] || 'tier-beam',
                        assetName: tierAsset.name,
                        assetId: tierAsset.id,
                        prizePool: t.prize_pool || 0,
                        totalPlayers: t.total_players || 0,
                        totalScores: t.total_scores || 0,
                        finalized: !!t.finalized,
                        startHeight: t.start_height,
                        endHeight: t.end_height,
                        myScore: my?.score || 0,
                        myReward: my?.estimated_reward || 0,
                        myClaimed: !!my?.claimed,
                    });
                }
            })());
        }
    }
    await Promise.all(promises);
    // Sort by round descending, then by tier
    fuddleState.roundHistory.sort((a, b) => b.round - a.round || a.tier - b.tier);
    return fuddleState.roundHistory;
}

function getFilteredRoundHistory() {
    const filter = fuddleState.roundHistoryTierFilter;
    if (filter < 0) return fuddleState.roundHistory;
    return fuddleState.roundHistory.filter(r => r.tier === filter);
}

async function loadFuddleMyGame(gameId) {
    const result = await fuddleCall('view_my_game', 'user', `game_id=${gameId}`);
    if (result && result.my_game) {
        const mg = result.my_game;
        fuddleState.attemptsUsed = mg.attempts_used || 0;
        fuddleState.playerStatus = mg.status || 0;
        fuddleState.score = mg.score || 0;

        if (mg.guesses) {
            fuddleState.guesses = mg.guesses.map(g => ({
                guess: g.guess ? g.guess.map(v => typeof v === 'object' ? v[''] : v) : [],
                feedback: g.feedback ? g.feedback.map(v => typeof v === 'object' ? v[''] : v) : []
            }));
        } else {
            fuddleState.guesses = [];
        }
        return mg;
    }
    return null;
}

async function loadFuddleLeaderboard() {
    const result = await fuddleCall('view_leaderboard', 'user');
    if (result && result.leaderboard) {
        fuddleState.leaderboard = result.leaderboard
            .sort((a, b) => b.total_score - a.total_score)
            .slice(0, 20);
    }
    return fuddleState.leaderboard;
}

async function loadFuddleMyStats() {
    const result = await fuddleCall('view_my_stats', 'user');
    if (result && result.stats) {
        fuddleState.myStats = result.stats;
    }
    return fuddleState.myStats;
}

async function loadCurrentHeight() {
    try {
        const resp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: Date.now(),
                method: 'wallet_status', params: {}
            })
        });
        const data = await resp.json();
        if (data.result && data.result.current_height) {
            fuddleState.currentHeight = data.result.current_height;
        }
    } catch (e) {
        console.error('Failed to get height:', e);
    }
}

// =========================================================================
// Format helpers
// =========================================================================

function fuddleFormatBeam(groth) {
    if (!groth) return '0';
    const beam = groth / 100000000;
    if (beam >= 1) return beam.toFixed(beam % 1 === 0 ? 0 : 2);
    return beam.toFixed(4);
}

function fuddleCharToLetter(ch) {
    return FUDDLE_LETTERS[ch] || '?';
}

function fuddleLetterToChar(letter) {
    return FUDDLE_LETTERS.indexOf(letter.toUpperCase());
}

function fuddleDiffName(diff) {
    return DIFF_NAMES[diff] || `${diff}-Letter`;
}

function fuddleTierName(contractTier) {
    return TIER_NAMES[contractTier] || 'Unknown';
}

function fuddleShortenPk(pk) {
    if (!pk || pk.length < 16) return pk || '';
    return pk.slice(0, 8) + '...' + pk.slice(-6);
}

function fuddleTotalLetters() {
    return Object.values(fuddleState.letters).reduce((s, c) => s + c, 0);
}

function fuddleShortenCid(cid) {
    if (!cid || cid.length < 16) return cid || '';
    return cid.slice(0, 6) + '...' + cid.slice(-6);
}

function fuddleFormatCountdown(blocksRemaining) {
    if (blocksRemaining <= 0) return 'Ended';
    const seconds = blocksRemaining * 60; // ~60s per block
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

// v5: Get the effective entry cost for a tier (round-locked from tournament, or settings)
function fuddleGetEffectiveEntryCost(cTier) {
    const t = fuddleState.tournaments[cTier];
    // Use tournament's stored entry_cost if active round exists
    if (t && t.entry_cost != null && !t.finalized) {
        return t.entry_cost;
    }
    // Fall back to settings
    return fuddleState.settings?.[`tier${cTier}_cost`] || 0;
}

// v5: Get the effective entry asset for a tier (round-locked from tournament, or settings)
function fuddleGetEffectiveEntryAsset(cTier) {
    return TIER_ASSETS[cTier] || TIER_ASSETS[0];
}

function fuddleEstimateReward(tournament, myScore) {
    if (!tournament || !tournament.total_scores || !myScore) return 0;
    const distributable = tournament.prize_pool * 50 / 100;
    return Math.floor(distributable * myScore / tournament.total_scores);
}

// =========================================================================
// v5: Balance checking
// =========================================================================

async function fuddleGetWalletBalance(assetId) {
    try {
        const resp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: Date.now(),
                method: 'wallet_status', params: {}
            })
        });
        const data = await resp.json();
        if (!data.result) return 0;
        if (assetId === 0) return data.result.available || 0;
        if (data.result.totals) {
            const asset = data.result.totals.find(t => t.asset_id === assetId);
            return asset ? (asset.available || 0) : 0;
        }
        return 0;
    } catch (e) {
        console.error('Balance check failed:', e);
        return 0;
    }
}

async function fuddleCheckBalance(assetId, amount, assetName) {
    const balance = await fuddleGetWalletBalance(assetId);
    if (balance >= amount) return true;

    fuddleShowInsufficientBalanceModal(assetId, amount, balance, assetName);
    return false;
}

function fuddleShowInsufficientBalanceModal(assetId, required, available, assetName) {
    const overlay = document.createElement('div');
    overlay.className = 'fuddle-result-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const reqText = fuddleFormatBeam(required);
    const availText = fuddleFormatBeam(available);
    const shortfall = required - available;
    const shortText = fuddleFormatBeam(shortfall);

    let actionBtn = '';
    if (assetId === 0) {
        actionBtn = `<button class="btn btn-accent" style="padding:12px;flex:1;" onclick="window.open('https://buybeam.my','_blank'); this.closest('.fuddle-result-overlay').remove();">Buy BEAM</button>`;
    } else {
        actionBtn = `<button class="btn btn-accent" style="padding:12px;flex:1;" onclick="this.closest('.fuddle-result-overlay').remove(); if(typeof showPage==='function') showPage('dex');">Swap on DEX</button>`;
    }

    overlay.innerHTML = `
        <div class="fuddle-result-modal" style="max-width:380px;">
            <div style="font-size:48px;text-align:center;margin-bottom:8px;">&#9888;</div>
            <h2 style="color:var(--warning);margin:0 0 8px;text-align:center;font-size:18px;">Insufficient Balance</h2>
            <div style="background:var(--bg-tertiary);border-radius:12px;padding:16px;margin:16px 0;">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                    <span style="color:var(--text-muted);font-size:13px;">Required</span>
                    <span style="color:var(--text-primary);font-weight:600;">${reqText} ${assetName}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                    <span style="color:var(--text-muted);font-size:13px;">Available</span>
                    <span style="color:var(--text-secondary);">${availText} ${assetName}</span>
                </div>
                <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;">
                    <span style="color:var(--text-muted);font-size:13px;">Shortfall</span>
                    <span style="color:var(--error);font-weight:600;">${shortText} ${assetName}</span>
                </div>
            </div>
            <div class="fuddle-result-btns">
                ${actionBtn}
                <button class="btn btn-outline" style="padding:12px;flex:1;" onclick="this.closest('.fuddle-result-overlay').remove();">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
}

// =========================================================================
// Entry point
// =========================================================================

function initFuddle() {
    fuddleState.view = 'lobby';
    fuddleState.currentGuess = [];
    fuddleState.isConfirming = false;

    if (fuddleState.pollTimer) {
        clearInterval(fuddleState.pollTimer);
        fuddleState.pollTimer = null;
    }
    if (fuddleState.countdownTimer) {
        clearInterval(fuddleState.countdownTimer);
        fuddleState.countdownTimer = null;
    }

    // Clean up any orphaned TX progress overlay
    if (typeof fuddleHideTxProgress === 'function') fuddleHideTxProgress();

    if (typeof FUDDLE_SHADER === 'undefined') {
        console.warn('Fuddle: FUDDLE_SHADER not defined — server-side shader injection will be used as fallback');
    }

    if (!FUDDLE_CID) {
        renderFuddleNoContract();
        return;
    }

    renderFuddleLoading();
    loadFuddleData().then(() => renderFuddleLobby());
}

async function loadFuddleData() {
    await Promise.all([
        loadFuddleSettings(),
        loadFuddleLetters(),
        loadFuddleMyStats(),
        loadFuddleGames(),
        loadAllTournaments(),
        loadAllMyTournaments(),
        loadCurrentHeight(),
    ]);
    // Update tier names AFTER both settings and tournaments are loaded
    fuddleUpdateTierNames();
    // Check past rounds for unclaimed rewards + load round history
    await Promise.all([
        loadUnclaimedRewards(),
        loadRoundHistory(5),
    ]);
}

// =========================================================================
// Render: No Contract
// =========================================================================

function renderFuddleNoContract() {
    const root = document.getElementById('fuddle-root');
    if (!root) return;
    root.innerHTML = `
        <div class="fuddle-header">
            <button class="fuddle-back-btn" onclick="showPage('appstore')">&#8592; Back</button>
            <div class="fuddle-title">FUDDLE</div>
            <div></div>
        </div>
        <div style="text-align:center; padding: 40px 20px;">
            <div style="font-size: 64px; margin-bottom: 16px;">&#127919;</div>
            <h2 style="color: var(--text-primary); margin-bottom: 8px;">Coming Soon</h2>
            <p style="color: var(--text-secondary); max-width: 400px; margin: 0 auto; line-height: 1.6;">
                Fuddle is an on-chain Wordle game with daily tournaments on BEAM blockchain.
                The contract needs to be deployed first. Check back soon!
            </p>
        </div>
    `;
}

// =========================================================================
// Render: Loading
// =========================================================================

function renderFuddleLoading() {
    const root = document.getElementById('fuddle-root');
    if (!root) return;
    root.innerHTML = `
        <div class="fuddle-header">
            <button class="fuddle-back-btn" onclick="showPage('appstore')">&#8592; Back</button>
            <div class="fuddle-title">FUDDLE</div>
            <div></div>
        </div>
        <div class="fuddle-loading">Loading tournament data...</div>
    `;
}

// =========================================================================
// Render: Lobby with Tournament Cards
// =========================================================================

function renderFuddleLobby() {
    fuddleState.view = 'lobby';
    const root = document.getElementById('fuddle-root');
    if (!root) return;

    const letters = fuddleState.letters;
    const settings = fuddleState.settings;
    const stats = fuddleState.myStats;
    const height = fuddleState.currentHeight;

    // Build tournament cards — keyed by contract tier (0/1/2)
    let tournamentsHtml = '';
    for (const cTier of [0, 1, 2]) {
        const t = fuddleState.tournaments[cTier];
        const my = fuddleState.myTournaments[cTier];
        const tierClass = TIER_CSS[cTier];
        const tierName = TIER_NAMES[cTier];
        const tierAsset = TIER_ASSETS[cTier] || TIER_ASSETS[0];       // Tournament's actual asset (for pool/rewards/display)

        let prizePool = '0';
        let players = 0;
        let blocksLeft = 0;
        let round = 0;
        let isActive = false;
        let isEnded = false;

        if (t) {
            prizePool = fuddleFormatBeam(t.prize_pool);
            players = t.total_players || 0;
            round = t.round || 0;
            if (t.end_height && height) {
                blocksLeft = t.end_height - height;
                isActive = blocksLeft > 0 && !t.finalized;
                isEnded = blocksLeft <= 0 || t.finalized;
            } else if (t.round > 0) {
                isActive = !t.finalized;
                isEnded = !!t.finalized;
            }
        }

        const myScore = my ? (my.score || 0) : 0;
        const myClaimed = my ? !!my.claimed : false;
        const estReward = t ? fuddleEstimateReward(t, myScore) : 0;

        let actionBtn = '';
        if (isEnded && myScore > 0 && !myClaimed) {
            actionBtn = `<button class="fuddle-tournament-claim" onclick="fuddleClaimTournamentReward(${cTier}, ${round})">Claim ~${fuddleFormatBeam(estReward)} ${tierAsset.name}</button>`;
        } else {
            actionBtn = `<button class="fuddle-tournament-play" onclick="fuddleShowDiffPicker(${cTier})">Play Now</button>`;
        }

        const countdownText = isActive ? fuddleFormatCountdown(blocksLeft) : (isEnded ? 'Ended' : 'Not started');

        // v5: Show entry cost from round-locked tournament, or settings
        const effectiveEntryCost = fuddleGetEffectiveEntryCost(cTier);
        const entryCostText = fuddleFormatBeam(effectiveEntryCost);
        const entryLabel = `${entryCostText} ${tierAsset.name} per game`;

        // USD for prize pool using tournament's actual asset
        let poolUsdHtml = '';
        if (t && t.prize_pool > 0 && typeof getAssetUsdValue === 'function') {
            const usd = getAssetUsdValue(tierAsset.id, t.prize_pool);
            if (usd > 0) poolUsdHtml = ` <span style="font-size:11px;color:var(--text-muted);">($${usd < 1 ? usd.toFixed(4) : usd.toFixed(2)})</span>`;
        }

        // USD for entry cost using tournament's asset
        let entryUsdHtml = '';
        if (effectiveEntryCost > 0 && typeof getAssetUsdValue === 'function') {
            const usd = getAssetUsdValue(tierAsset.id, effectiveEntryCost);
            if (usd > 0) entryUsdHtml = ` <span style="font-size:11px;color:var(--text-muted);">($${usd < 1 ? usd.toFixed(4) : usd.toFixed(2)})</span>`;
        }

        tournamentsHtml += `
            <div class="fuddle-tournament-card ${tierClass}">
                <div class="fuddle-tournament-tier-badge">${tierName}</div>
                <div class="fuddle-tournament-letters">${entryLabel}${entryUsdHtml}</div>
                <div class="fuddle-tournament-prize">
                    <span class="prize-amount">${prizePool}</span>
                    <span class="prize-label">${tierAsset.name} Prize Pool${poolUsdHtml}</span>
                </div>
                <div class="fuddle-tournament-meta">
                    <div class="meta-item">
                        <span class="meta-val">${players}</span>
                        <span class="meta-label">Players</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-val score">${myScore}</span>
                        <span class="meta-label">Your Score</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-val countdown" data-tier="${cTier}">${countdownText}</span>
                        <span class="meta-label">Time Left</span>
                    </div>
                    ${myScore > 0 ? `<div class="meta-item meta-reward">
                        <span class="meta-val reward">~${fuddleFormatBeam(estReward)} ${tierAsset.name}</span>
                        <span class="meta-label">Est. Reward</span>
                    </div>` : ''}
                </div>
                ${round > 0 ? `<div class="fuddle-tournament-round">Round ${round}</div>` : ''}
                <div class="fuddle-tournament-actions">
                    ${actionBtn}
                    <button class="fuddle-tournament-donate" onclick="fuddleShowDonateModal(${cTier})">Donate</button>
                </div>
            </div>
        `;
    }

    // Build letters bar
    let lettersHtml = '';
    for (let i = 0; i < 26; i++) {
        const count = letters[i] || 0;
        if (count > 0) {
            lettersHtml += `<div class="fuddle-letter-chip"><span class="char">${FUDDLE_LETTERS[i]}</span><span class="count">:${count}</span></div>`;
        }
    }
    if (!lettersHtml) lettersHtml = '<span style="color:var(--text-muted);font-size:13px;">No letters yet. Buy some to play!</span>';

    // Stats
    let statsHtml = '';
    if (stats) {
        statsHtml = `
            <div class="fuddle-stats-row">
                <div class="fuddle-stat-card"><div class="fuddle-stat-val" style="color:var(--fuddle-accent);">${stats.games_played || 0}</div><div class="fuddle-stat-label">Played</div></div>
                <div class="fuddle-stat-card"><div class="fuddle-stat-val" style="color:var(--fuddle-correct);">${stats.games_won || 0}</div><div class="fuddle-stat-label">Won</div></div>
                <div class="fuddle-stat-card"><div class="fuddle-stat-val" style="color:var(--fuddle-purple);">${stats.total_score || 0}</div><div class="fuddle-stat-label">Score</div></div>
                <div class="fuddle-stat-card"><div class="fuddle-stat-val" style="color:var(--fuddle-present);">${stats.best_streak || 0}</div><div class="fuddle-stat-label">Streak</div></div>
            </div>
        `;
    }

    root.innerHTML = `
        <div class="fuddle-header">
            <button class="fuddle-back-btn" onclick="showPage('appstore')">&#8592; Back</button>
            <div class="fuddle-title">FUDDLE</div>
            <button class="fuddle-help-btn" onclick="fuddleShowHowToPlay()">? How to Play</button>
        </div>

        <div class="fuddle-cid-display" onclick="fuddleCopyCid()">
            <span class="cid-label">Contract:</span>
            <span class="cid-value">${fuddleShortenCid(FUDDLE_CID)}</span>
            <span class="cid-copy" title="Copy CID">&#9112;</span>
        </div>

        ${stats ? `<div class="fuddle-lobby-section">${statsHtml}</div>` : ''}

        ${fuddleState.unclaimedRewards.length > 0 ? `
        <div class="fuddle-lobby-section fuddle-unclaimed-section">
            <h3>Unclaimed Rewards</h3>
            <div class="fuddle-unclaimed-list">
                ${fuddleState.unclaimedRewards.map(r => {
                    const tierClass = TIER_CSS[r.tier] || 'tier-beam';
                    const estText = r.estimated_reward ? `~${fuddleFormatBeam(r.estimated_reward)} ${r.assetName}` : 'Reward available';
                    return `
                    <div class="fuddle-unclaimed-card ${tierClass}">
                        <div class="fuddle-unclaimed-info">
                            <span class="fuddle-tournament-tier-badge" style="font-size:11px;">${r.tierName}</span>
                            <span style="color:var(--text-primary);font-family:var(--fuddle-font-game);font-size:13px;">Round ${r.round}</span>
                            <span style="color:var(--text-muted);font-size:12px;">Score: ${r.score}</span>
                        </div>
                        <button class="fuddle-tournament-claim" onclick="fuddleClaimTournamentReward(${r.tier}, ${r.round})">${estText}</button>
                    </div>`;
                }).join('')}
            </div>
        </div>
        ` : ''}

        ${getMyActiveGames().length > 0 ? `
        <div class="fuddle-lobby-section">
            <h3>Your Active Games</h3>
            <div class="fuddle-games-list">
                ${getMyActiveGames().map(g => {
                    const diff = g.difficulty || 5;
                    const cTier = g.tier != null ? g.tier : 0;
                    const tierName = TIER_NAMES[cTier] || 'BEAM';
                    const tierClass = TIER_CSS[cTier] || 'tier-beam';
                    return `
                    <div class="fuddle-active-game ${tierClass}" onclick="fuddleEnterGame(${g.id}, ${diff}, ${cTier})" style="cursor:pointer;">
                        <span class="fuddle-tournament-tier-badge" style="font-size:11px;padding:2px 8px;">${tierName}</span>
                        <span style="color:var(--text-primary);font-family:var(--fuddle-font-game);font-size:13px;">Game #${g.id}</span>
                        <span style="color:var(--text-muted);font-size:12px;">${diff}-letter</span>
                        <span class="btn btn-accent" style="padding:4px 12px;font-size:11px;">Continue</span>
                    </div>`;
                }).join('')}
            </div>
        </div>
        ` : ''}

        <div class="fuddle-lobby-section">
            <h3>Token Tournaments</h3>
            <div class="fuddle-tournaments-grid">${tournamentsHtml}</div>
        </div>

        ${fuddleState.roundHistory.length > 0 ? `
        <div class="fuddle-lobby-section">
            <h3>Round History</h3>
            <div class="fuddle-round-filters">
                <button class="fuddle-round-filter${fuddleState.roundHistoryTierFilter < 0 ? ' active' : ''}" onclick="fuddleFilterRounds(-1)">All</button>
                <button class="fuddle-round-filter tier-beam${fuddleState.roundHistoryTierFilter === 0 ? ' active' : ''}" onclick="fuddleFilterRounds(0)">${TIER_NAMES[0]}</button>
                <button class="fuddle-round-filter tier-fomo${fuddleState.roundHistoryTierFilter === 1 ? ' active' : ''}" onclick="fuddleFilterRounds(1)">${TIER_NAMES[1]}</button>
                <button class="fuddle-round-filter tier-beamx${fuddleState.roundHistoryTierFilter === 2 ? ' active' : ''}" onclick="fuddleFilterRounds(2)">${TIER_NAMES[2]}</button>
            </div>
            <div class="fuddle-round-history" id="fuddle-round-history">
                ${fuddleRenderRoundCards()}
            </div>
        </div>
        ` : ''}

        ${getMyCompletedGames().length > 0 ? `
        <div class="fuddle-lobby-section">
            <h3>Recent Games</h3>
            <div class="fuddle-games-list">
                ${getMyCompletedGames().slice(0, 10).map(g => {
                    const diff = g.difficulty || 5;
                    const cTier = g.tier != null ? g.tier : 0;
                    const tierName = TIER_NAMES[cTier] || 'BEAM';
                    const tierClass = TIER_CSS[cTier] || 'tier-beam';
                    const height = fuddleState.currentHeight;
                    const currentRound = fuddleState.tournaments[cTier]?.round || 0;
                    const isPastRound = g.tournament_round && currentRound && g.tournament_round < currentRound;
                    let statusBadge = '';
                    if (g.status === 1) {
                        statusBadge = '<span class="fuddle-game-badge won">Won</span>';
                    } else if (g.status === 2) {
                        statusBadge = '<span class="fuddle-game-badge lost">Lost</span>';
                    } else if (isPastRound) {
                        statusBadge = '<span class="fuddle-game-badge expired">Past Round</span>';
                    } else if (g.status === 0 && height && g.expires_at && g.expires_at < height) {
                        statusBadge = '<span class="fuddle-game-badge expired">Expired</span>';
                    }
                    const roundLabel = g.tournament_round ? `R${g.tournament_round}` : '';
                    return `
                    <div class="fuddle-active-game ${tierClass}" style="opacity:0.8;">
                        <span class="fuddle-tournament-tier-badge" style="font-size:11px;padding:2px 8px;">${tierName}</span>
                        <span style="color:var(--text-primary);font-family:var(--fuddle-font-game);font-size:13px;">Game #${g.id}</span>
                        <span style="color:var(--text-muted);font-size:12px;">${diff}-letter${roundLabel ? ' · ' + roundLabel : ''}</span>
                        ${statusBadge}
                    </div>`;
                }).join('')}
            </div>
        </div>
        ` : ''}

        <div class="fuddle-lobby-section">
            <h3>My Letters (${fuddleTotalLetters()} total)</h3>
            <div class="fuddle-letters-bar">${lettersHtml}</div>
            <div class="fuddle-shop-btns">
                <button class="fuddle-btn-shop" onclick="fuddleShowShop()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                    Buy Letters
                </button>
                <button class="fuddle-btn-lb" onclick="fuddleShowLeaderboard()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M8 21h8M12 17v4M6 3h12l-1.5 7.5h-9z"/><circle cx="12" cy="13" r="4"/></svg>
                    Leaderboard
                </button>
                ${fuddleState.isAdmin ? `<button class="fuddle-btn-admin" onclick="fuddleShowAdmin()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    Admin
                </button>` : ''}
            </div>
        </div>

        <div class="fuddle-lobby-section" id="fuddle-tx-section">
            <h3>Recent Transactions</h3>
            <div id="fuddle-tx-table"></div>
        </div>
    `;

    fuddleStartCountdownTimer();
    fuddleLoadTxTable();
}

function fuddleCopyCid() {
    navigator.clipboard.writeText(FUDDLE_CID).then(() => {
        showFuddleToast('Contract ID copied!', 'success');
    }).catch(() => {
        showFuddleToast('Copy failed', 'error');
    });
}

// =========================================================================
// Round History
// =========================================================================

function fuddleRenderRoundCards() {
    const rounds = getFilteredRoundHistory();
    if (!rounds.length) return '<span style="color:var(--text-muted);font-size:13px;">No past rounds yet</span>';

    return rounds.map(r => {
        const poolText = fuddleFormatBeam(r.prizePool);
        const distributed = Math.floor(r.prizePool * 50 / 100);
        const distText = fuddleFormatBeam(distributed);

        // USD for prize pool
        let poolUsd = '';
        if (r.prizePool > 0 && typeof getAssetUsdValue === 'function') {
            const usd = getAssetUsdValue(r.assetId, r.prizePool);
            if (usd > 0) poolUsd = `<span style="font-size:10px;color:var(--text-muted);">($${usd < 1 ? usd.toFixed(4) : usd.toFixed(2)})</span>`;
        }

        // Player score/reward
        let mySection = '';
        if (r.myScore > 0) {
            const rewardText = r.myReward ? fuddleFormatBeam(r.myReward) + ' ' + r.assetName : '—';
            const claimStatus = r.myClaimed
                ? '<span style="color:var(--fuddle-correct);font-size:10px;">Claimed</span>'
                : (r.finalized ? `<button class="fuddle-round-claim-btn" onclick="event.stopPropagation();fuddleClaimTournamentReward(${r.tier},${r.round})">Claim</button>` : '<span style="color:var(--fuddle-present);font-size:10px;">Active</span>');
            mySection = `
                <div class="fuddle-round-my">
                    <div class="fuddle-round-my-row">
                        <span>Your Score</span>
                        <span style="color:var(--fuddle-accent);font-weight:700;">${r.myScore}</span>
                    </div>
                    <div class="fuddle-round-my-row">
                        <span>Reward</span>
                        <span style="color:var(--fuddle-correct);font-weight:700;">${rewardText}</span>
                    </div>
                    <div class="fuddle-round-my-row">
                        <span>Status</span>
                        ${claimStatus}
                    </div>
                </div>`;
        }

        // Games played this round
        const roundGames = (fuddleState.allGames || []).filter(g =>
            g.creator === fuddleState.myStats?.pk &&
            (g.tier != null ? g.tier : 0) === r.tier &&
            g.tournament_round === r.round
        );
        let gamesSection = '';
        if (roundGames.length > 0) {
            const won = roundGames.filter(g => g.status === 1).length;
            const lost = roundGames.filter(g => g.status === 2 || (g.status === 0 && fuddleState.currentHeight && g.expires_at && g.expires_at < fuddleState.currentHeight)).length;
            gamesSection = `<div class="fuddle-round-games-summary">${roundGames.length} games (${won}W / ${lost}L)</div>`;
        }

        return `
        <div class="fuddle-round-card ${r.tierClass}">
            <div class="fuddle-round-card-head">
                <span class="fuddle-tournament-tier-badge" style="font-size:10px;">${r.tierName}</span>
                <span style="color:var(--text-secondary);font-family:var(--fuddle-font-game);font-size:12px;">Round ${r.round}</span>
                <span class="fuddle-round-status ${r.finalized ? 'ended' : 'active'}">${r.finalized ? 'Ended' : 'Active'}</span>
            </div>
            <div class="fuddle-round-prize">
                <span class="fuddle-round-prize-amount">${poolText}</span>
                <span class="fuddle-round-prize-label">${r.assetName} Pool ${poolUsd}</span>
            </div>
            <div class="fuddle-round-meta-row">
                <div class="fuddle-round-meta-item">
                    <span class="val">${r.totalPlayers}</span>
                    <span class="lbl">Players</span>
                </div>
                <div class="fuddle-round-meta-item">
                    <span class="val">${distText}</span>
                    <span class="lbl">Distributed</span>
                </div>
            </div>
            ${mySection}
            ${gamesSection}
        </div>`;
    }).join('');
}

function fuddleFilterRounds(tier) {
    fuddleState.roundHistoryTierFilter = tier;
    const container = document.getElementById('fuddle-round-history');
    if (container) container.innerHTML = fuddleRenderRoundCards();
    // Update filter button styles
    document.querySelectorAll('.fuddle-round-filter').forEach(btn => btn.classList.remove('active'));
    const activeIdx = tier < 0 ? 0 : tier + 1;
    const btns = document.querySelectorAll('.fuddle-round-filter');
    if (btns[activeIdx]) btns[activeIdx].classList.add('active');
}

function fuddleStartCountdownTimer() {
    if (fuddleState.countdownTimer) clearInterval(fuddleState.countdownTimer);

    fuddleState.countdownTimer = setInterval(async () => {
        await loadCurrentHeight();
        const height = fuddleState.currentHeight;
        for (const cTier of [0, 1, 2]) {
            const t = fuddleState.tournaments[cTier];
            if (t && t.end_height) {
                const blocksLeft = t.end_height - height;
                const el = document.querySelector(`.meta-val.countdown[data-tier="${cTier}"]`);
                if (el) {
                    el.textContent = blocksLeft > 0 ? fuddleFormatCountdown(blocksLeft) : 'Ended';
                    if (blocksLeft <= 0 && !el.classList.contains('ended')) {
                        el.classList.add('ended');
                    }
                }
            }
        }
    }, 30000);
}

// =========================================================================
// Render: Game Board
// =========================================================================

function renderFuddleGame() {
    fuddleState.view = 'game';
    const root = document.getElementById('fuddle-root');
    if (!root) return;

    const diff = fuddleState.currentDifficulty;
    const maxAttempts = 6;

    // Build board rows
    let boardHtml = '';
    for (let row = 0; row < maxAttempts; row++) {
        let rowHtml = '';
        for (let col = 0; col < diff; col++) {
            let tileClass = 'fuddle-tile';
            let letter = '';

            if (row < fuddleState.guesses.length) {
                const g = fuddleState.guesses[row];
                letter = fuddleCharToLetter(g.guess[col]);
                const fb = g.feedback[col];
                if (fb === 2) tileClass += ' correct';
                else if (fb === 1) tileClass += ' present';
                else tileClass += ' absent';
            } else if (row === fuddleState.attemptsUsed) {
                if (col < fuddleState.currentGuess.length) {
                    letter = fuddleCharToLetter(fuddleState.currentGuess[col]);
                    tileClass += ' filled current-row';
                } else {
                    tileClass += ' current-row';
                }
            }

            rowHtml += `<div class="${tileClass}" id="tile-${row}-${col}">${letter}</div>`;
        }
        boardHtml += `<div class="fuddle-row">${rowHtml}</div>`;
    }

    // Build keyboard with letter counts
    let kbHtml = '';
    const keyColors = fuddleGetKeyColors();
    for (const kbRow of KEYBOARD_ROWS) {
        let rowHtml = '';
        for (const key of kbRow) {
            if (key === 'ENTER' || key === 'DEL') {
                const label = key === 'ENTER' ? 'ENTER' : '&#9003;';
                rowHtml += `<button class="fuddle-key wide ${key === 'ENTER' ? 'enter-key' : 'del-key'}" onclick="fuddleKeyPress('${key}')">${label}</button>`;
            } else {
                const charId = fuddleLetterToChar(key);
                const count = fuddleState.letters[charId] || 0;
                const colorClass = keyColors[key] || '';
                rowHtml += `<button class="fuddle-key ${colorClass}" onclick="fuddleKeyPress('${key}')">
                    ${key}
                    <span class="key-count">${count}</span>
                </button>`;
            }
        }
        kbHtml += `<div class="fuddle-kb-row">${rowHtml}</div>`;
    }

    const cTier = fuddleState.currentTier;
    const tierAsset = TIER_ASSETS[cTier] || TIER_ASSETS[0];
    const t = fuddleState.tournaments[cTier];
    const tournamentInfo = t ? `${TIER_NAMES[cTier]} Round ${t.round || '?'} | Pool: ${fuddleFormatBeam(t.prize_pool)} ${tierAsset.name}` : '';

    let confirmingHtml = '';
    if (fuddleState.isConfirming) {
        const elapsed = fuddleState.confirmStartTime ? Math.floor((Date.now() - fuddleState.confirmStartTime) / 1000) : 0;
        const pct = Math.min(95, Math.floor((elapsed / 65) * 100));
        confirmingHtml = `
            <div class="fuddle-confirm-progress">
                <div class="fuddle-confirm-steps">
                    <div class="fuddle-confirm-step done">Sent</div>
                    <div class="fuddle-confirm-step ${elapsed > 3 ? 'done' : 'active'}">Mining</div>
                    <div class="fuddle-confirm-step ${elapsed > 55 ? 'active' : ''}">Confirmed</div>
                </div>
                <div class="fuddle-confirm-bar">
                    <div class="fuddle-confirm-fill" style="width:${pct}%"></div>
                </div>
                <div class="fuddle-confirm-text">Waiting for block confirmation... ${elapsed}s</div>
            </div>`;
    }

    // Submit button state
    const canSubmit = fuddleState.currentGuess.length === diff && !fuddleState.isConfirming && fuddleState.playerStatus === 0;
    const guessLetters = fuddleState.currentGuess.length;
    const submitLabel = fuddleState.isConfirming ? 'Confirming...' : (guessLetters === diff ? 'Submit Guess' : `${guessLetters}/${diff} letters`);
    const submitClass = canSubmit ? 'fuddle-submit-btn ready' : 'fuddle-submit-btn';

    root.innerHTML = `
        <div class="fuddle-header">
            <button class="fuddle-back-btn" onclick="fuddleBackToLobby()">&#8592; Back</button>
            <div class="fuddle-title">Fuddle ${fuddleDiffName(diff)}</div>
            <div></div>
        </div>

        <div class="fuddle-game-header">
            <div class="fuddle-game-prize">${tournamentInfo}</div>
            <div class="fuddle-game-info">Game #${fuddleState.currentGameId}</div>
        </div>

        <div class="fuddle-board">${boardHtml}</div>

        ${confirmingHtml}

        <div class="fuddle-keyboard">${kbHtml}</div>

        <button class="${submitClass}" onclick="fuddleSubmitGuess()" ${canSubmit ? '' : 'disabled'}>
            ${fuddleState.isConfirming ? '<span class="fuddle-spinner"></span>' : ''} ${submitLabel}
        </button>

        <div class="fuddle-status">
            <span>Attempts: ${fuddleState.attemptsUsed}/${maxAttempts}</span>
            <span>Letters: ${fuddleTotalLetters()}</span>
        </div>
    `;

    // Always ensure keyboard is attached when game is rendered
    fuddleAttachKeyboard();
}

function fuddleGetKeyColors() {
    const colors = {};
    for (const g of fuddleState.guesses) {
        for (let i = 0; i < g.guess.length; i++) {
            const letter = fuddleCharToLetter(g.guess[i]);
            const fb = g.feedback[i];
            const fbClass = fb === 2 ? 'correct' : fb === 1 ? 'present' : 'absent';
            if (!colors[letter] || fb === 2 || (fb === 1 && colors[letter] !== 'correct')) {
                colors[letter] = fbClass;
            }
        }
    }
    return colors;
}

// =========================================================================
// Render: Letter Shop
// =========================================================================

function fuddleShowShop() {
    fuddleState.view = 'shop';
    const root = document.getElementById('fuddle-root');
    if (!root) return;

    const settings = fuddleState.settings;
    const letterPrice = settings ? fuddleFormatBeam(settings.letter_price) : '?';
    const lbSmallPrice = settings ? fuddleFormatBeam(settings.lootbox_small_price) : '?';
    const lbLargePrice = settings ? fuddleFormatBeam(settings.lootbox_large_price) : '?';

    let gridHtml = '';
    for (let i = 0; i < 26; i++) {
        const count = fuddleState.letters[i] || 0;
        gridHtml += `
            <div class="fuddle-shop-letter" onclick="fuddleBuyLetter(${i})">
                <span class="letter">${FUDDLE_LETTERS[i]}</span>
                <span class="owned">${count}</span>
            </div>
        `;
    }

    root.innerHTML = `
        <div class="fuddle-header">
            <button class="fuddle-back-btn" onclick="fuddleBackFromShop()">&#8592; Back</button>
            <div class="fuddle-title">Letter Shop</div>
            <div></div>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Loot Boxes</h3>
            <div class="fuddle-lootbox-cards">
                <div class="fuddle-lootbox" onclick="fuddleBuyLootbox(0)">
                    <div class="fuddle-lootbox-emoji">&#128230;</div>
                    <div class="fuddle-lootbox-name">Small Box</div>
                    <div class="fuddle-lootbox-desc">24 unique random letters</div>
                    <div class="fuddle-lootbox-price">${lbSmallPrice} BEAM</div>
                </div>
                <div class="fuddle-lootbox" onclick="fuddleBuyLootbox(1)">
                    <div class="fuddle-lootbox-emoji">&#127873;</div>
                    <div class="fuddle-lootbox-name">Large Box</div>
                    <div class="fuddle-lootbox-desc">48 varied letters</div>
                    <div class="fuddle-lootbox-price">${lbLargePrice} BEAM</div>
                </div>
            </div>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Buy Individual Letters (${letterPrice} BEAM each)</h3>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Click a letter to buy one. Your current inventory shown below each letter.</p>
            <div class="fuddle-shop-grid">${gridHtml}</div>
        </div>
    `;
}

// =========================================================================
// Render: Leaderboard
// =========================================================================

async function fuddleShowLeaderboard() {
    fuddleState.view = 'leaderboard';
    const root = document.getElementById('fuddle-root');
    if (!root) return;

    root.innerHTML = `
        <div class="fuddle-header">
            <button class="fuddle-back-btn" onclick="renderFuddleLobby()">&#8592; Back</button>
            <div class="fuddle-title">Leaderboard</div>
            <div></div>
        </div>
        <div class="fuddle-loading">Loading leaderboard...</div>
    `;

    await loadFuddleLeaderboard();

    let rowsHtml = '';
    if (fuddleState.leaderboard.length === 0) {
        rowsHtml = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No players yet. Be the first!</div>';
    } else {
        const myPk = fuddleState.myStats?.pk || '';
        rowsHtml = fuddleState.leaderboard.map((p, i) => {
            const isMe = myPk && p.player === myPk;
            return `
            <div class="fuddle-lb-row ${isMe ? 'fuddle-lb-me' : ''}">
                <div class="fuddle-lb-rank ${i < 3 ? 'top' : ''}">${i === 0 ? '&#127942;' : i + 1}</div>
                <div class="fuddle-lb-player">${fuddleShortenPk(p.player)}${isMe ? ' <span class="fuddle-lb-you">(YOU)</span>' : ''}</div>
                <div class="fuddle-lb-score">${p.total_score}</div>
                <div class="fuddle-lb-wins">${p.games_won}W / ${p.games_played}P</div>
            </div>`;
        }).join('');
    }

    root.innerHTML = `
        <div class="fuddle-header">
            <button class="fuddle-back-btn" onclick="renderFuddleLobby()">&#8592; Back</button>
            <div class="fuddle-title">Leaderboard</div>
            <div></div>
        </div>
        <div class="fuddle-leaderboard">${rowsHtml}</div>
    `;
}

// =========================================================================
// How To Play modal
// =========================================================================

function fuddleShowHowToPlay() {
    const overlay = document.createElement('div');
    overlay.className = 'fuddle-result-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
        <div class="fuddle-result-modal fuddle-htp-modal" style="text-align:left;max-width:520px;max-height:85vh;overflow-y:auto;">
            <h2 style="text-align:center;color:var(--fuddle-accent);margin:0 0 24px;font-family:var(--fuddle-font-game);letter-spacing:3px;">HOW TO PLAY</h2>

            <div class="fuddle-htp-section">
                <h4>1. Buy Letters</h4>
                <p>Buy individual letters or loot boxes from the Letter Shop using <strong>BEAM</strong>. Every guess you submit <strong>consumes</strong> the letters used &mdash; they are burned on-chain. Stock up before you play!</p>
            </div>

            <div class="fuddle-htp-section">
                <h4>2. Pick a Tournament</h4>
                <p>Three token tournaments run simultaneously:</p>
                <div class="fuddle-htp-tiers">
                    <span class="fuddle-htp-tier tier-beam">BEAM</span>
                    <span class="fuddle-htp-tier tier-fomo">FOMO</span>
                    <span class="fuddle-htp-tier tier-beamx">BEAMX</span>
                </div>
                <p>Each tournament has its own prize pool funded by entry fees in that token. Click "Play Now" to enter, then <strong>choose your word difficulty</strong> (4, 5, or 6 letters).</p>
            </div>

            <div class="fuddle-htp-section">
                <h4>3. Guess the Word</h4>
                <p>You have <strong>6 attempts</strong> to find the secret word. Each guess is verified on-chain (~60 seconds per confirmation).</p>
                <div class="fuddle-htp-examples">
                    <div class="fuddle-htp-tile" style="background:linear-gradient(145deg,#00cc7a,var(--fuddle-correct));box-shadow:var(--fuddle-glow-correct);">C</div>
                    <div class="fuddle-htp-tile" style="background:var(--fuddle-absent);">R</div>
                    <div class="fuddle-htp-tile" style="background:linear-gradient(145deg,#e6a000,var(--fuddle-present));box-shadow:var(--fuddle-glow-present);">A</div>
                    <div class="fuddle-htp-tile" style="background:var(--fuddle-absent);">N</div>
                    <div class="fuddle-htp-tile" style="background:linear-gradient(145deg,#00cc7a,var(--fuddle-correct));box-shadow:var(--fuddle-glow-correct);">E</div>
                </div>
                <p><span style="color:var(--fuddle-correct);">Green</span> = correct position &middot; <span style="color:var(--fuddle-present);">Amber</span> = wrong position &middot; <span style="color:var(--text-muted);">Dark</span> = not in word</p>
            </div>

            <div class="fuddle-htp-section">
                <h4>4. Scoring</h4>
                <p>Your game score depends on how fast you solve and the word length:</p>
                <div class="fuddle-htp-formula">
                    Score = (1000 + (7 &minus; attempts) &times; 150) &times; multiplier
                </div>
                <div class="fuddle-htp-table">
                    <div class="fuddle-htp-table-row head">
                        <span>Difficulty</span><span>Multiplier</span><span>Max Score</span>
                    </div>
                    <div class="fuddle-htp-table-row"><span>4-letter</span><span>1.0x</span><span>1,900</span></div>
                    <div class="fuddle-htp-table-row"><span>5-letter</span><span>1.25x</span><span>2,375</span></div>
                    <div class="fuddle-htp-table-row"><span>6-letter</span><span>1.5x</span><span>2,850</span></div>
                </div>
                <p style="font-size:12px;color:var(--text-muted);">Max score = solved in 1 attempt. Solve in 6 attempts = base 1,150 &times; multiplier.</p>
            </div>

            <div class="fuddle-htp-section">
                <h4>5. Tournament Points</h4>
                <p>Each game you <strong>win</strong> earns <strong>1 tournament point</strong> (regardless of game score). Your tournament share is determined by your points relative to all players.</p>
            </div>

            <div class="fuddle-htp-section">
                <h4>6. Prize Distribution</h4>
                <p>When a tournament round ends:</p>
                <ul style="margin:8px 0;padding-left:20px;color:var(--text-secondary);font-size:13px;line-height:1.7;">
                    <li><strong>50%</strong> of the prize pool is distributed proportionally to players based on tournament points</li>
                    <li><strong>50%</strong> carries over to seed the next round</li>
                </ul>
                <p style="font-size:12px;color:var(--text-muted);">Your reward = (pool &times; 50% &times; your points) / total points</p>
            </div>

            <div class="fuddle-htp-section">
                <h4>7. Claiming &amp; Withdrawing</h4>
                <p>After a tournament ends, click <strong>"Claim"</strong> on the tournament card to collect your reward. The tokens go into your payout balance. Then use <strong>"Withdraw"</strong> to move them to your wallet.</p>
            </div>

            <div class="fuddle-htp-section">
                <h4>8. Donations</h4>
                <p>Anyone can donate tokens directly to any tournament's prize pool using the <strong>"Donate"</strong> button. Donations increase the pool for the current round.</p>
            </div>

            <div style="text-align:center;margin-top:24px;">
                <button class="btn btn-accent" style="padding:12px 36px;" onclick="this.closest('.fuddle-result-overlay').remove()">Got It</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
}

// =========================================================================
// Donate Modal
// =========================================================================

function fuddleShowDonateModal(cTier) {
    const tierName = TIER_NAMES[cTier];
    const tierAsset = TIER_ASSETS[cTier] || TIER_ASSETS[0];
    const overlay = document.createElement('div');
    overlay.className = 'fuddle-result-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
        <div class="fuddle-result-modal" style="max-width:400px;">
            <h2 style="color:var(--fuddle-accent);margin:0 0 8px;font-family:var(--fuddle-font-game);font-size:20px;letter-spacing:2px;">DONATE TO POOL</h2>
            <p style="color:var(--text-secondary);font-size:13px;margin:0 0 20px;">${tierName} Tournament — ${tierAsset.name}</p>

            <div style="margin-bottom:20px;">
                <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Amount (${tierAsset.name})</label>
                <input type="text" id="donate-amount" placeholder="1.0" style="width:100%;box-sizing:border-box;">
            </div>

            <div class="fuddle-result-btns">
                <button class="btn btn-accent" style="padding:12px;" onclick="fuddleDonateToPool(${cTier}); this.closest('.fuddle-result-overlay').remove();">Donate</button>
                <button class="btn btn-outline" style="padding:12px;" onclick="this.closest('.fuddle-result-overlay').remove();">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
}

async function fuddleDonateToPool(cTier) {
    const tierAsset = TIER_ASSETS[cTier] || TIER_ASSETS[0];
    const tierName = TIER_NAMES[cTier];
    const input = document.getElementById('donate-amount');
    const beamAmount = parseFloat(input?.value);
    if (!beamAmount || beamAmount <= 0) {
        showFuddleToast('Enter a valid amount', 'error');
        return;
    }
    const groth = Math.round(beamAmount * 100000000);

    // v5: Pre-transaction balance check (donate uses tournament's asset when active)
    const hasBalance = await fuddleCheckBalance(tierAsset.id, groth, tierAsset.name);
    if (!hasBalance) return;

    fuddleShowTxProgress(`Donating ${beamAmount} ${tierAsset.name}`, `${tierName} Prize Pool`, 'Sending transaction...');

    const result = await fuddleTx('donate_to_pool', 'user', `tier=${cTier},amount=${groth}`, `Donate ${beamAmount} ${tierAsset.name}`);
    if (!result || result.error) {
        fuddleTxProgressError('Failed: ' + (result?.error || 'Unknown error'));
        return;
    }

    fuddleUpdateTxProgress('Transaction sent. Waiting for confirmation...', 15);
    fuddleStartTxProgressTimer();

    // Donations don't have a simple poll condition — wait ~30s
    await new Promise(r => setTimeout(r, 30000));
    fuddleTxProgressSuccess(`Donated ${beamAmount} ${tierAsset.name}!`);
    setTimeout(async () => {
        await loadAllTournaments();
        fuddleUpdateTierNames();
        renderFuddleLobby();
    }, 1600);
}

// =========================================================================
// Result modals
// =========================================================================

function fuddleShowWinModal() {
    const overlay = document.createElement('div');
    overlay.className = 'fuddle-result-overlay';

    const diff = fuddleState.currentDifficulty;
    const cTier = fuddleState.currentTier;
    const tierName = TIER_NAMES[cTier] || 'BEAM';
    const attempts = fuddleState.attemptsUsed;
    const mult = DIFF_MULTIPLIER[diff] || 100;
    const gameScore = (1000 + (7 - attempts) * 150) * mult / 100;

    overlay.innerHTML = `
        <div class="fuddle-result-modal">
            <div class="fuddle-result-title win">You Won!</div>
            <div class="fuddle-result-score">+${gameScore}</div>
            <div class="fuddle-result-breakdown">
                Solved ${diff}-letter word in ${attempts} attempt${attempts > 1 ? 's' : ''}<br>
                +1 tournament point for ${tierName} tournament<br>
                <span style="color:var(--fuddle-cyan);font-size:12px;">Win more games to increase your share of the prize pool</span>
            </div>
            <div class="fuddle-result-btns">
                <button class="btn btn-accent" style="padding:12px;" onclick="this.closest('.fuddle-result-overlay').remove(); fuddleShowDiffPicker(${cTier});">Play Again</button>
                <button class="btn btn-outline" style="padding:12px;" onclick="this.closest('.fuddle-result-overlay').remove(); fuddleBackToLobby();">Back to Lobby</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
}

function fuddleShowLossModal() {
    const overlay = document.createElement('div');
    overlay.className = 'fuddle-result-overlay';

    overlay.innerHTML = `
        <div class="fuddle-result-modal">
            <div class="fuddle-result-title loss">Game Over</div>
            <div style="font-size:48px;margin:16px 0;">&#128532;</div>
            <div class="fuddle-result-breakdown">
                You used all 6 attempts.<br>
                Better luck next time!
            </div>
            <div class="fuddle-result-btns">
                <button class="btn btn-outline" style="padding:12px;" onclick="this.closest('.fuddle-result-overlay').remove(); fuddleShowShop();">Buy Letters</button>
                <button class="btn btn-accent" style="padding:12px;" onclick="this.closest('.fuddle-result-overlay').remove(); fuddleBackToLobby();">Play Again</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
}

// =========================================================================
// Game actions
// =========================================================================

// Show difficulty picker popup for a given contract tier
function fuddleShowDiffPicker(cTier) {
    const tierAsset = fuddleGetEffectiveEntryAsset(cTier);
    const tierName = TIER_NAMES[cTier];
    const entryCost = fuddleGetEffectiveEntryCost(cTier);

    const overlay = document.createElement('div');
    overlay.className = 'fuddle-result-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
        <div class="fuddle-result-modal" style="max-width:380px;">
            <h2 style="color:var(--fuddle-accent);margin:0 0 4px;font-family:var(--fuddle-font-display);font-size:20px;letter-spacing:2px;">${tierName} TOURNAMENT</h2>
            <p style="color:var(--text-secondary);font-size:13px;margin:0 0 20px;">Entry: ${fuddleFormatBeam(entryCost)} ${tierAsset.name} &middot; Choose word length</p>

            <div class="fuddle-diff-picker">
                <button class="fuddle-diff-btn" onclick="this.closest('.fuddle-result-overlay').remove(); fuddleCreateGame(4, ${cTier})">
                    <span class="diff-num">4</span>
                    <span class="diff-label">Letters</span>
                    <span class="diff-mult">1x score</span>
                </button>
                <button class="fuddle-diff-btn" onclick="this.closest('.fuddle-result-overlay').remove(); fuddleCreateGame(5, ${cTier})">
                    <span class="diff-num">5</span>
                    <span class="diff-label">Letters</span>
                    <span class="diff-mult">1.25x score</span>
                </button>
                <button class="fuddle-diff-btn" onclick="this.closest('.fuddle-result-overlay').remove(); fuddleCreateGame(6, ${cTier})">
                    <span class="diff-num">6</span>
                    <span class="diff-label">Letters</span>
                    <span class="diff-mult">1.5x score</span>
                </button>
            </div>

            <button class="btn btn-outline" style="padding:10px 24px;margin-top:16px;width:100%;" onclick="this.closest('.fuddle-result-overlay').remove();">Cancel</button>
        </div>
    `;

    document.body.appendChild(overlay);
}

async function fuddleCreateGame(difficulty, cTier) {
    const tierAsset = fuddleGetEffectiveEntryAsset(cTier);
    const tierName = TIER_NAMES[cTier];
    const entryCost = fuddleGetEffectiveEntryCost(cTier);

    // v5: Pre-transaction balance check
    if (entryCost > 0) {
        const hasBalance = await fuddleCheckBalance(tierAsset.id, entryCost, tierAsset.name);
        if (!hasBalance) return;
    }

    fuddleShowTxProgress(
        `Creating ${difficulty}-Letter Game`,
        `${tierName} Tournament`,
        'Sending transaction...'
    );

    const result = await fuddleTx('create_game', 'user', `difficulty=${difficulty},tier=${cTier}`, `New ${difficulty}-letter ${tierName} game`);
    if (!result || result.error) {
        fuddleTxProgressError('Failed to create game: ' + (result?.error || 'Unknown error'));
        return;
    }

    fuddleUpdateTxProgress('Waiting for confirmation...', 15);
    fuddleStartTxProgressTimer();

    // Poll for the game to appear, also check for tx failure
    let found = false;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));

        // Check for on-chain tx failure every 3rd poll
        if (i > 0 && i % 3 === 0) {
            const failReason = await fuddleCheckTxFailed();
            if (failReason) {
                fuddleTxProgressError(typeof failReason === 'string' ? failReason : 'Transaction failed');
                return;
            }
        }

        await loadFuddleGames();
        const myGames = getMyFuddleGames().filter(g => g.difficulty === difficulty);
        if (myGames.length > 0) {
            const latestGame = myGames[myGames.length - 1];
            fuddleTxProgressSuccess('Game created!');
            found = true;
            setTimeout(() => fuddleEnterGame(latestGame.id, difficulty, cTier), 2100);
            break;
        }
    }

    if (!found) {
        fuddleHideTxProgress();
        showFuddleToast('Game may still be processing. Check lobby in a moment.', 'warning');
        renderFuddleLobby();
    }
}

async function fuddleEnterGame(gameId, difficulty, cTier) {
    fuddleState.currentGameId = gameId;
    fuddleState.currentDifficulty = difficulty;
    fuddleState.currentTier = cTier != null ? cTier : 0;
    fuddleState.currentGuess = [];
    fuddleState.guesses = [];
    fuddleState.attemptsUsed = 0;
    fuddleState.playerStatus = 0;
    fuddleState.isConfirming = false;

    await loadFuddleMyGame(gameId);
    await loadFuddleLetters();

    renderFuddleGame();
    fuddleAttachKeyboard();
}

function fuddleBackToLobby() {
    if (fuddleState.pollTimer) {
        clearInterval(fuddleState.pollTimer);
        fuddleState.pollTimer = null;
    }
    fuddleState.isConfirming = false;
    fuddleStopTxPolling();
    fuddleHideTxProgress();
    fuddleDetachKeyboard();
    loadFuddleData().then(() => renderFuddleLobby());
}

function fuddleBackFromShop() {
    if (fuddleState.currentGameId && fuddleState.playerStatus === 0) {
        renderFuddleGame();
    } else {
        renderFuddleLobby();
    }
}

async function fuddleBuyLetter(charId) {
    const letter = FUDDLE_LETTERS[charId];
    const letterPrice = fuddleState.settings?.letter_price;
    fuddleConfirmModal(
        `Buy Letter "${letter}"`,
        `Purchase 1x <strong>${letter}</strong> for <strong>${fuddleFormatBeam(letterPrice)} BEAM</strong>`,
        `Buy ${letter}`,
        () => fuddleBuyLetterExecute(charId)
    );
}

async function fuddleBuyLetterExecute(charId) {
    const letter = FUDDLE_LETTERS[charId];
    const ownedBefore = fuddleState.letters[charId] || 0;
    const letterPrice = fuddleState.settings?.letter_price || 0;

    // v5: Pre-transaction balance check (letters always cost BEAM)
    if (letterPrice > 0) {
        const hasBalance = await fuddleCheckBalance(0, letterPrice, 'BEAM');
        if (!hasBalance) return;
    }

    fuddleShowTxProgress(`Buying "${letter}"`, '1x letter', 'Sending transaction...');

    const result = await fuddleTx('buy_letters', 'user', `char_id=${charId},count=1`, `Buy letter ${letter}`);
    if (!result || result.error) {
        fuddleTxProgressError('Failed: ' + (result?.error || 'Unknown error'));
        return;
    }

    fuddleUpdateTxProgress('Waiting for confirmation...', 15);
    fuddleStartTxProgressTimer();

    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 3000));
        if (i > 0 && i % 3 === 0) {
            const failReason = await fuddleCheckTxFailed();
            if (failReason) { fuddleTxProgressError(typeof failReason === 'string' ? failReason : 'Transaction failed'); return; }
        }
        await loadFuddleLetters();
        if ((fuddleState.letters[charId] || 0) > ownedBefore) {
            fuddleTxProgressSuccess(`Bought ${letter}!`);
            setTimeout(() => fuddleShowShop(), 2100);
            return;
        }
    }

    fuddleTxProgressSuccess(`Bought ${letter}! (confirming)`);
    setTimeout(() => fuddleShowShop(), 2100);
}

async function fuddleBuyLootbox(size) {
    const price = size === 0 ? fuddleState.settings?.lootbox_small_price : fuddleState.settings?.lootbox_large_price;
    const name = size === 0 ? 'Small' : 'Large';
    const letterCount = size === 0 ? 24 : 48;
    fuddleConfirmModal(
        `Buy ${name} Loot Box`,
        `Get <strong>${letterCount} random letters</strong> for <strong>${fuddleFormatBeam(price)} BEAM</strong>`,
        `Buy ${name} Box`,
        () => fuddleBuyLootboxExecute(size)
    );
}

async function fuddleBuyLootboxExecute(size) {
    const name = size === 0 ? 'Small' : 'Large';
    const totalBefore = fuddleTotalLetters();
    const lootPrice = size === 0 ? fuddleState.settings?.lootbox_small_price : fuddleState.settings?.lootbox_large_price;

    // v5: Pre-transaction balance check (lootboxes always cost BEAM)
    if (lootPrice > 0) {
        const hasBalance = await fuddleCheckBalance(0, lootPrice, 'BEAM');
        if (!hasBalance) return;
    }

    fuddleShowTxProgress(`Buying ${name} Loot Box`, size === 0 ? '24 random letters' : '48 random letters', 'Sending transaction...');

    const result = await fuddleTx('buy_lootbox', 'user', `size=${size}`, `Buy ${name} Loot Box`);
    if (!result || result.error) {
        fuddleTxProgressError('Failed: ' + (result?.error || 'Unknown error'));
        return;
    }

    fuddleUpdateTxProgress('Waiting for confirmation...', 15);
    fuddleStartTxProgressTimer();

    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 3000));
        if (i > 0 && i % 3 === 0) {
            const failReason = await fuddleCheckTxFailed();
            if (failReason) { fuddleTxProgressError(typeof failReason === 'string' ? failReason : 'Transaction failed'); return; }
        }
        await loadFuddleLetters();
        if (fuddleTotalLetters() > totalBefore) {
            fuddleTxProgressSuccess(`${name} Loot Box opened!`);
            setTimeout(() => fuddleShowShop(), 2100);
            return;
        }
    }

    fuddleTxProgressSuccess('Loot box purchased! (confirming)');
    setTimeout(() => fuddleShowShop(), 2100);
}

async function fuddleClaimTournamentReward(cTier, round) {
    const tierName = TIER_NAMES[cTier] || 'BEAM';
    const tierAsset = TIER_ASSETS[cTier] || TIER_ASSETS[0];

    fuddleShowTxProgress(`Claiming ${tierName} Reward`, `Tournament Round ${round}`, 'Sending claim transaction...');

    const result = await fuddleTx('claim_tournament_reward', 'user', `tier=${cTier},round=${round}`, `Claim ${tierName} reward`);
    if (!result || result.error) {
        fuddleTxProgressError('Failed: ' + (result?.error || 'Unknown error'));
        return;
    }

    fuddleUpdateTxProgress('Waiting for confirmation...', 15);
    fuddleStartTxProgressTimer();

    // Determine if this is a past round claim or current round claim
    const currentRound = fuddleState.tournaments[cTier]?.round || 0;
    const isPastRound = round < currentRound;

    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 3000));
        if (i > 0 && i % 3 === 0) {
            const failReason = await fuddleCheckTxFailed();
            if (failReason) { fuddleTxProgressError(typeof failReason === 'string' ? failReason : 'Transaction failed'); return; }
        }
        // Poll the specific round, not just current
        const myData = isPastRound
            ? await loadMyTournament(cTier, round)
            : (await loadAllMyTournaments(), fuddleState.myTournaments[cTier]);
        if (myData?.claimed) {
            fuddleTxProgressSuccess(`${tierName} reward claimed!`);
            setTimeout(async () => {
                await loadAllTournaments();
                await loadUnclaimedRewards();
                fuddleUpdateTierNames();
                renderFuddleLobby();
            }, 1600);
            return;
        }
    }

    fuddleTxProgressSuccess('Reward claimed! (confirming)');
    setTimeout(async () => {
        await loadAllTournaments();
        await loadAllMyTournaments();
        await loadUnclaimedRewards();
        fuddleUpdateTierNames();
        renderFuddleLobby();
    }, 1600);
}

// =========================================================================
// Keyboard handling
// =========================================================================

function fuddleKeyPress(key) {
    if (fuddleState.isConfirming) return;
    if (fuddleState.playerStatus !== 0) return;

    const diff = fuddleState.currentDifficulty;

    if (key === 'ENTER') {
        fuddleSubmitGuess();
    } else if (key === 'DEL') {
        if (fuddleState.currentGuess.length > 0) {
            fuddleState.currentGuess.pop();
            renderFuddleGame();
        }
    } else {
        if (fuddleState.currentGuess.length < diff) {
            const charId = fuddleLetterToChar(key);
            if (charId >= 0) {
                // Check if player has enough of this letter
                const alreadyUsed = fuddleState.currentGuess.filter(c => c === charId).length;
                const owned = fuddleState.letters[charId] || 0;
                if (alreadyUsed >= owned) {
                    // Not enough — show buy modal
                    const shortage = alreadyUsed - owned + 1;
                    fuddleShowBuyLetterModal(charId, shortage);
                    return;
                }

                fuddleState.currentGuess.push(charId);
                const row = fuddleState.attemptsUsed;
                const col = fuddleState.currentGuess.length - 1;
                renderFuddleGame();
                const tile = document.getElementById(`tile-${row}-${col}`);
                if (tile) {
                    tile.classList.add('pop');
                    setTimeout(() => tile.classList.remove('pop'), 100);
                }
            }
        }
    }
}

function fuddleShowBuyLetterModal(charId, shortage) {
    const letter = FUDDLE_LETTERS[charId];
    const owned = fuddleState.letters[charId] || 0;
    const price = fuddleState.settings?.letter_price || 0;
    const priceBeam = fuddleFormatBeam(price);

    const overlay = document.createElement('div');
    overlay.className = 'fuddle-result-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
        <div class="fuddle-result-modal fuddle-buy-letter-modal">
            <div class="fuddle-buy-letter-head">
                <div class="fuddle-buy-letter-tile">${letter}</div>
                <div class="fuddle-buy-letter-info">
                    <div class="fuddle-buy-letter-title">Need more "${letter}"</div>
                    <div class="fuddle-buy-letter-sub">You have <strong>${owned}</strong> but need at least <strong>${owned + shortage}</strong></div>
                </div>
            </div>
            <div class="fuddle-buy-letter-form">
                <div class="fuddle-buy-letter-row">
                    <label>Quantity</label>
                    <div class="fuddle-buy-letter-qty">
                        <button class="fuddle-qty-btn" onclick="fuddleBuyModalQty(-1)">-</button>
                        <input type="number" id="fuddle-buy-qty" value="${shortage}" min="1" max="100">
                        <button class="fuddle-qty-btn" onclick="fuddleBuyModalQty(1)">+</button>
                    </div>
                </div>
                <div class="fuddle-buy-letter-cost">
                    <span>Cost:</span>
                    <span id="fuddle-buy-cost">${fuddleFormatBeam(price * shortage)} BEAM</span>
                </div>
                <div class="fuddle-buy-letter-unit">${priceBeam} BEAM per letter</div>
            </div>
            <div class="fuddle-result-btns">
                <button class="fuddle-buy-confirm-btn" onclick="fuddleBuyFromModal(${charId})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                    Buy ${letter}
                </button>
                <button class="btn btn-outline" style="padding:12px;flex:1;" onclick="this.closest('.fuddle-result-overlay').remove()">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Update cost dynamically when qty changes
    const qtyInput = overlay.querySelector('#fuddle-buy-qty');
    qtyInput.addEventListener('input', () => {
        const qty = Math.max(1, parseInt(qtyInput.value) || 1);
        overlay.querySelector('#fuddle-buy-cost').textContent = fuddleFormatBeam(price * qty) + ' BEAM';
    });
}

function fuddleBuyModalQty(delta) {
    const input = document.getElementById('fuddle-buy-qty');
    if (!input) return;
    const val = Math.max(1, Math.min(100, (parseInt(input.value) || 1) + delta));
    input.value = val;
    input.dispatchEvent(new Event('input'));
}

async function fuddleBuyFromModal(charId) {
    const input = document.getElementById('fuddle-buy-qty');
    const count = Math.max(1, parseInt(input?.value) || 1);
    const letter = FUDDLE_LETTERS[charId];
    const letterPrice = fuddleState.settings?.letter_price || 0;
    const totalCost = letterPrice * count;

    // v5: Pre-transaction balance check (letters always cost BEAM)
    if (totalCost > 0) {
        const hasBalance = await fuddleCheckBalance(0, totalCost, 'BEAM');
        if (!hasBalance) return;
    }

    // Close buy-letter modal
    const modalOverlay = input?.closest('.fuddle-result-overlay');
    if (modalOverlay) modalOverlay.remove();

    const ownedBefore = fuddleState.letters[charId] || 0;

    fuddleShowTxProgress(`Buying ${count}x "${letter}"`, 'In-game purchase', 'Sending transaction...');

    const result = await fuddleTx('buy_letters', 'user', `char_id=${charId},count=${count}`, `Buy ${count}x ${letter}`);
    if (!result || result.error) {
        fuddleTxProgressError('Failed: ' + (result?.error || 'Unknown error'));
        return;
    }

    fuddleUpdateTxProgress('Waiting for confirmation...', 15);
    fuddleStartTxProgressTimer();

    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 3000));
        if (i > 0 && i % 3 === 0) {
            const failReason = await fuddleCheckTxFailed();
            if (failReason) { fuddleTxProgressError(typeof failReason === 'string' ? failReason : 'Transaction failed'); return; }
        }
        await loadFuddleLetters();
        const nowOwned = fuddleState.letters[charId] || 0;
        if (nowOwned > ownedBefore) {
            fuddleTxProgressSuccess(`Bought ${count}x ${letter}!`);
            setTimeout(() => {
                if (fuddleState.view === 'game') {
                    fuddleKeyPress(letter);
                    renderFuddleGame();
                }
            }, 2100);
            return;
        }
    }

    fuddleTxProgressSuccess(`Bought ${count}x ${letter}! (confirming)`);
    setTimeout(() => {
        if (fuddleState.view === 'game') renderFuddleGame();
    }, 1600);
}

function fuddleHandlePhysicalKey(e) {
    if (fuddleState.view !== 'game') return;
    // Ignore if user is typing in an input/textarea
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    const key = e.key;

    if (key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        fuddleKeyPress('ENTER');
    } else if (key === 'Backspace' || key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        fuddleKeyPress('DEL');
    } else if (key.length === 1 && key >= 'a' && key <= 'z') {
        e.preventDefault();
        fuddleKeyPress(key.toUpperCase());
    } else if (key.length === 1 && key >= 'A' && key <= 'Z') {
        e.preventDefault();
        fuddleKeyPress(key);
    }
}

function fuddleAttachKeyboard() {
    // Remove first to avoid duplicate listeners
    document.removeEventListener('keydown', fuddleHandlePhysicalKey);
    document.addEventListener('keydown', fuddleHandlePhysicalKey);
}

function fuddleDetachKeyboard() {
    document.removeEventListener('keydown', fuddleHandlePhysicalKey);
}

// =========================================================================
// Guess submission
// =========================================================================

async function fuddleSubmitGuess() {
    const diff = fuddleState.currentDifficulty;
    const guess = fuddleState.currentGuess;

    if (guess.length !== diff) {
        showFuddleToast(`Enter ${diff} letters`, 'error');
        return;
    }

    // Check player has all needed letters
    const needed = {};
    for (const ch of guess) {
        needed[ch] = (needed[ch] || 0) + 1;
    }
    for (const [ch, count] of Object.entries(needed)) {
        const owned = fuddleState.letters[ch] || 0;
        if (owned < count) {
            fuddleShowBuyLetterModal(parseInt(ch), count - owned);
            return;
        }
    }

    // Build guess args
    const gArgs = guess.map((g, i) => `g${i}=${g}`).join(',');
    let padded = gArgs;
    for (let i = guess.length; i < 6; i++) {
        padded += `,g${i}=0`;
    }

    fuddleState.isConfirming = true;
    fuddleState.confirmStartTime = Date.now();
    renderFuddleGame();
    fuddleStartConfirmTimer();

    showFuddleToast('Submitting guess to blockchain...', 'info');
    const word = fuddleState.currentGuess.map(c => fuddleCharToLetter(c)).join('');
    const result = await fuddleTx('submit_guess', 'user', `game_id=${fuddleState.currentGameId},${padded}`, `Guess: ${word}`);

    if (result && result.error) {
        fuddleState.isConfirming = false;
        fuddleState.confirmStartTime = null;
        fuddleStopConfirmTimer();
        showFuddleToast('Guess failed: ' + result.error, 'error');
        renderFuddleGame();
        return;
    }

    showFuddleToast('Waiting for block confirmation...', 'info');
    fuddlePollForResult();
}

function fuddlePollForResult() {
    let attempts = 0;
    const maxAttempts = 30;

    fuddleState.pollTimer = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(fuddleState.pollTimer);
            fuddleState.pollTimer = null;
            fuddleState.isConfirming = false;
            fuddleState.confirmStartTime = null;
            fuddleStopConfirmTimer();
            showFuddleToast('Block confirmation timed out. Your guess may still be processing. Go back to lobby and reopen the game to check.', 'warning');
            renderFuddleGame();
            return;
        }

        const prevAttempts = fuddleState.attemptsUsed;
        await loadFuddleMyGame(fuddleState.currentGameId);

        if (fuddleState.attemptsUsed > prevAttempts) {
            clearInterval(fuddleState.pollTimer);
            fuddleState.pollTimer = null;
            fuddleState.isConfirming = false;
            fuddleState.confirmStartTime = null;
            fuddleStopConfirmTimer();
            fuddleState.currentGuess = [];

            await loadFuddleLetters();

            renderFuddleGame();
            fuddleAnimateFeedback(fuddleState.attemptsUsed - 1);

            setTimeout(() => {
                if (fuddleState.playerStatus === 1) {
                    fuddleShowWinModal();
                } else if (fuddleState.playerStatus === 2) {
                    fuddleShowLossModal();
                }
            }, 500 * fuddleState.currentDifficulty + 300);
        }
    }, 5000);
}

function fuddleAnimateFeedback(rowIdx) {
    const diff = fuddleState.currentDifficulty;
    for (let col = 0; col < diff; col++) {
        const tile = document.getElementById(`tile-${rowIdx}-${col}`);
        if (tile) {
            setTimeout(() => {
                tile.classList.add('flip');
            }, col * 100);
        }
    }
}

// Confirm progress bar timer — updates the progress UI every second
function fuddleStartConfirmTimer() {
    fuddleStopConfirmTimer();
    fuddleState._confirmTimer = setInterval(() => {
        if (!fuddleState.isConfirming) {
            fuddleStopConfirmTimer();
            return;
        }
        // Update only the progress elements, not the whole game
        const bar = document.querySelector('.fuddle-confirm-fill');
        const text = document.querySelector('.fuddle-confirm-text');
        const steps = document.querySelectorAll('.fuddle-confirm-step');
        if (bar && text) {
            const elapsed = Math.floor((Date.now() - fuddleState.confirmStartTime) / 1000);
            const pct = Math.min(95, Math.floor((elapsed / 65) * 100));
            bar.style.width = pct + '%';
            text.textContent = `Waiting for block confirmation... ${elapsed}s`;
            // Update step indicators
            if (steps.length >= 3) {
                steps[0].className = 'fuddle-confirm-step done';
                steps[1].className = 'fuddle-confirm-step ' + (elapsed > 3 ? 'done' : 'active');
                steps[2].className = 'fuddle-confirm-step ' + (elapsed > 55 ? 'active' : '');
            }
        }
    }, 1000);
}

function fuddleStopConfirmTimer() {
    if (fuddleState._confirmTimer) {
        clearInterval(fuddleState._confirmTimer);
        fuddleState._confirmTimer = null;
    }
}

// =========================================================================
// Admin functions
// =========================================================================

async function loadFuddleWordCounts() {
    const result = await fuddleCall('view_word_counts', 'manager');
    if (result && !result.error) {
        fuddleState.wordCounts = result;
    }
    return fuddleState.wordCounts;
}

async function fuddleShowAdmin() {
    fuddleState.view = 'admin';
    const root = document.getElementById('fuddle-root');
    if (!root) return;

    root.innerHTML = `
        <div class="fuddle-header">
            <button class="fuddle-back-btn" onclick="renderFuddleLobby()">&#8592; Back</button>
            <div class="fuddle-title">Admin Panel</div>
            <div></div>
        </div>
        <div class="fuddle-loading">Loading settings...</div>
    `;

    await Promise.all([
        loadFuddleSettings(),
        loadAllTournaments(),
        loadFuddleWordCounts(),
    ]);
    fuddleUpdateTierNames();
    const s = fuddleState.settings;
    if (!s) {
        root.innerHTML += '<div style="color:var(--error);padding:20px;">Failed to load settings</div>';
        return;
    }

    // Tournament pool info (keyed by contract tier 0/1/2)
    const t0 = fuddleState.tournaments[0];
    const t1 = fuddleState.tournaments[1];
    const t2 = fuddleState.tournaments[2];

    const tournamentDuration = s.tournament_duration || 1440;

    // Word counts — API returns {word_counts: {len4, len5, len6}}
    const wcRaw = fuddleState.wordCounts || {};
    const wc = wcRaw.word_counts || wcRaw;
    const len4 = wc.len4 || 0;
    const len5 = wc.len5 || 0;
    const len6 = wc.len6 || 0;

    root.innerHTML = `
        <div class="fuddle-header">
            <button class="fuddle-back-btn" onclick="renderFuddleLobby()">&#8592; Back</button>
            <div class="fuddle-title">Admin Panel</div>
            <div></div>
        </div>

        <div class="fuddle-admin-cli-warning">
            <div class="fuddle-cli-warning-title">&#9888; Admin transactions require beam-wallet CLI</div>
            <p>wallet-api cannot produce admin-keyed transactions. Withdraw Fees, Update Settings, and Mint operations below will fail via the UI.</p>
            <details>
                <summary>Show CLI command examples</summary>
                <pre><code># Withdraw fees
./binaries/macos/beam-wallet shader \\
  --wallet_path=wallets/YOUR_WALLET/wallet.db \\
  --pass=YOUR_PASSWORD \\
  --node_addr=127.0.0.1:10005 \\
  --shader_app_file=shaders/fuddle_app.wasm \\
  --shader_args="role=manager,action=withdraw_fees,cid=${FUDDLE_CID},amount=GROTH_AMOUNT" &lt;&lt;&lt; "y"

# Update settings
./binaries/macos/beam-wallet shader \\
  --shader_app_file=shaders/fuddle_app.wasm \\
  --shader_args="role=manager,action=update_settings,cid=${FUDDLE_CID},\\
letter_price=GROTH,tier0_cost=GROTH,tier1_cost=GROTH,tier2_cost=GROTH,\\
lootbox_small_price=GROTH,lootbox_large_price=GROTH,tournament_duration=BLOCKS" \\
  --wallet_path=wallets/YOUR_WALLET/wallet.db \\
  --pass=YOUR_PASSWORD \\
  --node_addr=127.0.0.1:10005 &lt;&lt;&lt; "y"

# Mint letters
./binaries/macos/beam-wallet shader \\
  --shader_app_file=shaders/fuddle_app.wasm \\
  --shader_args="role=manager,action=mint,cid=${FUDDLE_CID},char_id=0,count=10" \\
  --wallet_path=wallets/YOUR_WALLET/wallet.db \\
  --pass=YOUR_PASSWORD \\
  --node_addr=127.0.0.1:10005 &lt;&lt;&lt; "y"</code></pre>
            </details>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Contract Stats</h3>
            <div class="fuddle-admin-stats">
                <div class="fuddle-admin-stat"><span class="label">Games Created</span><span class="value">${s.game_count || 0}</span></div>
                <div class="fuddle-admin-stat"><span class="label">Owner Fees</span><span class="value">${fuddleFormatBeam(s.owner_fees)} BEAM</span></div>
                <div class="fuddle-admin-stat"><span class="label">Tournament Duration</span><span class="value">${tournamentDuration} blocks</span></div>
            </div>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Word Dictionary</h3>
            <div class="fuddle-admin-stats">
                <div class="fuddle-admin-stat"><span class="label">4-Letter Words</span><span class="value">${len4}</span></div>
                <div class="fuddle-admin-stat"><span class="label">5-Letter Words</span><span class="value">${len5}</span></div>
                <div class="fuddle-admin-stat"><span class="label">6-Letter Words</span><span class="value">${len6}</span></div>
                <div class="fuddle-admin-stat"><span class="label">Total Words</span><span class="value">${len4 + len5 + len6}</span></div>
            </div>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Tournament Pools</h3>
            <div class="fuddle-admin-stats">
                <div class="fuddle-admin-stat"><span class="label">${TIER_NAMES[0]} Pool</span><span class="value">${t0 ? fuddleFormatBeam(t0.prize_pool) : '0'} ${TIER_NAMES[0]}${t0 && t0.prize_pool > 0 && typeof getAssetUsdValue === 'function' ? (() => { const u = getAssetUsdValue(TIER_ASSETS[0].id, t0.prize_pool); return u > 0 ? ` <span style="color:var(--text-muted);font-size:11px;">($${u.toFixed(2)})</span>` : ''; })() : ''}</span></div>
                <div class="fuddle-admin-stat"><span class="label">${TIER_NAMES[1]} Pool</span><span class="value">${t1 ? fuddleFormatBeam(t1.prize_pool) : '0'} ${TIER_NAMES[1]}${t1 && t1.prize_pool > 0 && typeof getAssetUsdValue === 'function' ? (() => { const u = getAssetUsdValue(TIER_ASSETS[1].id, t1.prize_pool); return u > 0 ? ` <span style="color:var(--text-muted);font-size:11px;">($${u.toFixed(2)})</span>` : ''; })() : ''}</span></div>
                <div class="fuddle-admin-stat"><span class="label">${TIER_NAMES[2]} Pool</span><span class="value">${t2 ? fuddleFormatBeam(t2.prize_pool) : '0'} ${TIER_NAMES[2]}${t2 && t2.prize_pool > 0 && typeof getAssetUsdValue === 'function' ? (() => { const u = getAssetUsdValue(TIER_ASSETS[2].id, t2.prize_pool); return u > 0 ? ` <span style="color:var(--text-muted);font-size:11px;">($${u.toFixed(2)})</span>` : ''; })() : ''}</span></div>
            </div>
            <div class="fuddle-admin-stats" style="margin-top:10px;">
                <div class="fuddle-admin-stat"><span class="label">Tier 0 Entry Cost</span><span class="value">${fuddleFormatBeam(s.tier0_cost)} ${TIER_ENTRY_ASSETS[0].name}</span></div>
                <div class="fuddle-admin-stat"><span class="label">Tier 1 Entry Cost</span><span class="value">${fuddleFormatBeam(s.tier1_cost)} ${TIER_ENTRY_ASSETS[1].name}</span></div>
                <div class="fuddle-admin-stat"><span class="label">Tier 2 Entry Cost</span><span class="value">${fuddleFormatBeam(s.tier2_cost)} ${TIER_ENTRY_ASSETS[2].name}</span></div>
            </div>
            <div class="fuddle-admin-stats" style="margin-top:10px;">
                <div class="fuddle-admin-stat"><span class="label">Settings Asset ID</span><span class="value">T0: ${s.tier0_asset ?? '—'} (${TIER_ENTRY_ASSETS[0].name}) | T1: ${s.tier1_asset ?? '—'} (${TIER_ENTRY_ASSETS[1].name}) | T2: ${s.tier2_asset ?? '—'} (${TIER_ENTRY_ASSETS[2].name})</span></div>
                <div class="fuddle-admin-stat"><span class="label">Active Round Asset</span><span class="value">T0: ${t0?.asset ?? '—'} (${TIER_NAMES[0]}) | T1: ${t1?.asset ?? '—'} (${TIER_NAMES[1]}) | T2: ${t2?.asset ?? '—'} (${TIER_NAMES[2]})${(t0?.asset != null && t0.asset !== s.tier0_asset) || (t1?.asset != null && t1.asset !== s.tier1_asset) || (t2?.asset != null && t2.asset !== s.tier2_asset) ? ' <span style="color:var(--warning);">MISMATCH - settings change takes effect next round</span>' : ''}</span></div>
            </div>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Withdraw Fees</h3>
            <div style="display:flex;gap:10px;align-items:center;">
                <input type="text" id="admin-withdraw-amount" placeholder="Amount (BEAM)"
                    value="${fuddleFormatBeam(s.owner_fees)}" style="flex:1;">
                <button class="btn btn-accent" onclick="fuddleAdminWithdrawFees()" style="padding:11px 22px;">Withdraw</button>
            </div>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Update Settings</h3>
            <div class="fuddle-admin-form">
                <div class="fuddle-admin-field">
                    <label>Letter Price (BEAM)</label>
                    <input type="text" id="admin-letter-price" value="${fuddleFormatBeam(s.letter_price)}">
                </div>
                <div class="fuddle-admin-field">
                    <label>Tier 0 Asset ID</label>
                    <input type="number" id="admin-tier0-asset" value="${s.tier0_asset ?? 0}" min="0">
                </div>
                <div class="fuddle-admin-field">
                    <label>Tier 0 Cost (${TIER_ASSETS[0].name})</label>
                    <input type="text" id="admin-tier0-cost" value="${fuddleFormatBeam(s.tier0_cost)}">
                </div>
                <div class="fuddle-admin-field">
                    <label>Tier 1 Asset ID</label>
                    <input type="number" id="admin-tier1-asset" value="${s.tier1_asset ?? 174}" min="0">
                </div>
                <div class="fuddle-admin-field">
                    <label>Tier 1 Cost (${TIER_ASSETS[1].name})</label>
                    <input type="text" id="admin-tier1-cost" value="${fuddleFormatBeam(s.tier1_cost)}">
                </div>
                <div class="fuddle-admin-field">
                    <label>Tier 2 Asset ID</label>
                    <input type="number" id="admin-tier2-asset" value="${s.tier2_asset ?? 7}" min="0">
                </div>
                <div class="fuddle-admin-field">
                    <label>Tier 2 Cost (${TIER_ASSETS[2].name})</label>
                    <input type="text" id="admin-tier2-cost" value="${fuddleFormatBeam(s.tier2_cost)}">
                </div>
                <div class="fuddle-admin-field">
                    <label>Small Lootbox (BEAM)</label>
                    <input type="text" id="admin-lootbox-small" value="${fuddleFormatBeam(s.lootbox_small_price)}">
                </div>
                <div class="fuddle-admin-field">
                    <label>Large Lootbox (BEAM)</label>
                    <input type="text" id="admin-lootbox-large" value="${fuddleFormatBeam(s.lootbox_large_price)}">
                </div>
                <div class="fuddle-admin-field">
                    <label>Tournament Duration (blocks)</label>
                    <input type="number" id="admin-tournament-duration" value="${tournamentDuration}">
                </div>
            </div>
            <button class="btn btn-accent" onclick="fuddleAdminUpdateSettings()" style="margin-top:14px;padding:11px 26px;">Update Settings</button>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Mint Letters (Admin)</h3>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                <select id="admin-mint-letter">
                    ${FUDDLE_LETTERS.split('').map((l, i) => `<option value="${i}">${l}</option>`).join('')}
                </select>
                <input type="number" id="admin-mint-count" placeholder="Count" value="10" style="width:90px;">
                <button class="btn btn-accent" onclick="fuddleAdminMint()" style="padding:11px 22px;">Mint</button>
            </div>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Force Finalize Tournament</h3>
            <p style="color:var(--text-secondary);font-size:12px;margin:0 0 10px;">Force-end an active tournament round early. 50% carryover goes to pending pool for next round.</p>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                <select id="admin-ff-tier">
                    <option value="0">Tier 0 (${TIER_NAMES[0]}) — Round ${t0?.round || '—'}</option>
                    <option value="1">Tier 1 (${TIER_NAMES[1]}) — Round ${t1?.round || '—'}</option>
                    <option value="2">Tier 2 (${TIER_NAMES[2]}) — Round ${t2?.round || '—'}</option>
                </select>
                <button class="btn btn-accent" onclick="fuddleAdminForceFinalize()" style="padding:11px 22px;background:var(--warning);color:#000;">Force Finalize</button>
            </div>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Emergency Withdraw</h3>
            <p style="color:var(--text-secondary);font-size:12px;margin:0 0 10px;">Withdraw any asset stuck in the contract (e.g. stranded carryover after asset mismatch).</p>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                <input type="number" id="admin-ew-asset" placeholder="Asset ID" value="0" style="width:100px;" min="0">
                <input type="text" id="admin-ew-amount" placeholder="Amount" style="flex:1;">
                <button class="btn btn-accent" onclick="fuddleAdminEmergencyWithdraw()" style="padding:11px 22px;background:var(--error);">Withdraw</button>
            </div>
        </div>

        <div class="fuddle-lobby-section">
            <h3>Add Words</h3>
            <p style="color:var(--text-secondary);font-size:12px;margin:0 0 10px;">Add words to the dictionary. One word per line, all same length. Max 50 per transaction.</p>
            <div style="display:flex;gap:10px;flex-direction:column;">
                <select id="admin-word-length">
                    <option value="4">4-letter words (${len4} existing)</option>
                    <option value="5">5-letter words (${len5} existing)</option>
                    <option value="6">6-letter words (${len6} existing)</option>
                </select>
                <textarea id="admin-words-input" rows="6" placeholder="WORD&#10;GAME&#10;PLAY&#10;..." style="font-family:var(--font-mono);font-size:13px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px;resize:vertical;"></textarea>
                <button class="btn btn-accent" onclick="fuddleAdminAddWords()" style="padding:11px 22px;">Add Words</button>
            </div>
        </div>
    `;
}

async function fuddleAdminWithdrawFees() {
    const input = document.getElementById('admin-withdraw-amount');
    const beamAmount = parseFloat(input?.value);
    if (!beamAmount || beamAmount <= 0) {
        showFuddleToast('Enter a valid amount', 'error');
        return;
    }
    const groth = Math.round(beamAmount * 100000000);

    showFuddleToast('Withdrawing fees...', 'info');
    const result = await fuddleTx('withdraw_fees', 'manager', `amount=${groth}`, `Withdraw ${beamAmount} BEAM fees`);
    if (result && !result.error) {
        showFuddleToast(`Withdrew ${beamAmount} BEAM in fees!`, 'success');
        setTimeout(() => fuddleShowAdmin(), 3000);
    } else {
        showFuddleToast('Failed: ' + (result?.error || 'Unknown error'), 'error');
    }
}

async function fuddleAdminUpdateSettings() {
    const lp = parseFloat(document.getElementById('admin-letter-price')?.value);
    const t0c = parseFloat(document.getElementById('admin-tier0-cost')?.value);
    const t1c = parseFloat(document.getElementById('admin-tier1-cost')?.value);
    const t2c = parseFloat(document.getElementById('admin-tier2-cost')?.value);
    const ls = parseFloat(document.getElementById('admin-lootbox-small')?.value);
    const ll = parseFloat(document.getElementById('admin-lootbox-large')?.value);
    const td = parseInt(document.getElementById('admin-tournament-duration')?.value);
    const t0a = parseInt(document.getElementById('admin-tier0-asset')?.value);
    const t1a = parseInt(document.getElementById('admin-tier1-asset')?.value);
    const t2a = parseInt(document.getElementById('admin-tier2-asset')?.value);

    if (!lp || !t0c || !t1c || !t2c || !ls || !ll) {
        showFuddleToast('All prices required', 'error');
        return;
    }

    const args = [
        `letter_price=${Math.round(lp * 100000000)}`,
        `tier0_asset=${isNaN(t0a) ? 4294967295 : t0a}`,
        `tier0_cost=${Math.round(t0c * 100000000)}`,
        `tier1_asset=${isNaN(t1a) ? 4294967295 : t1a}`,
        `tier1_cost=${Math.round(t1c * 100000000)}`,
        `tier2_asset=${isNaN(t2a) ? 4294967295 : t2a}`,
        `tier2_cost=${Math.round(t2c * 100000000)}`,
        `lootbox_small_price=${Math.round(ls * 100000000)}`,
        `lootbox_large_price=${Math.round(ll * 100000000)}`,
        `tournament_duration=${td || 1440}`
    ].join(',');

    showFuddleToast('Updating settings...', 'info');
    const result = await fuddleTx('update_settings', 'manager', args, 'Update settings');
    if (result && !result.error) {
        showFuddleToast('Settings updated!', 'success');
        setTimeout(() => fuddleShowAdmin(), 3000);
    } else {
        showFuddleToast('Failed: ' + (result?.error || 'Unknown error'), 'error');
    }
}

async function fuddleAdminMint() {
    const charId = parseInt(document.getElementById('admin-mint-letter')?.value);
    const count = parseInt(document.getElementById('admin-mint-count')?.value);
    if (isNaN(charId) || !count || count <= 0) {
        showFuddleToast('Select letter and count', 'error');
        return;
    }

    showFuddleToast(`Minting ${count}x ${FUDDLE_LETTERS[charId]}...`, 'info');
    const result = await fuddleTx('mint', 'manager', `char_id=${charId},count=${count}`, `Mint ${count}x ${FUDDLE_LETTERS[charId]}`);
    if (result && !result.error) {
        showFuddleToast(`Minted ${count}x ${FUDDLE_LETTERS[charId]}!`, 'success');
        setTimeout(async () => {
            await loadFuddleLetters();
            fuddleShowAdmin();
        }, 3000);
    } else {
        showFuddleToast('Failed: ' + (result?.error || 'Unknown error'), 'error');
    }
}

async function fuddleAdminForceFinalize() {
    const tier = parseInt(document.getElementById('admin-ff-tier')?.value);
    if (isNaN(tier) || tier < 0 || tier > 2) {
        showFuddleToast('Select a valid tier', 'error');
        return;
    }
    const t = fuddleState.tournaments[tier];
    if (!t || !t.round) {
        showFuddleToast('No active tournament for this tier', 'error');
        return;
    }
    if (t.finalized) {
        showFuddleToast('Tournament already finalized', 'error');
        return;
    }
    const tierName = TIER_NAMES[tier];
    if (!confirm(`Force finalize ${tierName} Round ${t.round}?\n\n50% of the prize pool (${fuddleFormatBeam(t.prize_pool / 2)} ${tierName}) will carry over to the next round.`)) return;

    showFuddleToast('Force finalizing...', 'info');
    const result = await fuddleTx('force_finalize', 'manager', `tier=${tier},round=${t.round}`, `Force finalize ${tierName} R${t.round}`);
    if (result && !result.error) {
        showFuddleToast(`${tierName} Round ${t.round} finalized!`, 'success');
        setTimeout(() => fuddleShowAdmin(), 3000);
    } else {
        showFuddleToast('Failed: ' + (result?.error || 'Unknown error'), 'error');
    }
}

async function fuddleAdminEmergencyWithdraw() {
    const assetId = parseInt(document.getElementById('admin-ew-asset')?.value);
    const amountStr = document.getElementById('admin-ew-amount')?.value;
    const amount = parseFloat(amountStr);
    if (isNaN(assetId) || assetId < 0) {
        showFuddleToast('Enter a valid Asset ID', 'error');
        return;
    }
    if (!amount || amount <= 0) {
        showFuddleToast('Enter a valid amount', 'error');
        return;
    }
    const groth = Math.round(amount * 100000000);
    const assetName = fuddleResolveAssetName(assetId);
    if (!confirm(`Emergency withdraw ${amount} ${assetName} (Asset #${assetId}) from contract?`)) return;

    showFuddleToast('Withdrawing...', 'info');
    const result = await fuddleTx('emergency_withdraw', 'manager', `asset_id=${assetId},amount=${groth}`, `Emergency withdraw ${amount} ${assetName}`);
    if (result && !result.error) {
        showFuddleToast(`Withdrew ${amount} ${assetName}!`, 'success');
        setTimeout(() => fuddleShowAdmin(), 3000);
    } else {
        showFuddleToast('Failed: ' + (result?.error || 'Unknown error'), 'error');
    }
}

async function fuddleAdminAddWords() {
    const wordLength = parseInt(document.getElementById('admin-word-length')?.value);
    const rawText = document.getElementById('admin-words-input')?.value?.trim();
    if (!rawText) {
        showFuddleToast('Enter words (one per line)', 'error');
        return;
    }
    const words = rawText.split('\n').map(w => w.trim().toUpperCase()).filter(w => w.length === wordLength);
    if (words.length === 0) {
        showFuddleToast(`No valid ${wordLength}-letter words found`, 'error');
        return;
    }
    if (words.length > 50) {
        showFuddleToast('Max 50 words per transaction', 'error');
        return;
    }
    // Encode words as hex blob of uint32_t LE values (A=0x00000000, B=0x01000000, ...)
    // This matches the contract's Letter::Char type and DocGetBlob("data", ...) expectation
    let hexData = '';
    for (const word of words) {
        for (let i = 0; i < word.length; i++) {
            const idx = word.charCodeAt(i) - 65; // A=0, B=1, ..., Z=25
            if (idx < 0 || idx > 25) {
                showFuddleToast(`Invalid character '${word[i]}' in word '${word}'`, 'error');
                return;
            }
            // uint32_t little-endian: idx as 4 bytes LE
            hexData += idx.toString(16).padStart(2, '0') + '000000';
        }
    }

    if (!confirm(`Add ${words.length} words (${wordLength}-letter) to dictionary?\n\n${words.slice(0, 10).join(', ')}${words.length > 10 ? '...' : ''}`)) return;

    showFuddleToast(`Adding ${words.length} words...`, 'info');
    const result = await fuddleTx('add_words', 'manager', `length=${wordLength},num_words=${words.length},data=${hexData}`, `Add ${words.length} ${wordLength}-letter words`);
    if (result && !result.error) {
        showFuddleToast(`Added ${words.length} words!`, 'success');
        document.getElementById('admin-words-input').value = '';
        setTimeout(async () => {
            await loadFuddleWordCounts();
            fuddleShowAdmin();
        }, 3000);
    } else {
        showFuddleToast('Failed: ' + (result?.error || 'Unknown error'), 'error');
    }
}

// =========================================================================
// Transaction table — from wallet tx_list, filtered by Fuddle CID
// Pattern: icon | info (label + meta) | status (badge + fee)
// =========================================================================

const FUDDLE_TX_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 6L9 17l-5-5"/></svg>',
    failed:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    cancelled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>',
};

function fuddleTxStatusInfo(walletStatus) {
    if (walletStatus === 3) return { text: 'completed', css: 'tx-success', icon: FUDDLE_TX_ICONS.success };
    if (walletStatus === 4) return { text: 'failed',    css: 'tx-failed',  icon: FUDDLE_TX_ICONS.failed };
    if (walletStatus === 2) return { text: 'canceled',  css: 'tx-cancelled', icon: FUDDLE_TX_ICONS.cancelled };
    return { text: 'in progress', css: 'tx-pending', icon: FUDDLE_TX_ICONS.pending };
}

async function fuddleLoadTxTable() {
    const container = document.getElementById('fuddle-tx-table');
    if (!container) return;

    try {
        const resp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: Date.now(),
                method: 'tx_list', params: { count: 50 }
            })
        });
        const data = await resp.json();
        if (!data.result) {
            container.innerHTML = '<div class="fuddle-tx-empty">Could not load transactions</div>';
            return;
        }

        // Filter for Fuddle contract txs (v2 and v1)
        const FUDDLE_V1 = 'ea643c8d8d2515d5eebe90e4350ad0251bcb0dfa9c039427f2060de6dbbaf13e';
        const fuddleTxs = data.result.filter(tx =>
            tx.invoke_data && tx.invoke_data.some(d =>
                d.contract_id === FUDDLE_CID || d.contract_id === FUDDLE_V1
            )
        );

        if (fuddleTxs.length === 0) {
            container.innerHTML = '<div class="fuddle-tx-empty">No Fuddle transactions yet</div>';
            return;
        }

        // Auto-poll while any pending
        const hasPending = fuddleTxs.some(tx => tx.status <= 1 || tx.status >= 5);
        if (hasPending) fuddleStartTxPolling();

        container.innerHTML = '';
        fuddleTxs.slice(0, 15).forEach(tx => {
            const status = fuddleTxStatusInfo(tx.status);
            const label = fuddleParseTxLabel(tx);
            const fee = tx.fee ? (tx.fee / 100000000).toFixed(4) : '0';
            const time = tx.create_time ? new Date(tx.create_time * 1000).toLocaleString() : '';
            const txId = tx.txId || '';
            const statusText = tx.status_string || status.text;

            // Build amounts string
            let amountInfo = '';
            const invokeData = tx.invoke_data || [];
            invokeData.forEach(d => {
                (d.amounts || []).forEach(a => {
                    const val = fuddleFormatBeam(Math.abs(a.amount));
                    const sym = a.asset_id === 0 ? 'BEAM' : a.asset_id === 174 ? 'FOMO' : a.asset_id === 7 ? 'BEAMX' : `#${a.asset_id}`;
                    const sign = a.amount > 0 ? '-' : '+';
                    const cls = a.amount > 0 ? 'out' : 'in';
                    amountInfo += `<span class="fuddle-tx-amount ${cls}">${sign}${val} ${sym}</span> `;
                });
            });

            const row = document.createElement('div');
            row.className = `fuddle-tx-row ${status.css}`;
            row.innerHTML = `
                <div class="fuddle-tx-icon">${status.icon}</div>
                <div class="fuddle-tx-info">
                    <div class="fuddle-tx-label">${label}</div>
                    <div class="fuddle-tx-meta">
                        ${time}${amountInfo ? ' &middot; ' + amountInfo.trim() : ''}
                    </div>
                </div>
                <div class="fuddle-tx-right">
                    <span class="fuddle-tx-badge ${status.css}">${statusText}</span>
                    <span class="fuddle-tx-fee">Fee: ${fee} BEAM</span>
                    ${txId ? `<span class="fuddle-tx-id" title="${txId}" onclick="navigator.clipboard.writeText('${txId}');showFuddleToast('TX ID copied','success')">${txId.slice(0, 8)}...</span>` : ''}
                </div>
            `;
            container.appendChild(row);
        });
    } catch (e) {
        console.error('Failed to load Fuddle txs:', e);
    }
}

function fuddleParseTxLabel(tx) {
    const comment = (tx.comment || '').toLowerCase();

    // Check comment first
    if (comment.includes('guess'))           return 'Submit Guess';
    if (comment.includes('create_game') || comment.includes('create game'))  return 'Create Game';
    if (comment.includes('buy_letter') || comment.includes('buy letter'))    return 'Buy Letter';
    if (comment.includes('buy_lootbox') || comment.includes('lootbox'))     return 'Buy Lootbox';
    if (comment.includes('claim'))           return 'Claim Reward';
    if (comment.includes('donate'))          return 'Donate to Pool';
    if (comment.includes('add_word'))        return 'Add Words (Admin)';
    if (comment.includes('update_settings')) return 'Update Settings (Admin)';
    if (comment.includes('withdraw_fees'))   return 'Withdraw Fees (Admin)';
    if (comment.includes('mint'))            return 'Mint Tokens (Admin)';

    // Fallback: infer from amounts
    const amounts = tx.invoke_data?.[0]?.amounts || [];
    if (amounts.length === 0) return 'Contract Call';

    const beamOut  = amounts.find(a => a.asset_id === 0   && a.amount > 0);
    const fomoOut  = amounts.find(a => a.asset_id === 174 && a.amount > 0);
    const beamxOut = amounts.find(a => a.asset_id === 7   && a.amount > 0);
    const anyIn    = amounts.some(a => a.amount < 0);

    if (fomoOut)  return 'Entry Fee (FOMO)';
    if (beamxOut) return 'Entry Fee (BEAMX)';
    if (beamOut && beamOut.amount < 1000000000) return 'Buy Letter';
    if (beamOut)  return 'Entry Fee (BEAM)';
    if (anyIn)    return 'Claim / Withdraw';

    return 'Contract Call';
}

function fuddleStartTxPolling() {
    if (fuddleState.txPollTimer) return;
    fuddleState.txPollTimer = setInterval(() => fuddleLoadTxTable(), 10000);
}

function fuddleStopTxPolling() {
    if (fuddleState.txPollTimer) {
        clearInterval(fuddleState.txPollTimer);
        fuddleState.txPollTimer = null;
    }
}

// =========================================================================
// Toast notifications
// =========================================================================

function showFuddleToast(msg, type) {
    if (typeof showToast === 'function') {
        showToast(msg, type);
        return;
    }
    console.log(`[Fuddle ${type}] ${msg}`);
}

// =========================================================================
// TX Progress Bar — non-blocking sticky bottom bar for transaction UX
// =========================================================================

let _fuddleTxProgressTimer = null;
let _fuddleTxProgressPct = 0;
let _fuddleTxLastTxId = null;

function fuddleShowTxProgress(title, detail, stepText) {
    fuddleHideTxProgress();
    _fuddleTxProgressPct = 5;

    const bar = document.createElement('div');
    bar.className = 'fuddle-tx-bar';
    bar.id = 'fuddle-tx-progress-overlay';

    bar.innerHTML = `
        <div class="fuddle-tx-bar-fill" id="fuddle-txp-bar" style="width:5%"></div>
        <div class="fuddle-tx-bar-content">
            <div class="fuddle-tx-bar-left">
                <div class="fuddle-tx-bar-spinner" id="fuddle-txp-spinner"></div>
                <div class="fuddle-tx-bar-info">
                    <div class="fuddle-tx-bar-title" id="fuddle-txp-title">${title}</div>
                    <div class="fuddle-tx-bar-text" id="fuddle-txp-text">${stepText || 'Sending transaction...'}</div>
                </div>
            </div>
            <button class="fuddle-tx-bar-close" onclick="fuddleHideTxProgress()" title="Dismiss">&times;</button>
        </div>
    `;

    document.body.appendChild(bar);
    // Trigger slide-up animation
    requestAnimationFrame(() => bar.classList.add('visible'));
}

function fuddleUpdateTxProgress(text, pct) {
    const bar = document.getElementById('fuddle-txp-bar');
    const txt = document.getElementById('fuddle-txp-text');
    if (bar && pct != null) {
        _fuddleTxProgressPct = pct;
        bar.style.width = pct + '%';
    }
    if (txt && text) txt.textContent = text;
}

function fuddleStartTxProgressTimer() {
    fuddleStopTxProgressTimer();
    _fuddleTxProgressTimer = setInterval(() => {
        if (_fuddleTxProgressPct < 90) {
            _fuddleTxProgressPct += 1.5;
            const elapsed = Math.round((_fuddleTxProgressPct - 5) / 1.3);
            fuddleUpdateTxProgress(`Confirming... ${elapsed}s`, _fuddleTxProgressPct);
        }
    }, 1000);
}

function fuddleStopTxProgressTimer() {
    if (_fuddleTxProgressTimer) {
        clearInterval(_fuddleTxProgressTimer);
        _fuddleTxProgressTimer = null;
    }
}

function fuddleHideTxProgress() {
    fuddleStopTxProgressTimer();
    _fuddleTxLastTxId = null;
    const el = document.getElementById('fuddle-tx-progress-overlay');
    if (el) {
        el.classList.remove('visible');
        el.classList.add('hiding');
        setTimeout(() => el.remove(), 300);
    }
}

function fuddleTxProgressSuccess(msg) {
    fuddleStopTxProgressTimer();
    const el = document.getElementById('fuddle-tx-progress-overlay');
    if (el) el.classList.add('success');
    const spinner = document.getElementById('fuddle-txp-spinner');
    if (spinner) spinner.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"/></svg>';
    fuddleUpdateTxProgress(msg || 'Confirmed!', 100);
    setTimeout(() => fuddleHideTxProgress(), 2000);
}

function fuddleTxProgressError(msg) {
    fuddleStopTxProgressTimer();
    _fuddleTxLastTxId = null;
    const el = document.getElementById('fuddle-tx-progress-overlay');
    if (!el) return;
    el.classList.add('error');
    const spinner = document.getElementById('fuddle-txp-spinner');
    if (spinner) spinner.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z"/></svg>';
    const title = document.getElementById('fuddle-txp-title');
    if (title) title.textContent = 'Transaction Failed';
    fuddleUpdateTxProgress(msg || 'Unknown error', _fuddleTxProgressPct);
    // Check if it's a balance error and show buy modal
    if (msg && (msg.includes('Not enough') || msg.includes('insufficient') || msg.includes('low balance'))) {
        fuddleShowInsufficientFundsModal();
    }
    setTimeout(() => fuddleHideTxProgress(), 5000);
}

// Check recent tx_list for failed transactions (detects on-chain failures)
async function fuddleCheckTxFailed() {
    try {
        const resp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tx_list', params: { count: 5 } })
        });
        const data = await resp.json();
        if (data.result && Array.isArray(data.result)) {
            for (const tx of data.result) {
                // status 4 = Failed, status 5 = Cancelled
                if (tx.status === 4 || tx.status === 5) {
                    const age = Date.now() / 1000 - tx.create_time;
                    if (age < 120) { // Created within last 2 minutes
                        return tx.failure_reason || 'Transaction failed on-chain';
                    }
                }
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

// =========================================================================
// Insufficient Funds Modal — links to buybeam.my
// =========================================================================

function fuddleShowInsufficientFundsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'fuddle-result-overlay';
    overlay.id = 'fuddle-insufficient-funds-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
        <div class="fuddle-result-modal" style="max-width:400px;text-align:center;">
            <div style="font-size:48px;margin-bottom:12px;">💰</div>
            <div style="font-family:var(--fuddle-font-display);font-size:20px;font-weight:700;color:var(--fuddle-accent);letter-spacing:1px;margin-bottom:8px;">Not Enough Funds</div>
            <div style="color:var(--text-secondary);font-size:14px;line-height:1.6;margin-bottom:20px;">
                You don't have enough balance to complete this transaction.
                <br><br>
                Buy BEAM instantly from <strong>any blockchain</strong> and <strong>any token</strong> in under 10 seconds:
            </div>
            <a href="https://buybeam.my" target="_blank" rel="noopener noreferrer" class="btn btn-accent" style="padding:14px 28px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:600;text-decoration:none;margin-bottom:12px;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                Buy BEAM Now
            </a>
            <button class="btn btn-outline" style="padding:10px 24px;width:100%;" onclick="this.closest('.fuddle-result-overlay').remove()">Close</button>
        </div>
    `;

    document.body.appendChild(overlay);
}

// =========================================================================
// Styled Confirm Modal — replaces native confirm()
// =========================================================================

function fuddleConfirmModal(title, message, confirmText, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'fuddle-result-overlay';
    overlay.id = 'fuddle-confirm-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
        <div class="fuddle-result-modal" style="max-width:380px;">
            <div style="font-family:var(--fuddle-font-display);font-size:18px;font-weight:700;color:var(--fuddle-accent);letter-spacing:1px;margin-bottom:8px;">${title}</div>
            <div style="color:var(--text-secondary);font-size:13px;line-height:1.6;margin-bottom:20px;">${message}</div>
            <div class="fuddle-result-btns">
                <button class="btn btn-accent" style="padding:12px;flex:1;" id="fuddle-confirm-yes">${confirmText || 'Confirm'}</button>
                <button class="btn btn-outline" style="padding:12px;flex:1;" onclick="this.closest('.fuddle-result-overlay').remove()">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#fuddle-confirm-yes').onclick = () => {
        overlay.remove();
        if (onConfirm) onConfirm();
    };
}
