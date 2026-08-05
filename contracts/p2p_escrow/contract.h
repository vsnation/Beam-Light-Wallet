// P2P Escrow Contract - Header
// BEAM Privacy Blockchain Smart Contract
// Decentralized peer-to-peer trading with escrow and verified feedback

#pragma once

namespace P2PEscrow
{
    static const ShaderID s_SID = { 0x50, 0x32, 0x50, 0x45, 0x73, 0x63, 0x72, 0x6f,
                                     0x77, 0x43, 0x6f, 0x6e, 0x74, 0x72, 0x61, 0x63,
                                     0x74, 0x42, 0x45, 0x41, 0x4d, 0x50, 0x72, 0x69,
                                     0x76, 0x61, 0x63, 0x79, 0x32, 0x30, 0x32, 0x35 };

    // =========================================
    // CONFIGURATION
    // =========================================

    static const Amount GROTH = 100000000;           // 1 BEAM = 100M groth

    // TEST VALUES - For development and UI testing
    static const Amount MIN_ESCROW_STAKE = 1 * GROTH;       // 1 FOMO minimum (TEST)
    static const uint32_t LOCK_PERIOD = 5 * 60;             // 5 minutes (TEST)
    static const uint32_t TRADE_FEE_BPS = 50;               // 0.5% in basis points
    static const uint32_t DEFAULT_DEPOSIT_PCT = 10;         // 10% security deposit
    static const uint32_t PAYMENT_TIMEOUT = 5 * 60;         // 5 minutes (TEST)
    static const uint32_t CONFIRM_TIMEOUT = 10 * 60;        // 10 minutes (TEST)
    static const uint32_t DISPUTE_TIMEOUT = 15 * 60;        // 15 minutes (TEST)
    static const uint32_t NUM_ESCROWS = 3;                  // Escrows per dispute

    // PRODUCTION VALUES - Uncomment for mainnet deployment
    // static const Amount MIN_ESCROW_STAKE = 10000 * GROTH;   // 10,000 FOMO minimum
    // static const uint32_t LOCK_PERIOD = 180 * 24 * 60 * 60; // 180 days (escrow stake lock)
    // static const uint32_t PAYMENT_TIMEOUT = 30 * 60;        // 30 minutes to send payment
    // static const uint32_t CONFIRM_TIMEOUT = 2 * 60 * 60;    // 2 hours to confirm receipt
    // static const uint32_t DISPUTE_TIMEOUT = 48 * 60 * 60;   // 48 hours to resolve dispute

    // =========================================
    // KEY TAGS for storage
    // =========================================

    struct KeyTag {
        static const uint8_t Settings = 0;
        static const uint8_t Trader = 1;
        static const uint8_t Order = 2;
        static const uint8_t Trade = 3;
        static const uint8_t Dispute = 4;
        static const uint8_t EscrowStake = 5;
        static const uint8_t Feedback = 6;
        static const uint8_t TradeFeedbackStatus = 7;
        static const uint8_t Counter = 8;
        static const uint8_t Manager = 9;
    };

    // =========================================
    // DATA STRUCTURES
    // =========================================

    // Contract version for upgradeability
    static const uint32_t CONTRACT_VERSION = 1;

    // Contract global settings
    struct Settings {
        uint32_t m_Version;           // Contract version for migration
        Amount m_MinEscrowStake;
        uint32_t m_LockPeriod;
        uint32_t m_TradeFeeBps;
        uint32_t m_DefaultDepositPct;
        uint32_t m_PaymentTimeout;
        uint32_t m_ConfirmTimeout;
        uint32_t m_DisputeTimeout;
        Amount m_TotalFees;           // Manager pool (60% of fees)
        Amount m_TotalStaked;         // Total escrow stakes
        Amount m_AccRewardPerShare;   // Accumulated reward per share (scaled by 1e8)
        uint64_t m_TotalTrades;
        uint64_t m_TotalDisputes;
        ContractID m_UpgradedTo;      // New contract ID after upgrade (zero if not upgraded)
    };

