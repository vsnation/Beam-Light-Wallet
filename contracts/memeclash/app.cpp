// =============================================================================
// MemeClash v8 - Meme Battle Game for BEAM Blockchain
// =============================================================================
// App shader (client-side): view methods + transaction builders
//
// Key feature: run_checkpoint auto-calculates all swap amounts by reading
// AMM pool reserves and running binary search — user provides NOTHING.
//
// v8: Burns BOTH treasuries every round (Stadium behavior). No carryover.
// Start reserves stored in Round, end reserves read from DEX at checkpoint time.
//
// View Methods:
//   view_state          - Contract config, current round, lifetime stats
//   view_round          - Specific round details
//   view_current_round  - Active round + time remaining
//   view_history        - Past N rounds with winners, burns
//   view_my_payout      - User's withdrawable balance
//   view_pool_reserves  - Current DEX pool reserves for both tokens
//
// Transaction Builders:
//   deposit_tokens      - Deposit $CHAD/$GIGA to battle treasury
//   run_checkpoint      - Auto-calculate swap amounts + resolve round
//   withdraw            - Withdraw payout balance
//   start_round         - Start new round (reads DEX reserves)
//
// Admin:
//   create, destroy, update_settings, withdraw_fees, emergency_withdraw
// =============================================================================

#include "common.h"
#include "Float.h"
#include "contract.h"
#include "app_common_impl.h"

using namespace MemeClash;
using MultiPrecision::Float;

// =========================================================================
// User key derivation
// =========================================================================
#pragma pack (push, 1)
struct MyAccountID
{
    ContractID m_Cid;
    uint8_t m_Ctx = 0;
};
#pragma pack (pop)

void DeriveMyPk(PubKey& pk, const ContractID& cid)
{
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::DerivePk(pk, &myid, sizeof(myid));
}

// Admin key for admin operations
static const char g_szAdmin[] = "memeclash.admin";

struct AdminKeyID : public Env::KeyID {
    AdminKeyID() : Env::KeyID(g_szAdmin, sizeof(g_szAdmin)) {}
};

// =========================================================================
// AMM pool reading — read DEX pool reserves cross-contract
// =========================================================================
#pragma pack (push, 1)

// Must match AMM Pool::Key layout exactly (packed)
struct AmmPoolReadKey
{
    uint8_t m_Tag;      // = 1 (AMM Tags::s_Pool)
    AssetID m_Aid1;     // Lower asset ID
    AssetID m_Aid2;     // Higher asset ID
    uint8_t m_Kind;     // Fee tier (0/1/2)
};

// Must match AMM Pool data layout exactly (packed)
struct AmmPoolData
{
    Amount m_Tok1;          // Reserve of aid1
    Amount m_Tok2;          // Reserve of aid2
    Amount m_Ctl;           // LP token supply
    AssetID m_aidCtl;       // LP token asset ID
    PubKey m_pkCreator;     // Pool creator
};

#pragma pack (pop)

// Read AMM pool reserves. Returns false if pool doesn't exist.
// beamRes/tokenRes are set relative to BEAM=aid1, TOKEN=aid2
bool ReadAmmPool(const ContractID& dexCid, AssetID tokenId, uint8_t kind,
                 Amount& beamRes, Amount& tokenRes)
{
    Env::Key_T<AmmPoolReadKey> ammKey;
    _POD_(ammKey.m_Prefix.m_Cid) = dexCid;
    ammKey.m_KeyInContract.m_Tag = 1; // AMM Tags::s_Pool

    // Pool stored with aid1 < aid2. BEAM=0 is always aid1.
    ammKey.m_KeyInContract.m_Aid1 = 0;
    ammKey.m_KeyInContract.m_Aid2 = tokenId;
    ammKey.m_KeyInContract.m_Kind = kind;

    AmmPoolData pool;
    if (!Env::VarReader::Read_T(ammKey, pool))
        return false;

    beamRes = pool.m_Tok1;      // BEAM reserve
    tokenRes = pool.m_Tok2;     // Token reserve
    return true;
}

// =========================================================================
// Trade simulation — replicate AMM math for exact amounts
// =========================================================================

struct TradeSimResult
{
    Amount m_Buy1;          // Amount of tok1 to buy
    Amount m_TotalPay;      // Total tok2 payment (payPool + daoFee)
    Amount m_PayPool;       // Amount added to pool reserves (payPool only, excludes daoFee)
};

