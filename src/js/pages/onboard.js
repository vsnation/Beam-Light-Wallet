/**
 * Bringing coins from a public chain into BEAM.
 *
 * WHY THIS IS AN ATOMIC SWAP AND NOT A BRIDGE.
 *
 * The obvious way to move value between chains is a bridge: lock on one side,
 * mint a representation on the other. Bridges are also the single most
 * exploited component in this industry - Ronin, Wormhole, Nomad and others lost
 * billions between them - because a bridge is a pot of custodied funds guarded
 * by a multisig, a validator set, or a contract, and any of those can be taken,
 * coerced, or simply switched off with the money inside.
 *
 * BEAM already ships something with none of that: hash time-locked atomic
 * swaps. Both sides lock on their own chain, the same secret releases both, and
 * if the counterparty walks away the timelock expires and each side takes their
 * own money back. There is no pot to raid, no operator to subpoena, and nothing
 * to suspend. Writing a new bridge to sit alongside it would add the exact risk
 * the user asked to avoid.
 *
 * So the work here is not a new mechanism. It is making the existing trustless
 * one findable and usable, because on the day this was written the BEAM swap
 * board held zero offers and the chain had recorded zero completed swaps. The
 * cryptography was never the barrier.
 */

const ONBOARD_COINS = [
    { id: 'btc',  symbol: 'BTC',  name: 'Bitcoin',  note: 'The deepest market. Most people arriving hold this.' },
    { id: 'eth',  symbol: 'ETH',  name: 'Ethereum', note: 'Also carries USDT, DAI and WBTC on the same connection.' },
    { id: 'usdt', symbol: 'USDT', name: 'Tether',   note: 'A stable value to arrive with, if you would rather not hold a moving price.' },
    { id: 'ltc',  symbol: 'LTC',  name: 'Litecoin', note: 'Cheap and fast to move, and settles quickly.' },
];

let onboardStep = 1;
let onboardCoin = null;
let onboardConnected = null;

function renderOnboard() {
    const el = document.getElementById('onboard-body');
    if (!el) return;

    if (onboardStep === 1) return renderOnboardChoose(el);
    if (onboardStep === 2) return renderOnboardTrust(el);
    if (onboardStep === 3) return renderOnboardConnect(el);
    return renderOnboardTrade(el);
}

function renderOnboardChoose(el) {
    el.innerHTML = `
        <div class="ob-intro">
            <h3>What are you holding now?</h3>
            <p>You will swap it directly with another person for BEAM. Nobody takes
               custody of it on the way — not this wallet, not an exchange, not a
               bridge.</p>
        </div>
        <div class="ob-coins">
            ${ONBOARD_COINS.map(c => `
                <button class="ob-coin" onclick="onboardPick('${c.id}')">
                    <span class="ob-coin-sym">${escapeHtml(c.symbol)}</span>
                    <span class="ob-coin-name">${escapeHtml(c.name)}</span>
                    <span class="ob-coin-note">${escapeHtml(c.note)}</span>
                </button>`).join('')}
        </div>
        <p class="ob-foot">Holding something else? BEAM can also settle against
           DOGE, DASH, BCH, QTUM, DAI and WBTC — pick the closest above and change
           the pair on the market screen.</p>`;
}

function renderOnboardTrust(el) {
    const c = ONBOARD_COINS.find(x => x.id === onboardCoin) || ONBOARD_COINS[0];
    el.innerHTML = `
        <div class="ob-intro">
            <h3>How the swap protects you</h3>
            <p>This is worth two minutes, because it is the reason you are not
               taking the risks people usually take when moving between chains.</p>
        </div>

        <div class="ob-steps">
            <div class="ob-step">
                <span class="ob-step-n">1</span>
                <div>
                    <strong>Both sides lock, nobody sends first.</strong>
                    You lock ${escapeHtml(c.symbol)} on its own chain, the other person
                    locks BEAM on this one. Neither of you has handed anything over yet.
                </div>
            </div>
            <div class="ob-step">
                <span class="ob-step-n">2</span>
                <div>
                    <strong>One secret opens both locks.</strong>
                    When they take their ${escapeHtml(c.symbol)}, they reveal a secret
                    that mathematically lets you take the BEAM. They cannot have one
                    without giving you the other.
                </div>
            </div>
            <div class="ob-step">
                <span class="ob-step-n">3</span>
                <div>
                    <strong>If they vanish, you get your money back.</strong>
                    Each lock has a deadline. If the swap does not complete, the
                    deadline passes and you reclaim what you locked. No appeal, no
                    support ticket — it is just how the contract expires.
                </div>
            </div>
        </div>

        <div class="ob-contrast">
            <div class="ob-contrast-col bad">
                <h4>What you are avoiding</h4>
                <ul>
                    <li>A bridge holding a pot of everyone's funds, which is what
                        gets drained for hundreds of millions at a time</li>
                    <li>An exchange that can freeze a withdrawal, ask for documents,
                        or fail while holding your balance</li>
                    <li>Anyone who can be ordered to stop serving you</li>
                </ul>
            </div>
            <div class="ob-contrast-col good">
                <h4>What you are accepting instead</h4>
                <ul>
                    <li>You need a counterparty who wants the opposite trade, and
                        there may not be one today</li>
                    <li>You run a ${escapeHtml(c.symbol)} connection yourself, set up on
                        the next screen</li>
                    <li>A swap takes as long as both chains need to confirm</li>
                </ul>
            </div>
        </div>

        <div class="ob-actions">
            <button class="quick-btn" onclick="onboardBack()">Back</button>
            <button class="quick-btn quick-btn-primary" onclick="onboardGo(3)">
                Set up my ${escapeHtml(c.symbol)} connection</button>
        </div>`;
}

