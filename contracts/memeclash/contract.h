// =============================================================================
// MemeClash v8 - Meme Battle Game for BEAM Blockchain
// =============================================================================
// Smart contract header: data structures and method parameters
//
// Architecture (same as Stadium Finance on ETH/BSC):
//   - Two meme tokens ($CHAD vs $GIGA) battle in 24-hour rounds
//   - Users buy tokens on the DEX — contract tracks DEX pool growth
//   - Start reserves stored in Round at creation, end reserves passed at checkpoint
//   - Winner = token whose DEX pool attracted more BEAM (higher growth)
//   - At checkpoint: loser treasury tokens SOLD on DEX via CallFar for BEAM
//     → BEAM used to buy winner tokens → winner tokens BURNED
//   - Fee split: 85% burn, 5% checkpoint caller, 10% FOMO buyback
//   - Anyone can run the checkpoint (incentivized by 5% fee in BEAM)
//   - Treasury pre-seeded by admin, community can top up
//
// v7 changes: Eliminated separate snapshot TXs. Start reserves stored in Round
// at creation. End reserves passed as params to RunCheckpoint (oracle, validated
// by AMM trade success). Single-TX checkpoint flow.
//
// Ported from Stadium Finance (BSC/ETH) — adapted for BEAM Shader architecture
// =============================================================================

#pragma once

namespace MemeClash
{
    static const ShaderID s_SID = { 0 }; // Generated at compile time

#pragma pack (push, 1)

    // =========================================================================
    // Tags - Storage key prefixes
    // =========================================================================
    struct Tags
    {
        static const uint8_t s_State = 2;           // Global state
        static const uint8_t s_Round = 3;           // Per-round data
        static const uint8_t s_Payout = 5;          // User withdrawable balances
    };

    // =========================================================================
    // Constants
    // =========================================================================
    static const uint8_t NUM_TEAMS = 2;                 // CHAD=0, GIGA=1
    static const Height DEFAULT_ROUND_DURATION = 1440;  // ~24h at 60s/block
    static const uint32_t CHECKPOINT_FEE_BPS = 500;     // 5% to checkpoint caller
    static const uint32_t FOMO_BUYBACK_BPS = 1000;      // 10% to FOMO buyback pool
    static const uint32_t BURN_BPS = 8500;              // 85% to buy+burn winner tokens
    static const uint32_t MAX_BPS = 10000;
    static const uint32_t DEFAULT_TRADE_FEE_BPS = 500;  // 5% trade fee
    static const AssetID FOMO_ASSET_ID = 174;

    // Round status (v7: only 2 statuses, no snapshot phase)
    static const uint8_t ROUND_ACTIVE = 0;
    static const uint8_t ROUND_FINALIZED = 2;

    // Winner codes
    static const uint8_t WINNER_NONE = 255;
    static const uint8_t WINNER_CHAD = 0;
    static const uint8_t WINNER_GIGA = 1;
    static const uint8_t WINNER_DRAW = 254;

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
    // BlackHole contract type for CallFar (permanent burn)
    // BlackHole::Method::Deposit = Method_2: FundsLock with no withdrawal
    // =========================================================================
    struct BlackHoleDeposit
    {
        static const uint32_t s_iMethod = 2;
        AssetID m_Aid;
        Amount m_Amount;
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
    // Round - one battle period (~24 hours)
    // =========================================================================
    struct Round
    {
        struct Key
        {
            uint8_t m_Tag = Tags::s_Round;
            uint32_t m_RoundId;
        };

        Height m_StartHeight;
        Height m_EndHeight;

        // Battle treasuries: tokens deposited, burned on loss via DEX swap
        Amount m_Treasury0;         // $CHAD tokens held by contract
        Amount m_Treasury1;         // $GIGA tokens held by contract

        // DEX pool BEAM reserves at round start (set at creation, immutable)
        Amount m_StartBeamReserve0;     // BEAM in CHAD/BEAM pool at round start
        Amount m_StartBeamReserve1;     // BEAM in GIGA/BEAM pool at round start

