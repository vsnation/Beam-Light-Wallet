/**
 * Atomic swap market — an order book over BEAM's native cross-chain swaps.
 *
 * These are real atomic swaps, not a custodial exchange and not an escrow: both
 * sides lock funds in a hash time-locked contract on their own chain, and the
 * secret that releases one releases the other. Nobody can take the money and
 * run. If a counterparty walks away, the timelock expires and both sides refund
 * themselves.
 *
 * SUPPORTED COINS ARE NOT A UI CHOICE. BEAM ships bridges for exactly seven
 * coin families (wallet/transactions/swaps/bridges/): bitcoin, bitcoin_cash,
 * dash, dogecoin, ethereum, litecoin, qtum — plus the ERC-20s DAI, USDT and
 * WBTC riding on the ethereum bridge.
 *
 * Monero is absent and cannot be added here. It has no scripting, so it cannot
 * express a hash time-locked contract at all; XMR swaps need adaptor signatures
 * with MuSig and DLEQ proofs across two different curves, which is a protocol
 * implemented in C++, not a coin entry in this list. Firo is a Bitcoin fork so
 * HTLCs would work in principle, but no bridge exists and writing one is C++ in
 * the beam repository. Adding either below without that work produces a market
 * that takes orders and can never settle them.
 */

const SWAP_COINS = [
    { id: 'btc',  name: 'Bitcoin',      symbol: 'BTC',  color: '#f7931a' },
    { id: 'ltc',  name: 'Litecoin',     symbol: 'LTC',  color: '#345d9d' },
    { id: 'eth',  name: 'Ethereum',     symbol: 'ETH',  color: '#627eea' },
    { id: 'doge', name: 'Dogecoin',     symbol: 'DOGE', color: '#c2a633' },
    { id: 'dash', name: 'Dash',         symbol: 'DASH', color: '#008ce7' },
    { id: 'qtum', name: 'Qtum',         symbol: 'QTUM', color: '#2e9ad0' },
    { id: 'bch',  name: 'Bitcoin Cash', symbol: 'BCH',  color: '#8dc351' },
    { id: 'usdt', name: 'Tether',       symbol: 'USDT', color: '#26a17b' },
    { id: 'dai',  name: 'Dai',          symbol: 'DAI',  color: '#f5ac37' },
    { id: 'wbtc', name: 'Wrapped BTC',  symbol: 'WBTC', color: '#f09242' },
];

let swapMarketCoin = 'btc';
let swapBook = { bids: [], asks: [] };
let swapMyOffers = [];
let swapBoardError = null;
let swapSupported = null;      // null until probed
let swapTxInFlight = false;

function swapCoinById(id) {
    return SWAP_COINS.find(c => c.id === id) || SWAP_COINS[0];
}

/**
 * Amounts arrive as decimal strings already scaled to the coin's own units.
 * Number is fine for display and sorting; never feed one back into an RPC call,
 * because 18-decimal values exceed what a double represents exactly.
 */
