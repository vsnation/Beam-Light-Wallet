// =============================================================================
// Fuddle v7 - On-Chain Wordle with DEX Auto-Swap Entry Fees
// =============================================================================
// App shader (client-side): view methods + transaction builders
//
// View Methods:
//   view_games           - List active games
//   view_game            - Single game detail
//   view_my_game         - Player's state + all guess feedback for a game
//   view_letters         - Player's letter inventory
//   view_leaderboard     - Top players by score
//   view_my_stats        - Player's aggregate stats
//   view_word_counts     - Number of words per difficulty
//   view_settings        - Contract settings (+ DEX config, FOMO fees)
//   view_tournament      - Current tournament state for a tier
//   view_my_tournament   - Player's score in a tournament
//   view_all_tournaments - All 3 current tournaments with tier assets
//
// Transaction Builders:
//   create_game, buy_letters, buy_lootbox, submit_guess,
//   claim_tournament_reward, withdraw, set_price, buy_from_player,
//   mint, end_game, update_settings, withdraw_fees, add_words,
//   donate_to_pool, emergency_withdraw, force_finalize,
//   withdraw_fomo_fees
//
// v7: create_game reads DEX pools, simulates trades, pre-computes swap amounts.
//   All entry fees in BEAM; non-BEAM tiers auto-swap via DEX.
//   withdraw_fomo_fees allows admin to withdraw accumulated FOMO buyback fees.
// v6: claim_tournament_reward includes FundsChange for direct wallet payout.
//   Withdraw still available for legacy payout balances + letter marketplace.
// =============================================================================

#include "common.h"
#include "Float.h"
#include "contract.h"
#include "app_common_impl.h"

using namespace Fuddle;
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

// Owner key for admin operations
static const char g_szAdmin[] = "fuddle.admin";

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

#define Fuddle_manager_create(macro) \
    macro(Amount, letter_price) \
    macro(Amount, lootbox_small_price) \
    macro(Amount, lootbox_large_price) \
    macro(AssetID, tier0_asset) \
    macro(Amount, tier0_cost) \
    macro(AssetID, tier1_asset) \
    macro(Amount, tier1_cost) \
    macro(AssetID, tier2_asset) \
    macro(Amount, tier2_cost) \
    macro(ContractID, dex_cid) \
    macro(uint32_t, pool_kind) \
    macro(AssetID, fomo_asset_id)

#define Fuddle_manager_destroy(macro) \
    macro(ContractID, cid)

#define Fuddle_manager_view(macro) \
    macro(ContractID, cid)

#define Fuddle_manager_add_words(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, length) \
    macro(uint32_t, num_words)

#define Fuddle_manager_mint(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, char_id) \
    macro(uint32_t, count)

#define Fuddle_manager_update_settings(macro) \
    macro(ContractID, cid) \
    macro(Amount, letter_price) \
    macro(Amount, lootbox_small_price) \
    macro(Amount, lootbox_large_price) \
    macro(Height, tournament_duration) \
    macro(AssetID, tier0_asset) \
    macro(Amount, tier0_cost) \
    macro(AssetID, tier1_asset) \
    macro(Amount, tier1_cost) \
    macro(AssetID, tier2_asset) \
    macro(Amount, tier2_cost) \
    macro(uint32_t, pool_kind) \
    macro(AssetID, fomo_asset_id)

#define Fuddle_manager_withdraw_fees(macro) \
    macro(ContractID, cid) \
    macro(Amount, amount)

#define Fuddle_manager_view_word_counts(macro) \
    macro(ContractID, cid)

#define Fuddle_manager_emergency_withdraw(macro) \
    macro(ContractID, cid) \
    macro(AssetID, asset_id) \
    macro(Amount, amount)

#define Fuddle_manager_force_finalize(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, tier) \
    macro(uint32_t, round)

#define Fuddle_manager_withdraw_fomo_fees(macro) \
    macro(ContractID, cid) \
    macro(Amount, amount)

#define FuddleRole_manager(macro) \
    macro(manager, create) \
    macro(manager, destroy) \
    macro(manager, view) \
    macro(manager, add_words) \
    macro(manager, mint) \
    macro(manager, update_settings) \
    macro(manager, withdraw_fees) \
    macro(manager, view_word_counts) \
    macro(manager, emergency_withdraw) \
    macro(manager, force_finalize) \
    macro(manager, withdraw_fomo_fees)

// =========================================================================
// Action macros - User Role
// =========================================================================

#define Fuddle_user_view_games(macro) \
    macro(ContractID, cid)

#define Fuddle_user_view_game(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, game_id)

#define Fuddle_user_view_my_game(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, game_id)

#define Fuddle_user_view_letters(macro) \
    macro(ContractID, cid)

#define Fuddle_user_view_leaderboard(macro) \
    macro(ContractID, cid)

#define Fuddle_user_view_my_stats(macro) \
    macro(ContractID, cid)

#define Fuddle_user_view_tournament(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, tier) \
    macro(uint32_t, round)

#define Fuddle_user_view_my_tournament(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, tier) \
    macro(uint32_t, round)

#define Fuddle_user_view_all_tournaments(macro) \
    macro(ContractID, cid)

#define Fuddle_user_create_game(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, difficulty) \
    macro(uint32_t, tier)

#define Fuddle_user_buy_letters(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, char_id) \
    macro(uint32_t, count)

#define Fuddle_user_buy_lootbox(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, size)

