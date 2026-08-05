// =============================================================================
// MemeClash v8 - Meme Battle Game for BEAM Blockchain
// =============================================================================
// Contract shader (validator-side): all battle logic
//
// Core flow (same as Stadium Finance on ETH/BSC):
//   1. Users buy $CHAD/$GIGA on DEX — pool liquidity changes
//   2. Start reserves stored in Round at creation (immutable)
//   3. Checkpoint: end reserves passed by caller, winner = pool growth
//   4. CallFar to DEX: sell loser treasury → BEAM → buy winner tokens → BlackHole
//   5. Fee: 5% BEAM to caller, 10% BEAM buys FOMO (50% burn/50% admin), 85% buys winner → BlackHole
//   6. Both treasuries burned via BlackHole every round (Stadium behavior)
//   7. Next round starts automatically with current reserves, zero treasuries
//
// v8 changes: Burn BOTH treasuries every round (Stadium behavior).
// Winner treasury + DEX-purchased tokens all go to BlackHole. Draw burns both directly.
// No carryover — next round always starts with zero treasuries.
//
// Methods:
//   0  Ctor              - Initialize contract
//   1  Dtor              - Destroy contract (admin)
//   2  Upgrade           - Upgrade contract (admin)
//   3  DepositTokens     - Deposit $CHAD/$GIGA to battle treasury
//   4  Reserved          - (was SubmitSnapshot, removed in v7)
//   5  RunCheckpoint     - Resolve round via DEX swap (permissionless)
//   6  Withdraw          - Withdraw payout balance
//   7  StartRound        - Start new round (with DEX reserves)
//   8  UpdateSettings    - Admin settings
//   9  WithdrawFees      - Admin withdraw FOMO buyback BEAM
//  10  EmergencyWithdraw - Admin emergency
//  11  ForceEndRound     - Admin force-end round
//  12  TradeForTeam      - User buys team tokens (5% fee)
// =============================================================================

#include "common.h"
#include "Math.h"
#include "contract.h"