        // Result
        uint8_t m_Winner;           // WINNER_CHAD, WINNER_GIGA, WINNER_DRAW, or WINNER_NONE
        uint8_t m_Status;           // ROUND_ACTIVE, ROUND_FINALIZED

        // Stats (set after checkpoint)
        Amount m_LoserSold;         // Loser tokens sold on DEX this round
        Amount m_BeamReceived;      // BEAM received from selling loser tokens
        Amount m_WinnerBurned;      // Winner tokens bought and burned this round
        Amount m_CallerFee;         // BEAM paid to checkpoint runner this round
        Amount m_FomoBuyback;       // BEAM used for FOMO buyback this round
        Amount m_FomoBurned;        // FOMO tokens bought and burned via BlackHole this round
    };

    // =========================================================================
    // Global state
    // =========================================================================
    struct Config
    {
        PubKey m_pkAdmin;
    };

    struct State
    {
        static const uint8_t s_Key = Tags::s_State;

        Config m_Config;

        // Token configuration
        AssetID m_Token0;               // CHAD asset ID
        AssetID m_Token1;               // GIGA asset ID
        AssetID m_FomoAssetId;          // FOMO asset ID (174)

        // DEX configuration (for CallFar trades)
        ContractID m_DexCid;            // DEX AMM contract ID
        uint8_t m_PoolKind;             // DEX pool kind (fee tier: 0/1/2)

        // BlackHole contract (for permanent burns via CallFar)
        ContractID m_BlackHoleCid;

        // Round management
        uint32_t m_CurrentRound;
        Height m_RoundDuration;

        // Fee configuration (in basis points, total must = 10000)
        uint32_t m_CheckpointFeeBps;    // % to checkpoint caller (BEAM)
        uint32_t m_FomoBuybackBps;      // % to FOMO buyback (BEAM)
        uint32_t m_BurnBps;             // % to buy+burn winner tokens

        // Lifetime stats
        Amount m_TotalBurned0;          // Lifetime $CHAD burned
        Amount m_TotalBurned1;          // Lifetime $GIGA burned
        Amount m_TotalFomoBuyback;      // Lifetime BEAM spent on FOMO buyback
        Amount m_TotalFomoBurned;       // Lifetime FOMO tokens burned via BlackHole
        Amount m_OwnerFees;             // Accumulated admin fees BEAM (admin withdraws)

        // Win counters
        uint32_t m_ChadWins;
        uint32_t m_GigaWins;
        uint32_t m_Draws;
        uint32_t m_TotalRounds;         // Total finalized rounds

        // v4: Trade fee config
        uint32_t m_TradeFeeBps;         // Trade fee in basis points (default 500 = 5%)

        // v4: Trade volume stats
        Amount m_TotalTradeVolume;      // Lifetime BEAM volume through TradeForTeam
        Amount m_TotalTradeFees0;       // Lifetime CHAD tokens deposited to treasury from fees
        Amount m_TotalTradeFees1;       // Lifetime GIGA tokens deposited to treasury from fees
    };

    // =========================================================================
    // Method parameters
    // =========================================================================
    namespace Method
    {
        // 0: Ctor - Deploy contract
        struct Init
        {
            static const uint32_t s_iMethod = 0;
            Config m_Config;
            AssetID m_Token0;           // CHAD asset ID
            AssetID m_Token1;           // GIGA asset ID
            AssetID m_FomoAssetId;      // FOMO (174)
            ContractID m_DexCid;        // DEX AMM contract ID
            ContractID m_BlackHoleCid;  // BlackHole contract for permanent burns
            uint8_t m_PoolKind;         // DEX pool kind (0/1/2)
            Height m_RoundDuration;     // Blocks per round (1440 = ~24h)
            uint32_t m_TradeFeeBps;     // Trade fee bps (0 = use default 500)
            Amount m_StartBeamReserve0; // Initial BEAM reserve for CHAD pool
            Amount m_StartBeamReserve1; // Initial BEAM reserve for GIGA pool
        };

        // 1: Dtor - Destroy contract (admin only)
        // (no params)