#define Fuddle_user_submit_guess(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, game_id) \
    macro(uint32_t, g0) \
    macro(uint32_t, g1) \
    macro(uint32_t, g2) \
    macro(uint32_t, g3) \
    macro(uint32_t, g4) \
    macro(uint32_t, g5)

#define Fuddle_user_claim_tournament_reward(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, tier) \
    macro(uint32_t, round)

#define Fuddle_user_withdraw(macro) \
    macro(ContractID, cid) \
    macro(Amount, amount) \
    macro(AssetID, asset_id)

#define Fuddle_user_set_price(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, char_id) \
    macro(Amount, price) \
    macro(AssetID, price_aid)

#define Fuddle_user_buy_from_player(macro) \
    macro(ContractID, cid) \
    macro(PubKey, seller) \
    macro(uint32_t, char_id)

#define Fuddle_user_end_game(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, game_id)

#define Fuddle_user_donate_to_pool(macro) \
    macro(ContractID, cid) \
    macro(uint32_t, tier) \
    macro(Amount, amount)

#define FuddleRole_user(macro) \
    macro(user, view_games) \
    macro(user, view_game) \
    macro(user, view_my_game) \
    macro(user, view_letters) \
    macro(user, view_leaderboard) \
    macro(user, view_my_stats) \
    macro(user, view_tournament) \
    macro(user, view_my_tournament) \
    macro(user, view_all_tournaments) \
    macro(user, create_game) \
    macro(user, buy_letters) \
    macro(user, buy_lootbox) \
    macro(user, submit_guess) \
    macro(user, claim_tournament_reward) \
    macro(user, withdraw) \
    macro(user, set_price) \
    macro(user, buy_from_player) \
    macro(user, end_game) \
    macro(user, donate_to_pool)

#define FuddleRoles_All(macro) \
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
#define THE_METHOD(role, name) { Env::DocGroup grMethod(#name); Fuddle_##role##_##name(THE_FIELD) }
#define THE_ROLE(name) { Env::DocGroup grRole(#name); FuddleRole_##name(THE_METHOD) }

        FuddleRoles_All(THE_ROLE)

#undef THE_ROLE
#undef THE_METHOD
#undef THE_FIELD
    }
}

// =========================================================================
// METHOD IMPLEMENTATIONS
// =========================================================================

#define THE_FIELD(type, name) const type& name,
#define ON_METHOD(role, name) void On_##role##_##name(Fuddle_##role##_##name(THE_FIELD) int unused = 0)

// =========================================================================
// Helper: Output tournament info to doc
// =========================================================================
void OutputTournament(const ContractID& cid, uint8_t tier, uint32_t round)
{
    if (!round) {
        Env::DocAddNum("tier", (uint32_t)tier);
        Env::DocAddNum("round", (uint32_t)0);
        Env::DocAddNum("prize_pool", (Amount)0);
        Env::DocAddText("status", "not_started");
        return;
    }

    Env::Key_T<Tournament::Key> tKey;
    _POD_(tKey.m_Prefix.m_Cid) = cid;
    tKey.m_KeyInContract.m_Tag = Tags::s_Tournament;
    tKey.m_KeyInContract.m_Tier = tier;
    tKey.m_KeyInContract.m_Round = round;

    Tournament t;
    if (!Env::VarReader::Read_T(tKey, t)) {
        Env::DocAddNum("tier", (uint32_t)tier);
        Env::DocAddNum("round", round);
        Env::DocAddText("status", "missing");
        return;
    }

    Env::DocAddNum("tier", (uint32_t)tier);
    Env::DocAddNum("round", round);
    Env::DocAddNum("asset", t.m_Asset);
    Env::DocAddNum("entry_cost", t.m_EntryCost);
    Env::DocAddNum("start_height", t.m_StartHeight);
    Env::DocAddNum("end_height", t.m_EndHeight);
    Env::DocAddNum("prize_pool", t.m_PrizePool);
    Env::DocAddNum("total_scores", t.m_TotalScores);
    Env::DocAddNum("total_players", t.m_TotalPlayers);
    Env::DocAddNum("finalized", (uint32_t)t.m_Finalized);

    if (!t.m_Finalized)
        Env::DocAddText("status", "active");
    else
        Env::DocAddText("status", "ended");
}

// =========================================================================
// MANAGER METHODS
// =========================================================================