namespace MemeClash {

// =========================================================================
// State management
// =========================================================================
struct MyState
    :public State
{
    MyState() {
        Env::LoadVar_T((uint8_t) s_Key, *this);
    }

    MyState(bool) {
        // no auto-load
    }

    void Save() {
        Env::SaveVar_T((uint8_t) s_Key, *this);
    }

    void AddSigAdmin() {
        Env::AddSig(m_Config.m_pkAdmin);
    }
};

// =========================================================================
// Payout management
// =========================================================================

// Credit to payout balance (funds already locked in contract)
__attribute__((always_inline)) void PayoutCredit(const PubKey& pkUser, Amount amount, AssetID aid)
{
    if (!amount)
        return;

    Payout::Key pk;
    _POD_(pk.m_pkUser) = pkUser;
    pk.m_Aid = aid;

    Payout po;
    if (Env::LoadVar_T(pk, po))
        Strict::Add(po.m_Amount, amount);
    else
        po.m_Amount = amount;

    Env::SaveVar_T(pk, po);
}

// Withdraw from payout balance
__attribute__((always_inline)) void PayoutWithdraw(const PubKey& pkUser, Amount amount, AssetID aid)
{
    if (!amount)
        return;

    Payout::Key pk;
    _POD_(pk.m_pkUser) = pkUser;
    pk.m_Aid = aid;

    Payout po;
    Env::Halt_if(!Env::LoadVar_T(pk, po));
    Env::Halt_if(amount > po.m_Amount);

    Strict::Sub(po.m_Amount, amount);

    if (po.m_Amount)
        Env::SaveVar_T(pk, po);
    else
        Env::DelVar_T(pk);

    Env::FundsUnlock(aid, amount);
}

// =========================================================================
// Round helpers
// =========================================================================
__attribute__((always_inline)) void CreateRound(State& s, Height h,
    Amount startRes0, Amount startRes1)
{
    uint32_t roundId = ++s.m_CurrentRound;

    Round r;
    _POD_(r).SetZero();
    r.m_StartHeight = h;
    r.m_EndHeight = h + s.m_RoundDuration;
    r.m_Winner = WINNER_NONE;
    r.m_Status = ROUND_ACTIVE;
    r.m_StartBeamReserve0 = startRes0;
    r.m_StartBeamReserve1 = startRes1;

    Round::Key rk;
    rk.m_RoundId = roundId;
    Env::SaveVar_T(rk, r);
}

// =========================================================================
// Method 0: Ctor - Initialize contract
// =========================================================================
BEAM_EXPORT void Ctor(const Method::Init& r)
{
    State s;
    _POD_(s).SetZero();
    _POD_(s.m_Config) = r.m_Config;

    s.m_Token0 = r.m_Token0;
    s.m_Token1 = r.m_Token1;
    s.m_FomoAssetId = r.m_FomoAssetId;
    _POD_(s.m_DexCid) = r.m_DexCid;
    _POD_(s.m_BlackHoleCid) = r.m_BlackHoleCid;
    s.m_PoolKind = r.m_PoolKind;

    s.m_RoundDuration = r.m_RoundDuration;
    if (!s.m_RoundDuration)
        s.m_RoundDuration = DEFAULT_ROUND_DURATION;

    // Default fee split: 85/5/10
    s.m_CheckpointFeeBps = CHECKPOINT_FEE_BPS;
    s.m_FomoBuybackBps = FOMO_BUYBACK_BPS;
    s.m_BurnBps = BURN_BPS;

    // v4: Trade fee
    s.m_TradeFeeBps = r.m_TradeFeeBps;
    if (!s.m_TradeFeeBps)
        s.m_TradeFeeBps = DEFAULT_TRADE_FEE_BPS;

    s.m_TotalTradeVolume = 0;
    s.m_TotalTradeFees0 = 0;
    s.m_TotalTradeFees1 = 0;

    s.m_CurrentRound = 0;

    uint8_t key = Tags::s_State;
    Env::SaveVar_T(key, s);

    // Create round 1 with initial reserves from deployer
    Height h = Env::get_Height();
    CreateRound(s, h, r.m_StartBeamReserve0, r.m_StartBeamReserve1);
    Env::SaveVar_T(key, s);
}

// =========================================================================
// Method 1: Dtor
// =========================================================================
BEAM_EXPORT void Dtor(void*)
{
    MyState s;
    s.AddSigAdmin();
    Env::DelVar_T((uint8_t) Tags::s_State);
}

// =========================================================================
// Method 2: Upgrade
// =========================================================================
BEAM_EXPORT void Method_2(void*)
{
    MyState s;
    s.AddSigAdmin();
}

// =========================================================================
// Method 3: DepositTokens - Anyone deposits $CHAD or $GIGA to treasury
// Pre-seeded by admin at launch; community can top up any time.
// =========================================================================
BEAM_EXPORT void Method_3(const Method::DepositTokens& r)
{
    Env::Halt_if(r.m_Team >= NUM_TEAMS);
    Env::Halt_if(!r.m_Amount);

    MyState s;

    // Load current round
    Round::Key rk;
    rk.m_RoundId = s.m_CurrentRound;
    Round round;
    Env::Halt_if(!Env::LoadVar_T(rk, round));
    Env::Halt_if(round.m_Status == ROUND_FINALIZED);

    // Lock tokens into contract
    AssetID aid = (r.m_Team == 0) ? s.m_Token0 : s.m_Token1;
    Env::FundsLock(aid, r.m_Amount);

    // Add to treasury
    if (r.m_Team == 0)
        Strict::Add(round.m_Treasury0, r.m_Amount);
    else
        Strict::Add(round.m_Treasury1, r.m_Amount);

    Env::SaveVar_T(rk, round);
}

// =========================================================================
// Method 4: Reserved (was SubmitSnapshot, removed in v7)
// =========================================================================
BEAM_EXPORT void Method_4(const Method::Reserved4&)
{
    Env::Halt_if(true); // Removed in v7
}

// =========================================================================
// Method 5: RunCheckpoint - THE CORE
//
// v7: Single-TX checkpoint. Start reserves from Round struct (immutable,
// set at creation). End reserves passed as params by app shader (oracle,
// validated indirectly by AMM trade success — if reserves are wrong,
// pre-calculated trade amounts will fail when AMM validates them).
//
// Stadium Finance flow on BEAM:
//   1. Compare DEX pool growth → determine winner
//   2. Sell loser treasury on DEX via CallFar → get BEAM
//   3. Split BEAM: 5% caller, 10% FOMO, 85% buy winner tokens
//   4. Buy winner tokens on DEX via CallFar → burn them via BlackHole
//   5. Burn winner's existing treasury via BlackHole (Stadium: burn everything)
//   6. Draw: burn both treasuries directly via BlackHole
//   7. Next round starts with zero treasuries
// =========================================================================
BEAM_EXPORT void Method_5(const Method::RunCheckpoint& r)
{
    MyState s;

    // Load round
    Round::Key rk;
    rk.m_RoundId = r.m_RoundId;
    Round round;
    Env::Halt_if(!Env::LoadVar_T(rk, round));
    Env::Halt_if(round.m_Status == ROUND_FINALIZED);

    Height h = Env::get_Height();
    Env::Halt_if(h < round.m_EndHeight);

    // =====================================================
    // Step 1: Determine winner by DEX pool BEAM growth
    // Start reserves from Round (immutable), end from params
    // =====================================================
    Amount startRes0 = round.m_StartBeamReserve0;
    Amount startRes1 = round.m_StartBeamReserve1;
    Amount endRes0 = r.m_EndBeamReserve0;
    Amount endRes1 = r.m_EndBeamReserve1;

    Amount growth0 = 0;
    Amount growth1 = 0;
    uint8_t shrunk0 = 0;
    uint8_t shrunk1 = 0;

    if (endRes0 >= startRes0)
        growth0 = endRes0 - startRes0;
    else
        shrunk0 = 1;

    if (endRes1 >= startRes1)
        growth1 = endRes1 - startRes1;
    else
        shrunk1 = 1;

    uint8_t winner;
    if (shrunk0 && !shrunk1)
        winner = WINNER_GIGA;
    else if (!shrunk0 && shrunk1)
        winner = WINNER_CHAD;
    else if (shrunk0 && shrunk1)
        winner = WINNER_DRAW;
    else if (growth0 > growth1)
        winner = WINNER_CHAD;
    else if (growth1 > growth0)
        winner = WINNER_GIGA;
    else
        winner = WINNER_DRAW;

    round.m_Winner = winner;

    // =====================================================
    // Step 2: Execute DEX swaps and burns
    // Winner: sell loser → BEAM → buy winner → burn + burn winner treasury
    // Draw: burn both treasuries directly via BlackHole
    // =====================================================
    Amount loserTreasury = 0;
    AssetID loserToken = 0;
    AssetID winnerToken = 0;

    if (winner == WINNER_CHAD)
    {
        loserTreasury = round.m_Treasury1;
        loserToken = s.m_Token1;
        winnerToken = s.m_Token0;
    }
    else if (winner == WINNER_GIGA)
    {
        loserTreasury = round.m_Treasury0;
        loserToken = s.m_Token0;
        winnerToken = s.m_Token1;
    }

    Amount beamReceived = 0;
    Amount winnerBurned = 0;
    Amount callerFee = 0;
    Amount fomoBuyback = 0;
    Amount fomoBought = 0;

    if (loserTreasury > 0 && winner != WINNER_DRAW)
    {
        // ----------------------------------------------------------
        // Trade 1: Sell loser tokens for BEAM via CallFar to AMM
        // ----------------------------------------------------------

        beamReceived = r.m_BeamFromLoser;
        Env::Halt_if(!beamReceived);

        // Release loser tokens from contract (available for AMM to take)
        Env::FundsUnlock(loserToken, loserTreasury);

        // CallFar AMM Trade: buy BEAM (aid1=0) by selling loserToken (aid2)
        AmmTrade trade1;
        trade1.m_Pid.m_Aid1 = 0;           // BEAM
        trade1.m_Pid.m_Aid2 = loserToken;
        trade1.m_Pid.m_Kind = s.m_PoolKind;
        trade1.m_Buy1 = beamReceived;       // How much BEAM to buy

        Env::CallFar_T(s.m_DexCid, trade1);

        // ----------------------------------------------------------
        // Fee split: 5% caller, 10% FOMO, 85% burn
        // ----------------------------------------------------------
        callerFee = (beamReceived * s.m_CheckpointFeeBps) / MAX_BPS;
        fomoBuyback = (beamReceived * s.m_FomoBuybackBps) / MAX_BPS;
        Amount burnBeam = beamReceived - callerFee - fomoBuyback;

        // Lock caller fee into contract (for payout withdrawal)
        if (callerFee > 0)
            Env::FundsLock(0, callerFee); // BEAM

        // Credit caller fee to payout balance
        PayoutCredit(r.m_pkCaller, callerFee, 0); // 0 = BEAM

        // ----------------------------------------------------------
        // Trade 2: Buy winner tokens with BEAM → send to BlackHole
        // ----------------------------------------------------------
        if (burnBeam > 0 && r.m_WinnerToBurn > 0)
        {
            winnerBurned = r.m_WinnerToBurn;

            AmmTrade trade2;
            trade2.m_Pid.m_Aid1 = winnerToken;
            trade2.m_Pid.m_Aid2 = 0;           // BEAM
            trade2.m_Pid.m_Kind = s.m_PoolKind;
            trade2.m_Buy1 = winnerBurned;

            Env::CallFar_T(s.m_DexCid, trade2);

            // Send winner tokens to BlackHole — permanent provable burn
            BlackHoleDeposit bhBurn;
            bhBurn.m_Aid = winnerToken;
            bhBurn.m_Amount = winnerBurned;
            Env::CallFar_T(s.m_BlackHoleCid, bhBurn);
        }

        // ----------------------------------------------------------
        // Stadium behavior: also burn winner's existing treasury via BlackHole
        // ----------------------------------------------------------
        Amount winnerTreasury = (winner == WINNER_CHAD) ? round.m_Treasury0 : round.m_Treasury1;
        if (winnerTreasury > 0)
        {
            Env::FundsUnlock(winnerToken, winnerTreasury);
            BlackHoleDeposit bhWinTreas;
            bhWinTreas.m_Aid = winnerToken;
            bhWinTreas.m_Amount = winnerTreasury;
            Env::CallFar_T(s.m_BlackHoleCid, bhWinTreas);
        }

        // Total winner burned = DEX purchased + existing treasury
        winnerBurned += winnerTreasury;

        // ----------------------------------------------------------
        // Trade 3: Buy FOMO with 10% BEAM → 50% burn, 50% admin fees
        // ----------------------------------------------------------
        if (fomoBuyback > 0 && r.m_FomoToBurn > 0)
        {
            fomoBought = r.m_FomoToBurn;

            // Buy FOMO on DEX: FOMO is aid1 (>0), BEAM is aid2 (0)
            AmmTrade trade3;
            trade3.m_Pid.m_Aid1 = s.m_FomoAssetId;
            trade3.m_Pid.m_Aid2 = 0;           // BEAM
            trade3.m_Pid.m_Kind = s.m_PoolKind;
            trade3.m_Buy1 = fomoBought;

            Env::CallFar_T(s.m_DexCid, trade3);

            // Split FOMO 50/50: burn + admin
            Amount fomoBurn = fomoBought / 2;
            Amount fomoAdmin = fomoBought - fomoBurn;

            // 50% → BlackHole (permanent provable burn)
            if (fomoBurn > 0)
            {
                BlackHoleDeposit bhFomo;
                bhFomo.m_Aid = s.m_FomoAssetId;
                bhFomo.m_Amount = fomoBurn;
                Env::CallFar_T(s.m_BlackHoleCid, bhFomo);
            }

            // 50% → admin fees (withdrawable via Method 9)
            if (fomoAdmin > 0)
            {
                Env::FundsLock(s.m_FomoAssetId, fomoAdmin);
                Strict::Add(s.m_OwnerFees, fomoAdmin);
            }

            Strict::Add(s.m_TotalFomoBurned, fomoBurn);
        }

        Strict::Add(s.m_TotalFomoBuyback, fomoBuyback);

        // Update burn stats (includes loser sold + winner purchased + winner treasury)
        if (winner == WINNER_CHAD)
        {
            Strict::Add(s.m_TotalBurned1, loserTreasury);  // GIGA sold on DEX
            Strict::Add(s.m_TotalBurned0, winnerBurned);   // CHAD bought+burned + treasury
        }
        else
        {
            Strict::Add(s.m_TotalBurned0, loserTreasury);  // CHAD sold on DEX
            Strict::Add(s.m_TotalBurned1, winnerBurned);   // GIGA bought+burned + treasury
        }
    }

    // =====================================================
    // Draw case: burn both treasuries directly via BlackHole
    // (no DEX trade needed, just send locked tokens to BlackHole)
    // =====================================================
    if (winner == WINNER_DRAW)
    {
        if (round.m_Treasury0 > 0)
        {
            Env::FundsUnlock(s.m_Token0, round.m_Treasury0);
            BlackHoleDeposit bh0;
            bh0.m_Aid = s.m_Token0;
            bh0.m_Amount = round.m_Treasury0;
            Env::CallFar_T(s.m_BlackHoleCid, bh0);
            Strict::Add(s.m_TotalBurned0, round.m_Treasury0);
        }
        if (round.m_Treasury1 > 0)
        {
            Env::FundsUnlock(s.m_Token1, round.m_Treasury1);
            BlackHoleDeposit bh1;
            bh1.m_Aid = s.m_Token1;
            bh1.m_Amount = round.m_Treasury1;
            Env::CallFar_T(s.m_BlackHoleCid, bh1);
            Strict::Add(s.m_TotalBurned1, round.m_Treasury1);
        }
    }

    // Verify caller signature
    Env::AddSig(r.m_pkCaller);

    // =====================================================
    // Step 3: Save round results
    // =====================================================
    round.m_LoserSold = loserTreasury;
    round.m_BeamReceived = beamReceived;
    round.m_WinnerBurned = winnerBurned;
    round.m_CallerFee = callerFee;
    round.m_FomoBuyback = fomoBuyback;
    round.m_FomoBurned = (fomoBought > 0) ? (fomoBought / 2) : 0;
    round.m_Status = ROUND_FINALIZED;

    if (winner == WINNER_CHAD)
        s.m_ChadWins++;
    else if (winner == WINNER_GIGA)
        s.m_GigaWins++;
    else
        s.m_Draws++;

    s.m_TotalRounds++;
    Env::SaveVar_T(rk, round);

    // =====================================================
    // Step 4: Create next round — no carryover (Stadium behavior)
    // Both treasuries burned, next round starts at zero
    // =====================================================
    CreateRound(s, h, r.m_EndBeamReserve0, r.m_EndBeamReserve1);

    s.Save();
}

// =========================================================================
// Method 6: Withdraw
// =========================================================================
BEAM_EXPORT void Method_6(const Method::Withdraw& r)
{
    Env::Halt_if(!r.m_Amount);
    PayoutWithdraw(r.m_pkUser, r.m_Amount, r.m_Aid);
    Env::AddSig(r.m_pkUser);
}

// =========================================================================
// Method 7: StartRound - Start new round if none active
// v7: Accepts DEX reserves from app shader
// =========================================================================
BEAM_EXPORT void Method_7(const Method::StartRound& r)
{
    MyState s;

    if (s.m_CurrentRound > 0)
    {
        Round::Key rk;
        rk.m_RoundId = s.m_CurrentRound;
        Round round;
        if (Env::LoadVar_T(rk, round))
            Env::Halt_if(round.m_Status != ROUND_FINALIZED);
    }

    Height h = Env::get_Height();
    CreateRound(s, h, r.m_StartBeamReserve0, r.m_StartBeamReserve1);
    s.Save();
}

// =========================================================================
// Method 8: UpdateSettings
// =========================================================================
BEAM_EXPORT void Method_8(const Method::UpdateSettings& r)
{
    MyState s;
    s.AddSigAdmin();

    if (r.m_RoundDuration)
        s.m_RoundDuration = r.m_RoundDuration;

    uint32_t cp = r.m_CheckpointFeeBps ? r.m_CheckpointFeeBps : s.m_CheckpointFeeBps;
    uint32_t fb = r.m_FomoBuybackBps ? r.m_FomoBuybackBps : s.m_FomoBuybackBps;
    uint32_t bn = r.m_BurnBps ? r.m_BurnBps : s.m_BurnBps;

    Env::Halt_if(cp + fb + bn != MAX_BPS);

    s.m_CheckpointFeeBps = cp;
    s.m_FomoBuybackBps = fb;
    s.m_BurnBps = bn;

    if (r.m_TradeFeeBps)
        s.m_TradeFeeBps = r.m_TradeFeeBps;

    s.Save();
}

// =========================================================================
// Method 9: WithdrawFees - Admin withdraws accumulated FOMO tokens
// (FOMO is auto-bought on DEX during checkpoint, accumulated here)
// =========================================================================
BEAM_EXPORT void Method_9(const Method::WithdrawFees& r)
{
    MyState s;
    s.AddSigAdmin();
    Env::Halt_if(!r.m_Amount);
    Env::Halt_if(r.m_Amount > s.m_OwnerFees);
    Strict::Sub(s.m_OwnerFees, r.m_Amount);
    s.Save();
    Env::FundsUnlock(s.m_FomoAssetId, r.m_Amount);
}

// =========================================================================
// Method 10: EmergencyWithdraw
// =========================================================================
BEAM_EXPORT void Method_10(const Method::EmergencyWithdraw& r)
{
    MyState s;
    s.AddSigAdmin();
    Env::Halt_if(!r.m_Amount);
    Env::FundsUnlock(r.m_AssetId, r.m_Amount);
}

// =========================================================================
// Method 11: ForceEndRound - Admin force-ends a round (testing)
// Sets the round's end height to current height so checkpoint can run
// =========================================================================
BEAM_EXPORT void Method_11(const Method::ForceEndRound& r)
{
    MyState s;
    s.AddSigAdmin();

    Round::Key rk;
    rk.m_RoundId = r.m_RoundId;
    Round round;
    Env::Halt_if(!Env::LoadVar_T(rk, round));
    Env::Halt_if(round.m_Status == ROUND_FINALIZED);

    Height h = Env::get_Height();
    round.m_EndHeight = h;
    Env::SaveVar_T(rk, round);
}

// =========================================================================
// Method 12: TradeForTeam - User buys team tokens through contract
// =========================================================================
BEAM_EXPORT void Method_12(const Method::TradeForTeam& r)
{
    Env::Halt_if(r.m_Team >= NUM_TEAMS);
    Env::Halt_if(!r.m_BeamAmount);

    MyState s;

    // Determine team token
    AssetID teamToken = (r.m_Team == 0) ? s.m_Token0 : s.m_Token1;

    // Calculate fee split
    Amount feeBeam = (r.m_BeamAmount * s.m_TradeFeeBps) / MAX_BPS;
    Amount userBeam = r.m_BeamAmount - feeBeam;
    Env::Halt_if(!userBeam);

    // ---- Trade 1: Fee portion -> treasury tokens ----
    Amount tokensToTreasury = r.m_TokensToTreasury;
    if (feeBeam > 0 && tokensToTreasury > 0)
    {
        AmmTrade trade1;
        trade1.m_Pid.m_Aid1 = teamToken;
        trade1.m_Pid.m_Aid2 = 0;
        trade1.m_Pid.m_Kind = s.m_PoolKind;
        trade1.m_Buy1 = tokensToTreasury;

        Env::CallFar_T(s.m_DexCid, trade1);

        // Lock treasury tokens into our contract (take from fund pool)
        Env::FundsLock(teamToken, tokensToTreasury);
    }

    // ---- Trade 2: User portion -> user tokens ----
    Amount tokensToUser = r.m_TokensToUser;
    if (userBeam > 0 && tokensToUser > 0)
    {
        AmmTrade trade2;
        trade2.m_Pid.m_Aid1 = teamToken;
        trade2.m_Pid.m_Aid2 = 0;
        trade2.m_Pid.m_Kind = s.m_PoolKind;
        trade2.m_Buy1 = tokensToUser;

        Env::CallFar_T(s.m_DexCid, trade2);
    }

    // ---- Update round treasury ----
    Round::Key rk;
    rk.m_RoundId = s.m_CurrentRound;
    Round round;
    Env::Halt_if(!Env::LoadVar_T(rk, round));
    Env::Halt_if(round.m_Status == ROUND_FINALIZED);

    if (r.m_Team == 0)
        Strict::Add(round.m_Treasury0, tokensToTreasury);
    else
        Strict::Add(round.m_Treasury1, tokensToTreasury);

    Env::SaveVar_T(rk, round);

    // ---- Update lifetime stats ----
    Strict::Add(s.m_TotalTradeVolume, r.m_BeamAmount);
    if (r.m_Team == 0)
        Strict::Add(s.m_TotalTradeFees0, tokensToTreasury);
    else
        Strict::Add(s.m_TotalTradeFees1, tokensToTreasury);

    s.Save();

    Env::AddSig(r.m_pkUser);
}

} // namespace MemeClash