// Simulate AMM Trade: find maximum tok1 to buy for ≤ maxPay of tok2.
// Replicates AMM Totals::Trade + FeeSettings::Get logic exactly.
// tok1/tok2 = pool reserves (tok1 is what we're buying)
void SimulateTrade(Amount tok1, Amount tok2, Amount maxPay, uint8_t feeKind,
                   TradeSimResult& out)
{
    out.m_Buy1 = 0;
    out.m_TotalPay = 0;
    out.m_PayPool = 0;

    if (!tok1 || !tok2 || !maxPay)
        return;

    // Binary search for optimal m_Buy1 (same algorithm as AMM app shader)
    Amount thrLo = 1;
    Amount thrHi = tok1 - 1;

    Amount bestBuy1 = 0;
    Amount bestTotalPay = 0;
    Amount bestPayPool = 0;

    for (uint32_t i = 0; i < 64; i++)
    {
        if (thrLo > thrHi)
            break;

        Amount mid = thrLo + (thrHi - thrLo) / 2;

        // Replicate Totals::Trade math:
        // vol = tok1 * tok2
        // valPay = floor(vol / (tok1 - mid)) - tok2
        Float vol = Float(tok1) * Float(tok2);
        Float fNewTok1 = Float(tok1 - mid);
        Float fResult = vol / fNewTok1;

        Amount valPay_raw;
        if (!fResult.RoundDown(valPay_raw))
        {
            thrHi = mid - 1;
            continue;
        }

        if (valPay_raw <= tok2)
        {
            thrLo = mid + 1;
            continue;
        }

        Amount valPay = valPay_raw - tok2;

        // Replicate FeeSettings::Get
        Amount feeAmount;
        switch (feeKind)
        {
        case 0: feeAmount = valPay / 2000; break;      // 0.05%
        case 1: feeAmount = valPay / 1000 * 3; break;  // 0.3%
        default: feeAmount = valPay / 100; break;       // 1%
        }
        feeAmount++;    // +1 groth for rounding

        Amount daoFee = feeAmount * 3 / 10;
        Amount poolFee = feeAmount - daoFee;
        Amount payPool = valPay + poolFee;
        Amount totalPay = payPool + daoFee;

        if (totalPay <= maxPay && totalPay >= bestTotalPay)
        {
            bestBuy1 = mid;
            bestTotalPay = totalPay;
            bestPayPool = payPool;
        }

        if (totalPay > maxPay)
            thrHi = mid - 1;
        else
            thrLo = mid + 1;
    }

    out.m_Buy1 = bestBuy1;
    out.m_TotalPay = bestTotalPay;
    out.m_PayPool = bestPayPool;
}

// =========================================================================
// Action macros - Manager Role
// =========================================================================

#define MemeClash_manager_create(macro) \
    macro(AssetID, token0) \
    macro(AssetID, token1) \
    macro(AssetID, fomo_asset_id) \
    macro(ContractID, dex_cid) \
    macro(ContractID, blackhole_cid) \
    macro(uint32_t, pool_kind) \
    macro(Height, round_duration) \
    macro(uint32_t, trade_fee_bps)

#define MemeClash_manager_destroy(macro) \
    macro(ContractID, cid)

#define MemeClash_manager_view(macro) \
    macro(ContractID, cid)

#define MemeClash_manager_update_settings(macro) \
    macro(ContractID, cid) \
    macro(Height, round_duration) \
    macro(uint32_t, checkpoint_fee_bps) \
    macro(uint32_t, fomo_buyback_bps) \
    macro(uint32_t, burn_bps) \
    macro(uint32_t, trade_fee_bps)

#define MemeClash_manager_withdraw_fees(macro) \
    macro(ContractID, cid) \
    macro(Amount, amount)

#define MemeClash_manager_emergency_withdraw(macro) \
    macro(ContractID, cid) \
    macro(AssetID, asset_id) \
    macro(Amount, amount)

#define MemeClash_manager_force_end_round(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, round_id)

#define MemeClashRole_manager(macro) \
    macro(manager, create) \
    macro(manager, destroy) \
    macro(manager, view) \
    macro(manager, update_settings) \
    macro(manager, withdraw_fees) \
    macro(manager, emergency_withdraw) \
    macro(manager, force_end_round)

// =========================================================================
// Action macros - User Role
// =========================================================================

#define MemeClash_user_view_state(macro) \
    macro(ContractID, cid)

#define MemeClash_user_view_round(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, round_id)

#define MemeClash_user_view_current_round(macro) \
    macro(ContractID, cid)

#define MemeClash_user_view_history(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, count)

#define MemeClash_user_view_my_payout(macro) \
    macro(ContractID, cid)

#define MemeClash_user_view_pool_reserves(macro) \
    macro(ContractID, cid)

#define MemeClash_user_deposit_tokens(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, team) \
    macro(Amount, amount)

#define MemeClash_user_run_checkpoint(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, round_id)

#define MemeClash_user_withdraw(macro) \
    macro(ContractID, cid) \
    macro(Amount, amount) \
    macro(AssetID, asset_id)

#define MemeClash_user_start_round(macro) \
    macro(ContractID, cid)

#define MemeClash_user_trade_for_team(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, team) \
    macro(Amount, beam_amount)

#define MemeClash_user_view_trade_quote(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, team) \
    macro(Amount, beam_amount)

#define MemeClashRole_user(macro) \
    macro(user, view_state) \
    macro(user, view_round) \
    macro(user, view_current_round) \
    macro(user, view_history) \
    macro(user, view_my_payout) \
    macro(user, view_pool_reserves) \
    macro(user, deposit_tokens) \
    macro(user, run_checkpoint) \
    macro(user, withdraw) \
    macro(user, start_round) \
    macro(user, trade_for_team) \
    macro(user, view_trade_quote)

#define MemeClashRoles_All(macro) \
    macro(manager) \
    macro(user)

// =========================================================================
// APP SHADER EXPORTS
// =========================================================================

// Method 0: Schema
BEAM_EXPORT void Method_0()
{
    Env::DocGroup root("");
    {
        Env::DocGroup gr("roles");

#define THE_FIELD(type, name) Env::DocAddText(#name, #type);
#define THE_METHOD(role, name) { Env::DocGroup grMethod(#name); MemeClash_##role##_##name(THE_FIELD) }
#define THE_ROLE(name) { Env::DocGroup grRole(#name); MemeClashRole_##name(THE_METHOD) }

        MemeClashRoles_All(THE_ROLE)

#undef THE_ROLE
#undef THE_METHOD
#undef THE_FIELD
    }
}