ON_METHOD(manager, create)
{
    Method::Init arg;
    AdminKeyID().get_Pk(arg.m_Config.m_pkAdmin);
    arg.m_LetterPrice = letter_price;
    arg.m_LootboxSmallPrice = lootbox_small_price;
    arg.m_LootboxLargePrice = lootbox_large_price;

    // Per-tier tournament configuration
    arg.m_TierAssets[0] = tier0_asset;
    arg.m_TierAssets[1] = tier1_asset;
    arg.m_TierAssets[2] = tier2_asset;
    arg.m_TierEntryCost[0] = tier0_cost;
    arg.m_TierEntryCost[1] = tier1_cost;
    arg.m_TierEntryCost[2] = tier2_cost;

    // v7: DEX config
    _POD_(arg.m_DexCid) = dex_cid;
    arg.m_PoolKind = (uint8_t)pool_kind;
    arg.m_FomoAssetId = fomo_asset_id;

    Env::GenerateKernel(nullptr, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Deploy Fuddle v7 contract", 2000000);
}

ON_METHOD(manager, destroy)
{
    AdminKeyID kid;
    Env::GenerateKernel(&cid, 1, nullptr, 0, nullptr, 0, &kid, 1,
        "Destroy Fuddle contract", 0);
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

    Env::DocGroup root("settings");
    Env::DocAddNum("game_count", s.m_GameCount);
    Env::DocAddNum("letter_price", s.m_LetterPrice);
    Env::DocAddNum("owner_fees", s.m_OwnerFees);
    Env::DocAddNum("lootbox_small_price", s.m_LootboxSmallPrice);
    Env::DocAddNum("lootbox_large_price", s.m_LootboxLargePrice);
    Env::DocAddNum("tournament_duration", s.m_TournamentDuration);
    Env::DocAddBlob_T("admin", s.m_Config.m_pkAdmin);

    // Admin check: derive this wallet's admin PK and compare
    PubKey myAdminPk;
    AdminKeyID().get_Pk(myAdminPk);
    Env::DocAddNum("is_admin", (uint32_t)(_POD_(myAdminPk) == s.m_Config.m_pkAdmin));

    // Per-tier tournament configuration
    for (uint8_t i = 0; i < NUM_TIERS; i++)
    {
        if (i == 0) {
            Env::DocAddNum("tier0_asset", s.m_TierAssets[0]);
            Env::DocAddNum("tier0_cost", s.m_TierEntryCost[0]);
            Env::DocAddNum("tier0_round", s.m_TournamentRounds[0]);
            Env::DocAddNum("tier0_pool", s.m_TierPools[0]);
        } else if (i == 1) {
            Env::DocAddNum("tier1_asset", s.m_TierAssets[1]);
            Env::DocAddNum("tier1_cost", s.m_TierEntryCost[1]);
            Env::DocAddNum("tier1_round", s.m_TournamentRounds[1]);
            Env::DocAddNum("tier1_pool", s.m_TierPools[1]);
        } else {
            Env::DocAddNum("tier2_asset", s.m_TierAssets[2]);
            Env::DocAddNum("tier2_cost", s.m_TierEntryCost[2]);
            Env::DocAddNum("tier2_round", s.m_TournamentRounds[2]);
            Env::DocAddNum("tier2_pool", s.m_TierPools[2]);
        }
    }

    // v7: DEX config + FOMO fees
    Env::DocAddBlob_T("dex_cid", s.m_DexCid);
    Env::DocAddNum("pool_kind", (uint32_t)s.m_PoolKind);
    Env::DocAddNum("fomo_asset_id", s.m_FomoAssetId);
    Env::DocAddNum("fomo_fees", s.m_FomoFees);
}

ON_METHOD(manager, add_words)
{
    Env::Halt_if(length < MIN_WORD_LEN || length > MAX_WORD_LEN);
    Env::Halt_if(num_words == 0 || num_words > MAX_WORDS_PER_BATCH);

    uint32_t nTotalChars = num_words * length;
    uint32_t nBlobSize = sizeof(Letter::Char) * nTotalChars;
    uint32_t nArgSize = sizeof(Method::AddWords) + nBlobSize;

    auto* pArg = (Method::AddWords*) Env::StackAlloc(nArgSize);
    pArg->m_Length = (uint8_t)length;
    pArg->m_NumWords = num_words;

    uint32_t nRead = Env::DocGetBlob("data", pArg + 1, nBlobSize);
    Env::Halt_if(nRead != nBlobSize);

    AdminKeyID kid;

    // Calculate BVM charge so beam-wallet sets correct fee for large batches
    uint32_t wordDataSize = sizeof(Letter::Char) * length;
    uint32_t nCharge =
        Env::Cost::CallFar +
        Env::Cost::LoadVar_For(sizeof(State)) +
        Env::Cost::AddSig +
        Env::Cost::LoadVar_For(sizeof(WordCount)) +
        num_words * (Env::Cost::SaveVar_For(wordDataSize) + Env::Cost::Cycle * 50) +
        Env::Cost::SaveVar_For(sizeof(WordCount)) +
        Env::Cost::Cycle * 500;

    nCharge += nCharge / 10; // 10% safety margin

    Env::GenerateKernel(&cid, pArg->s_iMethod, pArg, nArgSize, nullptr, 0, &kid, 1,
        "Add words to Fuddle word list", nCharge);
}

ON_METHOD(manager, mint)
{
    Method::Mint arg;
    _POD_(arg.m_Key.m_pkUser).SetZero();
    arg.m_Key.m_Char = (Letter::Char)char_id;
    arg.m_Count = count;

    AdminKeyID kid;
    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Mint Fuddle letters", 0);
}

ON_METHOD(manager, update_settings)
{
    Method::UpdateSettings arg;
    arg.m_LetterPrice = letter_price;
    arg.m_LootboxSmallPrice = lootbox_small_price;
    arg.m_LootboxLargePrice = lootbox_large_price;
    arg.m_TournamentDuration = tournament_duration;

    // Per-tier configuration
    arg.m_TierAssets[0] = tier0_asset;
    arg.m_TierAssets[1] = tier1_asset;
    arg.m_TierAssets[2] = tier2_asset;
    arg.m_TierEntryCost[0] = tier0_cost;
    arg.m_TierEntryCost[1] = tier1_cost;
    arg.m_TierEntryCost[2] = tier2_cost;

    // v7: DEX config
    arg.m_PoolKind = (uint8_t)pool_kind;
    arg.m_FomoAssetId = fomo_asset_id;

    AdminKeyID kid;
    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Update Fuddle settings", 0);
}

ON_METHOD(manager, withdraw_fees)
{
    Method::WithdrawFees arg;
    arg.m_Amount = amount;

    FundsChange fc;
    fc.m_Aid = 0;
    fc.m_Amount = amount;
    fc.m_Consume = 0;

    AdminKeyID kid;
    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Withdraw Fuddle owner fees", 1200000);
}

ON_METHOD(manager, view_word_counts)
{
    Env::DocGroup root("word_counts");

    for (uint8_t len = MIN_WORD_LEN; len <= MAX_WORD_LEN; len++)
    {
        Env::Key_T<WordCount::Key> key;
        _POD_(key.m_Prefix.m_Cid) = cid;
        key.m_KeyInContract.m_Tag = Tags::s_WordCount;
        key.m_KeyInContract.m_Length = len;

        WordCount wc;
        if (Env::VarReader::Read_T(key, wc))
        {
            if (len == 4) Env::DocAddNum("len4", wc.m_Count);
            else if (len == 5) Env::DocAddNum("len5", wc.m_Count);
            else Env::DocAddNum("len6", wc.m_Count);
        }
        else
        {
            if (len == 4) Env::DocAddNum("len4", (uint32_t)0);
            else if (len == 5) Env::DocAddNum("len5", (uint32_t)0);
            else Env::DocAddNum("len6", (uint32_t)0);
        }
    }
}

// =========================================================================
// USER METHODS - Views
// =========================================================================

ON_METHOD(user, view_games)
{
    Env::Key_T<Game::Key> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    _POD_(keyFrom.m_KeyInContract).SetZero();
    keyFrom.m_KeyInContract.m_Tag = Tags::s_Game;
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);
    keyTo.m_KeyInContract.m_Tag = Tags::s_Game;

    Env::DocArray arrGames("games");

    for (Env::VarReader r(keyFrom, keyTo); ; )
    {
        Env::Key_T<Game::Key> key;
        Game game;
        if (!r.MoveNext_T(key, game))
            break;

        Env::DocGroup gr("");
        Env::DocAddNum("id", key.m_KeyInContract.m_GameId);
        Env::DocAddNum("difficulty", (uint32_t)game.m_Difficulty);
        Env::DocAddNum("tier", (uint32_t)game.m_Tier);
        Env::DocAddNum("status", (uint32_t)game.m_Status);
        Env::DocAddNum("tournament_round", game.m_TournamentRound);
        Env::DocAddNum("created_at", game.m_CreatedAt);
        Env::DocAddNum("expires_at", game.m_ExpiresAt);
        Env::DocAddNum("max_attempts", (uint32_t)game.m_MaxAttempts);
        Env::DocAddBlob_T("creator", game.m_Creator);
    }
}

