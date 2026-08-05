// =============================================================================
// Fuddle v7 - On-Chain Wordle with DEX Auto-Swap Entry Fees
// =============================================================================
// Contract shader (validator-side): all game logic
//
// Methods:
//   0  Ctor           - Initialize contract with admin + settings + DEX config
//   1  Dtor           - Destroy contract (admin only)
//   2  Upgrade        - Handle upgrades (admin only)
//   3  AddWords       - Admin adds words to on-chain word list (KeyTag::Internal)
//   4  CreateGame     - Pay BEAM, auto-swap via DEX for non-BEAM tiers
//   5  BuyLetters     - Pay BEAM for specific letters (revenue → owner fees)
//   6  BuyLootbox     - Pay BEAM for random letters (random per-letter generation)
//   7  SubmitGuess    - Submit guess, on-chain Wordle verification, tournament score
//   8  ClaimTournamentReward - Claim + direct FundsUnlock (tokens go to wallet)
//   9  Withdraw       - Withdraw accumulated payout balance (legacy + marketplace)
//  10  SetPrice       - List letter for sale to other players
//  11  BuyFromPlayer  - Buy letter from another player
//  12  Mint           - Admin creates letters (seeding)
//  13  EndGame        - Expire game (permissionless after expiry)
//  14  UpdateSettings - Admin updates prices/fees/tournament config + DEX
//  15  WithdrawFees   - Owner withdraws owner fees (always BEAM)
//  16  DonateToPool   - Anyone donates tier's asset to a tier's prize pool
//  17  EmergencyWithdraw - Admin withdraws any asset (stuck funds recovery)
//  18  ForceFinalize  - Admin force-ends a tournament round early
//  19  WithdrawFomoFees - Admin withdraws accumulated FOMO from buybacks
//
// v7 changes:
//   - Entry fees always in BEAM, auto-swapped via DEX CallFar for non-BEAM tiers
//   - 50% BEAM → tier token → prize pool, 50% BEAM → FOMO → admin fees
//   - Method 19: WithdrawFomoFees for admin FOMO withdrawal
//   - No-player carryover: if TotalScores==0, 100% prize pool carries to next round
// v6 changes:
//   - Claim now does direct FundsUnlock (no payout ledger, tokens go to wallet)
//   - Auto-finalize in Claim saves 50% carryover to TierPools for next round
//     (v5 bug: carryover was lost when claim triggered auto-finalize)
//   - Withdraw (Method 9) kept for legacy payout balances + letter marketplace
// =============================================================================

#include "common.h"
#include "Math.h"
#include "contract.h"