// =========================================================================
// METHOD IMPLEMENTATIONS
// =========================================================================

#define THE_FIELD(type, name) const type& name,
#define ON_METHOD(role, name) void On_##role##_##name(MemeClash_##role##_##name(THE_FIELD) int unused = 0)

// =========================================================================
// MANAGER METHODS
// =========================================================================

ON_METHOD(manager, create)
{
    // Read initial DEX reserves for round 1
    Amount beamRes0 = 0, tokenRes0 = 0;
    Amount beamRes1 = 0, tokenRes1 = 0;
    ReadAmmPool(dex_cid, token0, (uint8_t)pool_kind, beamRes0, tokenRes0);
    ReadAmmPool(dex_cid, token1, (uint8_t)pool_kind, beamRes1, tokenRes1);

    Method::Init arg;
    AdminKeyID().get_Pk(arg.m_Config.m_pkAdmin);
    arg.m_Token0 = token0;
    arg.m_Token1 = token1;
    arg.m_FomoAssetId = fomo_asset_id;
    _POD_(arg.m_DexCid) = dex_cid;
    _POD_(arg.m_BlackHoleCid) = blackhole_cid;
    arg.m_PoolKind = (uint8_t)pool_kind;
    arg.m_RoundDuration = round_duration;
    arg.m_TradeFeeBps = trade_fee_bps;
    arg.m_StartBeamReserve0 = beamRes0;
    arg.m_StartBeamReserve1 = beamRes1;

    Env::GenerateKernel(nullptr, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Deploy MemeClash contract", 2000000);
}

ON_METHOD(manager, destroy)
{
    AdminKeyID kid;
    Env::GenerateKernel(&cid, 1, nullptr, 0, nullptr, 0, &kid, 1,
        "Destroy MemeClash contract", 0);
}

ON_METHOD(manager, view)
{
    Env::Key_T<uint8_t> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    key.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(key, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Env::DocGroup root("state");
    Env::DocAddBlob_T("admin", s.m_Config.m_pkAdmin);
    Env::DocAddNum("token0", s.m_Token0);
    Env::DocAddNum("token1", s.m_Token1);
    Env::DocAddNum("fomo_asset_id", s.m_FomoAssetId);
    Env::DocAddBlob_T("dex_cid", s.m_DexCid);
    Env::DocAddBlob_T("blackhole_cid", s.m_BlackHoleCid);
    Env::DocAddNum("pool_kind", (uint32_t)s.m_PoolKind);
    Env::DocAddNum("current_round", s.m_CurrentRound);
    Env::DocAddNum("round_duration", s.m_RoundDuration);
    Env::DocAddNum("checkpoint_fee_bps", s.m_CheckpointFeeBps);
    Env::DocAddNum("fomo_buyback_bps", s.m_FomoBuybackBps);
    Env::DocAddNum("burn_bps", s.m_BurnBps);
    Env::DocAddNum("total_burned0", s.m_TotalBurned0);
    Env::DocAddNum("total_burned1", s.m_TotalBurned1);
    Env::DocAddNum("total_fomo_buyback", s.m_TotalFomoBuyback);
    Env::DocAddNum("total_fomo_burned", s.m_TotalFomoBurned);
    Env::DocAddNum("owner_fees", s.m_OwnerFees);
    Env::DocAddNum("chad_wins", s.m_ChadWins);
    Env::DocAddNum("giga_wins", s.m_GigaWins);
    Env::DocAddNum("draws", s.m_Draws);
    Env::DocAddNum("total_rounds", s.m_TotalRounds);
    Env::DocAddNum("trade_fee_bps", s.m_TradeFeeBps);
    Env::DocAddNum("total_trade_volume", s.m_TotalTradeVolume);
    Env::DocAddNum("total_trade_fees0", s.m_TotalTradeFees0);
    Env::DocAddNum("total_trade_fees1", s.m_TotalTradeFees1);

    // Admin check
    PubKey myAdminPk;
    AdminKeyID().get_Pk(myAdminPk);
    Env::DocAddNum("is_admin", (uint32_t)(_POD_(myAdminPk) == s.m_Config.m_pkAdmin));
}

ON_METHOD(manager, update_settings)
{
    Method::UpdateSettings arg;
    arg.m_RoundDuration = round_duration;
    arg.m_CheckpointFeeBps = checkpoint_fee_bps;
    arg.m_FomoBuybackBps = fomo_buyback_bps;
    arg.m_BurnBps = burn_bps;
    arg.m_TradeFeeBps = trade_fee_bps;

    AdminKeyID kid;
    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Update MemeClash settings", 0);
}

ON_METHOD(manager, withdraw_fees)
{
    // Read state to get FOMO asset ID
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Method::WithdrawFees arg;
    arg.m_Amount = amount;

    FundsChange fc;
    fc.m_Aid = s.m_FomoAssetId;   // Withdraw FOMO tokens (auto-bought from DEX)
    fc.m_Amount = amount;
    fc.m_Consume = 0;

    AdminKeyID kid;
    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Withdraw MemeClash FOMO fees", 1200000);
}

ON_METHOD(manager, emergency_withdraw)
{
    Method::EmergencyWithdraw arg;
    arg.m_AssetId = asset_id;
    arg.m_Amount = amount;

    FundsChange fc;
    fc.m_Aid = asset_id;
    fc.m_Amount = amount;
    fc.m_Consume = 0;

    AdminKeyID kid;
    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Emergency withdraw from MemeClash", 1200000);
}

ON_METHOD(manager, force_end_round)
{
    Method::ForceEndRound arg;
    arg.m_RoundId = round_id;

    AdminKeyID kid;
    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Force end MemeClash round", 1200000);
}

// =========================================================================
// USER METHODS - Views
// =========================================================================

ON_METHOD(user, view_state)
{
    Env::Key_T<uint8_t> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    key.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(key, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Env::DocGroup root("state");
    Env::DocAddNum("token0", s.m_Token0);
    Env::DocAddNum("token1", s.m_Token1);
    Env::DocAddNum("fomo_asset_id", s.m_FomoAssetId);
    Env::DocAddNum("pool_kind", (uint32_t)s.m_PoolKind);
    Env::DocAddNum("current_round", s.m_CurrentRound);
    Env::DocAddNum("round_duration", s.m_RoundDuration);
    Env::DocAddNum("checkpoint_fee_bps", s.m_CheckpointFeeBps);
    Env::DocAddNum("fomo_buyback_bps", s.m_FomoBuybackBps);
    Env::DocAddNum("burn_bps", s.m_BurnBps);
    Env::DocAddNum("total_burned0", s.m_TotalBurned0);
    Env::DocAddNum("total_burned1", s.m_TotalBurned1);
    Env::DocAddNum("total_fomo_buyback", s.m_TotalFomoBuyback);
    Env::DocAddNum("total_fomo_burned", s.m_TotalFomoBurned);
    Env::DocAddNum("chad_wins", s.m_ChadWins);
    Env::DocAddNum("giga_wins", s.m_GigaWins);
    Env::DocAddNum("draws", s.m_Draws);
    Env::DocAddNum("total_rounds", s.m_TotalRounds);
    Env::DocAddNum("trade_fee_bps", s.m_TradeFeeBps);
    Env::DocAddNum("total_trade_volume", s.m_TotalTradeVolume);
    Env::DocAddNum("total_trade_fees0", s.m_TotalTradeFees0);
    Env::DocAddNum("total_trade_fees1", s.m_TotalTradeFees1);
}

ON_METHOD(user, view_round)
{
    Env::Key_T<Round::Key> rKey;
    _POD_(rKey.m_Prefix.m_Cid) = cid;
    rKey.m_KeyInContract.m_Tag = Tags::s_Round;
    rKey.m_KeyInContract.m_RoundId = round_id;

    Round r;
    if (!Env::VarReader::Read_T(rKey, r)) {
        Env::DocAddText("error", "Round not found");
        return;
    }

    Env::DocGroup root("round");
    Env::DocAddNum("round_id", round_id);
    Env::DocAddNum("start_height", r.m_StartHeight);
    Env::DocAddNum("end_height", r.m_EndHeight);
    Env::DocAddNum("treasury0", r.m_Treasury0);
    Env::DocAddNum("treasury1", r.m_Treasury1);
    Env::DocAddNum("start_beam_reserve0", r.m_StartBeamReserve0);
    Env::DocAddNum("start_beam_reserve1", r.m_StartBeamReserve1);
    Env::DocAddNum("winner", (uint32_t)r.m_Winner);
    Env::DocAddNum("status", (uint32_t)r.m_Status);
    Env::DocAddNum("loser_sold", r.m_LoserSold);
    Env::DocAddNum("beam_received", r.m_BeamReceived);
    Env::DocAddNum("winner_burned", r.m_WinnerBurned);
    Env::DocAddNum("caller_fee", r.m_CallerFee);
    Env::DocAddNum("fomo_buyback", r.m_FomoBuyback);
    Env::DocAddNum("fomo_burned", r.m_FomoBurned);
}

ON_METHOD(user, view_current_round)
{
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    if (!s.m_CurrentRound) {
        Env::DocAddText("error", "No rounds yet");
        return;
    }

    Env::Key_T<Round::Key> rKey;
    _POD_(rKey.m_Prefix.m_Cid) = cid;
    rKey.m_KeyInContract.m_Tag = Tags::s_Round;
    rKey.m_KeyInContract.m_RoundId = s.m_CurrentRound;

    Round r;
    if (!Env::VarReader::Read_T(rKey, r)) {
        Env::DocAddText("error", "Current round not found");
        return;
    }

    Height curHeight = Env::get_Height();

    Env::DocGroup root("current_round");
    Env::DocAddNum("round_id", s.m_CurrentRound);
    Env::DocAddNum("start_height", r.m_StartHeight);
    Env::DocAddNum("end_height", r.m_EndHeight);
    Env::DocAddNum("current_height", curHeight);
    Env::DocAddNum("treasury0", r.m_Treasury0);
    Env::DocAddNum("treasury1", r.m_Treasury1);
    Env::DocAddNum("start_beam_reserve0", r.m_StartBeamReserve0);
    Env::DocAddNum("start_beam_reserve1", r.m_StartBeamReserve1);
    Env::DocAddNum("winner", (uint32_t)r.m_Winner);
    Env::DocAddNum("status", (uint32_t)r.m_Status);

    // v7: simplified phase logic — no snapshot checks
    if (curHeight < r.m_EndHeight)
    {
        Env::DocAddNum("blocks_remaining", r.m_EndHeight - curHeight);
        Env::DocAddText("phase", "active");
    }
    else
    {
        Env::DocAddNum("blocks_remaining", (Height)0);
        if (r.m_Status == ROUND_FINALIZED)
            Env::DocAddText("phase", "finalized");
        else
            Env::DocAddText("phase", "ready_for_checkpoint");
    }
}

ON_METHOD(user, view_history)
{
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    uint32_t maxRounds = count;
    if (!maxRounds || maxRounds > 50)
        maxRounds = 10;

    Env::DocArray arr("rounds");

    uint32_t startId = (s.m_CurrentRound > maxRounds) ? s.m_CurrentRound - maxRounds + 1 : 1;
    for (uint32_t id = startId; id <= s.m_CurrentRound; id++)
    {
        Env::Key_T<Round::Key> rKey;
        _POD_(rKey.m_Prefix.m_Cid) = cid;
        rKey.m_KeyInContract.m_Tag = Tags::s_Round;
        rKey.m_KeyInContract.m_RoundId = id;

        Round r;
        if (!Env::VarReader::Read_T(rKey, r))
            continue;

        Env::DocGroup gr("");
        Env::DocAddNum("round_id", id);
        Env::DocAddNum("start_height", r.m_StartHeight);
        Env::DocAddNum("end_height", r.m_EndHeight);
        Env::DocAddNum("treasury0", r.m_Treasury0);
        Env::DocAddNum("treasury1", r.m_Treasury1);
        Env::DocAddNum("start_beam_reserve0", r.m_StartBeamReserve0);
        Env::DocAddNum("start_beam_reserve1", r.m_StartBeamReserve1);
        Env::DocAddNum("winner", (uint32_t)r.m_Winner);
        Env::DocAddNum("status", (uint32_t)r.m_Status);
        Env::DocAddNum("loser_sold", r.m_LoserSold);
        Env::DocAddNum("beam_received", r.m_BeamReceived);
        Env::DocAddNum("winner_burned", r.m_WinnerBurned);
        Env::DocAddNum("caller_fee", r.m_CallerFee);
        Env::DocAddNum("fomo_buyback", r.m_FomoBuyback);
        Env::DocAddNum("fomo_burned", r.m_FomoBurned);
    }
}

ON_METHOD(user, view_my_payout)
{
    PubKey myPk;
    DeriveMyPk(myPk, cid);

    // Read state to get token IDs
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Env::DocGroup root("payout");

    // Check BEAM payout
    {
        Env::Key_T<Payout::Key> pk;
        _POD_(pk.m_Prefix.m_Cid) = cid;
        pk.m_KeyInContract.m_Tag = Tags::s_Payout;
        _POD_(pk.m_KeyInContract.m_pkUser) = myPk;
        pk.m_KeyInContract.m_Aid = 0;

        Payout po;
        if (Env::VarReader::Read_T(pk, po))
            Env::DocAddNum("beam", po.m_Amount);
        else
            Env::DocAddNum("beam", (Amount)0);
    }

    // Check token0 payout
    {
        Env::Key_T<Payout::Key> pk;
        _POD_(pk.m_Prefix.m_Cid) = cid;
        pk.m_KeyInContract.m_Tag = Tags::s_Payout;
        _POD_(pk.m_KeyInContract.m_pkUser) = myPk;
        pk.m_KeyInContract.m_Aid = s.m_Token0;

        Payout po;
        if (Env::VarReader::Read_T(pk, po))
            Env::DocAddNum("token0", po.m_Amount);
        else
            Env::DocAddNum("token0", (Amount)0);
    }

    // Check token1 payout
    {
        Env::Key_T<Payout::Key> pk;
        _POD_(pk.m_Prefix.m_Cid) = cid;
        pk.m_KeyInContract.m_Tag = Tags::s_Payout;
        _POD_(pk.m_KeyInContract.m_pkUser) = myPk;
        pk.m_KeyInContract.m_Aid = s.m_Token1;

        Payout po;
        if (Env::VarReader::Read_T(pk, po))
            Env::DocAddNum("token1", po.m_Amount);
        else
            Env::DocAddNum("token1", (Amount)0);
    }

    Env::DocAddBlob_T("pk", myPk);
}

ON_METHOD(user, view_pool_reserves)
{
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Env::DocGroup root("pools");

    Amount beamRes0, tokenRes0;
    if (ReadAmmPool(s.m_DexCid, s.m_Token0, s.m_PoolKind, beamRes0, tokenRes0))
    {
        Env::DocAddNum("beam_reserve0", beamRes0);
        Env::DocAddNum("token_reserve0", tokenRes0);
    }
    else
    {
        Env::DocAddNum("beam_reserve0", (Amount)0);
        Env::DocAddNum("token_reserve0", (Amount)0);
    }

    Amount beamRes1, tokenRes1;
    if (ReadAmmPool(s.m_DexCid, s.m_Token1, s.m_PoolKind, beamRes1, tokenRes1))
    {
        Env::DocAddNum("beam_reserve1", beamRes1);
        Env::DocAddNum("token_reserve1", tokenRes1);
    }
    else
    {
        Env::DocAddNum("beam_reserve1", (Amount)0);
        Env::DocAddNum("token_reserve1", (Amount)0);
    }
}

// =========================================================================
// USER METHODS - Transactions
// =========================================================================

ON_METHOD(user, deposit_tokens)
{
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Method::DepositTokens arg;
    arg.m_Team = (uint8_t)team;
    arg.m_Amount = amount;

    AssetID aid = (team == 0) ? s.m_Token0 : s.m_Token1;

    FundsChange fc;
    fc.m_Aid = aid;
    fc.m_Amount = amount;
    fc.m_Consume = 1;

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, nullptr, 0,
        "Deposit tokens to MemeClash treasury", 1200000);
}

// =========================================================================
// run_checkpoint - THE CORE: fully automated round resolution
//
// v7: Reads end reserves directly from DEX pools, start reserves from Round.
// No snapshot TXs needed. Single TX does everything.
// =========================================================================
ON_METHOD(user, run_checkpoint)
{
    // 1. Read MemeClash state
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    // 2. Read round
    Env::Key_T<Round::Key> rKey;
    _POD_(rKey.m_Prefix.m_Cid) = cid;
    rKey.m_KeyInContract.m_Tag = Tags::s_Round;
    rKey.m_KeyInContract.m_RoundId = round_id;

    Round r;
    if (!Env::VarReader::Read_T(rKey, r)) {
        Env::DocAddText("error", "Round not found");
        return;
    }

    if (r.m_Status == ROUND_FINALIZED) {
        Env::DocAddText("error", "Round already finalized");
        return;
    }

    // 3. Read current DEX pool reserves as end reserves
    Amount endRes0, endTokenRes0;
    if (!ReadAmmPool(s.m_DexCid, s.m_Token0, s.m_PoolKind, endRes0, endTokenRes0)) {
        Env::DocAddText("error", "CHAD/BEAM pool not found");
        return;
    }

    Amount endRes1, endTokenRes1;
    if (!ReadAmmPool(s.m_DexCid, s.m_Token1, s.m_PoolKind, endRes1, endTokenRes1)) {
        Env::DocAddText("error", "GIGA/BEAM pool not found");
        return;
    }

    // Start reserves from round data (immutable, set at creation)
    Amount startRes0 = r.m_StartBeamReserve0;
    Amount startRes1 = r.m_StartBeamReserve1;

    // 4. Determine winner (same logic as contract)
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

    // 5. Calculate swap amounts
    Amount beamFromLoser = 0;
    Amount winnerToBurn = 0;
    Amount fomoToBurn = 0;
    Amount leftoverLoser = 0;
    Amount leftoverBeam = 0;
    AssetID loserTokenId = 0;

    if (winner != WINNER_DRAW)
    {
        Amount loserTreasury = (winner == WINNER_CHAD) ? r.m_Treasury1 : r.m_Treasury0;
        AssetID loserToken = (winner == WINNER_CHAD) ? s.m_Token1 : s.m_Token0;
        AssetID winnerToken = (winner == WINNER_CHAD) ? s.m_Token0 : s.m_Token1;
        loserTokenId = loserToken;

        if (loserTreasury > 0)
        {
            // Read AMM pool for loser/BEAM
            Amount beamRes, tokenRes;
            if (!ReadAmmPool(s.m_DexCid, loserToken, s.m_PoolKind, beamRes, tokenRes)) {
                Env::DocAddText("error", "Loser token pool not found on DEX");
                return;
            }

            // Trade 1: sell loserTreasury tokens, buy BEAM
            TradeSimResult tr1;
            SimulateTrade(beamRes, tokenRes, loserTreasury, s.m_PoolKind, tr1);
            beamFromLoser = tr1.m_Buy1;
            leftoverLoser = loserTreasury - tr1.m_TotalPay;

            if (beamFromLoser > 0)
            {
                // Fee split
                Amount callerFee = (beamFromLoser * s.m_CheckpointFeeBps) / MAX_BPS;
                Amount fomoBuyback = (beamFromLoser * s.m_FomoBuybackBps) / MAX_BPS;
                Amount burnBeam = beamFromLoser - callerFee - fomoBuyback;

                if (burnBeam > 0)
                {
                    // Read AMM pool for winner/BEAM
                    Amount beamResW, tokenResW;
                    if (!ReadAmmPool(s.m_DexCid, winnerToken, s.m_PoolKind, beamResW, tokenResW)) {
                        Env::DocAddText("error", "Winner token pool not found on DEX");
                        return;
                    }

                    // Trade 2: buy winner tokens with BEAM
                    TradeSimResult tr2;
                    SimulateTrade(tokenResW, beamResW, burnBeam, s.m_PoolKind, tr2);
                    winnerToBurn = tr2.m_Buy1;
                    leftoverBeam = burnBeam - tr2.m_TotalPay;
                }

                // Trade 3: buy FOMO with 10% BEAM (auto-buyback)
                if (fomoBuyback > 0)
                {
                    Amount fomoBeamRes, fomoTokenRes;
                    if (ReadAmmPool(s.m_DexCid, s.m_FomoAssetId, s.m_PoolKind, fomoBeamRes, fomoTokenRes))
                    {
                        TradeSimResult tr3;
                        SimulateTrade(fomoTokenRes, fomoBeamRes, fomoBuyback, s.m_PoolKind, tr3);
                        fomoToBurn = tr3.m_Buy1;
                    }
                }
            }
        }
    }

    // Debug output
    Env::DocAddNum("winner", (uint32_t)winner);
    Env::DocAddNum("beam_from_loser", beamFromLoser);
    Env::DocAddNum("winner_to_burn", winnerToBurn);
    Env::DocAddNum("fomo_to_burn", fomoToBurn);
    Env::DocAddNum("leftover_loser", leftoverLoser);
    Env::DocAddNum("leftover_beam", leftoverBeam);
    Env::DocAddNum("start_reserve0", startRes0);
    Env::DocAddNum("start_reserve1", startRes1);
    Env::DocAddNum("end_reserve0", endRes0);
    Env::DocAddNum("end_reserve1", endRes1);

    // 6. Build RunCheckpoint tx
    Method::RunCheckpoint arg;
    DeriveMyPk(arg.m_pkCaller, cid);
    arg.m_RoundId = round_id;
    arg.m_BeamFromLoser = beamFromLoser;
    arg.m_WinnerToBurn = winnerToBurn;
    arg.m_FomoToBurn = fomoToBurn;
    arg.m_EndBeamReserve0 = endRes0;
    arg.m_EndBeamReserve1 = endRes1;

    // FundsChange: caller receives any leftovers from imprecise binary search
    FundsChange fc[2];
    uint32_t nFc = 0;

    if (leftoverLoser > 0)
    {
        fc[nFc].m_Aid = loserTokenId;
        fc[nFc].m_Amount = leftoverLoser;
        fc[nFc].m_Consume = 0;
        nFc++;
    }

    if (leftoverBeam > 0)
    {
        fc[nFc].m_Aid = 0;
        fc[nFc].m_Amount = leftoverBeam;
        fc[nFc].m_Consume = 0;
        nFc++;
    }

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    // High nCharge for CallFar operations
    uint32_t nCharge =
        Env::Cost::CallFar * 12 +   // +3 for treasury burns (winner treas + draw 0 + draw 1)
        Env::Cost::LoadVar_For(sizeof(State)) +
        Env::Cost::LoadVar_For(sizeof(Round)) +
        Env::Cost::SaveVar_For(sizeof(Round)) * 2 +
        Env::Cost::SaveVar_For(sizeof(State)) +
        Env::Cost::FundsLock * 12 +
        Env::Cost::AddSig +
        Env::Cost::Cycle * 80000;

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg),
        nFc ? fc : nullptr, nFc, &kid, 1,
        "Run MemeClash checkpoint", nCharge);
}

