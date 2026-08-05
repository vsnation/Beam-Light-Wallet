// =============================================================================
// Fuddle v7 - On-Chain Wordle with DEX Auto-Swap Entry Fees
// =============================================================================
// Smart contract header: data structures and method parameters
//
// Architecture:
//   - Word list stored with KeyTag::Internal (private, unhackable)
//   - Random word selection per game using block height entropy
//   - Wordle feedback computed on-chain (green/yellow/gray)
//   - Letter balances per player (buy, burn on guess, trade)
//   - 3 tournament tiers, each tied to a SPECIFIC TOKEN (e.g., BEAM, FOMO, BEAMX)
//   - Player chooses tournament (token) + word difficulty (4/5/6 letters)
//   - Entry fees ALWAYS in BEAM. Non-BEAM tiers: 50% DEX swap → tier token → pool,
//     50% DEX swap → FOMO → admin fees (buyback)
//   - CallFar to AMM DEX for cross-contract trades (pattern from MemeClash)
//   - Letters/lootboxes → always BEAM, revenue to owner
//   - 50% of prize pool distributed proportionally by score, 50% carries over
//   - Admin-configurable tournament duration, tier assets, entry costs
//
// v7 changes:
//   - Entry fees always in BEAM, auto-swapped via DEX for non-BEAM tiers
//   - FOMO buyback from 50% of non-BEAM entry fees
//   - Method 19: WithdrawFomoFees for admin FOMO withdrawal
// v6 changes:
//   - Claim (Method 8) does direct FundsUnlock — no separate Withdraw needed
//   - Auto-finalize in Claim saves 50% carryover to TierPools (was lost in v5)
// =============================================================================

#pragma once

namespace Fuddle
{
    static const ShaderID s_SID = { 0x14,0x7b,0xf6,0x72,0xc2,0x26,0x21,0x39,0x9d,0xd4,0x9f,0x97,0x63,0x01,0xf5,0x63,0xaf,0x95,0x3a,0xca,0x49,0x25,0x1f,0x19,0xa8,0x64,0x4e,0x9d,0x44,0x2f,0x78,0x3f };

#pragma pack (push, 1)

    // =========================================================================
    // Tags - Storage key prefixes
    // =========================================================================
    struct Tags
    {
        static const uint8_t s_State = 2;       // Global state
        static const uint8_t s_Payout = 3;      // User payout balances
        static const uint8_t s_Letter = 4;      // Letter ownership
        static const uint8_t s_Word = 5;        // Word list (Internal)
        static const uint8_t s_WordCount = 6;   // Word count per difficulty
        static const uint8_t s_Game = 7;        // Game metadata
        static const uint8_t s_GameWord = 8;    // Game's selected word (Internal)
        static const uint8_t s_PlayerGame = 9;  // Player state per game
        static const uint8_t s_Guess = 10;      // Guess results
        static const uint8_t s_Stats = 11;      // Player aggregate stats
        static const uint8_t s_Tournament = 12;       // Tournament metadata
        static const uint8_t s_TournamentPlayer = 13; // Player score per tournament
    };

    // =========================================================================
    // Constants
    // =========================================================================
    static const uint8_t MAX_WORD_LEN = 6;
    static const uint8_t MIN_WORD_LEN = 4;
    static const uint8_t MAX_ATTEMPTS = 6;
    static const uint32_t MAX_WORDS_PER_BATCH = 50;
    static const Height GAME_DURATION_BLOCKS = 1440; // ~24h at 60s/block
    static const uint32_t LOOTBOX_SMALL_COUNT = 24;
    static const uint32_t LOOTBOX_LARGE_COUNT = 48;

    // Tournament constants
    static const uint8_t NUM_TIERS = 3;          // 3 token-based tournament tiers
    static const Height DEFAULT_TOURNAMENT_DURATION = 1440; // ~24h, admin can change
    static const uint8_t DISTRIBUTION_PCT = 50;   // 50% distributed, 50% carries over

    // Feedback codes
    static const uint8_t FB_ABSENT = 0;
    static const uint8_t FB_PRESENT = 1;
    static const uint8_t FB_CORRECT = 2;

    // Game status
    static const uint8_t GAME_ACTIVE = 0;
    static const uint8_t GAME_WON = 1;
    static const uint8_t GAME_EXPIRED = 2;

    // Player game status
    static const uint8_t PLAYER_PLAYING = 0;
    static const uint8_t PLAYER_WON = 1;
    static const uint8_t PLAYER_LOST = 2;

