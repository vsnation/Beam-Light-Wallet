// =============================================================================
// MemeClash v9 - Meme Battle Game for BEAM Blockchain
// v9: New tokens (CHAD=190, GIGA=191), 1B supply, 50K BEAM LP, 45% burned
// =============================================================================
// Two meme tokens ($CHAD vs $GIGA) battle in 24-hour rounds.
// Winner = token whose DEX pool attracted more BEAM (higher growth).
// Loser treasury sold on DEX -> BEAM -> buy winner tokens -> burned.
// Fee split: 85% burn, 5% checkpoint caller, 10% ecosystem.
// =============================================================================

// Contract ID
const MEMECLASH_CID = 'd753ecb032b59f95d83bda64d5ed67baecc78068428be0cfae44c4dc2e4b6282';

// Asset IDs
const MC_CHAD_AID = 190;
const MC_GIGA_AID = 191;

// State
let mcState = {
    contractState: null,
    currentRound: null,
    history: [],
    payout: null,
    pools: null,
    refreshInterval: null,
    howToOpen: null // null = check localStorage, true/false = explicit
};

// Swap UI state
let mcSwapTeam = 0;         // 0=CHAD, 1=GIGA
let mcSwapQuote = null;     // Last quote result
let mcSwapQuoteTimer = null; // Debounce timer
let mcSwapLoading = false;
let mcSwapPrefilled = false; // Whether we've done the initial prefill
let mcSwapInputValue = '';   // Current input value (survives re-renders)

// Admin panel state
let mcAdminOpen = false;

// =========================================================================
// Contract helpers
// =========================================================================

async function mcCall(action, role, extraArgs) {
    if (!MEMECLASH_CID) {
        return { error: 'MemeClash contract not deployed yet' };
    }
    const args = `role=${role},action=${action},cid=${MEMECLASH_CID}${extraArgs ? ',' + extraArgs : ''}`;
    try {
        const resp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'invoke_contract',
                params: { args }
            })
        });
        const data = await resp.json();
        if (data.result && data.result.output) {
            try {
                const output = JSON.parse(data.result.output);
                if (output.error) {
                    console.error('MemeClash shader error:', output.error);
                    return { error: output.error };
                }
                return output;
            } catch (e) {
                return data.result;
            }
        }
        if (data.error) {
            console.error('MemeClash contract error:', data.error);
            return { error: data.error.message || 'Contract call failed' };
        }
        return data.result || data;
    } catch (e) {
        console.error('MemeClash API error:', e);
        return { error: e.message };
    }
}

async function mcTx(action, role, extraArgs) {
    const args = `role=${role},action=${action},cid=${MEMECLASH_CID}${extraArgs ? ',' + extraArgs : ''}`;
    try {
        const resp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'invoke_contract',
                params: { args, create_tx: true }
            })
        });
        const data = await resp.json();
        if (data.result && data.result.output) {
            try {
                const output = JSON.parse(data.result.output);
                if (output.error) return { error: output.error };
            } catch (e) { /* not JSON */ }
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
            const data2 = await resp2.json();
            if (data2.error) return { error: data2.error.message };
            _mcTxLastTxId = data2.result?.txid || null;
            return { success: true, txid: data2.result?.txid };
        }
        if (data.error) return { error: data.error.message };
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
}

// =========================================================================
// Formatting helpers
// =========================================================================

function mcFormatAmount(groth, decimals = 8) {
    if (!groth && groth !== 0) return '0';
    const val = Number(groth) / Math.pow(10, decimals);
    if (val === 0) return '0';
    if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    if (val >= 1) return val.toFixed(2);
    if (val >= 0.01) return val.toFixed(4);
    return val.toFixed(6);
}

function mcParseAmount(str, decimals = 8) {
    const val = parseFloat(str);
    if (isNaN(val) || val <= 0) return 0;
    return Math.round(val * Math.pow(10, decimals));
}

function mcBlocksToTime(blocks) {
    if (blocks <= 0) return 'Ended';
    const seconds = blocks * 60;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 24) {
        const days = Math.floor(hours / 24);
        const remH = hours % 24;
        return `${days}d ${remH}h`;
    }
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function mcWinnerLabel(winner) {
    if (winner === 0) return 'CHAD';
    if (winner === 1) return 'GIGA';
    if (winner === 254) return 'DRAW';
    return '---';
}

function mcWinnerClass(winner) {
    if (winner === 0) return 'chad';
    if (winner === 1) return 'giga';
    return 'draw';
}

// =========================================================================
// Data loading
// =========================================================================

async function mcLoadState() {
    const res = await mcCall('view', 'manager');
    if (res && res.state) {
        mcState.contractState = res.state;
    }
    return res;
}

async function mcLoadCurrentRound() {
    const res = await mcCall('view_current_round', 'user');
    if (res && res.current_round) {
        mcState.currentRound = res.current_round;
    } else if (res && res.error) {
        mcState.currentRound = null;
    }
    return res;
}

async function mcLoadHistory() {
    const res = await mcCall('view_history', 'user', 'count=20');
    if (res && res.rounds) {
        mcState.history = res.rounds;
    }
    return res;
}

async function mcLoadPayout() {
    const res = await mcCall('view_my_payout', 'user');
    if (res && res.payout) {
        mcState.payout = res.payout;
    }
    return res;
}

async function mcLoadPools() {
    const res = await mcCall('view_pool_reserves', 'user');
    if (res && res.pools) {
        mcState.pools = res.pools;
    }
    return res;
}

async function mcLoadAll() {
    await Promise.all([
        mcLoadState(),
        mcLoadCurrentRound(),
        mcLoadHistory(),
        mcLoadPayout(),
        mcLoadPools()
    ]);
    mcRender();
    mcLoadTxTable();
}

// =========================================================================
// Main Render - Single Page Layout
// =========================================================================

function mcRender() {
    const root = document.getElementById('memeclash-root');
    if (!root) return;

    if (!MEMECLASH_CID) {
        root.innerHTML = `
            <div class="mc-container">
                <div class="mc-empty">
                    <div class="mc-empty-icon">&#9876;</div>
                    <h3 style="color: var(--text-primary); margin-bottom: 8px;">MemeClash - Coming Soon</h3>
                    <p>The meme battle arena is being prepared.</p>
                </div>
            </div>
        `;
        return;
    }

    const s = mcState.contractState;
    if (!s) {
        root.innerHTML = `
            <div class="mc-container">
                <div class="mc-loading">
                    <div class="mc-loading-spinner"></div>
                    Loading MemeClash...
                </div>
            </div>
        `;
        return;
    }

    root.innerHTML = `
        <div class="mc-container">
            ${mcRenderHeader()}
            ${mcRenderPayoutBanner()}
            ${mcRenderArena()}
            ${mcRenderSwapSection()}
            ${mcRenderHowToPlay()}
            ${mcRenderDeposit()}
            ${mcRenderLifetimeStats()}
            ${mcRenderHistorySection()}
            ${mcRenderTxSection()}
            ${mcRenderAdminPanel()}
            ${mcRenderContractBar()}
        </div>
    `;

    // Restore how-to state
    mcInitHowTo();
}

// =========================================================================
// Page Header
// =========================================================================

function mcRenderHeader() {
    return `
        <div class="mc-page-header">
            <div class="mc-title">MEME CLASH</div>
            <div class="mc-subtitle">$CHAD vs $GIGA</div>
        </div>
    `;
}

// =========================================================================
// Payout Banner
// =========================================================================

function mcRenderPayoutBanner() {
    const p = mcState.payout;
    if (!p || ((!p.beam || p.beam <= 0) && (!p.token0 || p.token0 <= 0) && (!p.token1 || p.token1 <= 0))) {
        return '';
    }

    let parts = [];
    if (p.beam > 0) parts.push(`${mcFormatAmount(p.beam)} BEAM`);
    if (p.token0 > 0) parts.push(`${mcFormatAmount(p.token0)} CHAD`);
    if (p.token1 > 0) parts.push(`${mcFormatAmount(p.token1)} GIGA`);

    return `
        <div class="mc-payout-banner">
            <div>
                <div class="mc-payout-info">Withdrawable Balance</div>
                <div class="mc-payout-amount">${parts.join(' + ')}</div>
            </div>
            <button class="mc-btn mc-btn-primary mc-btn-sm" onclick="mcWithdraw()">Withdraw</button>
        </div>
    `;
}