ON_METHOD(user, withdraw)
{
    Method::Withdraw arg;
    DeriveMyPk(arg.m_pkUser, cid);
    arg.m_Aid = asset_id;
    arg.m_Amount = amount;

    FundsChange fc;
    fc.m_Aid = asset_id;
    fc.m_Amount = amount;
    fc.m_Consume = 0;

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Withdraw MemeClash payout", 1200000);
}

// v7: start_round reads DEX reserves and passes to contract
ON_METHOD(user, start_round)
{
    // Read state to get DEX config
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Amount beamRes0 = 0, tokenRes0 = 0;
    ReadAmmPool(s.m_DexCid, s.m_Token0, s.m_PoolKind, beamRes0, tokenRes0);
    Amount beamRes1 = 0, tokenRes1 = 0;
    ReadAmmPool(s.m_DexCid, s.m_Token1, s.m_PoolKind, beamRes1, tokenRes1);

    Method::StartRound arg;
    arg.m_StartBeamReserve0 = beamRes0;
    arg.m_StartBeamReserve1 = beamRes1;

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg),
        nullptr, 0, nullptr, 0,
        "Start new MemeClash round", 1200000);
}

// =========================================================================
// v4: Trade Quote - preview trade amounts (read-only, no tx)
// =========================================================================
ON_METHOD(user, view_trade_quote)
{
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    if (team > 1) {
        Env::DocAddText("error", "Invalid team (0=CHAD, 1=GIGA)");
        return;
    }

    if (!beam_amount) {
        Env::DocAddText("error", "Amount must be > 0");
        return;
    }

    AssetID tokenId = (team == 0) ? s.m_Token0 : s.m_Token1;

    // Read AMM pool for this team's token
    Amount beamRes, tokenRes;
    if (!ReadAmmPool(s.m_DexCid, tokenId, s.m_PoolKind, beamRes, tokenRes)) {
        Env::DocAddText("error", "Pool not found on DEX");
        return;
    }

    // Calculate fee split
    Amount feeBeam = (beam_amount * s.m_TradeFeeBps) / MAX_BPS;
    Amount userBeam = beam_amount - feeBeam;

    // Simulate fee trade: feeBeam BEAM → tokens for treasury
    TradeSimResult feeTrade;
    SimulateTrade(tokenRes, beamRes, feeBeam, s.m_PoolKind, feeTrade);

    // After fee trade, pool reserves change
    Amount beamResAfterFee = beamRes + feeTrade.m_PayPool;
    Amount tokenResAfterFee = tokenRes - feeTrade.m_Buy1;

    // Simulate user trade: userBeam BEAM → tokens for user (on updated pool)
    TradeSimResult userTrade;
    SimulateTrade(tokenResAfterFee, beamResAfterFee, userBeam, s.m_PoolKind, userTrade);

    Env::DocGroup root("quote");
    Env::DocAddNum("beam_amount", beam_amount);
    Env::DocAddNum("fee_beam", feeBeam);
    Env::DocAddNum("user_beam", userBeam);
    Env::DocAddNum("tokens_to_treasury", feeTrade.m_Buy1);
    Env::DocAddNum("tokens_to_user", userTrade.m_Buy1);
    Env::DocAddNum("total_tokens", feeTrade.m_Buy1 + userTrade.m_Buy1);
    Env::DocAddNum("trade_fee_bps", s.m_TradeFeeBps);
    Env::DocAddNum("team", (uint32_t)team);
}