function renderOnboardConnect(el) {
    const c = ONBOARD_COINS.find(x => x.id === onboardCoin) || ONBOARD_COINS[0];
    el.innerHTML = `
        <div class="ob-intro">
            <h3>Connect ${escapeHtml(c.name)}</h3>
            <p>A swap has to build a lock on ${escapeHtml(c.name)} as well as on BEAM,
               so this wallet needs a way to reach that chain. It uses Electrum, so
               you do not have to run a full node.</p>
        </div>

        <div class="ob-connect">
            <div class="ob-field">
                <label for="ob-password">Your wallet password</label>
                <input type="password" id="ob-password" autocomplete="current-password"
                       placeholder="Needed to write the setting into your wallet">
            </div>
            <p class="ob-note">The wallet must be locked while this is written, so it
               will lock and reopen. Nothing is sent anywhere — the setting is stored
               in your own wallet file.</p>
            <button class="quick-btn quick-btn-primary" id="ob-connect-btn"
                    onclick="onboardConnect()">Connect ${escapeHtml(c.symbol)}</button>
            <div id="ob-connect-result"></div>
        </div>

        <div class="ob-actions">
            <button class="quick-btn" onclick="onboardBack()">Back</button>
            <button class="quick-btn" onclick="onboardGo(4)">Skip — just show me the market</button>
        </div>`;
}

function renderOnboardTrade(el) {
    const c = ONBOARD_COINS.find(x => x.id === onboardCoin) || ONBOARD_COINS[0];
    el.innerHTML = `
        <div class="ob-intro">
            <h3>You are ready</h3>
            <p>The market lists offers from other people. Taking one starts the swap
               described earlier.</p>
        </div>

        <div class="ob-honest">
            <h4>One thing to expect</h4>
            <p><strong>The board is usually empty.</strong> At the time this was
               written no atomic swap had ever completed on BEAM mainnet — the
               mechanism works, but almost nobody uses it yet. If you post an offer
               you may be the first, and you may wait.</p>
            <p>That is not a fault in your wallet and not something a better screen
               can fix. An offer you post is real, anyone running BEAM can take it,
               and your funds are only committed once somebody does.</p>
        </div>

        <div class="ob-actions">
            <button class="quick-btn" onclick="onboardBack()">Back</button>
            <button class="quick-btn quick-btn-primary" onclick="onboardToMarket()">
                Open the BEAM / ${escapeHtml(c.symbol)} market</button>
        </div>`;
}

function onboardPick(id) { onboardCoin = id; onboardGo(2); }
function onboardGo(step) { onboardStep = step; renderOnboard(); updateOnboardProgress(); }
function onboardBack() { if (onboardStep > 1) onboardGo(onboardStep - 1); }

function onboardToMarket() {
    if (typeof swapMarketCoin !== 'undefined' && onboardCoin) swapMarketCoin = onboardCoin;
    showPage('swap-market');
}

function updateOnboardProgress() {
    document.querySelectorAll('.ob-progress-dot').forEach((d, i) => {
        d.classList.toggle('done', i < onboardStep - 1);
        d.classList.toggle('current', i === onboardStep - 1);
    });
}

async function onboardConnect() {
    const c = ONBOARD_COINS.find(x => x.id === onboardCoin) || ONBOARD_COINS[0];
    const pw = (document.getElementById('ob-password') || {}).value || '';
    const out = document.getElementById('ob-connect-result');
    const btn = document.getElementById('ob-connect-btn');
    if (!pw) { showToast('Enter your wallet password', 'error'); return; }

    btn.disabled = true; btn.textContent = 'Connecting...';
    try {
        const r = await fetch('/api/swap/connect', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coin: c.id, password: pw }),
        }).then(x => x.json());

        if (r.error) {
            // 'locked' is the wallet database being held open, not a wrong
            // password, and telling someone their password failed when it did
            // not is its own harm.
            out.innerHTML = errorState(
                r.error === 'locked' ? 'The wallet is in use' : 'Could not connect',
                null, { detail: r.message || r.error });
            return;
        }

        onboardConnected = true;
        out.innerHTML = `
            <div class="ob-connected">
                <strong>${escapeHtml(c.symbol)} connected.</strong>
                ${r.electrum_seed ? `
                <div class="ob-seed">
                    <p>This is the seed for the ${escapeHtml(c.name)} wallet that was just
                       created for you. It controls real ${escapeHtml(c.symbol)}. Write it
                       down now — it is shown once and cannot be recovered.</p>
                    <code>${escapeHtml(r.electrum_seed)}</code>
                </div>` : ''}
            </div>`;
        onboardGo(4);
    } catch (e) {
        out.innerHTML = errorState('Could not connect', null, { detail: e && e.message });
    } finally {
        btn.disabled = false; btn.textContent = `Connect ${c.symbol}`;
    }
}

function initOnboardPage() {
    onboardStep = 1; onboardCoin = null;
    renderOnboard(); updateOnboardProgress();
}