ON_METHOD(user, view_game)
{
    Env::Key_T<Game::Key> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    key.m_KeyInContract.m_Tag = Tags::s_Game;
    key.m_KeyInContract.m_GameId = game_id;

    Game game;
    if (!Env::VarReader::Read_T(key, game)) {
        Env::DocAddText("error", "Game not found");
        return;
    }

    Env::DocGroup root("game");
    Env::DocAddNum("id", game_id);
    Env::DocAddNum("difficulty", (uint32_t)game.m_Difficulty);
    Env::DocAddNum("tier", (uint32_t)game.m_Tier);
    Env::DocAddNum("status", (uint32_t)game.m_Status);
    Env::DocAddNum("tournament_round", game.m_TournamentRound);
    Env::DocAddNum("created_at", game.m_CreatedAt);
    Env::DocAddNum("expires_at", game.m_ExpiresAt);
    Env::DocAddNum("max_attempts", (uint32_t)game.m_MaxAttempts);
    Env::DocAddBlob_T("creator", game.m_Creator);
}

ON_METHOD(user, view_my_game)
{
    PubKey myPk;
    DeriveMyPk(myPk, cid);

    Env::Key_T<Game::Key> gKey;
    _POD_(gKey.m_Prefix.m_Cid) = cid;
    gKey.m_KeyInContract.m_Tag = Tags::s_Game;
    gKey.m_KeyInContract.m_GameId = game_id;

    Game game;
    uint8_t wordLen = 5;
    if (Env::VarReader::Read_T(gKey, game))
        wordLen = game.m_Difficulty;

    Env::Key_T<PlayerGame::Key> pgKey;
    _POD_(pgKey.m_Prefix.m_Cid) = cid;
    pgKey.m_KeyInContract.m_Tag = Tags::s_PlayerGame;
    pgKey.m_KeyInContract.m_GameId = game_id;
    _POD_(pgKey.m_KeyInContract.m_Player) = myPk;

    PlayerGame pg;
    bool hasJoined = Env::VarReader::Read_T(pgKey, pg);

    Env::DocGroup root("my_game");
    Env::DocAddNum("game_id", game_id);
    Env::DocAddNum("joined", (uint32_t)(hasJoined ? 1 : 0));
    Env::DocAddNum("difficulty", (uint32_t)wordLen);

    if (hasJoined)
    {
        Env::DocAddNum("attempts_used", (uint32_t)pg.m_AttemptsUsed);
        Env::DocAddNum("status", (uint32_t)pg.m_Status);
        Env::DocAddNum("score", pg.m_Score);

        Env::DocArray arrGuesses("guesses");
        for (uint8_t i = 0; i < pg.m_AttemptsUsed; i++)
        {
            Env::Key_T<GuessResult::Key> grKey;
            _POD_(grKey.m_Prefix.m_Cid) = cid;
            grKey.m_KeyInContract.m_Tag = Tags::s_Guess;
            grKey.m_KeyInContract.m_GameId = game_id;
            _POD_(grKey.m_KeyInContract.m_Player) = myPk;
            grKey.m_KeyInContract.m_AttemptNum = i;

            GuessResult gr;
            if (Env::VarReader::Read_T(grKey, gr))
            {
                Env::DocGroup grp("");
                Env::DocAddNum("attempt", (uint32_t)i);
                {
                    Env::DocArray arrG("guess");
                    for (uint32_t j = 0; j < wordLen; j++)
                        Env::DocAddNum32("", gr.m_Guess[j]);
                }
                {
                    Env::DocArray arrF("feedback");
                    for (uint32_t j = 0; j < wordLen; j++)
                        Env::DocAddNum32("", (uint32_t)gr.m_Feedback[j]);
                }
            }
        }
    }
}