    // Registered trader info
    struct Trader {
        PubKey m_pk;
        uint64_t m_RegisteredAt;
        uint64_t m_LastActive;
        uint32_t m_TotalTrades;
        uint32_t m_SuccessfulTrades;
        uint32_t m_DisputesWon;
        uint32_t m_DisputesLost;
        Amount m_TotalVolume;
        uint32_t m_FeedbackCount;
        uint32_t m_TotalRating;       // Sum of all ratings (for avg calculation)
        uint16_t m_Badges;            // Bitmask: 1=verified, 2=fire, 4=diamond, 8=escrow
    };

    // Order status
    struct OrderStatus {
        static const uint8_t Open = 0;
        static const uint8_t InTrade = 1;
        static const uint8_t Completed = 2;
        static const uint8_t Cancelled = 3;
    };

    // Maximum payment methods per order
    static const uint8_t MAX_PAYMENT_METHODS = 8;

    // P2P Order
    struct Order {
        uint64_t m_Id;
        PubKey m_Seller;
        AssetID m_AssetId;
        Amount m_Amount;              // Total order amount
        Amount m_RemainingAmount;     // Remaining amount after partial trades
        Amount m_Deposit;             // Security deposit (% of total)
        uint64_t m_PriceInCents;      // Price per token in cents (4 decimal precision)
        uint16_t m_CurrencyId;        // ISO 4217 currency code (840=USD, 978=EUR, 643=RUB)
        Amount m_MinLimit;            // Minimum trade amount (fiat)
        Amount m_MaxLimit;            // Maximum trade amount (fiat)
        uint16_t m_PaymentMethods[MAX_PAYMENT_METHODS];  // Array of payment method IDs
        uint8_t m_PaymentMethodCount; // Number of payment methods (0-8)
        uint8_t m_Side;               // 0 = sell, 1 = buy
        uint8_t m_Status;
        uint64_t m_CreatedAt;
        uint64_t m_ActiveTradeId;     // Current active trade (0 if none)
    };

    // Trade status
    struct TradeStatus {
        static const uint8_t Pending = 0;
        static const uint8_t Accepted = 1;
        static const uint8_t PaymentSent = 2;
        static const uint8_t Completed = 3;
        static const uint8_t Disputed = 4;
        static const uint8_t Refunded = 5;
        static const uint8_t Cancelled = 6;
        static const uint8_t SellerConfirmed = 7;   // Seller confirmed, buyer can claim
        static const uint8_t BuyerWonDispute = 8;   // Buyer won, can claim
        static const uint8_t SellerWonDispute = 9;  // Seller won, can claim
    };

    // Active trade
    struct Trade {
        uint64_t m_Id;
        uint64_t m_OrderId;
        PubKey m_Buyer;
        PubKey m_Seller;
        AssetID m_AssetId;
        Amount m_Amount;
        Amount m_BuyerDeposit;
        Amount m_SellerDeposit;
        Amount m_PayAmount;           // Fiat amount in cents
        uint16_t m_CurrencyId;        // ISO 4217 currency code
        uint16_t m_PaymentMethods[MAX_PAYMENT_METHODS];  // Copied from order
        uint8_t m_PaymentMethodCount;
        uint8_t m_Status;
        uint64_t m_StartedAt;
        uint64_t m_PaymentSentAt;
        uint64_t m_ConfirmDeadline;
        uint64_t m_CompletedAt;
    };

    // Dispute
    struct Dispute {
        uint64_t m_Id;
        uint64_t m_TradeId;
        PubKey m_Escrows[NUM_ESCROWS];
        uint8_t m_Votes[NUM_ESCROWS];  // 0=pending, 1=buyer, 2=seller
        uint8_t m_Reason;
        uint8_t m_Resolved;
        uint8_t m_Winner;              // 1=buyer, 2=seller
        uint64_t m_OpenedAt;
        uint64_t m_Deadline;
    };

    // Escrow staker
    struct EscrowStake {
        PubKey m_pk;
        Amount m_Amount;
        uint64_t m_StakedAt;
        uint64_t m_UnlockTime;
        uint32_t m_DisputesResolved;
        uint32_t m_AccuracyScore;     // 0-100
        Amount m_Rewards;             // Pending rewards (legacy, kept for compatibility)
        Amount m_RewardDebt;          // Reward debt for fair distribution
    };