// =========================================================================
// v4: Trade For Team - buy team tokens with 5% fee to treasury
// =========================================================================
ON_METHOD(user, trade_for_team)
{
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    if (team > 1) {
        Env::DocAddText("error", "Invalid team (0=CHAD, 1=GIGA)");
        return;
    }

    if (!beam_amount) {
        Env::DocAddText("error", "Amount must be > 0");
        return;
    }

    AssetID tokenId = (team == 0) ? s.m_Token0 : s.m_Token1;

    // Read AMM pool
    Amount beamRes, tokenRes;
    if (!ReadAmmPool(s.m_DexCid, tokenId, s.m_PoolKind, beamRes, tokenRes)) {
        Env::DocAddText("error", "Pool not found on DEX");
        return;
    }

    // Calculate fee split
    Amount feeBeam = (beam_amount * s.m_TradeFeeBps) / MAX_BPS;
    Amount userBeam = beam_amount - feeBeam;

    // Simulate fee trade first (changes pool reserves)
    TradeSimResult feeTrade;
    SimulateTrade(tokenRes, beamRes, feeBeam, s.m_PoolKind, feeTrade);

    // AMM adds only payPool to reserves (daoFee goes to DaoVault, NOT the pool)
    Amount beamResAfterFee = beamRes + feeTrade.m_PayPool;
    Amount tokenResAfterFee = tokenRes - feeTrade.m_Buy1;

    // Simulate user trade on updated pool
    TradeSimResult userTrade;
    SimulateTrade(tokenResAfterFee, beamResAfterFee, userBeam, s.m_PoolKind, userTrade);

    if (!userTrade.m_Buy1) {
        Env::DocAddText("error", "Trade amount too small");
        return;
    }

    // Actual BEAM consumed = both AMM trades' total payment (including pool+DAO fees)
    Amount actualBeamPaid = feeTrade.m_TotalPay + userTrade.m_TotalPay;

    // Build Method::TradeForTeam
    Method::TradeForTeam arg;
    DeriveMyPk(arg.m_pkUser, cid);
    arg.m_Team = (uint8_t)team;
    arg.m_BeamAmount = beam_amount;  // For stats tracking (approx)
    arg.m_TokensToUser = userTrade.m_Buy1;
    arg.m_TokensToTreasury = feeTrade.m_Buy1;

    // FundsChange: user pays exact BEAM consumed by AMM, receives tokens
    FundsChange fc[2];
    fc[0].m_Aid = 0;            // BEAM
    fc[0].m_Amount = actualBeamPaid;
    fc[0].m_Consume = 1;        // user pays

    fc[1].m_Aid = tokenId;
    fc[1].m_Amount = userTrade.m_Buy1;
    fc[1].m_Consume = 0;        // user receives tokens

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    // nCharge: MemeClash→AMM×2 + AMM→DaoVault×2 + state updates
    uint32_t nCharge =
        Env::Cost::CallFar * 5 +
        Env::Cost::LoadVar_For(sizeof(State)) +
        Env::Cost::LoadVar_For(sizeof(Round)) +
        Env::Cost::SaveVar_For(sizeof(State)) +
        Env::Cost::SaveVar_For(sizeof(Round)) +
        Env::Cost::FundsLock * 8 +
        Env::Cost::AddSig +
        Env::Cost::Cycle * 50000;

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg),
        fc, 2, &kid, 1,
        "Buy team tokens via MemeClash", nCharge);
}

// =========================================================================
// METHOD DISPATCH
// =========================================================================

#undef ON_METHOD
#undef THE_FIELD

// Method 1: Action dispatcher
BEAM_EXPORT void Method_1()
{
    Env::DocGroup root("");

    char szRole[16], szAction[32];
    if (!Env::DocGetText("role", szRole, sizeof(szRole)))
        return;
    if (!Env::DocGetText("action", szAction, sizeof(szAction)))
        return;

#define PAR_READ(type, name) type arg_##name; Env::DocGet(#name, arg_##name);
#define PAR_PASS(type, name) arg_##name,

#define THE_METHOD(role, name) \
    if (!Env::Strcmp(szAction, #name)) { \
        MemeClash_##role##_##name(PAR_READ) \
        On_##role##_##name(MemeClash_##role##_##name(PAR_PASS) 0); \
        return; \
    }

#define THE_ROLE(name) \
    if (!Env::Strcmp(szRole, #name)) { \
        MemeClashRole_##name(THE_METHOD) \
    }

    MemeClashRoles_All(THE_ROLE)

#undef THE_ROLE
#undef THE_METHOD
#undef PAR_PASS
#undef PAR_READ
}