ON_METHOD(user, view_letters)
{
    PubKey myPk;
    DeriveMyPk(myPk, cid);

    Env::Key_T<Letter::Key> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    _POD_(keyFrom.m_KeyInContract).SetZero();
    keyFrom.m_KeyInContract.m_Tag = Tags::s_Letter;
    _POD_(keyFrom.m_KeyInContract.m_Raw.m_pkUser) = myPk;
    keyFrom.m_KeyInContract.m_Raw.m_Char = 0;
    _POD_(keyTo.m_KeyInContract).SetZero();
    keyTo.m_KeyInContract.m_Tag = Tags::s_Letter;
    _POD_(keyTo.m_KeyInContract.m_Raw.m_pkUser) = myPk;
    keyTo.m_KeyInContract.m_Raw.m_Char = 25;

    Env::DocArray arrLetters("letters");

    for (Env::VarReader r(keyFrom, keyTo); ; )
    {
        Env::Key_T<Letter::Key> key;
        Letter let;
        if (!r.MoveNext_T(key, let))
            break;

        Env::DocGroup gr("");
        Env::DocAddNum("char", key.m_KeyInContract.m_Raw.m_Char);
        Env::DocAddNum("count", let.m_Count);
        Env::DocAddNum("price", let.m_Price.m_Amount);
        Env::DocAddNum("price_aid", let.m_Price.m_Aid);
    }
}

ON_METHOD(user, view_leaderboard)
{
    Env::Key_T<PlayerStats::Key> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    _POD_(keyFrom.m_KeyInContract).SetZero();
    keyFrom.m_KeyInContract.m_Tag = Tags::s_Stats;
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);
    keyTo.m_KeyInContract.m_Tag = Tags::s_Stats;

    Env::DocArray arrLeaderboard("leaderboard");

    for (Env::VarReader r(keyFrom, keyTo); ; )
    {
        Env::Key_T<PlayerStats::Key> key;
        PlayerStats stats;
        if (!r.MoveNext_T(key, stats))
            break;

        if (stats.m_GamesPlayed == 0)
            continue;

        Env::DocGroup gr("");
        Env::DocAddBlob_T("player", key.m_KeyInContract.m_Player);
        Env::DocAddNum("games_played", stats.m_GamesPlayed);
        Env::DocAddNum("games_won", stats.m_GamesWon);
        Env::DocAddNum("total_score", stats.m_TotalScore);
        Env::DocAddNum("best_streak", stats.m_BestStreak);
        Env::DocAddNum("current_streak", stats.m_CurrentStreak);
    }
}

ON_METHOD(user, view_my_stats)
{
    PubKey myPk;
    DeriveMyPk(myPk, cid);

    Env::Key_T<PlayerStats::Key> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    key.m_KeyInContract.m_Tag = Tags::s_Stats;
    _POD_(key.m_KeyInContract.m_Player) = myPk;

    PlayerStats stats;
    Env::DocGroup root("stats");

    if (Env::VarReader::Read_T(key, stats))
    {
        Env::DocAddNum("games_played", stats.m_GamesPlayed);
        Env::DocAddNum("games_won", stats.m_GamesWon);
        Env::DocAddNum("total_score", stats.m_TotalScore);
        Env::DocAddNum("best_streak", stats.m_BestStreak);
        Env::DocAddNum("current_streak", stats.m_CurrentStreak);
    }
    else
    {
        Env::DocAddNum("games_played", (uint32_t)0);
        Env::DocAddNum("games_won", (uint32_t)0);
        Env::DocAddNum("total_score", (uint32_t)0);
        Env::DocAddNum("best_streak", (uint32_t)0);
        Env::DocAddNum("current_streak", (uint32_t)0);
    }

    Env::DocAddBlob_T("pk", myPk);
}

// =========================================================================
// USER METHODS - Tournament Views
// =========================================================================

ON_METHOD(user, view_tournament)
{
    // Load state to get current round for this tier
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    uint8_t t = (uint8_t)tier;
    if (t >= NUM_TIERS) {
        Env::DocAddText("error", "Invalid tier (0/1/2)");
        return;
    }

    // If round is 0, use current round; otherwise use specified round
    uint32_t r = round;
    if (!r)
        r = s.m_TournamentRounds[t];

    Env::DocGroup root("tournament");
    Env::DocAddNum("tier_asset", s.m_TierAssets[t]);
    Env::DocAddNum("tier_entry_cost", s.m_TierEntryCost[t]);
    OutputTournament(cid, t, r);
    Env::DocAddNum("pending_pool", s.m_TierPools[t]);
    Env::DocAddNum("current_round", s.m_TournamentRounds[t]);
}