// =========================================================================
// Battle Arena (Hero Section)
// =========================================================================

function mcRenderArena() {
    const r = mcState.currentRound;

    if (!r) {
        return `
            <div class="mc-arena">
                ${mcRenderBattleVisual(null)}
                <div class="mc-no-round">
                    <div class="mc-no-round-text">No Active Round</div>
                    <button class="mc-btn mc-btn-primary" onclick="mcStartRound()">Start New Round</button>
                </div>
            </div>
        `;
    }

    const blocks = r.blocks_remaining || 0;
    const phase = r.phase || 'active';
    // Power bar based on DEX pool BEAM growth since round start (not treasury ratio)
    const startRes0 = r.start_beam_reserve0 || 0;
    const startRes1 = r.start_beam_reserve1 || 0;
    const pools = mcState.pools || {};
    const curRes0 = pools.beam_reserve0 || startRes0;
    const curRes1 = pools.beam_reserve1 || startRes1;
    const growth0 = Math.max(0, curRes0 - startRes0);
    const growth1 = Math.max(0, curRes1 - startRes1);
    const totalGrowth = growth0 + growth1;
    const pct0 = totalGrowth > 0 ? Math.round((growth0 / totalGrowth) * 100) : 50;
    const pct1 = 100 - pct0;

    return `
        <div class="mc-arena">
            ${mcRenderRoundHeader(r, blocks, phase)}
            ${mcRenderBattleVisual(r)}
            ${mcRenderPowerBar(pct0, pct1)}
            ${mcRenderArenaActions(r, phase)}
        </div>
    `;
}

function mcRenderRoundHeader(r, blocks, phase) {
    return `
        <div class="mc-round-header">
            <div class="mc-round-badge">
                Round <span class="round-num">#${r.round_id}</span>
            </div>
            <div class="mc-timer-badge ${blocks <= 0 ? 'expired' : ''}">
                ${blocks > 0 ? mcBlocksToTime(blocks) + ' left' : 'Round ended'}
            </div>
            <span class="mc-phase-pill ${phase}">${phase.replace(/_/g, ' ')}</span>
        </div>
    `;
}