function swapParseAmount(value) {
    const n = Number(String(value == null ? '0' : value).replace(/[^0-9.eE+-]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

/**
 * Turn one offer into an order-book row.
 *
 * An offer states "I send X, I receive Y". Whichever side is BEAM decides
 * whether it reads as a bid or an ask to someone looking to trade BEAM, and the
 * price is always quoted as coin-per-BEAM so both halves of the book sort on one
 * axis. Returns null for anything that is not a BEAM/<coin> pair, or that would
 * divide by zero.
 */
function swapNormaliseOffer(offer, coinSymbol) {
    const sendCur = String(offer.send_currency || '').toUpperCase();
    const recvCur = String(offer.receive_currency || '').toUpperCase();
    const sendAmt = swapParseAmount(offer.send_amount);
    const recvAmt = swapParseAmount(offer.receive_amount);
    if (sendAmt <= 0 || recvAmt <= 0) return null;

    const wanted = String(coinSymbol).toUpperCase();
    let side, price, beamAmount, coinAmount;

    if (sendCur === 'BEAM' && recvCur === wanted) {
        // They give BEAM, they want the coin: BEAM is for sale.
        side = 'ask';
        beamAmount = sendAmt;
        coinAmount = recvAmt;
    } else if (sendCur === wanted && recvCur === 'BEAM') {
        // They give the coin, they want BEAM: they are bidding for BEAM.
        side = 'bid';
        beamAmount = recvAmt;
        coinAmount = sendAmt;
    } else {
        return null;
    }
    price = coinAmount / beamAmount;

    return {
        id: offer.id,
        token: offer.token || '',
        side,
        price,
        beamAmount,
        coinAmount,
        isMine: !!offer.is_my_offer,
        status: offer.status,
        statusText: offer.status_string || '',
        comment: offer.comment || '',
        expiresAt: offer.height_expired || offer.offer_expires || null,
        createdAt: offer.time_created || null,
    };
}

/**
 * Ask wallet-api whether it can do swaps at all.
 *
 * The binary shipped in v1.2.0 and v1.2.1 was built without
 * BEAM_ATOMIC_SWAP_SUPPORT, so every swap method answers "Procedure not found".
 * Probing once and saying so plainly beats ten identical errors and a market
 * that looks broken rather than absent.
 */
async function probeSwapSupport() {
    if (swapSupported !== null) return swapSupported;
    try {
        // quiet: a missing method here is an expected answer, not a fault, and
        // logging it as an error makes a supported build look broken.
        await apiCall('swap_offers_board', {}, { quiet: true });
        swapSupported = true;
    } catch (e) {
        const msg = String(e && e.message || e);
        swapSupported = !/Procedure not found|-32601/.test(msg);
        if (!swapSupported) console.log('[swap] wallet-api has no atomic swap support');
    }
    return swapSupported;
}

async function loadSwapMarket() {
    const coin = swapCoinById(swapMarketCoin);
    swapBoardError = null;

    if (!(await probeSwapSupport())) {
        renderSwapMarket();
        return;
    }

    try {
        const [board, mine] = await Promise.all([
            apiCall('swap_offers_board', {}),
            apiCall('swap_offers_list', {}).catch(() => []),
        ]);

        const rows = (Array.isArray(board) ? board : [])
            .map(o => swapNormaliseOffer(o, coin.symbol))
            .filter(Boolean);

        // Best price first on each side: a bidder wants the highest bid shown
        // at the top, a seller the lowest ask.
        swapBook = {
            bids: rows.filter(r => r.side === 'bid').sort((a, b) => b.price - a.price),
            asks: rows.filter(r => r.side === 'ask').sort((a, b) => a.price - b.price),
        };

        swapMyOffers = (Array.isArray(mine) ? mine : [])
            .map(o => swapNormaliseOffer(o, coin.symbol))
            .filter(Boolean);
    } catch (e) {
        swapBoardError = e && e.message ? e.message : String(e);
        swapBook = { bids: [], asks: [] };
    }
    renderSwapMarket();
}

function swapFmtPrice(p) {
    if (!Number.isFinite(p) || p <= 0) return '—';
    if (p >= 1) return p.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return p.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
}

function swapFmtAmount(a) {
    if (!Number.isFinite(a)) return '—';
    return a >= 1 ? a.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : a.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

function renderSwapBookSide(rows, side, coin) {
    if (!rows.length) {
        return `<div class="swap-book-empty">No ${side === 'bid' ? 'bids' : 'asks'}</div>`;
    }
    const max = Math.max(...rows.map(r => r.beamAmount)) || 1;
    return rows.slice(0, 15).map(r => {
        const depth = Math.max(2, Math.round((r.beamAmount / max) * 100));
        return `
        <div class="swap-row ${side}${r.isMine ? ' mine' : ''}"
             ${r.isMine ? '' : `onclick="takeSwapOffer('${escapeHtml(r.token)}')"`}
             title="${r.isMine ? 'Your own offer' : 'Click to take this offer'}">
            <span class="swap-depth" style="width:${depth}%"></span>
            <span class="swap-price">${swapFmtPrice(r.price)}</span>
            <span class="swap-size">${swapFmtAmount(r.beamAmount)}</span>
            <span class="swap-total">${swapFmtAmount(r.coinAmount)}</span>
        </div>`;
    }).join('');
}

function renderSwapMarket() {
    const el = document.getElementById('swap-market-body');
    if (!el) return;
    const coin = swapCoinById(swapMarketCoin);

    if (swapSupported === false) {
        el.innerHTML = `
            <div class="swap-unavailable">
                <h3>Atomic swaps are not available in this build</h3>
                <p>The bundled <code>wallet-api</code> was compiled without atomic swap
                   support, so the offer board cannot be reached. This is a packaging
                   problem, not a network one — the swaps themselves work fine.</p>
                <p class="swap-note">Rebuild <code>wallet-api</code> with
                   <code>-DBEAM_ATOMIC_SWAP_SUPPORT=ON</code>, or install a release that
                   ships a swap-enabled binary.</p>
            </div>`;
        return;
    }

    if (swapBoardError) {
        el.innerHTML = errorState('Could not load the offer board', 'loadSwapMarket()',
                                  { detail: swapBoardError });
        return;
    }

    const totalOffers = swapBook.bids.length + swapBook.asks.length;
    const spread = (swapBook.bids[0] && swapBook.asks[0])
        ? swapBook.asks[0].price - swapBook.bids[0].price
        : null;

    el.innerHTML = `
        <div class="swap-book">
            <div class="swap-book-head">
                <span>Price <em>${escapeHtml(coin.symbol)}/BEAM</em></span>
                <span>Size <em>BEAM</em></span>
                <span>Total <em>${escapeHtml(coin.symbol)}</em></span>
            </div>
            <div class="swap-book-side asks">${renderSwapBookSide(swapBook.asks.slice().reverse(), 'ask', coin)}</div>
            <div class="swap-spread">
                ${spread !== null
                    ? `Spread <strong>${swapFmtPrice(spread)}</strong> ${escapeHtml(coin.symbol)}`
                    : `<span class="swap-muted">No two-sided market</span>`}
            </div>
            <div class="swap-book-side bids">${renderSwapBookSide(swapBook.bids, 'bid', coin)}</div>
        </div>

        ${totalOffers === 0 ? `
        <div class="swap-empty-market">
            <h4>No open offers for BEAM/${escapeHtml(coin.symbol)}</h4>
            <p>BEAM's swap board is peer-to-peer and currently thin — at the time of
               writing no atomic swap had ever settled on mainnet. An offer you post
               here is real and anyone running a BEAM wallet can take it, but you may
               be the first, and you may wait.</p>
            <p class="swap-note">Offers expire on their own, and your funds are only
               committed once someone accepts.</p>
        </div>` : ''}

        <div class="swap-my-offers">
            <h4>My offers <span class="swap-muted">${swapMyOffers.length}</span></h4>
            ${swapMyOffers.length === 0
                ? `<div class="swap-book-empty">You have no open offers</div>`
                : swapMyOffers.map(o => `
                    <div class="swap-my-row">
                        <span class="swap-side-tag ${o.side}">${o.side === 'bid' ? 'BUY' : 'SELL'}</span>
                        <span>${swapFmtAmount(o.beamAmount)} BEAM</span>
                        <span class="swap-muted">@ ${swapFmtPrice(o.price)} ${escapeHtml(coin.symbol)}</span>
                        <span class="swap-muted">${escapeHtml(o.statusText)}</span>
                        <button class="swap-cancel" onclick="cancelSwapOffer('${escapeHtml(String(o.id))}')">Cancel</button>
                    </div>`).join('')}
        </div>`;
}

async function takeSwapOffer(token) {
    if (!token) return;
    if (swapTxInFlight) return;
    if (isWalletOutOfSync()) {
        showToast('Wallet is out of sync — taking an offer is disabled until it catches up', 'error');
        return;
    }

    // Decode before showing anything: the token carries the real terms, and the
    // board row is only a rendering of what the maker claimed.
    let decoded;
    try {
        decoded = await apiCall('swap_decode_token', { token });
    } catch (e) {
        showErrorToast(e, 'Could not read that offer');
        return;
    }

    const send = `${decoded.send_amount} ${decoded.send_currency}`;
    const recv = `${decoded.receive_amount} ${decoded.receive_currency}`;
    const ok = await Modals.confirm(
        `Accept this swap?\n\nYou send ${send}\nYou receive ${recv}\n\n` +
        `Both sides lock funds in a time-locked contract. If the other side ` +
        `never completes, your refund unlocks automatically.`);
    if (!ok) return;

    swapTxInFlight = true;
    try {
        await apiCall('swap_accept_offer', { token });
        showToast('Swap accepted — watch Transactions for progress', 'success');
        await loadSwapMarket();
    } catch (e) {
        showErrorToast(e, 'Could not accept the offer');
    } finally {
        swapTxInFlight = false;
    }
}

async function cancelSwapOffer(offerId) {
    if (!offerId || swapTxInFlight) return;
    swapTxInFlight = true;
    try {
        await apiCall('swap_cancel_offer', { offer_id: offerId });
        showToast('Offer cancelled', 'success');
        await loadSwapMarket();
    } catch (e) {
        showErrorToast(e, 'Could not cancel the offer');
    } finally {
        swapTxInFlight = false;
    }
}

function selectSwapCoin(id) {
    swapMarketCoin = id;
    const sel = document.getElementById('swap-coin-select');
    if (sel) sel.value = id;
    loadSwapMarket();
}

/**
 * Post an offer to the board.
 *
 * Amounts go to the RPC as decimal strings in each coin's own units, exactly as
 * typed. They are deliberately not routed through Number first: an 18-decimal
 * ETH amount does not survive a double intact, and a rounding error here is a
 * rounding error in a real trade.
 */
async function createSwapOffer() {
    if (swapTxInFlight) return;

    const coin = swapCoinById(swapMarketCoin);
    const side = document.querySelector('input[name="swap-side"]:checked')?.value || 'sell';
    const beamStr = (document.getElementById('swap-beam-amount')?.value || '').trim();
    const priceStr = (document.getElementById('swap-price')?.value || '').trim();

    const beamNum = Number(beamStr), priceNum = Number(priceStr);
    if (!(beamNum > 0)) { showToast('Enter how much BEAM to trade', 'error'); return; }
    if (!(priceNum > 0)) { showToast(`Enter a price in ${coin.symbol} per BEAM`, 'error'); return; }

    if (isWalletOutOfSync()) {
        showToast('Wallet is out of sync — creating an offer is disabled until it catches up', 'error');
        return;
    }

    // Selling BEAM means our BEAM is the side that gets locked, so we must
    // actually hold it plus the fee. Buying BEAM locks the other coin instead,
    // which lives in a wallet this app does not control - so that side is left
    // to wallet-api to reject, with its own error.
    const isBeamSide = side === 'sell';
    if (isBeamSide) {
        const beamAvail = (walletData.assets.find(a => a.id === 0) || {}).balance || 0;
        const needed = Math.round(beamNum * GROTH) + CONTRACT_CALL_FEE_GROTH;
        if (beamAvail < needed) {
            showToast(`Not enough BEAM. Offering ${beamStr} plus fees needs about `
                + `${formatAmount(needed)}, and ${formatAmount(beamAvail)} is available.`, 'error');
            return;
        }
    }

    const swapAmountStr = (beamNum * priceNum).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    const btn = document.getElementById('swap-create-btn');

    swapTxInFlight = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Publishing...'; }
    try {
        const created = await apiCall('swap_create_offer', {
            send_amount:      isBeamSide ? beamStr : swapAmountStr,
            send_currency:    isBeamSide ? 'beam' : coin.id,
            receive_amount:   isBeamSide ? swapAmountStr : beamStr,
            receive_currency: isBeamSide ? coin.id : 'beam',
            offer_expires:    Number(document.getElementById('swap-expiry')?.value || 15),
        });

        // Creating and publishing are separate: an unpublished offer exists only
        // locally and nobody can take it, which looks identical to a broken
        // market from the maker's side.
        if (created && created.token) {
            await apiCall('swap_publish_offer', { token: created.token });
        }
        showToast('Offer published to the board', 'success');
        const amt = document.getElementById('swap-beam-amount'); if (amt) amt.value = '';
        await loadSwapMarket();
    } catch (e) {
        showErrorToast(e, 'Could not publish the offer');
    } finally {
        swapTxInFlight = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Publish offer'; }
    }
}

/** Entry point used by the router. */
async function initSwapMarketPage() {
    const sel = document.getElementById('swap-coin-select');
    if (sel && !sel.dataset.filled) {
        sel.innerHTML = SWAP_COINS.map(c =>
            `<option value="${c.id}">BEAM / ${escapeHtml(c.symbol)}</option>`).join('');
        sel.dataset.filled = '1';
        sel.value = swapMarketCoin;
    }
    await loadSwapMarket();
    // Registered so navigating away tears it down; an orphaned poller here would
    // hit the board forever.
    startInterval('swapMarket', loadSwapMarket, 20000);
}

/**
 * Live total under the amount and price fields.
 *
 * A price quoted per-BEAM is easy to misread by a factor of a thousand, and an
 * atomic swap cannot be undone once both sides lock. Showing the resulting
 * two-sided amounts as they type is the cheapest way to catch that before it
 * becomes a trade.
 */
function updateSwapTotal() {
    const line = document.getElementById('swap-total-line');
    if (!line) return;
    const coin = swapCoinById(swapMarketCoin);
    const side = document.querySelector('input[name="swap-side"]:checked')?.value || 'sell';
    const beam = Number((document.getElementById('swap-beam-amount')?.value || '').trim());
    const price = Number((document.getElementById('swap-price')?.value || '').trim());

    const label = document.getElementById('swap-price-label');
    if (label) label.textContent = `Price per BEAM (${coin.symbol})`;

    if (!(beam > 0) || !(price > 0)) {
        line.textContent = 'Enter an amount and a price.';
        return;
    }
    const total = beam * price;
    line.innerHTML = side === 'sell'
        ? `You lock <strong>${swapFmtAmount(beam)} BEAM</strong> and receive
           <strong>${swapFmtAmount(total)} ${escapeHtml(coin.symbol)}</strong>.`
        : `You lock <strong>${swapFmtAmount(total)} ${escapeHtml(coin.symbol)}</strong> and receive
           <strong>${swapFmtAmount(beam)} BEAM</strong>.`;
}