ON_METHOD(user, view_my_tournament)
{
    PubKey myPk;
    DeriveMyPk(myPk, cid);

    uint8_t t = (uint8_t)tier;
    if (t >= NUM_TIERS) {
        Env::DocAddText("error", "Invalid tier (0/1/2)");
        return;
    }

    // If round is 0, look up current round from state
    uint32_t r = round;
    if (!r) {
        Env::Key_T<uint8_t> sKey;
        _POD_(sKey.m_Prefix.m_Cid) = cid;
        sKey.m_KeyInContract = Tags::s_State;
        State s;
        if (Env::VarReader::Read_T(sKey, s))
            r = s.m_TournamentRounds[t];
    }

    Env::DocGroup root("my_tournament");
    Env::DocAddNum("tier", (uint32_t)t);
    Env::DocAddNum("round", r);

    if (!r) {
        Env::DocAddNum("score", (uint32_t)0);
        Env::DocAddNum("claimed", (uint32_t)0);
        Env::DocAddNum("estimated_reward", (Amount)0);
        return;
    }

    // Load tournament player entry
    Env::Key_T<TournamentPlayer::Key> tpKey;
    _POD_(tpKey.m_Prefix.m_Cid) = cid;
    tpKey.m_KeyInContract.m_Tag = Tags::s_TournamentPlayer;
    tpKey.m_KeyInContract.m_Tier = t;
    tpKey.m_KeyInContract.m_Round = r;
    _POD_(tpKey.m_KeyInContract.m_Player) = myPk;

    TournamentPlayer tp;
    if (Env::VarReader::Read_T(tpKey, tp))
    {
        Env::DocAddNum("score", tp.m_Score);
        Env::DocAddNum("claimed", (uint32_t)tp.m_Claimed);

        // Estimate reward
        Env::Key_T<Tournament::Key> tk;
        _POD_(tk.m_Prefix.m_Cid) = cid;
        tk.m_KeyInContract.m_Tag = Tags::s_Tournament;
        tk.m_KeyInContract.m_Tier = t;
        tk.m_KeyInContract.m_Round = r;

        Tournament tt;
        if (Env::VarReader::Read_T(tk, tt) && tt.m_TotalScores)
        {
            Amount distributable = (tt.m_PrizePool * DISTRIBUTION_PCT) / 100;
            Amount est = (distributable * tp.m_Score) / tt.m_TotalScores;
            Env::DocAddNum("estimated_reward", est);
        }
        else
        {
            Env::DocAddNum("estimated_reward", (Amount)0);
        }
    }
    else
    {
        Env::DocAddNum("score", (uint32_t)0);
        Env::DocAddNum("claimed", (uint32_t)0);
        Env::DocAddNum("estimated_reward", (Amount)0);
    }
}

ON_METHOD(user, view_all_tournaments)
{
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Env::DocAddNum("tournament_duration", s.m_TournamentDuration);

    Env::DocArray arr("tournaments");
    for (uint8_t i = 0; i < NUM_TIERS; i++)
    {
        uint32_t round = s.m_TournamentRounds[i];

        Env::DocGroup gr("");
        Env::DocAddNum("tier_asset", s.m_TierAssets[i]);
        Env::DocAddNum("tier_entry_cost", s.m_TierEntryCost[i]);
        OutputTournament(cid, i, round);
        Env::DocAddNum("pending_pool", s.m_TierPools[i]);
    }
}

// =========================================================================
// USER METHODS - Transactions
// =========================================================================