    // Verified feedback
    struct Feedback {
        uint64_t m_Id;
        uint64_t m_TradeId;
        PubKey m_From;
        PubKey m_To;
        uint8_t m_Rating;             // 1-5 stars
        uint64_t m_CreatedAt;
    };

    // Track if feedback submitted for a trade
    struct TradeFeedbackStatus {
        uint64_t m_TradeId;
        uint8_t m_BuyerSubmitted;
        uint8_t m_SellerSubmitted;
    };

    // Manager entry
    struct Manager {
        PubKey m_pk;
        uint64_t m_AddedAt;
        uint8_t m_IsOwner;  // 1 = contract owner (cannot be removed)
    };

    // =========================================
    // STORAGE KEYS
    // =========================================
    // IMPORTANT: Must be packed to avoid padding between m_Tag and other fields
    // Without packing, uint8_t + uint64_t = 16 bytes (7 bytes padding)
    // With packing, uint8_t + uint64_t = 9 bytes (no padding)

#pragma pack (push, 1)
    struct Key {
        struct Settings {
            uint8_t m_Tag = KeyTag::Settings;
        };

        struct Trader {
            uint8_t m_Tag = KeyTag::Trader;
            PubKey m_pk;
        };

        struct Order {
            uint8_t m_Tag = KeyTag::Order;
            uint64_t m_Id;
        };

        struct Trade {
            uint8_t m_Tag = KeyTag::Trade;
            uint64_t m_Id;
        };

        struct Dispute {
            uint8_t m_Tag = KeyTag::Dispute;
            uint64_t m_Id;
        };

        struct EscrowStake {
            uint8_t m_Tag = KeyTag::EscrowStake;
            PubKey m_pk;
        };

        struct Feedback {
            uint8_t m_Tag = KeyTag::Feedback;
            uint64_t m_Id;
        };

        struct TradeFeedbackStatus {
            uint8_t m_Tag = KeyTag::TradeFeedbackStatus;
            uint64_t m_TradeId;
        };

        struct Counter {
            uint8_t m_Tag = KeyTag::Counter;
            uint8_t m_Type;  // 0=order, 1=trade, 2=dispute, 3=feedback
        };

        struct Manager {
            uint8_t m_Tag = KeyTag::Manager;
            PubKey m_pk;
        };
    };
#pragma pack (pop)

    // =========================================
    // METHOD PARAMETERS
    // =========================================

    namespace Method
    {
        // Method 0: Constructor
        struct Create {
            static const uint32_t s_iMethod = 0;
            Amount m_MinEscrowStake;
            PubKey m_Owner;  // Auto-derived from deployer's wallet key
        };

        // Method 1: Destructor
        struct Destroy {
            static const uint32_t s_iMethod = 1;
        };
    }

    // Legacy aliases for backward compatibility
    using Ctor = Method::Create;
    using Dtor = Method::Destroy;

    // Method 2: Register Trader
    struct RegisterTrader {
        PubKey m_pk;
    };

    // Method 3: Create Order
    struct CreateOrder {
        PubKey m_pk;
        AssetID m_AssetId;
        Amount m_Amount;
        uint64_t m_Price;
        uint16_t m_CurrencyId;        // ISO 4217 currency code (840=USD, 978=EUR, 643=RUB)
        Amount m_MinLimit;
        Amount m_MaxLimit;
        uint16_t m_PaymentMethods[MAX_PAYMENT_METHODS];  // Array of payment method IDs (1001, 3002, etc.)
        uint8_t m_PaymentMethodCount; // Number of methods (1-8)
        uint8_t m_Side;
    };

    // Method 4: Cancel Order
    struct CancelOrder {
        PubKey m_pk;
        uint64_t m_OrderId;
    };

    // Method 5: Accept Order (starts trade)
    struct AcceptOrder {
        PubKey m_pk;
        uint64_t m_OrderId;
        Amount m_Amount;
    };

    // Method 6: Mark Payment Sent
    struct MarkPaymentSent {
        PubKey m_pk;
        uint64_t m_TradeId;
    };

    // Method 7: Confirm Payment Received (seller confirms, releases seller deposit)
    // UPDATED: Now requires feedback rating (1-5) for the buyer
    struct ConfirmPayment {
        PubKey m_pk;
        uint64_t m_TradeId;
        uint8_t m_Rating;  // Required: 1-5 stars for the buyer
    };