        // 2: Upgrade (admin only)
        // (no params)

        // 3: DepositTokens - Anyone deposits $CHAD or $GIGA to battle treasury
        // Treasury is pre-seeded by admin; community can top up
        struct DepositTokens
        {
            static const uint32_t s_iMethod = 3;
            uint8_t m_Team;             // 0=CHAD, 1=GIGA
            Amount m_Amount;            // Token amount in groth
        };

        // 4: Reserved (was SubmitSnapshot, removed in v7)
        struct Reserved4
        {
            static const uint32_t s_iMethod = 4;
        };

        // 5: RunCheckpoint - Resolve round (permissionless, caller-incentivized)
        //
        // v7: End reserves passed by app shader (oracle, validated by AMM trade
        // outcomes). Start reserves are stored in Round at creation.
        //
        // Flow: sell loser tokens → BEAM → buy winner tokens → BlackHole burn
        // Fee split: 5% BEAM to caller, 10% BEAM buys FOMO → BlackHole, 85% buys winner → BlackHole
        struct RunCheckpoint
        {
            static const uint32_t s_iMethod = 5;
            PubKey m_pkCaller;          // Gets checkpoint fee in BEAM (via payout balance)
            uint32_t m_RoundId;
            Amount m_BeamFromLoser;     // BEAM to buy from selling loser tokens (auto-calculated)
            Amount m_WinnerToBurn;      // Winner tokens to buy with BEAM for burn (auto-calculated)
            Amount m_FomoToBurn;        // FOMO tokens to buy with 10% BEAM → BlackHole (auto-calculated)
            // v7: end reserves passed by app shader (oracle, validated by AMM trade success)
            Amount m_EndBeamReserve0;   // BEAM in CHAD/BEAM pool now
            Amount m_EndBeamReserve1;   // BEAM in GIGA/BEAM pool now
        };

        // 6: Withdraw - Withdraw accumulated payout balance
        struct Withdraw
        {
            static const uint32_t s_iMethod = 6;
            PubKey m_pkUser;
            AssetID m_Aid;
            Amount m_Amount;
        };

        // 7: StartRound - Anyone starts a new round (if none active)
        // v7: Reserves passed by app shader from DEX pool reads
        struct StartRound
        {
            static const uint32_t s_iMethod = 7;
            Amount m_StartBeamReserve0;
            Amount m_StartBeamReserve1;
        };

        // 8: UpdateSettings - Admin updates parameters
        struct UpdateSettings
        {
            static const uint32_t s_iMethod = 8;
            Height m_RoundDuration;         // 0 = don't change
            uint32_t m_CheckpointFeeBps;    // 0 = don't change
            uint32_t m_FomoBuybackBps;      // 0 = don't change
            uint32_t m_BurnBps;             // 0 = don't change
            uint32_t m_TradeFeeBps;         // 0 = don't change
        };

        // 9: WithdrawFees - Admin withdraws accumulated FOMO buyback BEAM
        struct WithdrawFees
        {
            static const uint32_t s_iMethod = 9;
            Amount m_Amount;
        };

        // 10: EmergencyWithdraw - Admin withdraws any asset (stuck funds)
        struct EmergencyWithdraw
        {
            static const uint32_t s_iMethod = 10;
            AssetID m_AssetId;
            Amount m_Amount;
        };

        // 11: ForceEndRound - Admin force-ends current round (for testing)
        struct ForceEndRound
        {
            static const uint32_t s_iMethod = 11;
            uint32_t m_RoundId;
        };

        // 12: TradeForTeam - User buys team tokens through contract (5% fee to treasury)
        struct TradeForTeam
        {
            static const uint32_t s_iMethod = 12;
            PubKey m_pkUser;
            uint8_t m_Team;             // 0=CHAD, 1=GIGA
            Amount m_BeamAmount;        // Total BEAM from user
            Amount m_TokensToUser;      // Tokens going to user (95% trade result)
            Amount m_TokensToTreasury;  // Tokens going to treasury (5% trade result)
        };

    } // namespace Method

#pragma pack (pop)

} // namespace MemeClash