ON_METHOD(user, create_game)
{
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    uint8_t t = (uint8_t)tier;
    if (t >= NUM_TIERS) {
        Env::DocAddText("error", "Invalid tier (0/1/2)");
        return;
    }

    Method::CreateGame arg;
    DeriveMyPk(arg.m_pkCreator, cid);
    arg.m_Difficulty = (uint8_t)difficulty;
    arg.m_Tier = t;
    arg.m_TokensToPool = 0;
    arg.m_FomoToBuyback = 0;

    // v7: Determine entry cost from active tournament (round-locked)
    AssetID entryAsset = s.m_TierAssets[t];
    Amount entryCost = s.m_TierEntryCost[t];

    uint32_t round = s.m_TournamentRounds[t];
    if (round > 0) {
        Env::Key_T<Tournament::Key> tKey;
        _POD_(tKey.m_Prefix.m_Cid) = cid;
        tKey.m_KeyInContract.m_Tag = Tags::s_Tournament;
        tKey.m_KeyInContract.m_Tier = t;
        tKey.m_KeyInContract.m_Round = round;
        Tournament tourn;
        if (Env::VarReader::Read_T(tKey, tourn) && !tourn.m_Finalized) {
            entryAsset = tourn.m_Asset;
            entryCost = tourn.m_EntryCost;
        }
    }

    FundsChange fc;
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    if (entryAsset == 0)
    {
        // BEAM tier: pay BEAM directly (no DEX swap)
        fc.m_Aid = 0;
        fc.m_Amount = entryCost;
        fc.m_Consume = 1;

        Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
            "Create Fuddle game", 1200000);
    }
    else
    {
        // Non-BEAM tier: simulate DEX swaps, pay BEAM
        Amount halfBeam = entryCost / 2;
        Amount otherHalf = entryCost - halfBeam;

        // Read BEAM/TierToken pool
        Amount beamRes1, tokenRes1;
        if (!ReadAmmPool(s.m_DexCid, entryAsset, s.m_PoolKind, beamRes1, tokenRes1)) {
            Env::DocAddText("error", "DEX pool not found for tier token");
            return;
        }

        // Simulate trade 1: halfBeam BEAM → tier token
        TradeSimResult trade1;
        SimulateTrade(tokenRes1, beamRes1, halfBeam, s.m_PoolKind, trade1);

        // Read/update reserves for trade 2
        Amount beamRes2, tokenRes2;
        if (entryAsset == s.m_FomoAssetId) {
            // Same pool (FOMO tier) — use updated reserves after trade 1
            beamRes2 = beamRes1 + trade1.m_PayPool;
            tokenRes2 = tokenRes1 - trade1.m_Buy1;
        } else {
            // Different pool (BEAMX tier) — read BEAM/FOMO pool
            if (!ReadAmmPool(s.m_DexCid, s.m_FomoAssetId, s.m_PoolKind, beamRes2, tokenRes2)) {
                Env::DocAddText("error", "DEX pool not found for FOMO");
                return;
            }
        }

        // Simulate trade 2: otherHalf BEAM → FOMO
        TradeSimResult trade2;
        SimulateTrade(tokenRes2, beamRes2, otherHalf, s.m_PoolKind, trade2);

        if (!trade1.m_Buy1 || !trade2.m_Buy1) {
            Env::DocAddText("error", "Entry cost too small for DEX swap");
            return;
        }

        // Actual BEAM consumed by AMM
        Amount actualBeam = trade1.m_TotalPay + trade2.m_TotalPay;

        arg.m_TokensToPool = trade1.m_Buy1;
        arg.m_FomoToBuyback = trade2.m_Buy1;

        // FundsChange: user pays exact BEAM consumed
        fc.m_Aid = 0;
        fc.m_Amount = actualBeam;
        fc.m_Consume = 1;

        // Higher nCharge for DEX trades (CallFar overhead)
        uint32_t nCharge = Env::Cost::CallFar * 5 +
            Env::Cost::LoadVar_For(sizeof(State)) * 2 +
            Env::Cost::SaveVar_For(sizeof(State)) +
            Env::Cost::SaveVar_For(sizeof(Tournament)) +
            Env::Cost::FundsLock * 8 +
            Env::Cost::AddSig +
            Env::Cost::Cycle * 50000;

        Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
            "Create Fuddle game (DEX swap)", nCharge);
    }
}

ON_METHOD(user, buy_letters)
{
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Method::BuyLetters arg;
    DeriveMyPk(arg.m_pkUser, cid);
    arg.m_Char = (Letter::Char)char_id;
    arg.m_Count = count;

    Amount totalCost = s.m_LetterPrice * count;

    // Letters always paid in BEAM
    FundsChange fc;
    fc.m_Aid = 0;
    fc.m_Amount = totalCost;
    fc.m_Consume = 1;

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Buy Fuddle letters", 1200000);
}

ON_METHOD(user, buy_lootbox)
{
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Method::BuyLootbox arg;
    DeriveMyPk(arg.m_pkUser, cid);
    arg.m_Size = (uint8_t)size;

    Amount price = (size == 0) ? s.m_LootboxSmallPrice : s.m_LootboxLargePrice;

    // Lootboxes always paid in BEAM
    FundsChange fc;
    fc.m_Aid = 0;
    fc.m_Amount = price;
    fc.m_Consume = 1;

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Buy Fuddle loot box", 1200000);
}

ON_METHOD(user, submit_guess)
{
    Method::SubmitGuess arg;
    DeriveMyPk(arg.m_pkUser, cid);
    arg.m_GameId = game_id;
    arg.m_Guess[0] = (Letter::Char)g0;
    arg.m_Guess[1] = (Letter::Char)g1;
    arg.m_Guess[2] = (Letter::Char)g2;
    arg.m_Guess[3] = (Letter::Char)g3;
    arg.m_Guess[4] = (Letter::Char)g4;
    arg.m_Guess[5] = (Letter::Char)g5;

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Submit Fuddle guess", 1800000);
}

ON_METHOD(user, claim_tournament_reward)
{
    // Load tournament to estimate reward for FundsChange
    Env::Key_T<Tournament::Key> tk;
    _POD_(tk.m_Prefix.m_Cid) = cid;
    tk.m_KeyInContract.m_Tag = Tags::s_Tournament;
    tk.m_KeyInContract.m_Tier = (uint8_t)tier;
    tk.m_KeyInContract.m_Round = round;

    Tournament t;
    Amount estReward = 0;
    if (Env::VarReader::Read_T(tk, t))
    {
        PubKey myPk;
        DeriveMyPk(myPk, cid);

        Env::Key_T<TournamentPlayer::Key> tpKey;
        _POD_(tpKey.m_Prefix.m_Cid) = cid;
        tpKey.m_KeyInContract.m_Tag = Tags::s_TournamentPlayer;
        tpKey.m_KeyInContract.m_Tier = (uint8_t)tier;
        tpKey.m_KeyInContract.m_Round = round;
        _POD_(tpKey.m_KeyInContract.m_Player) = myPk;

        TournamentPlayer tp;
        if (Env::VarReader::Read_T(tpKey, tp) && t.m_TotalScores)
        {
            Amount distributable = (t.m_PrizePool * DISTRIBUTION_PCT) / 100;
            estReward = (distributable * tp.m_Score) / t.m_TotalScores;
        }
    }

    Method::ClaimTournamentReward arg;
    DeriveMyPk(arg.m_pkUser, cid);
    arg.m_Tier = (uint8_t)tier;
    arg.m_Round = round;

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    // v6: Include FundsChange so tokens go directly to wallet
    if (estReward > 0 && Env::VarReader::Read_T(tk, t))
    {
        FundsChange fc;
        fc.m_Aid = t.m_Asset;
        fc.m_Amount = estReward;
        fc.m_Consume = 0;

        Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
            "Claim Fuddle tournament reward", 1200000);
    }
    else
    {
        Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
            "Claim Fuddle tournament reward", 1200000);
    }
}