    // Method 20: Claim Trade (buyer claims crypto + deposit after seller confirms)
    // UPDATED: Now requires feedback rating (1-5) for the seller
    struct ClaimTrade {
        PubKey m_pk;
        uint64_t m_TradeId;
        uint8_t m_Rating;  // Required: 1-5 stars for the seller
    };

    // Method 21: Claim Dispute Win (winner claims after dispute resolved)
    struct ClaimDisputeWin {
        PubKey m_pk;
        uint64_t m_TradeId;
    };

    // Method 8: Open Dispute
    struct OpenDispute {
        PubKey m_pk;
        uint64_t m_TradeId;
        uint8_t m_Reason;
    };

    // Method 9: Escrow Vote
    struct EscrowVote {
        PubKey m_pk;
        uint64_t m_DisputeId;
        uint8_t m_Decision;  // 1=buyer wins, 2=seller wins
    };

    // Method 10: Submit Feedback (verified)
    struct SubmitFeedback {
        PubKey m_pk;
        uint64_t m_TradeId;
        PubKey m_Target;
        uint8_t m_Rating;
    };

    // Method 11: Stake for Escrow
    struct StakeEscrow {
        PubKey m_pk;
        Amount m_Amount;
    };

    // Method 12: Unstake Escrow
    struct UnstakeEscrow {
        PubKey m_pk;
    };

    // Method 13: Claim Escrow Rewards
    struct ClaimRewards {
        PubKey m_pk;
    };

    // Method 14: Withdraw Fees (Manager only)
    struct WithdrawFees {
        PubKey m_pk;        // Manager's pubkey for signature
        Amount m_Amount;
        AssetID m_AssetId;  // Asset to withdraw fees from
    };

    // Method 15: Assign Escrows to Dispute (Manager only)
    struct AssignEscrows {
        PubKey m_pk;  // Manager's pubkey for signature
        uint64_t m_DisputeId;
        PubKey m_Escrows[NUM_ESCROWS];
    };

    // Method 16: Update Settings (Manager only)
    struct UpdateSettings {
        PubKey m_pk;  // Manager's pubkey for signature
        Amount m_MinEscrowStake;
        uint32_t m_TradeFeeBps;
        uint32_t m_DefaultDepositPct;
        uint32_t m_PaymentTimeout;
        uint32_t m_ConfirmTimeout;
        uint32_t m_DisputeTimeout;
    };

    // Method 17: Add Manager (Owner only)
    struct AddManager {
        PubKey m_OwnerPk;  // Current owner/manager signature
        PubKey m_NewManager;
    };

    // Method 18: Remove Manager (Owner only)
    struct RemoveManager {
        PubKey m_OwnerPk;
        PubKey m_ManagerToRemove;
    };

    // Method 19: Upgrade Contract (Owner only)
    // Marks this contract as upgraded and points to new version
    // Allows migrating data to new contract without losing state references
    struct UpgradeContract {
        PubKey m_OwnerPk;
        ContractID m_NewContractId;  // New contract to migrate to
    };

    // =========================================
    // VIEW METHODS (App Shader)
    // =========================================

    // Get trader reputation
    struct GetTraderRep {
        PubKey m_pk;
    };

    struct GetTraderRepResult {
        uint32_t m_TotalTrades;
        uint32_t m_SuccessfulTrades;
        uint32_t m_DisputesWon;
        uint32_t m_DisputesLost;
        Amount m_TotalVolume;
        uint32_t m_FeedbackCount;
        uint32_t m_AvgRating;         // Rating * 100 (485 = 4.85)
        uint32_t m_TrustScore;        // 0-100
        uint16_t m_Badges;
        uint64_t m_RegisteredAt;
    };

    // Get feedbacks for trader
    struct GetFeedbacks {
        PubKey m_pk;
        uint32_t m_Skip;
        uint32_t m_Limit;
    };

    // View orders
    struct ViewOrders {
        AssetID m_AssetId;
        uint8_t m_Side;
        uint32_t m_Skip;
        uint32_t m_Limit;
    };

} // namespace P2PEscrow