    // =========================================================================
    // Helper types
    // =========================================================================
    struct AmountWithAsset {
        Amount m_Amount;
        AssetID m_Aid;
    };

    // =========================================================================
    // AMM DEX types for CallFar (must match AMM contract.h layout exactly)
    // AMM Trade = Method 7, packed struct with Pool::ID + Amount
    // =========================================================================
    struct AmmPoolID
    {
        AssetID m_Aid1;
        AssetID m_Aid2;
        uint8_t m_Kind;         // FeeSettings
    };

    struct AmmTrade
    {
        static const uint32_t s_iMethod = 7;
        AmmPoolID m_Pid;
        Amount m_Buy1;          // Amount of aid1 to buy (positive, unsigned)
    };

    // =========================================================================
    // Payout - accumulated withdrawable balances per user+asset
    // =========================================================================
    struct Payout
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_Payout;
            PubKey m_pkUser;
            AssetID m_Aid;
        };

        Amount m_Amount;
    };

    // =========================================================================
    // Letter - player's letter inventory
    // =========================================================================
    struct Letter
    {
        typedef uint32_t Char; // A=0, B=1, ..., Z=25

        struct Key
        {
            uint8_t m_Tag = Tags::s_Letter;
            struct Raw {
                PubKey m_pkUser;
                Char m_Char;
            } m_Raw;
        };

        uint32_t m_Count;
        AmountWithAsset m_Price; // For player-to-player sale
    };

    // =========================================================================
    // Word list entry (KeyTag::Internal - cannot be read externally)
    // =========================================================================
    struct WordEntry
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_Word;
            uint8_t m_Length;    // 4, 5, or 6
            uint32_t m_Index;   // Index within this difficulty
        };

        // Value: Letter::Char chars[m_Length] (variable length)
    };

    // =========================================================================
    // Word count per difficulty
    // =========================================================================
    struct WordCount
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_WordCount;
            uint8_t m_Length;
        };

        uint32_t m_Count;
    };

    // =========================================================================
    // Tournament - periodic competition per tier (each tier = one token)
    // =========================================================================
    struct Tournament
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_Tournament;
            uint8_t m_Tier;      // Tier index: 0, 1, or 2
            uint32_t m_Round;    // Round number (1-based)
        };

        Height m_StartHeight;
        Height m_EndHeight;
        Amount m_PrizePool;       // Total prize pool (in this tournament's asset)
        uint32_t m_TotalScores;   // Sum of all player scores
        uint32_t m_TotalPlayers;
        uint8_t m_Finalized;      // 0=active, 1=finalized
        AssetID m_Asset;          // The asset for this tournament (stored at creation for safe reward payouts)
        Amount m_EntryCost;       // Entry cost for this round (stored at creation — round-locked)
    };

    // =========================================================================
    // TournamentPlayer - player's score within a tournament
    // =========================================================================
    struct TournamentPlayer
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_TournamentPlayer;
            uint8_t m_Tier;       // Tier index: 0, 1, or 2
            uint32_t m_Round;
            PubKey m_Player;
        };

        uint32_t m_Score;     // Games won in this tournament
        uint8_t m_Claimed;    // Already claimed reward
    };

    // =========================================================================
    // Game metadata (public) - v2: single-player, linked to tournament tier
    // =========================================================================
    struct Game
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_Game;
            uint32_t m_GameId;
        };

        uint8_t m_Difficulty;       // 4, 5, or 6 (word length)
        uint8_t m_MaxAttempts;      // Always 6
        uint8_t m_Status;           // GAME_ACTIVE, GAME_WON, GAME_EXPIRED
        uint8_t m_Tier;             // Tournament tier index: 0, 1, or 2
        uint32_t m_TournamentRound; // Which tournament round this game belongs to
        PubKey m_Creator;           // = the only player (single-player)
        Height m_CreatedAt;
        Height m_ExpiresAt;
    };

    // =========================================================================
    // Game's hidden word (KeyTag::Internal)
    // =========================================================================
    struct GameWord
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_GameWord;
            uint32_t m_GameId;
        };

        // Value: Letter::Char chars[difficulty] (variable length)
    };

    // =========================================================================
    // Player's state within a game
    // =========================================================================
    struct PlayerGame
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_PlayerGame;
            uint32_t m_GameId;
            PubKey m_Player;
        };

        uint8_t m_AttemptsUsed;
        uint8_t m_Status;           // PLAYER_PLAYING, PLAYER_WON, PLAYER_LOST
        uint32_t m_Score;
        Height m_StartedAt;
    };

    // =========================================================================
    // Guess result (public - player reads feedback via app shader)
    // =========================================================================
    struct GuessResult
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_Guess;
            uint32_t m_GameId;
            PubKey m_Player;
            uint8_t m_AttemptNum;
        };

        Letter::Char m_Guess[MAX_WORD_LEN];     // What was guessed
        uint8_t m_Feedback[MAX_WORD_LEN];        // FB_ABSENT/FB_PRESENT/FB_CORRECT
    };

    // =========================================================================
    // Player aggregate stats
    // =========================================================================
    struct PlayerStats
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_Stats;
            PubKey m_Player;
        };

        uint32_t m_GamesPlayed;
        uint32_t m_GamesWon;
        uint32_t m_TotalScore;
        uint32_t m_BestStreak;
        uint32_t m_CurrentStreak;
    };

    // =========================================================================
    // Global state - v2: per-tier token tournaments
    // =========================================================================
    struct Config
    {
        PubKey m_pkAdmin;
    };

    struct State
    {
        static const uint8_t s_Key = Tags::s_State;

        Config m_Config;
        uint32_t m_GameCount;           // Total games created (counter for IDs)
        Amount m_LetterPrice;           // Price per letter (always in BEAM)
        Amount m_OwnerFees;             // Owner fees from letter/lootbox sales (always BEAM)
        Amount m_LootboxSmallPrice;     // Price for small lootbox (always in BEAM)
        Amount m_LootboxLargePrice;     // Price for large lootbox (always in BEAM)
        // Per-tier tournament configuration
        uint32_t m_TournamentRounds[NUM_TIERS]; // Current round per tier
        Amount m_TierPools[NUM_TIERS];          // Pending pool accumulator per tier (in tier's asset)
        Height m_TournamentDuration;             // Admin-configurable duration in blocks
        AssetID m_TierAssets[NUM_TIERS];         // Asset per tier (e.g., 0=BEAM, 174=FOMO, 7=BEAMX)
        Amount m_TierEntryCost[NUM_TIERS];       // Entry cost per tier (in BEAM groth for v7)
        // v7: DEX auto-swap for entry fees
        ContractID m_DexCid;               // DEX AMM contract ID
        uint8_t m_PoolKind;                // DEX pool kind (0/1/2)
        AssetID m_FomoAssetId;             // FOMO asset ID (174)
        Amount m_FomoFees;                 // Accumulated FOMO from buybacks (admin withdraws)
    };

    // =========================================================================
    // Method parameters
    // =========================================================================
    namespace Method
    {
        // 0: Ctor - Initialize contract
        struct Init
        {
            static const uint32_t s_iMethod = 0;
            Config m_Config;
            Amount m_LetterPrice;                    // Price per letter (BEAM)
            Amount m_LootboxSmallPrice;              // Small lootbox price (BEAM)
            Amount m_LootboxLargePrice;              // Large lootbox price (BEAM)
            AssetID m_TierAssets[NUM_TIERS];         // Asset per tier
            Amount m_TierEntryCost[NUM_TIERS];       // Entry cost per tier (in BEAM groth for v7)
            // v7: DEX config
            ContractID m_DexCid;
            uint8_t m_PoolKind;
            AssetID m_FomoAssetId;
        };

        // 1: Dtor - Destroy contract
        // (no params)

        // 2: Upgrade
        // (no params)

        // 3: AddWords - Admin adds words to on-chain word list (batch)
        struct AddWords
        {
            static const uint32_t s_iMethod = 3;
            uint8_t m_Length;       // 4, 5, or 6
            uint32_t m_NumWords;    // Number of words in this batch
            // followed by: Letter::Char words[m_NumWords * m_Length]
        };

        // 4: CreateGame - Pay BEAM to enter tournament, DEX auto-swap for non-BEAM tiers
        struct CreateGame
        {
            static const uint32_t s_iMethod = 4;
            PubKey m_pkCreator;     // Auto-derived
            uint8_t m_Difficulty;   // 4, 5, or 6 (word length)
            uint8_t m_Tier;         // Tournament tier index: 0, 1, or 2
            // v7: DEX swap results (pre-computed by app shader, 0 for BEAM tier)
            Amount m_TokensToPool;      // Tier tokens for prize pool (from DEX swap)
            Amount m_FomoToBuyback;     // FOMO for admin fees (from DEX swap)
        };

        // 5: BuyLetters - Buy specific letters (always BEAM)
        struct BuyLetters
        {
            static const uint32_t s_iMethod = 5;
            PubKey m_pkUser;        // Auto-derived
            Letter::Char m_Char;    // Which letter (0-25)
            uint32_t m_Count;       // How many
        };

        // 6: BuyLootbox - Buy random letters (always BEAM)
        struct BuyLootbox
        {
            static const uint32_t s_iMethod = 6;
            PubKey m_pkUser;
            uint8_t m_Size;         // 0=small (24), 1=large (48)
        };

        // 7: SubmitGuess - Submit a word guess (increments tournament score on win)
        struct SubmitGuess
        {
            static const uint32_t s_iMethod = 7;
            PubKey m_pkUser;
            uint32_t m_GameId;
            Letter::Char m_Guess[MAX_WORD_LEN]; // Guessed letters (0-25)
        };

        // 8: ClaimTournamentReward - Claim proportional share from ended tournament
        struct ClaimTournamentReward
        {
            static const uint32_t s_iMethod = 8;
            PubKey m_pkUser;
            uint8_t m_Tier;     // Tier index: 0, 1, or 2
            uint32_t m_Round;
        };

        // 9: Withdraw - Withdraw accumulated payout balance
        struct Withdraw
        {
            static const uint32_t s_iMethod = 9;
            PubKey m_pkUser;
            AmountWithAsset m_Val;
        };

        // 10: SetPrice - List a letter for sale
        struct SetPrice
        {
            static const uint32_t s_iMethod = 10;
            Letter::Key::Raw m_Key;
            AmountWithAsset m_Price;
        };

        // 11: BuyFromPlayer - Buy letter from another player
        struct BuyFromPlayer
        {
            static const uint32_t s_iMethod = 11;
            Letter::Key::Raw m_Key;     // Seller's key
            PubKey m_pkNewOwner;        // Buyer
        };

        // 12: Mint - Admin creates letters (for seeding)
        struct Mint
        {
            static const uint32_t s_iMethod = 12;
            Letter::Key::Raw m_Key;
            uint32_t m_Count;
        };

        // 13: EndGame - End expired game (permissionless after expiry)
        struct EndGame
        {
            static const uint32_t s_iMethod = 13;
            uint32_t m_GameId;
        };

        // 14: UpdateSettings - Admin updates prices/fees/tournament config
        struct UpdateSettings
        {
            static const uint32_t s_iMethod = 14;
            Amount m_LetterPrice;                    // 0 = don't change
            Amount m_LootboxSmallPrice;              // 0 = don't change
            Amount m_LootboxLargePrice;              // 0 = don't change
            Height m_TournamentDuration;             // 0 = don't change
            AssetID m_TierAssets[NUM_TIERS];         // 0xFFFFFFFF = don't change
            Amount m_TierEntryCost[NUM_TIERS];       // 0 = don't change
            // v7: DEX config updates
            uint8_t m_PoolKind;                      // 0xFF = don't change
            AssetID m_FomoAssetId;                   // 0xFFFFFFFF = don't change
        };

        // 15: WithdrawFees - Owner withdraws owner fees (always BEAM)
        struct WithdrawFees
        {
            static const uint32_t s_iMethod = 15;
            Amount m_Amount;
        };

        // 16: DonateToPool - Anyone can donate to a tier's prize pool (in tier's asset)
        struct DonateToPool
        {
            static const uint32_t s_iMethod = 16;
            uint8_t m_Tier;     // Tier index: 0, 1, or 2
            Amount m_Amount;
        };

        // 17: EmergencyWithdraw - Admin withdraws any asset (for stuck funds after asset change)
        struct EmergencyWithdraw
        {
            static const uint32_t s_iMethod = 17;
            AssetID m_AssetId;
            Amount m_Amount;
        };

        // 18: ForceFinalize - Admin force-ends a tournament round early
        struct ForceFinalize
        {
            static const uint32_t s_iMethod = 18;
            uint8_t m_Tier;
            uint32_t m_Round;
        };

        // 19: WithdrawFomoFees - Admin withdraws accumulated FOMO fees from buybacks
        struct WithdrawFomoFees
        {
            static const uint32_t s_iMethod = 19;
            Amount m_Amount;
        };

    } // namespace Method

#pragma pack (pop)

} // namespace Fuddle