ON_METHOD(user, withdraw)
{
    Method::Withdraw arg;
    DeriveMyPk(arg.m_pkUser, cid);
    arg.m_Val.m_Amount = amount;
    arg.m_Val.m_Aid = asset_id;

    FundsChange fc;
    fc.m_Aid = asset_id;
    fc.m_Amount = amount;
    fc.m_Consume = 0;

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Withdraw Fuddle balance", 1200000);
}

ON_METHOD(user, set_price)
{
    Method::SetPrice arg;
    DeriveMyPk(arg.m_Key.m_pkUser, cid);
    arg.m_Key.m_Char = (Letter::Char)char_id;
    arg.m_Price.m_Amount = price;
    arg.m_Price.m_Aid = price_aid;

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Set letter price", 0);
}

ON_METHOD(user, buy_from_player)
{
    Env::Key_T<Letter::Key> lKey;
    _POD_(lKey.m_Prefix.m_Cid) = cid;
    lKey.m_KeyInContract.m_Tag = Tags::s_Letter;
    _POD_(lKey.m_KeyInContract.m_Raw.m_pkUser) = seller;
    lKey.m_KeyInContract.m_Raw.m_Char = (Letter::Char)char_id;

    Letter let;
    if (!Env::VarReader::Read_T(lKey, let)) {
        Env::DocAddText("error", "Letter not found");
        return;
    }

    Method::BuyFromPlayer arg;
    _POD_(arg.m_Key.m_pkUser) = seller;
    arg.m_Key.m_Char = (Letter::Char)char_id;
    DeriveMyPk(arg.m_pkNewOwner, cid);

    FundsChange fc;
    fc.m_Aid = let.m_Price.m_Aid;
    fc.m_Amount = let.m_Price.m_Amount;
    fc.m_Consume = 1;

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Buy letter from player", 1200000);
}

ON_METHOD(user, end_game)
{
    Method::EndGame arg;
    arg.m_GameId = game_id;

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "End expired Fuddle game", 0);
}

ON_METHOD(user, donate_to_pool)
{
    // Read state to determine the tier's asset
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;

    State s;
    if (!Env::VarReader::Read_T(sKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    uint8_t t = (uint8_t)tier;
    if (t >= NUM_TIERS) {
        Env::DocAddText("error", "Invalid tier (0/1/2)");
        return;
    }

    Method::DonateToPool arg;
    arg.m_Tier = t;
    arg.m_Amount = amount;

    // v5: Use tournament's asset if active round exists, settings otherwise
    AssetID donateAid = s.m_TierAssets[t];
    uint32_t round = s.m_TournamentRounds[t];
    if (round > 0) {
        Env::Key_T<Tournament::Key> tKey;
        _POD_(tKey.m_Prefix.m_Cid) = cid;
        tKey.m_KeyInContract.m_Tag = Tags::s_Tournament;
        tKey.m_KeyInContract.m_Tier = t;
        tKey.m_KeyInContract.m_Round = round;
        Tournament tourn;
        if (Env::VarReader::Read_T(tKey, tourn) && !tourn.m_Finalized) {
            donateAid = tourn.m_Asset;
        }
    }

    FundsChange fc;
    fc.m_Aid = donateAid;
    fc.m_Amount = amount;
    fc.m_Consume = 1;

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, nullptr, 0,
        "Donate to Fuddle tournament pool", 1200000);
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
        "Emergency withdraw from Fuddle", 1200000);
}

ON_METHOD(manager, force_finalize)
{
    Method::ForceFinalize arg;
    arg.m_Tier = (uint8_t)tier;
    arg.m_Round = round;

    AdminKeyID kid;
    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Force finalize Fuddle tournament", 1200000);
}

ON_METHOD(manager, withdraw_fomo_fees)
{
    Method::WithdrawFomoFees arg;
    arg.m_Amount = amount;

    // Read state to get FOMO asset ID
    Env::Key_T<uint8_t> sKey;
    _POD_(sKey.m_Prefix.m_Cid) = cid;
    sKey.m_KeyInContract = Tags::s_State;
    State s;
    AssetID fomoAid = 174; // default
    if (Env::VarReader::Read_T(sKey, s))
        fomoAid = s.m_FomoAssetId;

    FundsChange fc;
    fc.m_Aid = fomoAid;
    fc.m_Amount = amount;
    fc.m_Consume = 0;

    AdminKeyID kid;
    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Withdraw Fuddle FOMO fees", 1200000);
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
        Fuddle_##role##_##name(PAR_READ) \
        On_##role##_##name(Fuddle_##role##_##name(PAR_PASS) 0); \
        return; \
    }

#define THE_ROLE(name) \
    if (!Env::Strcmp(szRole, #name)) { \
        FuddleRole_##name(THE_METHOD) \
    }

    FuddleRoles_All(THE_ROLE)

#undef THE_ROLE
#undef THE_METHOD
#undef PAR_PASS
#undef PAR_READ
}