function mcRenderBattleVisual(r) {
    const t0 = r ? (r.treasury0 || 0) : 0;
    const t1 = r ? (r.treasury1 || 0) : 0;
    const pools = mcState.pools;

    return `
        <div class="mc-battle">
            <div class="mc-team-card chad ${r && r.winner === 0 ? 'winner' : ''}">
                <div class="mc-team-avatar chad">
                    <img src="https://ipfs.io/ipfs/QmYMksnyN1Cb32jMFkQcjxao3i7XSPL1dWJuHrGXcTr5cx" alt="CHAD">
                </div>
                <div class="mc-team-name chad">$CHAD</div>
                <div class="mc-team-treasury">
                    Treasury
                    <span class="value">${mcFormatAmount(t0)}</span>
                </div>
                ${pools ? `
                    <div class="mc-team-pool">
                        DEX Pool
                        <div class="pool-value">${mcFormatAmount(pools.beam_reserve0)} BEAM</div>
                    </div>
                ` : ''}
            </div>

            <div class="mc-vs-divider">
                <div class="mc-vs-swords">&#9876;</div>
                <div class="mc-vs-text">VS</div>
                <div class="mc-vs-swords">&#9876;</div>
            </div>

            <div class="mc-team-card giga ${r && r.winner === 1 ? 'winner' : ''}">
                <div class="mc-team-avatar giga">
                    <img src="https://ipfs.io/ipfs/QmZrekbbMSqYNjbkyKM9Ar3k7f6RUW2zUmNv9cxGz8DZvJ" alt="GIGA">
                </div>
                <div class="mc-team-name giga">$GIGA</div>
                <div class="mc-team-treasury">
                    Treasury
                    <span class="value">${mcFormatAmount(t1)}</span>
                </div>
                ${pools ? `
                    <div class="mc-team-pool">
                        DEX Pool
                        <div class="pool-value">${mcFormatAmount(pools.beam_reserve1)} BEAM</div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function mcRenderPowerBar(pct0, pct1) {
    return `
        <div class="mc-power-bar-section">
            <div class="mc-power-labels">
                <span class="chad-label">CHAD ${pct0}%</span>
                <span class="giga-label">${pct1}% GIGA</span>
            </div>
            <div class="mc-power-bar">
                <div class="mc-power-fill chad" style="width: ${pct0}%">${pct0 > 15 ? pct0 + '%' : ''}</div>
                <div class="mc-power-fill giga" style="width: ${pct1}%">${pct1 > 15 ? pct1 + '%' : ''}</div>
            </div>
        </div>
    `;
}

function mcRenderArenaActions(r, phase) {
    if (phase === 'active') {
        return `<div class="mc-arena-status">Battle in progress... winner determined by DEX pool growth</div>`;
    }

    let html = '';

    if (phase === 'finalized') {
        const winner = r.winner;
        html += `
            <div class="mc-winner-announce">
                <div class="mc-winner-crown">&#128081;</div>
                <div class="mc-winner-text ${mcWinnerClass(winner)}">
                    ${winner === 254 ? 'Draw!' : mcWinnerLabel(winner) + ' Wins!'}
                </div>
            </div>
        `;
    }

    let buttons = [];

    if (phase === 'ready_for_checkpoint') {
        const cpFeePct = mcState.contractState ? (mcState.contractState.checkpoint_fee_bps / 100).toFixed(0) : '5';
        buttons.push(`<button class="mc-btn mc-btn-gold" onclick="mcRunCheckpoint(${r.round_id})">Run Checkpoint (earn ${cpFeePct}%)</button>`);
    }

    if (phase === 'finalized') {
        buttons.push(`<button class="mc-btn mc-btn-primary" onclick="mcStartRound()">Start Next Round</button>`);
    }

    if (buttons.length > 0) {
        html += `<div class="mc-actions-row">${buttons.join('')}</div>`;
    }

    return html;
}

// =========================================================================
// Inline Swap UI (v4 - buy tokens through contract with 5% fee)
// =========================================================================

function mcGetBeamBalance() {
    // Get available BEAM balance from walletData (set by app.js loadWalletData)
    if (typeof walletData !== 'undefined' && walletData.assets) {
        const beam = walletData.assets.find(a => a.id === 0);
        if (beam) return beam.balance || 0;
    }
    return 0;
}

function mcRenderSwapSection() {
    const s = mcState.contractState;
    const feePct = s ? (s.trade_fee_bps / 100).toFixed(1) : '5.0';
    const teamName = mcSwapTeam === 0 ? 'CHAD' : 'GIGA';
    const teamClass = mcSwapTeam === 0 ? 'chad' : 'giga';

    // Balance info
    const balanceGroth = mcGetBeamBalance();
    const balanceBeam = balanceGroth / 1e8;
    const balanceDisplay = mcFormatAmount(balanceGroth);

    // Prefill: 100 BEAM or MAX if less
    if (!mcSwapPrefilled) {
        mcSwapPrefilled = true;
        mcSwapInputValue = balanceBeam >= 100 ? '100' : (balanceBeam > 0 ? balanceBeam.toFixed(2) : '');
    }

    let quoteHtml = '';
    if (mcSwapLoading) {
        quoteHtml = `<div class="mc-swap-quote"><div class="mc-loading-spinner small"></div> Getting quote...</div>`;
    } else if (mcSwapQuote) {
        const q = mcSwapQuote;
        quoteHtml = `
            <div class="mc-swap-quote">
                <div class="mc-swap-quote-row main">
                    <span>You receive:</span>
                    <span class="mc-swap-quote-value ${teamClass}">~${mcFormatAmount(q.tokens_to_user)} ${teamName}</span>
                </div>
            </div>
        `;
    }

    return `
        <div class="mc-swap-section">
            <div class="mc-swap-header">
                <h3>Buy Team Tokens</h3>
            </div>
            <div class="mc-team-toggle">
                <button id="mc-swap-chad" class="${mcSwapTeam === 0 ? 'active' : ''} chad-toggle" onclick="mcSwapSelectTeam(0)">$CHAD</button>
                <button id="mc-swap-giga" class="${mcSwapTeam === 1 ? 'active' : ''} giga-toggle" onclick="mcSwapSelectTeam(1)">$GIGA</button>
            </div>
            <div class="mc-swap-balance">
                <span>Balance:</span>
                <span class="mc-swap-balance-value">${balanceDisplay} BEAM</span>
            </div>
            <div class="mc-swap-input-row">
                <input type="number" id="mc-swap-amount" class="mc-input" placeholder="BEAM amount" min="0" step="0.1" value="${mcSwapInputValue}" oninput="mcOnSwapInput()">
                <span class="mc-swap-unit">BEAM</span>
            </div>
            <div class="mc-swap-pct-row">
                <button class="mc-swap-pct-btn" onclick="mcSwapSetPct(25)">25%</button>
                <button class="mc-swap-pct-btn" onclick="mcSwapSetPct(50)">50%</button>
                <button class="mc-swap-pct-btn" onclick="mcSwapSetPct(75)">75%</button>
                <button class="mc-swap-pct-btn max" onclick="mcSwapSetPct(100)">MAX</button>
            </div>
            ${quoteHtml}
            <button class="mc-btn mc-btn-${teamClass} mc-swap-btn" onclick="mcExecuteSwap()" ${!mcSwapQuote || mcSwapLoading ? 'disabled' : ''}>
                Buy $${teamName}
            </button>
        </div>
    `;
}

function mcSwapSelectTeam(team) {
    mcSwapTeam = team;
    mcSwapQuote = null;
    // Re-render swap section only
    const swapEl = document.querySelector('.mc-swap-section');
    if (swapEl) {
        swapEl.outerHTML = mcRenderSwapSection();
        // Trigger quote if amount already entered
        const input = document.getElementById('mc-swap-amount');
        if (input && input.value) mcOnSwapInput();
    }
}

function mcSwapSetPct(pct) {
    const balanceGroth = mcGetBeamBalance();
    const balanceBeam = balanceGroth / 1e8;
    // Reserve 0.01 BEAM for tx fee when using 100%
    const usable = pct === 100 ? Math.max(0, balanceBeam - 0.01) : balanceBeam;
    const amount = (usable * pct / 100);
    if (amount <= 0) {
        mcToast('No BEAM balance available');
        return;
    }
    // Round to 2 decimal places
    mcSwapInputValue = amount.toFixed(2);
    const input = document.getElementById('mc-swap-amount');
    if (input) {
        input.value = mcSwapInputValue;
        mcOnSwapInput();
    }
}

function mcOnSwapInput() {
    // Track input value so it survives re-renders
    const input = document.getElementById('mc-swap-amount');
    if (input) mcSwapInputValue = input.value;
    if (mcSwapQuoteTimer) clearTimeout(mcSwapQuoteTimer);
    mcSwapQuoteTimer = setTimeout(() => mcFetchQuote(), 500);
}

async function mcFetchQuote() {
    const input = document.getElementById('mc-swap-amount');
    if (input) mcSwapInputValue = input.value;
    const beamAmount = mcParseAmount(mcSwapInputValue);
    if (beamAmount <= 0) {
        mcSwapQuote = null;
        mcSwapLoading = false;
        const swapEl = document.querySelector('.mc-swap-section');
        if (swapEl) swapEl.outerHTML = mcRenderSwapSection();
        return;
    }

    mcSwapLoading = true;
    const swapEl = document.querySelector('.mc-swap-section');
    if (swapEl) swapEl.outerHTML = mcRenderSwapSection();

    const res = await mcCall('view_trade_quote', 'user', `team=${mcSwapTeam},beam_amount=${beamAmount}`);
    mcSwapLoading = false;

    if (res && res.quote) {
        mcSwapQuote = res.quote;
    } else {
        mcSwapQuote = null;
    }

    const swapEl2 = document.querySelector('.mc-swap-section');
    if (swapEl2) swapEl2.outerHTML = mcRenderSwapSection();
}

async function mcExecuteSwap() {
    const input = document.getElementById('mc-swap-amount');
    if (!input) return;
    const beamVal = input.value;
    const beamAmount = mcParseAmount(beamVal);
    if (beamAmount <= 0) {
        mcToast('Enter a valid BEAM amount');
        return;
    }

    const teamName = mcSwapTeam === 0 ? 'CHAD' : 'GIGA';
    const expectedTokens = mcSwapQuote ? mcFormatAmount(mcSwapQuote.tokens_to_user) : '';

    mcShowTxProgress(
        `Buying $${teamName}`,
        `${beamVal} BEAM`,
        'Sending transaction...'
    );

    const prevVolume = mcState.contractState?.total_trade_volume || 0;
    const res = await mcTx('trade_for_team', 'user', `team=${mcSwapTeam},beam_amount=${beamAmount}`);
    if (res.error) {
        mcTxProgressError(res.error);
        return;
    }

    mcUpdateTxProgress('Waiting for confirmation...', 15);
    mcStartTxProgressTimer();

    mcSwapQuote = null;
    mcSwapInputValue = '';
    mcSwapPrefilled = false;

    const confirmed = await mcWaitForConfirmation(async () => {
        await mcLoadState();
        return mcState.contractState && mcState.contractState.total_trade_volume > prevVolume;
    });

    if (confirmed) {
        mcTxProgressSuccess(`Bought ~${expectedTokens} ${teamName}!`);
    } else {
        mcTxProgressSuccess(`$${teamName} purchase sent!`);
    }
    setTimeout(() => mcLoadAll(), 1500);
}

// =========================================================================
// How To Play (expandable)
// =========================================================================

function mcRenderHowToPlay() {
    return `
        <div class="mc-howto" id="mc-howto">
            <div class="mc-howto-toggle" onclick="mcToggleHowTo()">
                <div class="mc-howto-title">
                    <span class="icon">&#128218;</span>
                    How to Play
                </div>
                <span class="mc-howto-arrow">&#9660;</span>
            </div>
            <div class="mc-howto-content">
                <div class="mc-howto-steps">
                    <div class="mc-howto-step">
                        <div class="mc-step-number">1</div>
                        <div class="mc-step-title">Pick Your Team</div>
                        <div class="mc-step-desc">Choose $CHAD or $GIGA. Each token has its own DEX pool on BEAM.</div>
                    </div>
                    <div class="mc-howto-step">
                        <div class="mc-step-number">2</div>
                        <div class="mc-step-title">Buy Your Token</div>
                        <div class="mc-step-desc">Buy your team's token right here. Every trade fuels the team's battle treasury = bigger burns!</div>
                    </div>
                    <div class="mc-howto-step">
                        <div class="mc-step-number">3</div>
                        <div class="mc-step-title">Watch the Battle</div>
                        <div class="mc-step-desc">Every 24h, pools are compared. Loser treasury burned, winner tokens become more scarce.</div>
                    </div>
                </div>
                <div class="mc-howto-bonus">
                    &#9733; Run the checkpoint after a round ends and earn a ${mcState.contractState ? (mcState.contractState.checkpoint_fee_bps / 100).toFixed(0) : '5'}% caller fee! ${mcState.contractState ? (mcState.contractState.fomo_buyback_bps / 100).toFixed(0) : '10'}% goes to ecosystem.
                </div>
                <div class="mc-howto-whitepaper">
                    <a href="/docs/memeclash-whitepaper.pdf" target="_blank" class="mc-whitepaper-link">
                        &#128220; Read the Whitepaper
                    </a>
                </div>
            </div>
        </div>
    `;
}

function mcToggleHowTo() {
    const el = document.getElementById('mc-howto');
    if (!el) return;
    const isOpen = el.classList.contains('open');
    el.classList.toggle('open');
    localStorage.setItem('mc_howto_seen', isOpen ? '0' : '1');
}

function mcInitHowTo() {
    const el = document.getElementById('mc-howto');
    if (!el) return;
    // Show by default on first visit, collapsed after that
    const seen = localStorage.getItem('mc_howto_seen');
    if (seen === null || seen === '0') {
        el.classList.add('open');
    }
}

// =========================================================================
// Deposit Section (compact, not a tab)
// =========================================================================

function mcGetTokenBalance(assetId) {
    if (typeof walletData !== 'undefined' && walletData.assets) {
        const asset = walletData.assets.find(a => a.id === assetId);
        if (asset) return asset.balance || 0;
    }
    return 0;
}

function mcRenderDeposit() {
    const s = mcState.contractState;
    const teamName = mcSelectedTeam === 0 ? 'CHAD' : 'GIGA';
    const teamClass = mcSelectedTeam === 0 ? 'chad' : 'giga';
    const assetId = mcSelectedTeam === 0 ? MC_CHAD_AID : MC_GIGA_AID;
    const balanceGroth = mcGetTokenBalance(assetId);
    const balanceDisplay = mcFormatAmount(balanceGroth);

    return `
        <div class="mc-deposit-section">
            <h3>Boost Your Team</h3>
            <div class="mc-deposit-desc">
                Add extra tokens to your team's war chest. A bigger treasury means more tokens get burned when your team wins &mdash; making your remaining tokens more scarce and valuable. If your team loses, the treasury gets sold and burned anyway, reducing supply forever.
            </div>
            <div class="mc-deposit-detail">
                <span class="mc-deposit-detail-icon">&#9889;</span>
                Either way, tokens are burned &mdash; boosting scarcity for all holders.
            </div>
            <div class="mc-team-toggle">
                <button id="mc-team-chad" class="${mcSelectedTeam === 0 ? 'active' : ''} chad-toggle" onclick="mcSelectTeam(0)">$CHAD</button>
                <button id="mc-team-giga" class="${mcSelectedTeam === 1 ? 'active' : ''} giga-toggle" onclick="mcSelectTeam(1)">$GIGA</button>
            </div>
            <div class="mc-deposit-balance">
                <span>Your $${teamName}:</span>
                <span class="mc-deposit-balance-value ${teamClass}">${balanceDisplay} ${teamName}</span>
            </div>
            <div class="mc-input-row">
                <input type="number" id="mc-deposit-amount" class="mc-input" placeholder="Amount of $${teamName}" min="0" step="0.01">
                <button class="mc-btn mc-btn-primary mc-btn-sm" onclick="mcDeposit()">Boost</button>
            </div>
            <div class="mc-deposit-pct-row">
                <button class="mc-deposit-pct-btn" onclick="mcDepositSetPct(5)">5%</button>
                <button class="mc-deposit-pct-btn" onclick="mcDepositSetPct(10)">10%</button>
                <button class="mc-deposit-pct-btn" onclick="mcDepositSetPct(20)">20%</button>
                <button class="mc-deposit-pct-btn max" onclick="mcDepositSetPct(100)">MAX</button>
            </div>
        </div>
    `;
}

let mcSelectedTeam = 0;

function mcSelectTeam(team) {
    mcSelectedTeam = team;
    const chadBtn = document.getElementById('mc-team-chad');
    const gigaBtn = document.getElementById('mc-team-giga');
    if (chadBtn) chadBtn.className = team === 0 ? 'active chad-toggle' : 'chad-toggle';
    if (gigaBtn) gigaBtn.className = team === 1 ? 'active giga-toggle' : 'giga-toggle';

    // Update balance display and input placeholder
    const teamName = team === 0 ? 'CHAD' : 'GIGA';
    const teamClass = team === 0 ? 'chad' : 'giga';
    const assetId = team === 0 ? MC_CHAD_AID : MC_GIGA_AID;
    const balanceGroth = mcGetTokenBalance(assetId);
    const balanceDisplay = mcFormatAmount(balanceGroth);

    const balLabel = document.querySelector('.mc-deposit-balance');
    if (balLabel) {
        balLabel.innerHTML = `<span>Your $${teamName}:</span><span class="mc-deposit-balance-value ${teamClass}">${balanceDisplay} ${teamName}</span>`;
    }
    const input = document.getElementById('mc-deposit-amount');
    if (input) {
        input.placeholder = `Amount of $${teamName}`;
        input.value = '';
    }
}

function mcDepositSetPct(pct) {
    const assetId = mcSelectedTeam === 0 ? MC_CHAD_AID : MC_GIGA_AID;
    const balanceGroth = mcGetTokenBalance(assetId);
    if (balanceGroth <= 0) {
        mcToast('No tokens available');
        return;
    }
    const amount = Math.floor(balanceGroth * pct / 100);
    const val = amount / 1e8;
    const input = document.getElementById('mc-deposit-amount');
    if (input) input.value = val > 0 ? val.toFixed(2).replace(/\.?0+$/, '') : '';

    // Highlight active pct button
    document.querySelectorAll('.mc-deposit-pct-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

// =========================================================================
// Lifetime Stats
// =========================================================================

function mcRenderLifetimeStats() {
    const s = mcState.contractState;
    if (!s) return '';

    return `
        <div class="mc-section-title">Lifetime Stats</div>
        <div class="mc-stats-grid">
            <div class="mc-stat-card">
                <div class="mc-stat-label">Rounds</div>
                <div class="mc-stat-value">${s.total_rounds || 0}</div>
            </div>
            <div class="mc-stat-card">
                <div class="mc-stat-label">CHAD Wins</div>
                <div class="mc-stat-value chad">${s.chad_wins || 0}</div>
            </div>
            <div class="mc-stat-card">
                <div class="mc-stat-label">GIGA Wins</div>
                <div class="mc-stat-value giga">${s.giga_wins || 0}</div>
            </div>
            <div class="mc-stat-card">
                <div class="mc-stat-label">Draws</div>
                <div class="mc-stat-value">${s.draws || 0}</div>
            </div>
        </div>
        <div class="mc-stats-grid">
            <div class="mc-stat-card">
                <div class="mc-stat-label">CHAD Burned</div>
                <div class="mc-stat-value chad">${mcFormatAmount(s.total_burned0)}</div>
            </div>
            <div class="mc-stat-card">
                <div class="mc-stat-label">GIGA Burned</div>
                <div class="mc-stat-value giga">${mcFormatAmount(s.total_burned1)}</div>
            </div>
            <div class="mc-stat-card">
                <div class="mc-stat-label">Trade Volume</div>
                <div class="mc-stat-value">${mcFormatAmount(s.total_trade_volume)} BEAM</div>
            </div>
            <div class="mc-stat-card">
                <div class="mc-stat-label">Round Duration</div>
                <div class="mc-stat-value">${mcBlocksToTime(s.round_duration)}</div>
            </div>
        </div>
        <div class="mc-stats-grid">
            <div class="mc-stat-card">
                <div class="mc-stat-label">CHAD Trade Fees</div>
                <div class="mc-stat-value chad">${mcFormatAmount(s.total_trade_fees0)}</div>
            </div>
            <div class="mc-stat-card">
                <div class="mc-stat-label">GIGA Trade Fees</div>
                <div class="mc-stat-value giga">${mcFormatAmount(s.total_trade_fees1)}</div>
            </div>
            <div class="mc-stat-card">
                <div class="mc-stat-label">Fee Split</div>
                <div class="mc-stat-value" style="font-size: 12px;">${s.burn_bps/100}% burn / ${s.checkpoint_fee_bps/100}% caller / ${s.fomo_buyback_bps/100}% ecosystem</div>
            </div>
        </div>
    `;
}

// =========================================================================
// Round History
// =========================================================================

function mcRenderHistorySection() {
    const history = mcState.history;
    if (!history || history.length === 0) {
        return `
            <div class="mc-history-section">
                <div class="mc-section-title">Round History</div>
                <div class="mc-empty" style="padding: 30px;">No rounds completed yet</div>
            </div>
        `;
    }

    const rows = [...history].reverse().map(r => {
        const winner = r.winner;
        const isActive = r.round_id === (mcState.currentRound?.round_id);
        const isFinalized = r.status === 2;
        return `
            <tr>
                <td style="font-weight: 700; font-family: var(--font-mono);">#${r.round_id}</td>
                <td>
                    ${isActive && !isFinalized
                        ? '<span class="mc-winner-badge active-round">ACTIVE</span>'
                        : `<span class="mc-winner-badge ${mcWinnerClass(winner)}">${mcWinnerLabel(winner)}</span>`
                    }
                </td>
                <td style="font-family: var(--font-mono); color: var(--chad-color);">${mcFormatAmount(r.treasury0)}</td>
                <td style="font-family: var(--font-mono); color: var(--giga-color);">${mcFormatAmount(r.treasury1)}</td>
                <td style="font-family: var(--font-mono);">${r.winner_burned ? mcFormatAmount(r.winner_burned) : '---'}</td>
                <td style="font-family: var(--font-mono);">${r.beam_received ? mcFormatAmount(r.beam_received) + ' BEAM' : '---'}</td>
                <td style="font-family: var(--font-mono);">${r.caller_fee ? mcFormatAmount(r.caller_fee) : '---'}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="mc-history-section">
            <div class="mc-section-title">Round History</div>
            <div class="mc-history-scroll">
                <table class="mc-history-table">
                    <thead>
                        <tr>
                            <th>Round</th>
                            <th>Winner</th>
                            <th>CHAD Treasury</th>
                            <th>GIGA Treasury</th>
                            <th>Burned</th>
                            <th>BEAM Received</th>
                            <th>Caller Fee</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

// =========================================================================
// Contract ID bar (subtle, at bottom)
// =========================================================================

function mcRenderContractBar() {
    return `
        <div class="mc-contract-bar">
            <span>Contract:</span>
            <code onclick="navigator.clipboard.writeText('${MEMECLASH_CID}');mcToast('Contract ID copied')" title="Click to copy">${MEMECLASH_CID.substring(0, 12)}...${MEMECLASH_CID.substring(52)}</code>
        </div>
    `;
}

// =========================================================================
// Actions
// =========================================================================

async function mcDeposit() {
    const amountStr = document.getElementById('mc-deposit-amount')?.value;
    const amount = mcParseAmount(amountStr);
    if (amount <= 0) {
        mcToast('Enter a valid amount');
        return;
    }
    const teamName = mcSelectedTeam === 0 ? 'CHAD' : 'GIGA';
    mcShowTxProgress(`Depositing to ${teamName}`, `${amountStr} tokens`, 'Sending transaction...');

    const res = await mcTx('deposit_tokens', 'user', `team=${mcSelectedTeam},amount=${amount}`);
    if (res.error) {
        mcTxProgressError(res.error);
        return;
    }

    mcUpdateTxProgress('Waiting for confirmation...', 15);
    mcStartTxProgressTimer();

    await mcWaitForConfirmation(null, 10, 3000);
    mcTxProgressSuccess(`Deposited to ${teamName} treasury!`);
    setTimeout(() => mcLoadAll(), 1500);
}

async function mcRunCheckpoint(roundId) {
    mcShowTxProgress('Running Checkpoint', `Round #${roundId}`, 'Executing trades & burns...');

    const res = await mcTx('run_checkpoint', 'user', `round_id=${roundId}`);
    if (res.error) {
        mcTxProgressError(res.error);
        return;
    }

    mcUpdateTxProgress('Waiting for confirmation...', 15);
    mcStartTxProgressTimer();

    const confirmed = await mcWaitForConfirmation(async () => {
        const r = await mcCall('view_current_round', 'user');
        return r && r.current_round && r.current_round.phase === 'finalized';
    }, 25, 3000);

    if (confirmed) {
        const r = mcState.currentRound;
        await mcLoadCurrentRound();
        const winner = mcState.currentRound?.winner;
        const winnerName = winner === 0 ? 'CHAD' : winner === 1 ? 'GIGA' : 'DRAW';
        mcTxProgressSuccess(`Checkpoint complete! ${winnerName} wins!`);
    } else {
        mcTxProgressSuccess('Checkpoint submitted!');
    }
    setTimeout(() => mcLoadAll(), 1500);
}

async function mcStartRound() {
    const prevRound = mcState.contractState?.current_round || 0;
    mcShowTxProgress('Starting New Round', '', 'Sending transaction...');

    const res = await mcTx('start_round', 'user');
    if (res.error) {
        mcTxProgressError(res.error);
        return;
    }

    mcUpdateTxProgress('Waiting for confirmation...', 15);
    mcStartTxProgressTimer();

    const confirmed = await mcWaitForConfirmation(async () => {
        await mcLoadState();
        return mcState.contractState && mcState.contractState.current_round > prevRound;
    });

    if (confirmed) {
        mcTxProgressSuccess(`Round #${mcState.contractState.current_round} started!`);
    } else {
        mcTxProgressSuccess('New round submitted!');
    }
    setTimeout(() => mcLoadAll(), 1500);
}

async function mcWithdraw() {
    const p = mcState.payout;
    if (!p) return;

    let parts = [];
    if (p.beam > 0) parts.push(`${mcFormatAmount(p.beam)} BEAM`);
    if (p.token0 > 0) parts.push(`${mcFormatAmount(p.token0)} CHAD`);
    if (p.token1 > 0) parts.push(`${mcFormatAmount(p.token1)} GIGA`);

    mcShowTxProgress('Withdrawing', parts.join(' + '), 'Sending transaction...');

    if (p.beam > 0) {
        const res = await mcTx('withdraw', 'user', `amount=${p.beam},asset_id=0`);
        if (res.error) { mcTxProgressError(res.error); return; }
    }

    if (p.token0 > 0 && mcState.contractState) {
        mcUpdateTxProgress('Withdrawing CHAD...', 40);
        await mcTx('withdraw', 'user', `amount=${p.token0},asset_id=${mcState.contractState.token0}`);
    }

    if (p.token1 > 0 && mcState.contractState) {
        mcUpdateTxProgress('Withdrawing GIGA...', 70);
        await mcTx('withdraw', 'user', `amount=${p.token1},asset_id=${mcState.contractState.token1}`);
    }

    mcTxProgressSuccess('Withdrawal complete!');
    setTimeout(() => mcLoadAll(), 3000);
}

// =========================================================================
// Admin Panel (visible only when is_admin == 1)
// =========================================================================

function mcRenderAdminPanel() {
    const s = mcState.contractState;
    if (!s || !s.is_admin) return '';

    return `
        <div class="mc-admin-section">
            <div class="mc-admin-toggle" onclick="mcToggleAdmin()">
                <span class="mc-admin-icon">&#9881;</span>
                <span>Admin Panel</span>
                <span class="mc-howto-arrow">${mcAdminOpen ? '&#9650;' : '&#9660;'}</span>
            </div>
            <div class="mc-admin-content" style="display: ${mcAdminOpen ? 'block' : 'none'}">
                ${mcRenderAdminStatus(s)}
                ${mcRenderAdminBalances(s)}
                ${mcRenderAdminSettings(s)}
                ${mcRenderAdminFees(s)}
                ${mcRenderAdminActions()}
            </div>
        </div>
    `;
}

function mcRenderAdminStatus(s) {
    return `
        <div class="mc-admin-group">
            <div class="mc-admin-group-title">Contract Status</div>
            <div class="mc-admin-kv">
                <span>CID:</span><code>${MEMECLASH_CID.substring(0, 20)}...</code>
            </div>
            <div class="mc-admin-kv">
                <span>Current Round:</span><span>${s.current_round || 0}</span>
            </div>
            <div class="mc-admin-kv">
                <span>Round Duration:</span><span>${s.round_duration} blocks (${mcBlocksToTime(s.round_duration)})</span>
            </div>
            <div class="mc-admin-kv">
                <span>Trade Fee:</span><span>${s.trade_fee_bps || 500} bps (${((s.trade_fee_bps || 500) / 100).toFixed(1)}%)</span>
            </div>
            <div class="mc-admin-kv">
                <span>Checkpoint Fee:</span><span>${s.checkpoint_fee_bps} bps</span>
            </div>
            <div class="mc-admin-kv">
                <span>FOMO Buyback:</span><span>${s.fomo_buyback_bps} bps</span>
            </div>
            <div class="mc-admin-kv">
                <span>Burn:</span><span>${s.burn_bps} bps</span>
            </div>
        </div>
    `;
}

function mcRenderAdminBalances(s) {
    const r = mcState.currentRound;
    const t0 = r ? (r.treasury0 || 0) : 0;
    const t1 = r ? (r.treasury1 || 0) : 0;
    return `
        <div class="mc-admin-group">
            <div class="mc-admin-group-title">Contract Balances</div>
            <div class="mc-admin-kv">
                <span>Admin FOMO Balance:</span><span style="color: #f59e0b; font-weight: 700;">${mcFormatAmount(s.owner_fees)} FOMO</span>
            </div>
            <div class="mc-admin-kv">
                <span>CHAD Treasury (Round):</span><span style="color: var(--chad-color);">${mcFormatAmount(t0)} CHAD</span>
            </div>
            <div class="mc-admin-kv">
                <span>GIGA Treasury (Round):</span><span style="color: var(--giga-color);">${mcFormatAmount(t1)} GIGA</span>
            </div>
            <div class="mc-admin-kv">
                <span>Total CHAD Burned:</span><span>${mcFormatAmount(s.total_burned0)}</span>
            </div>
            <div class="mc-admin-kv">
                <span>Total GIGA Burned:</span><span>${mcFormatAmount(s.total_burned1)}</span>
            </div>
            <div class="mc-admin-kv">
                <span>Total FOMO Burned:</span><span>${mcFormatAmount(s.total_fomo_burned || 0)}</span>
            </div>
            <div class="mc-admin-kv">
                <span>Total FOMO Buyback BEAM:</span><span>${mcFormatAmount(s.total_fomo_buyback)} BEAM</span>
            </div>
        </div>
    `;
}
function mcRenderAdminSettings(s) {
    return `
        <div class="mc-admin-group">
            <div class="mc-admin-group-title">Update Settings</div>
            <div class="mc-admin-form-row">
                <label>Round Duration (blocks):</label>
                <input type="number" id="mc-admin-duration" class="mc-input mc-input-sm" placeholder="${s.round_duration}" value="">
            </div>
            <div class="mc-admin-form-row">
                <label>Trade Fee (bps):</label>
                <input type="number" id="mc-admin-trade-fee" class="mc-input mc-input-sm" placeholder="${s.trade_fee_bps || 500}" value="">
            </div>
            <div class="mc-admin-form-row">
                <label>Checkpoint Fee (bps):</label>
                <input type="number" id="mc-admin-cp-fee" class="mc-input mc-input-sm" placeholder="${s.checkpoint_fee_bps}" value="">
            </div>
            <div class="mc-admin-form-row">
                <label>FOMO Buyback (bps):</label>
                <input type="number" id="mc-admin-fomo-bps" class="mc-input mc-input-sm" placeholder="${s.fomo_buyback_bps}" value="">
            </div>
            <div class="mc-admin-form-row">
                <label>Burn (bps):</label>
                <input type="number" id="mc-admin-burn-bps" class="mc-input mc-input-sm" placeholder="${s.burn_bps}" value="">
            </div>
            <button class="mc-btn mc-btn-primary mc-btn-sm" onclick="mcAdminUpdateSettings()">Update Settings</button>
        </div>
    `;
}

function mcRenderAdminFees(s) {
    return `
        <div class="mc-admin-group">
            <div class="mc-admin-group-title">Withdraw FOMO Fees</div>
            <div class="mc-admin-kv">
                <span>Withdrawable FOMO:</span><span style="color: #f59e0b; font-weight: 700;">${mcFormatAmount(s.owner_fees)} FOMO</span>
            </div>
            <div class="mc-admin-form-row">
                <label>FOMO amount:</label>
                <input type="number" id="mc-admin-withdraw-amt" class="mc-input mc-input-sm" placeholder="Amount in FOMO">
            </div>
            <button class="mc-btn mc-btn-primary mc-btn-sm" onclick="mcAdminWithdrawFees()">Withdraw FOMO</button>
        </div>
    `;
}

function mcRenderAdminActions() {
    return `
        <div class="mc-admin-group">
            <div class="mc-admin-group-title">Admin Actions</div>
            <div class="mc-admin-form-row">
                <label>Force End Round ID:</label>
                <input type="number" id="mc-admin-force-round" class="mc-input mc-input-sm" placeholder="Round ID">
                <button class="mc-btn mc-btn-gold mc-btn-sm" onclick="mcAdminForceEndRound()">Force End</button>
            </div>
            <div class="mc-admin-form-row">
                <label>Emergency Withdraw Asset ID:</label>
                <input type="number" id="mc-admin-emerg-asset" class="mc-input mc-input-sm" placeholder="Asset ID">
            </div>
            <div class="mc-admin-form-row">
                <label>Emergency Withdraw Amount:</label>
                <input type="number" id="mc-admin-emerg-amount" class="mc-input mc-input-sm" placeholder="Amount">
                <button class="mc-btn mc-btn-gold mc-btn-sm" onclick="mcAdminEmergencyWithdraw()">Emergency Withdraw</button>
            </div>
        </div>
    `;
}

function mcToggleAdmin() {
    mcAdminOpen = !mcAdminOpen;
    const content = document.querySelector('.mc-admin-content');
    const arrow = document.querySelector('.mc-admin-toggle .mc-howto-arrow');
    if (content) content.style.display = mcAdminOpen ? 'block' : 'none';
    if (arrow) arrow.innerHTML = mcAdminOpen ? '&#9650;' : '&#9660;';
}

async function mcAdminUpdateSettings() {
    const duration = document.getElementById('mc-admin-duration')?.value || '0';
    const tradeFee = document.getElementById('mc-admin-trade-fee')?.value || '0';
    const cpFee = document.getElementById('mc-admin-cp-fee')?.value || '0';
    const fomoBps = document.getElementById('mc-admin-fomo-bps')?.value || '0';
    const burnBps = document.getElementById('mc-admin-burn-bps')?.value || '0';

    mcShowTxProgress('Update Settings', '', 'Sending transaction...');
    const res = await mcTx('update_settings', 'manager',
        `round_duration=${duration},checkpoint_fee_bps=${cpFee},fomo_buyback_bps=${fomoBps},burn_bps=${burnBps},trade_fee_bps=${tradeFee}`);
    if (res.error) {
        mcTxProgressError(res.error);
        return;
    }

    mcUpdateTxProgress('Waiting for confirmation...', 15);
    mcStartTxProgressTimer();
    await mcWaitForConfirmation(null, 10, 3000);
    mcTxProgressSuccess('Settings updated!');
    setTimeout(() => mcLoadAll(), 1500);
}

async function mcAdminWithdrawFees() {
    const amtStr = document.getElementById('mc-admin-withdraw-amt')?.value;
    const amount = mcParseAmount(amtStr);
    if (amount <= 0) {
        mcToast('Enter a valid amount');
        return;
    }
    mcShowTxProgress('Withdraw Fees', `${amtStr} FOMO`, 'Sending transaction...');
    const res = await mcTx('withdraw_fees', 'manager', `amount=${amount}`);
    if (res.error) {
        mcTxProgressError(res.error);
        return;
    }

    mcUpdateTxProgress('Waiting for confirmation...', 15);
    mcStartTxProgressTimer();
    await mcWaitForConfirmation(null, 10, 3000);
    mcTxProgressSuccess('Fees withdrawn!');
    setTimeout(() => mcLoadAll(), 1500);
}

async function mcAdminForceEndRound() {
    const roundId = document.getElementById('mc-admin-force-round')?.value;
    if (!roundId) {
        mcToast('Enter a round ID');
        return;
    }
    mcShowTxProgress('Force End Round', `Round #${roundId}`, 'Sending transaction...');
    const res = await mcTx('force_end_round', 'manager', `round_id=${roundId}`);
    if (res.error) {
        mcTxProgressError(res.error);
        return;
    }

    mcUpdateTxProgress('Waiting for confirmation...', 15);
    mcStartTxProgressTimer();
    await mcWaitForConfirmation(null, 10, 3000);
    mcTxProgressSuccess('Round force-ended!');
    setTimeout(() => mcLoadAll(), 1500);
}

async function mcAdminEmergencyWithdraw() {
    const assetId = document.getElementById('mc-admin-emerg-asset')?.value;
    const amtStr = document.getElementById('mc-admin-emerg-amount')?.value;
    const amount = mcParseAmount(amtStr);
    if (!assetId || amount <= 0) {
        mcToast('Enter asset ID and amount');
        return;
    }
    mcShowTxProgress('Emergency Withdraw', `Asset ${assetId}`, 'Sending transaction...');
    const res = await mcTx('emergency_withdraw', 'manager', `asset_id=${assetId},amount=${amount}`);
    if (res.error) {
        mcTxProgressError(res.error);
        return;
    }

    mcUpdateTxProgress('Waiting for confirmation...', 15);
    mcStartTxProgressTimer();
    await mcWaitForConfirmation(null, 10, 3000);
    mcTxProgressSuccess('Emergency withdrawal complete!');
    setTimeout(() => mcLoadAll(), 1500);
}

// =========================================================================
// Transaction Progress Bar (matches Fuddle pattern)
// =========================================================================

let _mcTxProgressTimer = null;
let _mcTxProgressPct = 0;
let _mcTxLastTxId = null;

function mcShowTxProgress(title, detail, stepText) {
    mcHideTxProgress();
    _mcTxProgressPct = 5;

    const bar = document.createElement('div');
    bar.className = 'mc-tx-bar';
    bar.id = 'mc-tx-progress-overlay';

    bar.innerHTML = `
        <div class="mc-tx-bar-fill" id="mc-txp-bar" style="width:5%"></div>
        <div class="mc-tx-bar-content">
            <div class="mc-tx-bar-left">
                <div class="mc-tx-bar-spinner" id="mc-txp-spinner"></div>
                <div class="mc-tx-bar-info">
                    <div class="mc-tx-bar-title" id="mc-txp-title">${title}</div>
                    <div class="mc-tx-bar-text" id="mc-txp-text">${stepText || 'Sending transaction...'}</div>
                </div>
            </div>
            <button class="mc-tx-bar-close" onclick="mcHideTxProgress()" title="Dismiss">&times;</button>
        </div>
    `;

    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('visible'));
}

function mcUpdateTxProgress(text, pct) {
    const bar = document.getElementById('mc-txp-bar');
    const txt = document.getElementById('mc-txp-text');
    if (bar && pct != null) {
        _mcTxProgressPct = pct;
        bar.style.width = pct + '%';
    }
    if (txt && text) txt.textContent = text;
}

function mcStartTxProgressTimer() {
    mcStopTxProgressTimer();
    _mcTxProgressTimer = setInterval(() => {
        if (_mcTxProgressPct < 90) {
            _mcTxProgressPct += 1.5;
            const elapsed = Math.round((_mcTxProgressPct - 5) / 1.3);
            mcUpdateTxProgress(`Confirming... ${elapsed}s`, _mcTxProgressPct);
        }
    }, 1000);
}

function mcStopTxProgressTimer() {
    if (_mcTxProgressTimer) {
        clearInterval(_mcTxProgressTimer);
        _mcTxProgressTimer = null;
    }
}

function mcHideTxProgress() {
    mcStopTxProgressTimer();
    _mcTxLastTxId = null;
    const el = document.getElementById('mc-tx-progress-overlay');
    if (el) {
        el.classList.remove('visible');
        el.classList.add('hiding');
        setTimeout(() => el.remove(), 300);
    }
}

function mcTxProgressSuccess(msg) {
    mcStopTxProgressTimer();
    const el = document.getElementById('mc-tx-progress-overlay');
    if (el) el.classList.add('success');
    const spinner = document.getElementById('mc-txp-spinner');
    if (spinner) spinner.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"/></svg>';
    mcUpdateTxProgress(msg || 'Confirmed!', 100);
    setTimeout(() => mcHideTxProgress(), 2500);
}

function mcTxProgressError(msg) {
    mcStopTxProgressTimer();
    _mcTxLastTxId = null;
    const el = document.getElementById('mc-tx-progress-overlay');
    if (!el) return;
    el.classList.add('error');
    const spinner = document.getElementById('mc-txp-spinner');
    if (spinner) spinner.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z"/></svg>';
    const title = document.getElementById('mc-txp-title');
    if (title) title.textContent = 'Transaction Failed';
    mcUpdateTxProgress(msg || 'Unknown error', _mcTxProgressPct);
    setTimeout(() => mcHideTxProgress(), 5000);
}

// Poll tx_list for failure of a specific transaction
async function mcCheckTxFailed(txId) {
    if (!txId) return null;
    try {
        const resp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tx_list', params: { count: 10 } })
        });
        const data = await resp.json();
        if (data.result && Array.isArray(data.result)) {
            for (const tx of data.result) {
                if (tx.txId === txId && (tx.status === 4 || tx.status === 5)) {
                    return tx.failure_reason || 'Transaction failed on-chain';
                }
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

// Wait for tx confirmation by polling contract state change
async function mcWaitForConfirmation(checkFn, maxAttempts, intervalMs) {
    maxAttempts = maxAttempts || 20;
    intervalMs = intervalMs || 3000;
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, intervalMs));

        // Check for on-chain failure every 3rd poll
        if (i > 0 && i % 3 === 0 && _mcTxLastTxId) {
            const failReason = await mcCheckTxFailed(_mcTxLastTxId);
            if (failReason) {
                mcTxProgressError(typeof failReason === 'string' ? failReason : 'Transaction failed');
                return false;
            }
        }

        if (checkFn) {
            const result = await checkFn();
            if (result) return true;
        }
    }
    return false;
}

// =========================================================================
// Transaction History Table — Compact Card Style
// =========================================================================

let mcTxPollTimer = null;

function mcTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Math.floor(Date.now() / 1000 - timestamp);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(timestamp * 1000).toLocaleDateString();
}

function mcTxStatusInfo(walletStatus) {
    if (walletStatus === 3) return { text: 'Confirmed', css: 'mc-tx-success', dot: '#10b981' };
    if (walletStatus === 4) return { text: 'Failed',    css: 'mc-tx-failed',  dot: '#ef4444' };
    if (walletStatus === 2) return { text: 'Canceled',  css: 'mc-tx-cancelled', dot: '#64748b' };
    return { text: 'Pending', css: 'mc-tx-pending', dot: '#f59e0b' };
}

// Parse tx into structured data: { label, icon, team, amounts, beamSpent, tokensReceived }
function mcParseTxDetails(tx) {
    const comment = (tx.comment || '').toLowerCase();
    const amounts = tx.invoke_data?.[0]?.amounts || [];
    const isFailed = tx.status === 4 || tx.status === 2;

    // Detect team from amounts
    const chadAmount = amounts.find(a => a.asset_id === MC_CHAD_AID);
    const gigaAmount = amounts.find(a => a.asset_id === MC_GIGA_AID);
    const beamAmount = amounts.find(a => a.asset_id === 0);
    const fomoAmount = amounts.find(a => a.asset_id === 174);
    const team = chadAmount ? 'chad' : gigaAmount ? 'giga' : null;
    const tokenAmount = chadAmount || gigaAmount;
    const tokenSym = chadAmount ? 'CHAD' : gigaAmount ? 'GIGA' : null;

    let result = { label: '', sublabel: '', icon: '', team: null, amountMain: '', amountSub: '' };

    // Buy (trade_for_team)
    if (comment.includes('trade_for_team') || comment.includes('buy') ||
        (beamAmount && beamAmount.amount > 0 && tokenAmount && tokenAmount.amount < 0)) {
        result.label = `Buy $${tokenSym || 'Tokens'}`;
        result.icon = '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z"/></svg>';
        result.team = team;
        if (!isFailed && tokenAmount) {
            result.amountMain = `+${mcFormatAmount(Math.abs(tokenAmount.amount))} ${tokenSym}`;
        }
        if (beamAmount) {
            result.amountSub = `-${mcFormatAmount(Math.abs(beamAmount.amount))} BEAM`;
        }
        if (isFailed) { result.amountMain = ''; result.amountSub = beamAmount ? `${mcFormatAmount(Math.abs(beamAmount.amount))} BEAM` : ''; }
        return result;
    }

    // Deposit
    if (comment.includes('deposit')) {
        result.label = `Deposit to ${tokenSym || 'Treasury'}`;
        result.icon = '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M3 10a7 7 0 1114 0 7 7 0 01-14 0zm8-3a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/></svg>';
        result.team = team;
        if (tokenAmount) result.amountMain = `${mcFormatAmount(Math.abs(tokenAmount.amount))} ${tokenSym}`;
        return result;
    }

    // Checkpoint
    if (comment.includes('checkpoint')) {
        result.label = 'Run Checkpoint';
        result.icon = '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z"/></svg>';
        if (beamAmount && beamAmount.amount < 0) result.amountMain = `+${mcFormatAmount(Math.abs(beamAmount.amount))} BEAM`;
        return result;
    }

    // Start Round
    if (comment.includes('start_round')) {
        result.label = 'Start Round';
        result.icon = '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>';
        return result;
    }

    // Withdraw
    if (comment.includes('withdraw')) {
        result.label = 'Withdraw';
        result.icon = '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M3 10a7 7 0 1114 0 7 7 0 01-14 0zm8 1V7a1 1 0 10-2 0v4a1 1 0 001 1h3a1 1 0 100-2h-2z" clip-rule="evenodd"/></svg>';
        let parts = [];
        amounts.forEach(a => {
            if (a.amount < 0) {
                let sym = a.asset_id === 0 ? 'BEAM' : a.asset_id === MC_CHAD_AID ? 'CHAD' : a.asset_id === MC_GIGA_AID ? 'GIGA' : a.asset_id === 174 ? 'FOMO' : `#${a.asset_id}`;
                parts.push(`+${mcFormatAmount(Math.abs(a.amount))} ${sym}`);
            }
        });
        result.amountMain = parts[0] || '';
        result.amountSub = parts.slice(1).join(', ');
        return result;
    }

    // Admin actions
    if (comment.includes('update_settings')) { result.label = 'Update Settings'; result.icon = '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>'; return result; }
    if (comment.includes('force_end'))       { result.label = 'Force End Round'; result.icon = '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>'; return result; }
    if (comment.includes('emergency'))       { result.label = 'Emergency Withdraw'; result.icon = '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>'; return result; }

    // Fallback: infer from amounts
    if (beamAmount && beamAmount.amount > 0 && tokenAmount && tokenAmount.amount < 0) {
        result.label = `Buy $${tokenSym}`;
        result.team = team;
        if (!isFailed) result.amountMain = `+${mcFormatAmount(Math.abs(tokenAmount.amount))} ${tokenSym}`;
        result.amountSub = `-${mcFormatAmount(Math.abs(beamAmount.amount))} BEAM`;
        if (isFailed) { result.amountMain = ''; }
        return result;
    }
    if (amounts.some(a => a.amount < 0) && !beamAmount) {
        result.label = 'Withdraw';
        amounts.forEach(a => { if (a.amount < 0) { let s = a.asset_id === 0 ? 'BEAM' : a.asset_id === MC_CHAD_AID ? 'CHAD' : a.asset_id === MC_GIGA_AID ? 'GIGA' : `#${a.asset_id}`; result.amountMain = `+${mcFormatAmount(Math.abs(a.amount))} ${s}`; } });
        return result;
    }

    // Generic
    if (amounts.length > 0) {
        result.label = 'Contract Call';
        const a = amounts[0];
        let sym = a.asset_id === 0 ? 'BEAM' : a.asset_id === MC_CHAD_AID ? 'CHAD' : a.asset_id === MC_GIGA_AID ? 'GIGA' : `#${a.asset_id}`;
        result.amountMain = `${mcFormatAmount(Math.abs(a.amount))} ${sym}`;
    } else {
        result.label = 'Contract Call';
    }
    return result;
}

function mcRenderTxSection() {
    return `
        <div class="mc-tx-section">
            <div class="mc-section-title">Recent Transactions</div>
            <div id="mc-tx-table"><div class="mc-tx-empty">Loading transactions...</div></div>
        </div>
    `;
}

async function mcLoadTxTable() {
    const container = document.getElementById('mc-tx-table');
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
            container.innerHTML = '<div class="mc-tx-empty">Could not load transactions</div>';
            return;
        }

        // Filter for MemeClash contract txs
        const mcTxs = data.result.filter(tx =>
            tx.invoke_data && tx.invoke_data.some(d =>
                d.contract_id === MEMECLASH_CID
            )
        );

        if (mcTxs.length === 0) {
            container.innerHTML = '<div class="mc-tx-empty">No MemeClash transactions yet</div>';
            return;
        }

        // Auto-poll while any pending
        const hasPending = mcTxs.some(tx => tx.status <= 1 || tx.status >= 5);
        if (hasPending) mcStartTxPolling();
        else mcStopTxPolling();

        container.innerHTML = '';
        mcTxs.slice(0, 15).forEach(tx => {
            const status = mcTxStatusInfo(tx.status);
            const details = mcParseTxDetails(tx);
            const timeAgo = mcTimeAgo(tx.create_time);
            const txId = tx.txId || '';
            const isFailed = tx.status === 4;

            // Team color class for the icon
            const teamCls = details.team === 'chad' ? 'mc-tx-team-chad' : details.team === 'giga' ? 'mc-tx-team-giga' : '';

            const row = document.createElement('div');
            row.className = `mc-tx-row ${status.css}`;
            row.innerHTML = `
                <div class="mc-tx-dot ${teamCls}" style="--dot-color: ${status.dot}">
                    ${details.icon || '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M10 2a8 8 0 100 16 8 8 0 000-16z"/></svg>'}
                </div>
                <div class="mc-tx-info">
                    <div class="mc-tx-label">${details.label}${isFailed ? ' <span class="mc-tx-fail-tag">Failed</span>' : ''}</div>
                    <div class="mc-tx-meta">
                        <span>${timeAgo}</span>${txId ? `<span class="mc-tx-id" title="Click to copy TX ID" onclick="event.stopPropagation();navigator.clipboard.writeText('${txId}');mcToast('TX ID copied')">${txId.slice(0, 6)}..${txId.slice(-4)}</span>` : ''}
                    </div>
                </div>
                <div class="mc-tx-right">
                    ${details.amountMain ? `<div class="mc-tx-amount-main ${isFailed ? 'failed' : (details.amountMain.startsWith('+') ? 'in' : 'out')}">${details.amountMain}</div>` : `<span class="mc-tx-badge ${status.css}">${status.text}</span>`}
                    ${details.amountSub ? `<div class="mc-tx-amount-sub">${details.amountSub}</div>` : ''}
                </div>
            `;
            container.appendChild(row);
        });
    } catch (e) {
        console.error('Failed to load MemeClash txs:', e);
    }
}

function mcStartTxPolling() {
    if (mcTxPollTimer) return;
    mcTxPollTimer = setInterval(() => mcLoadTxTable(), 10000);
}

function mcStopTxPolling() {
    if (mcTxPollTimer) {
        clearInterval(mcTxPollTimer);
        mcTxPollTimer = null;
    }
}

// =========================================================================
// Toast helper
// =========================================================================

function mcToast(msg) {
    if (typeof showToast === 'function') {
        showToast(msg);
    } else {
        console.log('[MemeClash]', msg);
    }
}

// =========================================================================
// Init / Cleanup
// =========================================================================

function initMemeClash() {
    mcSwapPrefilled = false;
    mcSwapInputValue = '';
    mcLoadAll().then(() => {
        // Auto-fetch quote for the prefilled amount
        const input = document.getElementById('mc-swap-amount');
        if (input && input.value) {
            mcOnSwapInput();
        }
        // Load transaction history
        mcLoadTxTable();
    });
    mcState.refreshInterval = setInterval(() => {
        mcLoadAll();
    }, 30000);
}

function cleanupMemeClash() {
    if (mcState.refreshInterval) {
        clearInterval(mcState.refreshInterval);
        mcState.refreshInterval = null;
    }
    mcStopTxPolling();
}