namespace Fuddle {

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
__attribute__((always_inline)) void PayoutMove(const PubKey& pkUser, const AmountWithAsset& x, bool bAdd)
{
    if (!x.m_Amount)
        return;

    Payout::Key pk;
    _POD_(pk.m_pkUser) = pkUser;
    pk.m_Aid = x.m_Aid;

    if (bAdd)
        Env::FundsLock(x.m_Aid, x.m_Amount);
    else
        Env::FundsUnlock(x.m_Aid, x.m_Amount);

    Payout po;
    if (Env::LoadVar_T(pk, po))
    {
        if (bAdd)
            Strict::Add(po.m_Amount, x.m_Amount);
        else
        {
            Strict::Sub(po.m_Amount, x.m_Amount);
            if (!po.m_Amount)
            {
                Env::DelVar_T(pk);
                return;
            }
        }
    }
    else
    {
        Env::Halt_if(!bAdd);
        po.m_Amount = x.m_Amount;
    }

    Env::SaveVar_T(pk, po);
}

__attribute__((always_inline)) void PayoutAdd(const PubKey& pkUser, Amount amount, AssetID aid)
{
    AmountWithAsset x;
    x.m_Amount = amount;
    x.m_Aid = aid;
    PayoutMove(pkUser, x, true);
}

// Add to payout balance without FundsLock (funds already locked in contract)
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

// =========================================================================
// Letter management
// =========================================================================
__attribute__((always_inline)) void AddLetter(const PubKey& pkUser, Letter::Char ch, uint32_t n = 1)
{
    if (!n)
        return;

    Letter::Key lk;
    _POD_(lk.m_Raw.m_pkUser) = pkUser;
    lk.m_Raw.m_Char = ch;

    Letter let;
    if (Env::LoadVar_T(lk, let))
        Strict::Add(let.m_Count, n);
    else
    {
        _POD_(let).SetZero();
        let.m_Count = n;
    }

    Env::SaveVar_T(lk, let);
}

__attribute__((always_inline)) void DecAndSave(const Letter::Key& lk, Letter& let)
{
    if (--let.m_Count)
        Env::SaveVar_T(lk, let);
    else
        Env::DelVar_T(lk);
}

// =========================================================================
// Scoring
// =========================================================================
__attribute__((always_inline)) uint32_t CalcScore(uint32_t attempts, uint8_t difficulty)
{
    uint32_t base = 1000;
    uint32_t attemptBonus = (MAX_ATTEMPTS + 1 - attempts) * 150;
    uint32_t multiplier;

    if (difficulty == 4) multiplier = 100;
    else if (difficulty == 5) multiplier = 125;
    else multiplier = 150; // 6-letter

    return (base + attemptBonus) * multiplier / 100;
}

// =========================================================================
// Player stats
// =========================================================================
__attribute__((always_inline)) void UpdatePlayerStats(const PubKey& pk, uint32_t score, bool won)
{
    PlayerStats::Key sk;
    _POD_(sk.m_Player) = pk;

    PlayerStats stats;
    if (!Env::LoadVar_T(sk, stats))
        _POD_(stats).SetZero();

    stats.m_GamesPlayed++;

    if (won)
    {
        stats.m_GamesWon++;
        Strict::Add(stats.m_TotalScore, score);
        stats.m_CurrentStreak++;
        if (stats.m_CurrentStreak > stats.m_BestStreak)
            stats.m_BestStreak = stats.m_CurrentStreak;
    }
    else
    {
        stats.m_CurrentStreak = 0;
    }

    Env::SaveVar_T(sk, stats);
}

// =========================================================================
// Random number generation (block hash entropy)
// =========================================================================
__attribute__((always_inline)) uint32_t GetPseudoRandom(Height h, uint32_t extra1, const PubKey& pk)
{
    BlockHeader::Info hdr;
    hdr.m_Height = h;
    Env::get_HdrInfo(hdr);

    uint64_t val;
    Env::Memcpy(&val, &hdr.m_Hash, sizeof(val));

    val ^= ((uint64_t)extra1 << 32);
    val ^= (uint64_t)h;

    uint64_t pkVal;
    Env::Memcpy(&pkVal, &pk, sizeof(pkVal));
    val ^= pkVal;

    return (uint32_t)(val >> 16);
}

// =========================================================================
// Tournament helpers
// =========================================================================

// Finalize a tournament: mark as finalized, return carryover amount
// If no players scored, 100% carries over. Otherwise 50% distributable / 50% carryover.
__attribute__((always_inline)) Amount FinalizeTournament(Tournament::Key& tk, Tournament& t)
{
    if (t.m_Finalized)
        return 0;

    t.m_Finalized = 1;

    Amount carryover;
    if (t.m_TotalScores == 0)
    {
        // No players scored — carry over entire prize pool to next round
        carryover = t.m_PrizePool;
    }
    else
    {
        // 50% distributable (stays in prize pool for claims), 50% carries over
        carryover = t.m_PrizePool / 2;
    }

    Env::SaveVar_T(tk, t);
    return carryover;
}

// Ensure an active tournament exists for the given tier, auto-starting if needed.
// Returns the tournament round number.
__attribute__((always_inline)) uint32_t EnsureActiveTournament(State& s, uint8_t tier, Height h)
{
    uint32_t round = s.m_TournamentRounds[tier];
    Height duration = s.m_TournamentDuration;
    if (!duration) duration = DEFAULT_TOURNAMENT_DURATION;

    if (round > 0)
    {
        // Check if current tournament is still active
        Tournament::Key tk;
        tk.m_Tier = tier;
        tk.m_Round = round;
        Tournament t;
        if (Env::LoadVar_T(tk, t))
        {
            if (!t.m_Finalized && h <= t.m_EndHeight)
                return round; // Still active

            // Tournament expired — finalize and start new one
            Amount carryover = 0;
            if (!t.m_Finalized)
                carryover = FinalizeTournament(tk, t);

            // If asset changed between rounds, carryover can't transfer (different token).
            // Leave carryover funds in finalized tournament — admin can EmergencyWithdraw.
            if (carryover > 0 && t.m_Asset != s.m_TierAssets[tier])
                carryover = 0;

            // Start new round
            round++;
            s.m_TournamentRounds[tier] = round;

            Tournament newT;
            _POD_(newT).SetZero();
            newT.m_StartHeight = h;
            newT.m_EndHeight = h + duration;
            newT.m_PrizePool = s.m_TierPools[tier] + carryover;
            newT.m_Asset = s.m_TierAssets[tier];
            newT.m_EntryCost = s.m_TierEntryCost[tier];
            s.m_TierPools[tier] = 0;

            Tournament::Key newTk;
            newTk.m_Tier = tier;
            newTk.m_Round = round;
            Env::SaveVar_T(newTk, newT);

            return round;
        }
    }

    // No tournament exists yet — create first one
    round = 1;
    s.m_TournamentRounds[tier] = round;

    Tournament newT;
    _POD_(newT).SetZero();
    newT.m_StartHeight = h;
    newT.m_EndHeight = h + duration;
    newT.m_PrizePool = s.m_TierPools[tier];
    newT.m_Asset = s.m_TierAssets[tier];
    newT.m_EntryCost = s.m_TierEntryCost[tier];
    s.m_TierPools[tier] = 0;

    Tournament::Key newTk;
    newTk.m_Tier = tier;
    newTk.m_Round = round;
    Env::SaveVar_T(newTk, newT);

    return round;
}

// =========================================================================
// Method 0: Ctor - Initialize contract
// =========================================================================
BEAM_EXPORT void Ctor(const Method::Init& r)
{
    State s;
    _POD_(s).SetZero();
    _POD_(s.m_Config) = r.m_Config;
    s.m_GameCount = 0;
    s.m_LetterPrice = r.m_LetterPrice;
    s.m_OwnerFees = 0;
    s.m_LootboxSmallPrice = r.m_LootboxSmallPrice;
    s.m_LootboxLargePrice = r.m_LootboxLargePrice;
    s.m_TournamentDuration = DEFAULT_TOURNAMENT_DURATION;

    // Per-tier tournament configuration
    for (uint8_t i = 0; i < NUM_TIERS; i++)
    {
        s.m_TierAssets[i] = r.m_TierAssets[i];
        s.m_TierEntryCost[i] = r.m_TierEntryCost[i];
    }

    // v7: DEX config
    _POD_(s.m_DexCid) = r.m_DexCid;
    s.m_PoolKind = r.m_PoolKind;
    s.m_FomoAssetId = r.m_FomoAssetId;
    s.m_FomoFees = 0;

    uint8_t key = Tags::s_State;
    Env::SaveVar_T(key, s);
}

// =========================================================================
// Method 1: Dtor - Destroy contract
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
// Method 3: AddWords - Admin adds words to on-chain word list (batch)
// =========================================================================
BEAM_EXPORT void Method_3(const Method::AddWords& r)
{
    Env::Halt_if(r.m_Length < MIN_WORD_LEN || r.m_Length > MAX_WORD_LEN);
    Env::Halt_if(!r.m_NumWords || r.m_NumWords > MAX_WORDS_PER_BATCH);

    MyState s;
    s.AddSigAdmin();

    WordCount::Key wck;
    wck.m_Length = r.m_Length;
    WordCount wc;
    if (!Env::LoadVar_T(wck, wc))
        wc.m_Count = 0;

    const Letter::Char* pData = (const Letter::Char*)(&r + 1);

    for (uint32_t i = 0; i < r.m_NumWords; i++)
    {
        WordEntry::Key wek;
        wek.m_Length = r.m_Length;
        wek.m_Index = wc.m_Count;

        const Letter::Char* pWord = pData + i * r.m_Length;
        uint32_t nBlobSize = sizeof(Letter::Char) * r.m_Length;

        Env::SaveVar(&wek, sizeof(wek), pWord, nBlobSize, KeyTag::Internal);
        wc.m_Count++;
    }

    Env::SaveVar_T(wck, wc);
}

// =========================================================================
// Method 4: CreateGame - Single-player game, tournament-linked
// v7: Entry fee always in BEAM. Non-BEAM tiers: auto-swap via DEX CallFar
//   - BEAM tier: 100% BEAM → prize pool (no swap)
//   - Non-BEAM: 50% BEAM → DEX → tier token → pool, 50% BEAM → DEX → FOMO → fees
// =========================================================================
BEAM_EXPORT void Method_4(const Method::CreateGame& r)
{
    Env::Halt_if(r.m_Difficulty < MIN_WORD_LEN || r.m_Difficulty > MAX_WORD_LEN);
    Env::Halt_if(r.m_Tier >= NUM_TIERS);

    MyState s;

    // Check word list has words for this difficulty
    WordCount::Key wck;
    wck.m_Length = r.m_Difficulty;
    WordCount wc;
    Env::Halt_if(!Env::LoadVar_T(wck, wc) || !wc.m_Count);

    Height h = Env::get_Height();

    // Ensure active tournament (auto-starts if needed, stores settings at creation)
    uint32_t tournRound = EnsureActiveTournament(s, r.m_Tier, h);

    // Read entry cost/asset FROM TOURNAMENT (round-locked, not settings)
    Tournament::Key tk;
    tk.m_Tier = r.m_Tier;
    tk.m_Round = tournRound;
    Tournament t;
    Env::Halt_if(!Env::LoadVar_T(tk, t));

    Amount entryCost = t.m_EntryCost;
    AssetID entryAsset = t.m_Asset;

    if (entryAsset == 0)
    {
        // BEAM tier: direct to pool (no DEX swap needed)
        Env::FundsLock(0, entryCost);
        Strict::Add(t.m_PrizePool, entryCost);
    }
    else
    {
        // Non-BEAM tier: BEAM is in global fund pool (from user's FundsChange)
        // AMM CallFar takes BEAM from fund pool, gives tokens to fund pool

        // Trade 1: ~50% BEAM → tier token → prize pool
        if (r.m_TokensToPool)
        {
            AmmTrade trade1;
            trade1.m_Pid.m_Aid1 = entryAsset;
            trade1.m_Pid.m_Aid2 = 0;  // BEAM
            trade1.m_Pid.m_Kind = s.m_PoolKind;
            trade1.m_Buy1 = r.m_TokensToPool;
            Env::CallFar_T(s.m_DexCid, trade1);
            // AMM took BEAM from pool, gave tier tokens to pool
            Env::FundsLock(entryAsset, r.m_TokensToPool);
            Strict::Add(t.m_PrizePool, r.m_TokensToPool);
        }

        // Trade 2: ~50% BEAM → FOMO → admin fees
        if (r.m_FomoToBuyback)
        {
            AmmTrade trade2;
            trade2.m_Pid.m_Aid1 = s.m_FomoAssetId;
            trade2.m_Pid.m_Aid2 = 0;  // BEAM
            trade2.m_Pid.m_Kind = s.m_PoolKind;
            trade2.m_Buy1 = r.m_FomoToBuyback;
            Env::CallFar_T(s.m_DexCid, trade2);
            // AMM took BEAM from pool, gave FOMO to pool
            Env::FundsLock(s.m_FomoAssetId, r.m_FomoToBuyback);
            Strict::Add(s.m_FomoFees, r.m_FomoToBuyback);
        }
    }
    Env::SaveVar_T(tk, t);

    // Random word selection
    uint32_t rnd = GetPseudoRandom(h, s.m_GameCount, r.m_pkCreator);
    uint32_t wordIndex = rnd % wc.m_Count;

    WordEntry::Key srcKey;
    srcKey.m_Length = r.m_Difficulty;
    srcKey.m_Index = wordIndex;

    Letter::Char word[MAX_WORD_LEN];
    uint32_t nSizeChars = sizeof(Letter::Char) * r.m_Difficulty;
    Env::LoadVar(&srcKey, sizeof(srcKey), word, nSizeChars, KeyTag::Internal);

    // Store as game's hidden word
    uint32_t gameId = ++s.m_GameCount;
    GameWord::Key gwk;
    gwk.m_GameId = gameId;
    Env::SaveVar(&gwk, sizeof(gwk), word, nSizeChars, KeyTag::Internal);

    // Create game metadata
    Game game;
    _POD_(game).SetZero();
    game.m_Difficulty = r.m_Difficulty;
    game.m_MaxAttempts = MAX_ATTEMPTS;
    game.m_Status = GAME_ACTIVE;
    game.m_Tier = r.m_Tier;
    game.m_TournamentRound = tournRound;
    _POD_(game.m_Creator) = r.m_pkCreator;
    game.m_CreatedAt = h;
    game.m_ExpiresAt = h + GAME_DURATION_BLOCKS;

    Game::Key gk;
    gk.m_GameId = gameId;
    Env::SaveVar_T(gk, game);

    // Auto-join: create player game state
    PlayerGame::Key pgk;
    pgk.m_GameId = gameId;
    _POD_(pgk.m_Player) = r.m_pkCreator;
    PlayerGame pg;
    _POD_(pg).SetZero();
    pg.m_StartedAt = h;
    Env::SaveVar_T(pgk, pg);

    s.Save();
    Env::AddSig(r.m_pkCreator);
}

// =========================================================================
// Method 5: BuyLetters - Buy specific letters (always BEAM)
// Revenue: 100% to owner fees
// =========================================================================
BEAM_EXPORT void Method_5(const Method::BuyLetters& r)
{
    Env::Halt_if(r.m_Char > 25);
    Env::Halt_if(!r.m_Count);

    MyState s;
    Amount totalCost = s.m_LetterPrice * r.m_Count;

    Env::Halt_if(!totalCost);
    Env::Halt_if(totalCost / r.m_Count != s.m_LetterPrice);

    // Letters always paid in BEAM
    Env::FundsLock(0, totalCost);

    // 100% to owner fees
    Strict::Add(s.m_OwnerFees, totalCost);

    s.Save();

    AddLetter(r.m_pkUser, r.m_Char, r.m_Count);
    Env::AddSig(r.m_pkUser);
}

// =========================================================================
// Method 6: BuyLootbox - Random letters (always BEAM)
// Revenue: 100% to owner fees
// =========================================================================
BEAM_EXPORT void Method_6(const Method::BuyLootbox& r)
{
    Env::Halt_if(r.m_Size > 1);

    MyState s;
    uint32_t count = (r.m_Size == 0) ? LOOTBOX_SMALL_COUNT : LOOTBOX_LARGE_COUNT;
    Amount price = (r.m_Size == 0) ? s.m_LootboxSmallPrice : s.m_LootboxLargePrice;
    Env::Halt_if(!price);

    // Lootboxes always paid in BEAM
    Env::FundsLock(0, price);

    // 100% to owner fees
    Strict::Add(s.m_OwnerFees, price);

    Height h = Env::get_Height();

    s.Save();

    // Random letter generation - accumulate counts first, then batch-write
    // Reduces BVM storage ops from 2*count to 2*unique_letters (max 26)
    uint32_t letterCounts[26];
    Env::Memset(letterCounts, 0, sizeof(letterCounts));

    for (uint32_t i = 0; i < count; i++)
    {
        uint32_t rnd = GetPseudoRandom(h, i, r.m_pkUser);
        Letter::Char ch = rnd % 26;
        letterCounts[ch]++;
    }

    for (uint32_t ch = 0; ch < 26; ch++)
    {
        if (letterCounts[ch])
            AddLetter(r.m_pkUser, (Letter::Char)ch, letterCounts[ch]);
    }

    Env::AddSig(r.m_pkUser);
}

// =========================================================================
// Method 7: SubmitGuess - On-chain Wordle verification + tournament scoring
// =========================================================================
BEAM_EXPORT void Method_7(const Method::SubmitGuess& r)
{
    // Load game
    Game::Key gk;
    gk.m_GameId = r.m_GameId;
    Game game;
    Env::Halt_if(!Env::LoadVar_T(gk, game));
    Env::Halt_if(game.m_Status != GAME_ACTIVE);

    // Check game not expired
    Height h = Env::get_Height();
    Env::Halt_if(h > game.m_ExpiresAt);

    // Single-player: only creator can play
    Env::Halt_if(_POD_(game.m_Creator) != r.m_pkUser);

    // Validate all guess chars are A-Z (0-25)
    for (uint32_t i = 0; i < game.m_Difficulty; i++)
        Env::Halt_if(r.m_Guess[i] > 25);

    // Load or create player game state
    PlayerGame::Key pgk;
    pgk.m_GameId = r.m_GameId;
    _POD_(pgk.m_Player) = r.m_pkUser;
    PlayerGame pg;
    if (!Env::LoadVar_T(pgk, pg))
    {
        _POD_(pg).SetZero();
        pg.m_StartedAt = h;
    }
    Env::Halt_if(pg.m_AttemptsUsed >= game.m_MaxAttempts);
    Env::Halt_if(pg.m_Status != PLAYER_PLAYING);

    // Burn letters from player's balance
    Letter::Key lk;
    _POD_(lk.m_Raw.m_pkUser) = r.m_pkUser;
    for (uint32_t i = 0; i < game.m_Difficulty; i++)
    {
        lk.m_Raw.m_Char = r.m_Guess[i];
        Letter let;
        Env::Halt_if(!Env::LoadVar_T(lk, let));
        DecAndSave(lk, let);
    }

    // Load hidden word
    GameWord::Key gwk;
    gwk.m_GameId = r.m_GameId;
    Letter::Char word[MAX_WORD_LEN];
    uint32_t nSizeChars = sizeof(Letter::Char) * game.m_Difficulty;
    Env::LoadVar(&gwk, sizeof(gwk), word, nSizeChars, KeyTag::Internal);

    // Compute Wordle feedback
    uint8_t feedback[MAX_WORD_LEN];
    Letter::Char wordCopy[MAX_WORD_LEN];
    Env::Memcpy(wordCopy, word, nSizeChars);

    // Pass 1: Exact matches (green)
    bool allCorrect = true;
    for (uint32_t i = 0; i < game.m_Difficulty; i++)
    {
        if (r.m_Guess[i] == wordCopy[i])
        {
            feedback[i] = FB_CORRECT;
            wordCopy[i] = 0xFFFFFFFF;
        }
        else
        {
            feedback[i] = FB_ABSENT;
            allCorrect = false;
        }
    }

    // Pass 2: Present but wrong position (yellow)
    if (!allCorrect)
    {
        for (uint32_t i = 0; i < game.m_Difficulty; i++)
        {
            if (feedback[i] == FB_CORRECT)
                continue;

            for (uint32_t j = 0; j < game.m_Difficulty; j++)
            {
                if (r.m_Guess[i] == wordCopy[j])
                {
                    feedback[i] = FB_PRESENT;
                    wordCopy[j] = 0xFFFFFFFF;
                    break;
                }
            }
        }
    }

    // Store guess result
    GuessResult::Key grk;
    grk.m_GameId = r.m_GameId;
    _POD_(grk.m_Player) = r.m_pkUser;
    grk.m_AttemptNum = pg.m_AttemptsUsed;

    GuessResult gr;
    _POD_(gr).SetZero();
    Env::Memcpy(gr.m_Guess, r.m_Guess, sizeof(Letter::Char) * game.m_Difficulty);
    Env::Memcpy(gr.m_Feedback, feedback, game.m_Difficulty);
    Env::SaveVar_T(grk, gr);

    // Update player game state
    pg.m_AttemptsUsed++;

    if (allCorrect)
    {
        // WIN — update tournament score (using game's tier, not difficulty)
        pg.m_Status = PLAYER_WON;
        pg.m_Score = CalcScore(pg.m_AttemptsUsed, game.m_Difficulty);
        game.m_Status = GAME_WON;

        // Increment TournamentPlayer score
        TournamentPlayer::Key tpk;
        tpk.m_Tier = game.m_Tier;
        tpk.m_Round = game.m_TournamentRound;
        _POD_(tpk.m_Player) = r.m_pkUser;

        TournamentPlayer tp;
        if (!Env::LoadVar_T(tpk, tp))
        {
            _POD_(tp).SetZero();
        }
        tp.m_Score++;
        Env::SaveVar_T(tpk, tp);

        // Update tournament totals
        Tournament::Key tk;
        tk.m_Tier = game.m_Tier;
        tk.m_Round = game.m_TournamentRound;
        Tournament t;
        if (Env::LoadVar_T(tk, t))
        {
            if (tp.m_Score == 1)
                t.m_TotalPlayers++;
            t.m_TotalScores++;
            Env::SaveVar_T(tk, t);
        }

        UpdatePlayerStats(r.m_pkUser, pg.m_Score, true);
    }
    else if (pg.m_AttemptsUsed >= game.m_MaxAttempts)
    {
        pg.m_Status = PLAYER_LOST;
        UpdatePlayerStats(r.m_pkUser, 0, false);
    }

    Env::SaveVar_T(pgk, pg);
    Env::SaveVar_T(gk, game);
    Env::AddSig(r.m_pkUser);
}

// =========================================================================
// Method 8: ClaimTournamentReward - Claim + direct FundsUnlock to wallet
// v6: tokens go directly to user's wallet, no payout ledger needed
// v6: auto-finalize saves carryover to TierPools for next round
// =========================================================================
BEAM_EXPORT void Method_8(const Method::ClaimTournamentReward& r)
{
    Env::Halt_if(r.m_Tier >= NUM_TIERS);

    // Load tournament
    Tournament::Key tk;
    tk.m_Tier = r.m_Tier;
    tk.m_Round = r.m_Round;
    Tournament t;
    Env::Halt_if(!Env::LoadVar_T(tk, t));

    // Must be finalized or expired
    Height h = Env::get_Height();
    if (!t.m_Finalized && h > t.m_EndHeight)
    {
        // Auto-finalize expired tournament — save carryover for next round
        Amount carryover = FinalizeTournament(tk, t);
        if (carryover > 0)
        {
            MyState s;
            // Only carry over if asset matches (same token between rounds)
            if (t.m_Asset == s.m_TierAssets[r.m_Tier])
                Strict::Add(s.m_TierPools[r.m_Tier], carryover);
            s.Save();
        }
        Env::LoadVar_T(tk, t);
    }
    Env::Halt_if(!t.m_Finalized);

    // Load player's tournament entry
    TournamentPlayer::Key tpk;
    tpk.m_Tier = r.m_Tier;
    tpk.m_Round = r.m_Round;
    _POD_(tpk.m_Player) = r.m_pkUser;

    TournamentPlayer tp;
    Env::Halt_if(!Env::LoadVar_T(tpk, tp));
    Env::Halt_if(tp.m_Score == 0);
    Env::Halt_if(tp.m_Claimed);

    // Calculate proportional reward
    Env::Halt_if(!t.m_TotalScores);

    Amount distributable = (t.m_PrizePool * DISTRIBUTION_PCT) / 100;
    Amount reward = (distributable * tp.m_Score) / t.m_TotalScores;

    // v6: Direct FundsUnlock — tokens go straight to user's wallet
    if (reward > 0)
        Env::FundsUnlock(t.m_Asset, reward);

    // Mark as claimed
    tp.m_Claimed = 1;
    Env::SaveVar_T(tpk, tp);

    Env::AddSig(r.m_pkUser);
}

// =========================================================================
// Method 9: Withdraw - Generic payout withdrawal
// =========================================================================
BEAM_EXPORT void Method_9(const Method::Withdraw& r)
{
    PayoutMove(r.m_pkUser, r.m_Val, false);
    Env::AddSig(r.m_pkUser);
}

// =========================================================================
// Method 10: SetPrice - List letter for sale
// =========================================================================
BEAM_EXPORT void Method_10(const Method::SetPrice& r)
{
    Letter::Key lk;
    _POD_(lk.m_Raw) = r.m_Key;
    Letter let;
    Env::Halt_if(!Env::LoadVar_T(lk, let));

    _POD_(let.m_Price) = r.m_Price;
    Env::SaveVar_T(lk, let);

    Env::AddSig(r.m_Key.m_pkUser);
}

// =========================================================================
// Method 11: BuyFromPlayer - Buy letter from another player
// =========================================================================
BEAM_EXPORT void Method_11(const Method::BuyFromPlayer& r)
{
    Letter::Key lk;
    _POD_(lk.m_Raw) = r.m_Key;
    Letter let;
    Env::Halt_if(!Env::LoadVar_T(lk, let));

    assert(let.m_Count);

    if (let.m_Price.m_Amount)
    {
        PayoutMove(r.m_Key.m_pkUser, let.m_Price, true);
        _POD_(let.m_Price).SetZero();
    }
    else
        Env::Halt_if(!_POD_(r.m_Key.m_pkUser).IsZero());

    DecAndSave(lk, let);
    AddLetter(r.m_pkNewOwner, r.m_Key.m_Char);

    Env::AddSig(r.m_pkNewOwner);
}

// =========================================================================
// Method 12: Mint - Admin creates letters
// =========================================================================
BEAM_EXPORT void Method_12(const Method::Mint& r)
{
    PubKey pk;
    _POD_(pk) = r.m_Key.m_pkUser;
    AddLetter(pk, r.m_Key.m_Char, r.m_Count);

    MyState s;
    s.AddSigAdmin();
}

// =========================================================================
// Method 13: EndGame - Expire game (permissionless after expiry)
// =========================================================================
BEAM_EXPORT void Method_13(const Method::EndGame& r)
{
    Game::Key gk;
    gk.m_GameId = r.m_GameId;
    Game game;
    Env::Halt_if(!Env::LoadVar_T(gk, game));
    Env::Halt_if(game.m_Status != GAME_ACTIVE);

    Height h = Env::get_Height();
    Env::Halt_if(h <= game.m_ExpiresAt);

    game.m_Status = GAME_EXPIRED;
    Env::SaveVar_T(gk, game);
}

// =========================================================================
// Method 14: UpdateSettings - Admin updates prices/fees/tournament config
// =========================================================================
BEAM_EXPORT void Method_14(const Method::UpdateSettings& r)
{
    MyState s;
    s.AddSigAdmin();

    if (r.m_LetterPrice)
        s.m_LetterPrice = r.m_LetterPrice;
    if (r.m_LootboxSmallPrice)
        s.m_LootboxSmallPrice = r.m_LootboxSmallPrice;
    if (r.m_LootboxLargePrice)
        s.m_LootboxLargePrice = r.m_LootboxLargePrice;
    if (r.m_TournamentDuration)
        s.m_TournamentDuration = r.m_TournamentDuration;

    // Per-tier config: 0xFFFFFFFF = don't change asset, 0 = don't change cost
    for (uint8_t i = 0; i < NUM_TIERS; i++)
    {
        if (r.m_TierAssets[i] != static_cast<AssetID>(-1))
            s.m_TierAssets[i] = r.m_TierAssets[i];
        if (r.m_TierEntryCost[i])
            s.m_TierEntryCost[i] = r.m_TierEntryCost[i];
    }

    // v7: DEX config updates
    if (r.m_PoolKind != 0xFF)
        s.m_PoolKind = r.m_PoolKind;
    if (r.m_FomoAssetId != static_cast<AssetID>(-1))
        s.m_FomoAssetId = r.m_FomoAssetId;

    s.Save();
}

// =========================================================================
// Method 15: WithdrawFees - Owner withdraws owner fees (always BEAM)
// =========================================================================
BEAM_EXPORT void Method_15(const Method::WithdrawFees& r)
{
    MyState s;
    s.AddSigAdmin();

    Env::Halt_if(r.m_Amount > s.m_OwnerFees);
    Strict::Sub(s.m_OwnerFees, r.m_Amount);
    s.Save();

    Env::FundsUnlock(0, r.m_Amount);
}

// =========================================================================
// Method 16: DonateToPool - Anyone can donate to a tier's prize pool
// v5: uses TOURNAMENT's asset when active round exists, settings when no round
// =========================================================================
BEAM_EXPORT void Method_16(const Method::DonateToPool& r)
{
    Env::Halt_if(r.m_Tier >= NUM_TIERS);
    Env::Halt_if(!r.m_Amount);

    MyState s;
    uint32_t round = s.m_TournamentRounds[r.m_Tier];
    Height h = Env::get_Height();

    if (round > 0)
    {
        Tournament::Key tk;
        tk.m_Tier = r.m_Tier;
        tk.m_Round = round;
        Tournament t;
        if (Env::LoadVar_T(tk, t) && !t.m_Finalized && h <= t.m_EndHeight)
        {
            // Active tournament: lock in TOURNAMENT's asset (round-locked)
            Env::FundsLock(t.m_Asset, r.m_Amount);
            Strict::Add(t.m_PrizePool, r.m_Amount);
            Env::SaveVar_T(tk, t);
            s.Save();
            return;
        }
    }

    // No active tournament: lock in SETTINGS' asset (next round will use it)
    Env::FundsLock(s.m_TierAssets[r.m_Tier], r.m_Amount);
    Strict::Add(s.m_TierPools[r.m_Tier], r.m_Amount);
    s.Save();
}

// =========================================================================
// Method 17: EmergencyWithdraw - Admin withdraws any asset (stuck funds)
// =========================================================================
BEAM_EXPORT void Method_17(const Method::EmergencyWithdraw& r)
{
    MyState s;
    s.AddSigAdmin();
    Env::Halt_if(!r.m_Amount);
    Env::FundsUnlock(r.m_AssetId, r.m_Amount);
}

// =========================================================================
// Method 18: ForceFinalize - Admin force-ends a tournament round early
// =========================================================================
BEAM_EXPORT void Method_18(const Method::ForceFinalize& r)
{
    Env::Halt_if(r.m_Tier >= NUM_TIERS);

    MyState s;
    s.AddSigAdmin();

    Tournament::Key tk;
    tk.m_Tier = r.m_Tier;
    tk.m_Round = r.m_Round;
    Tournament t;
    Env::Halt_if(!Env::LoadVar_T(tk, t));
    Env::Halt_if(t.m_Finalized);

    // Finalize and put carryover in pending pool
    Amount carryover = FinalizeTournament(tk, t);
    if (carryover > 0)
        Strict::Add(s.m_TierPools[r.m_Tier], carryover);
    s.Save();
}

// =========================================================================
// Method 19: WithdrawFomoFees - Admin withdraws accumulated FOMO fees
// =========================================================================
BEAM_EXPORT void Method_19(const Method::WithdrawFomoFees& r)
{
    MyState s;
    s.AddSigAdmin();

    Env::Halt_if(!r.m_Amount);
    Env::Halt_if(r.m_Amount > s.m_FomoFees);
    Strict::Sub(s.m_FomoFees, r.m_Amount);
    s.Save();

    Env::FundsUnlock(s.m_FomoAssetId, r.m_Amount);
}

} // namespace Fuddle
