// P2P Escrow Contract - Implementation
// BEAM Privacy Blockchain Smart Contract

#include "common.h"
#include "contract.h"

using namespace P2PEscrow;

// =========================================
// HELPER FUNCTIONS
// =========================================

namespace {

    // Load settings from storage
    bool LoadSettings(Settings& s) {
        Key::Settings key;
        _POD_(key).SetZero();  // Clear any padding/garbage
        key.m_Tag = P2PEscrow::KeyTag::Settings;
        return Env::LoadVar_T(key, s);
    }

    void SaveSettings(const Settings& s) {
        Key::Settings key;
        _POD_(key).SetZero();  // Clear any padding/garbage
        key.m_Tag = P2PEscrow::KeyTag::Settings;
        Env::SaveVar_T(key, s);
    }

    // Load/save trader
    bool LoadTrader(const PubKey& pk, Trader& t) {
        Key::Trader key;
        key.m_Tag = P2PEscrow::KeyTag::Trader;
        key.m_pk = pk;
        return Env::LoadVar_T(key, t);
    }

    void SaveTrader(const PubKey& pk, const Trader& t) {
        Key::Trader key;
        key.m_Tag = P2PEscrow::KeyTag::Trader;
        key.m_pk = pk;
        Env::SaveVar_T(key, t);
    }

    // Auto-register trader if not exists
    void EnsureTraderRegistered(const PubKey& pk) {
        Trader t;
        if (!LoadTrader(pk, t)) {
            _POD_(t).SetZero();
            t.m_pk = pk;
            t.m_RegisteredAt = Env::get_Height();
            t.m_LastActive = t.m_RegisteredAt;
            SaveTrader(pk, t);
        }
    }

    // Load/save order
    bool LoadOrder(uint64_t id, Order& o) {
        Key::Order key;
        key.m_Tag = P2PEscrow::KeyTag::Order;  // Must set tag explicitly!
        key.m_Id = id;
        return Env::LoadVar_T(key, o);
    }

    void SaveOrder(const Order& o) {
        Key::Order key;
        key.m_Tag = P2PEscrow::KeyTag::Order;  // Must set tag explicitly!
        key.m_Id = o.m_Id;
        Env::SaveVar_T(key, o);
    }

    void DeleteOrder(uint64_t id) {
        Key::Order key;
        key.m_Tag = P2PEscrow::KeyTag::Order;  // Must set tag explicitly!
        key.m_Id = id;
        Env::DelVar_T(key);
    }

    // Load/save trade
    bool LoadTrade(uint64_t id, Trade& t) {
        Key::Trade key;
        key.m_Tag = P2PEscrow::KeyTag::Trade;
        key.m_Id = id;
        return Env::LoadVar_T(key, t);
    }

    void SaveTrade(const Trade& t) {
        Key::Trade key;
        key.m_Tag = P2PEscrow::KeyTag::Trade;
        key.m_Id = t.m_Id;
        Env::SaveVar_T(key, t);
    }

    // Load/save dispute
    bool LoadDispute(uint64_t id, Dispute& d) {
        Key::Dispute key;
        key.m_Tag = P2PEscrow::KeyTag::Dispute;
        key.m_Id = id;
        return Env::LoadVar_T(key, d);
    }

    void SaveDispute(const Dispute& d) {
        Key::Dispute key;
        key.m_Tag = P2PEscrow::KeyTag::Dispute;
        key.m_Id = d.m_Id;
        Env::SaveVar_T(key, d);
    }

    // Load/save escrow stake
    bool LoadEscrowStake(const PubKey& pk, EscrowStake& s) {
        Key::EscrowStake key;
        key.m_Tag = P2PEscrow::KeyTag::EscrowStake;
        key.m_pk = pk;
        return Env::LoadVar_T(key, s);
    }

    void SaveEscrowStake(const PubKey& pk, const EscrowStake& s) {
        Key::EscrowStake key;
        key.m_Tag = P2PEscrow::KeyTag::EscrowStake;
        key.m_pk = pk;
        Env::SaveVar_T(key, s);
    }

    void DeleteEscrowStake(const PubKey& pk) {
        Key::EscrowStake key;
        key.m_Tag = P2PEscrow::KeyTag::EscrowStake;
        key.m_pk = pk;
        Env::DelVar_T(key);
    }

    // Counter management
    uint64_t GetNextId(uint8_t type) {
        Key::Counter key;
        key.m_Tag = P2PEscrow::KeyTag::Counter;
        key.m_Type = type;
        uint64_t id = 0;
        Env::LoadVar_T(key, id);
        id++;
        Env::SaveVar_T(key, id);
        return id;
    }

    // Manager management
    bool LoadManager(const PubKey& pk, Manager& m) {
        Key::Manager key;
        key.m_Tag = P2PEscrow::KeyTag::Manager;
        key.m_pk = pk;
        return Env::LoadVar_T(key, m);
    }

    void SaveManager(const PubKey& pk, const Manager& m) {
        Key::Manager key;
        key.m_Tag = P2PEscrow::KeyTag::Manager;
        key.m_pk = pk;
        Env::SaveVar_T(key, m);
    }

    void DeleteManager(const PubKey& pk) {
        Key::Manager key;
        key.m_Tag = P2PEscrow::KeyTag::Manager;
        key.m_pk = pk;
        Env::DelVar_T(key);
    }

    bool IsManager(const PubKey& pk) {
        Manager m;
        return LoadManager(pk, m);
    }

    // Calculate trust score
    uint32_t CalculateTrustScore(const Trader& t) {
        if (t.m_TotalTrades == 0) return 50;

        // Base score from completion rate (0-50 points)
        uint32_t completionRate = (t.m_SuccessfulTrades * 100) / t.m_TotalTrades;
        uint32_t score = completionRate / 2;

        // Dispute bonus/penalty (-20 to +20)
        int32_t disputeScore = (int32_t)t.m_DisputesWon - ((int32_t)t.m_DisputesLost * 3);
        if (disputeScore > 10) disputeScore = 10;
        if (disputeScore < -10) disputeScore = -10;
        score += 10 + disputeScore;

        // Feedback bonus (0-20)
        if (t.m_FeedbackCount > 0) {
            uint32_t avgRating = (t.m_TotalRating * 100) / t.m_FeedbackCount;
            score += (avgRating - 300) / 10;  // 3 stars = 0 bonus, 5 stars = 20 bonus
        }

        if (score > 100) score = 100;
        return score;
    }

    // Update badges based on stats
    uint16_t UpdateBadges(const Trader& t, uint16_t currentBadges) {
        uint16_t badges = currentBadges;

        // Fire badge: 95%+ trust, 50+ trades
        if (CalculateTrustScore(t) >= 95 && t.m_TotalTrades >= 50)
            badges |= 0x02;

        // Diamond badge: 500+ trades, high volume
        if (t.m_TotalTrades >= 500)
            badges |= 0x04;

        return badges;
    }

} // anonymous namespace

// =========================================
// CONTRACT METHODS
// =========================================

// Method 0: Constructor (faucet2 pattern with auto-derived owner)
BEAM_EXPORT void Ctor(const Method::Create& r) {
    Settings s;
    s.m_Version = CONTRACT_VERSION;  // Track contract version for migration
    s.m_MinEscrowStake = r.m_MinEscrowStake ? r.m_MinEscrowStake : MIN_ESCROW_STAKE;
    s.m_LockPeriod = LOCK_PERIOD;
    s.m_TradeFeeBps = TRADE_FEE_BPS;
    s.m_DefaultDepositPct = DEFAULT_DEPOSIT_PCT;
    s.m_PaymentTimeout = PAYMENT_TIMEOUT;
    s.m_ConfirmTimeout = CONFIRM_TIMEOUT;
    s.m_DisputeTimeout = DISPUTE_TIMEOUT;
    s.m_TotalFees = 0;
    s.m_TotalStaked = 0;
    s.m_AccRewardPerShare = 0;
    s.m_TotalTrades = 0;
    s.m_TotalDisputes = 0;
    _POD_(s.m_UpgradedTo).SetZero();  // Not upgraded yet
    SaveSettings(s);

    // Register the deployer as initial owner/manager
    // Owner pk is auto-derived in app shader from wallet key (secure, faucet2 pattern)
    Manager m;
    m.m_pk = r.m_Owner;
    m.m_AddedAt = Env::get_Height();
    m.m_IsOwner = 1;  // This is the contract owner
    SaveManager(r.m_Owner, m);
}

// Method 1: Destructor
BEAM_EXPORT void Dtor(const Method::Destroy&) {
    // Contract can only be destroyed if no active trades/stakes
}

// Method 2: Register Trader
// NO AddSig - registration stores data under pk, FundsLock not needed
BEAM_EXPORT void Method_2(const RegisterTrader& r) {
    EnsureTraderRegistered(r.m_pk);
}

// Method 3: Create Order
// NO AddSig - FundsLock handles authorization (caller spends own funds)
BEAM_EXPORT void Method_3(const CreateOrder& r) {
    EnsureTraderRegistered(r.m_pk);

    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Calculate deposit (always in FOMO)
    Amount deposit = (r.m_Amount * s.m_DefaultDepositPct) / 100;

    // Lock trade amount in trade asset
    Env::FundsLock(r.m_AssetId, r.m_Amount);

    // Lock deposit separately in FOMO (asset 174)
    Env::FundsLock(174, deposit);

    // Validate payment method count
    Env::Halt_if(r.m_PaymentMethodCount == 0 || r.m_PaymentMethodCount > MAX_PAYMENT_METHODS);

    // Create order
    Order o;
    o.m_Id = GetNextId(0);
    o.m_Seller = r.m_pk;
    o.m_AssetId = r.m_AssetId;
    o.m_Amount = r.m_Amount;
    o.m_RemainingAmount = r.m_Amount;  // Initially, remaining = total
    o.m_Deposit = deposit;
    o.m_PriceInCents = r.m_Price;
    o.m_CurrencyId = r.m_CurrencyId;  // ISO 4217 currency code
    o.m_MinLimit = r.m_MinLimit;
    o.m_MaxLimit = r.m_MaxLimit;

    // Copy payment methods array
    o.m_PaymentMethodCount = r.m_PaymentMethodCount;
    for (uint8_t i = 0; i < MAX_PAYMENT_METHODS; i++) {
        o.m_PaymentMethods[i] = (i < r.m_PaymentMethodCount) ? r.m_PaymentMethods[i] : 0;
    }

    o.m_Side = r.m_Side;
    o.m_Status = OrderStatus::Open;
    o.m_CreatedAt = Env::get_Height();
    o.m_ActiveTradeId = 0;  // No active trade

    SaveOrder(o);

    // Emit log
    Env::EmitLog_T(o.m_Id, o);
}

// Method 4: Cancel Order (handles partial orders)
// YES AddSig - FundsUnlock returns funds to seller
BEAM_EXPORT void Method_4(const CancelOrder& r) {
    Order o;
    Env::Halt_if(!LoadOrder(r.m_OrderId, o));
    Env::Halt_if(o.m_Status != OrderStatus::Open);  // Can only cancel open orders
    Env::Halt_if(_POD_(o.m_Seller) != r.m_pk);
    Env::AddSig(r.m_pk);  // Verify seller owns this pk (FundsUnlock)

    // Unlock REMAINING trade amount in trade asset
    Env::FundsUnlock(o.m_AssetId, o.m_RemainingAmount);

    // Unlock proportional FOMO deposit
    Amount remainingDeposit = (o.m_Deposit * o.m_RemainingAmount) / o.m_Amount;
    Env::FundsUnlock(174, remainingDeposit);

    // Delete order
    DeleteOrder(r.m_OrderId);
}

// Method 5: Accept Order (starts trade) - supports PARTIAL orders
// NO AddSig - FundsLock handles authorization (buyer deposits own funds)
BEAM_EXPORT void Method_5(const AcceptOrder& r) {
    EnsureTraderRegistered(r.m_pk);

    Order o;
    Env::Halt_if(!LoadOrder(r.m_OrderId, o));
    Env::Halt_if(o.m_Status != OrderStatus::Open);  // Must be open (not already in trade)
    Env::Halt_if(_POD_(o.m_Seller) == r.m_pk);  // Can't accept own order

    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // VALIDATION: Amount must be within order limits
    // Limits are in fiat terms (cents), so calculate fiat value of requested amount
    Amount fiatValue = (r.m_Amount * o.m_PriceInCents) / GROTH;
    Env::Halt_if(fiatValue < o.m_MinLimit);   // Below minimum trade
    Env::Halt_if(fiatValue > o.m_MaxLimit);   // Above maximum trade

    // VALIDATION: Amount must not exceed remaining order amount
    Env::Halt_if(r.m_Amount > o.m_RemainingAmount);
    Env::Halt_if(r.m_Amount == 0);

    // Calculate buyer deposit (% of trade amount) - ALWAYS IN FOMO
    Amount buyerDeposit = (r.m_Amount * s.m_DefaultDepositPct) / 100;

    // Calculate proportional seller deposit for this trade
    // Seller's deposit is proportional to the trade amount vs total order
    Amount sellerDepositForTrade = (o.m_Deposit * r.m_Amount) / o.m_Amount;

    // Lock buyer deposit in FOMO (asset 174)
    Env::FundsLock(174, buyerDeposit);

    // Create trade
    Trade t;
    t.m_Id = GetNextId(1);
    t.m_OrderId = r.m_OrderId;
    t.m_Buyer = r.m_pk;
    t.m_Seller = o.m_Seller;
    t.m_AssetId = o.m_AssetId;
    t.m_Amount = r.m_Amount;
    t.m_BuyerDeposit = buyerDeposit;
    t.m_SellerDeposit = sellerDepositForTrade;  // Proportional deposit
    t.m_PayAmount = fiatValue;
    t.m_CurrencyId = o.m_CurrencyId;  // Copy ISO 4217 currency code

    // Copy payment methods array from order
    t.m_PaymentMethodCount = o.m_PaymentMethodCount;
    for (uint8_t i = 0; i < MAX_PAYMENT_METHODS; i++) {
        t.m_PaymentMethods[i] = o.m_PaymentMethods[i];
    }

    t.m_Status = TradeStatus::Accepted;
    t.m_StartedAt = Env::get_Height();
    t.m_PaymentSentAt = 0;
    t.m_ConfirmDeadline = 0;
    t.m_CompletedAt = 0;

    SaveTrade(t);

    // Update order: mark as in trade and track active trade
    o.m_Status = OrderStatus::InTrade;
    o.m_ActiveTradeId = t.m_Id;
    SaveOrder(o);

    // Emit log
    Env::EmitLog_T(t.m_Id, t);
}

// Method 6: Mark Payment Sent
// NO AddSig - no funds involved, state change only (buyer verification via pk check)
BEAM_EXPORT void Method_6(const MarkPaymentSent& r) {
    Trade t;
    Env::Halt_if(!LoadTrade(r.m_TradeId, t));
    Env::Halt_if(t.m_Status != TradeStatus::Accepted);
    Env::Halt_if(_POD_(t.m_Buyer) != r.m_pk);

    Settings s;
    Env::Halt_if(!LoadSettings(s));

    t.m_Status = TradeStatus::PaymentSent;
    t.m_PaymentSentAt = Env::get_Height();
    t.m_ConfirmDeadline = t.m_PaymentSentAt + s.m_ConfirmTimeout;

    SaveTrade(t);
}

// Method 7: Confirm Payment Received (seller confirms, releases seller's deposit)
// YES AddSig - FundsUnlock releases seller's deposit back to seller
// NOTE: Buyer must call claim_trade (Method 20) to get their crypto + deposit
// UPDATED: Now requires feedback rating (1-5) for the buyer
BEAM_EXPORT void Method_7(const ConfirmPayment& r) {
    // Validate rating (REQUIRED)
    Env::Halt_if(r.m_Rating < 1 || r.m_Rating > 5);

    Trade t;
    Env::Halt_if(!LoadTrade(r.m_TradeId, t));
    Env::Halt_if(t.m_Status != TradeStatus::PaymentSent);
    Env::Halt_if(_POD_(t.m_Seller) != r.m_pk);
    Env::AddSig(r.m_pk);  // Verify seller owns this pk (FundsUnlock)

    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Calculate 0.5% fee from seller's FOMO deposit
    Amount sellerFee = (t.m_SellerDeposit * s.m_TradeFeeBps) / 10000;

    // Return seller's deposit minus fee (in FOMO)
    Env::FundsUnlock(174, t.m_SellerDeposit - sellerFee);

    // Add seller's fee portion to totals (buyer fee added when they claim)
    Amount escrowShare = (sellerFee * 40) / 100;
    Amount managerShare = sellerFee - escrowShare;

    s.m_TotalFees += managerShare;

    // Distribute escrow share to stakers (if any staked)
    if (s.m_TotalStaked > 0 && escrowShare > 0) {
        s.m_AccRewardPerShare += (escrowShare * 100000000) / s.m_TotalStaked;
    }

    SaveSettings(s);

    // Update trade status - buyer can now claim
    t.m_Status = TradeStatus::SellerConfirmed;
    SaveTrade(t);

    // ========== SAVE SELLER'S FEEDBACK FOR BUYER ==========
    // Mark feedback as submitted
    Key::TradeFeedbackStatus fsKey;
    fsKey.m_Tag = P2PEscrow::KeyTag::TradeFeedbackStatus;
    fsKey.m_TradeId = r.m_TradeId;
    TradeFeedbackStatus fs;
    if (!Env::LoadVar_T(fsKey, fs)) {
        fs.m_TradeId = r.m_TradeId;
        fs.m_BuyerSubmitted = 0;
        fs.m_SellerSubmitted = 0;
    }
    fs.m_SellerSubmitted = 1;
    Env::SaveVar_T(fsKey, fs);

    // Create feedback record
    Feedback f;
    f.m_Id = GetNextId(3);  // 3 = feedback counter
    f.m_TradeId = r.m_TradeId;
    f.m_From = r.m_pk;      // Seller
    f.m_To = t.m_Buyer;     // Buyer
    f.m_Rating = r.m_Rating;
    f.m_CreatedAt = Env::get_Height();

    Key::Feedback fKey;
    fKey.m_Tag = P2PEscrow::KeyTag::Feedback;
    fKey.m_Id = f.m_Id;
    Env::SaveVar_T(fKey, f);

    // Update buyer's reputation
    Trader buyer;
    if (LoadTrader(t.m_Buyer, buyer)) {
        buyer.m_FeedbackCount++;
        buyer.m_TotalRating += r.m_Rating;
        buyer.m_Badges = UpdateBadges(buyer, buyer.m_Badges);
        SaveTrader(t.m_Buyer, buyer);
    }
    // ========== END FEEDBACK ==========

    // Update seller stats
    Trader seller;
    if (LoadTrader(t.m_Seller, seller)) {
        seller.m_TotalTrades++;
        seller.m_SuccessfulTrades++;
        seller.m_TotalVolume += t.m_Amount;
        seller.m_LastActive = Env::get_Height();
        seller.m_Badges = UpdateBadges(seller, seller.m_Badges);
        SaveTrader(t.m_Seller, seller);
    }
}

// Method 20: Claim Trade (buyer claims crypto + deposit after seller confirms)
// YES AddSig - FundsUnlock releases trade amount + buyer deposit to buyer
// UPDATED: Now requires feedback rating (1-5) for the seller
BEAM_EXPORT void Method_20(const ClaimTrade& r) {
    // Validate rating (REQUIRED)
    Env::Halt_if(r.m_Rating < 1 || r.m_Rating > 5);

    Trade t;
    Env::Halt_if(!LoadTrade(r.m_TradeId, t));
    Env::Halt_if(t.m_Status != TradeStatus::SellerConfirmed);
    Env::Halt_if(_POD_(t.m_Buyer) != r.m_pk);
    Env::AddSig(r.m_pk);  // Verify buyer owns this pk (FundsUnlock)

    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Release FULL trade amount to buyer (in trade asset)
    Env::FundsUnlock(t.m_AssetId, t.m_Amount);

    // Calculate 0.5% fee from buyer's FOMO deposit
    Amount buyerFee = (t.m_BuyerDeposit * s.m_TradeFeeBps) / 10000;

    // Return buyer's deposit minus fee (in FOMO)
    Env::FundsUnlock(174, t.m_BuyerDeposit - buyerFee);

    // Add buyer's fee portion to totals
    Amount escrowShare = (buyerFee * 40) / 100;
    Amount managerShare = buyerFee - escrowShare;

    s.m_TotalFees += managerShare;

    // Distribute escrow share to stakers (if any staked)
    if (s.m_TotalStaked > 0 && escrowShare > 0) {
        s.m_AccRewardPerShare += (escrowShare * 100000000) / s.m_TotalStaked;
    }

    s.m_TotalTrades++;
    SaveSettings(s);

    // Update trade status to fully completed
    t.m_Status = TradeStatus::Completed;
    t.m_CompletedAt = Env::get_Height();
    SaveTrade(t);

    // ========== SAVE BUYER'S FEEDBACK FOR SELLER ==========
    // Load or create feedback status
    Key::TradeFeedbackStatus fsKey;
    fsKey.m_Tag = P2PEscrow::KeyTag::TradeFeedbackStatus;
    fsKey.m_TradeId = r.m_TradeId;
    TradeFeedbackStatus fs;
    if (!Env::LoadVar_T(fsKey, fs)) {
        fs.m_TradeId = r.m_TradeId;
        fs.m_BuyerSubmitted = 0;
        fs.m_SellerSubmitted = 0;
    }
    fs.m_BuyerSubmitted = 1;
    Env::SaveVar_T(fsKey, fs);

    // Create feedback record
    Feedback f;
    f.m_Id = GetNextId(3);  // 3 = feedback counter
    f.m_TradeId = r.m_TradeId;
    f.m_From = r.m_pk;      // Buyer
    f.m_To = t.m_Seller;    // Seller
    f.m_Rating = r.m_Rating;
    f.m_CreatedAt = Env::get_Height();

    Key::Feedback fKey;
    fKey.m_Tag = P2PEscrow::KeyTag::Feedback;
    fKey.m_Id = f.m_Id;
    Env::SaveVar_T(fKey, f);

    // Update seller's reputation
    Trader seller;
    if (LoadTrader(t.m_Seller, seller)) {
        seller.m_FeedbackCount++;
        seller.m_TotalRating += r.m_Rating;
        seller.m_Badges = UpdateBadges(seller, seller.m_Badges);
        SaveTrader(t.m_Seller, seller);
    }
    // ========== END FEEDBACK ==========

    // Update buyer stats
    Trader buyer;
    if (LoadTrader(t.m_Buyer, buyer)) {
        buyer.m_TotalTrades++;
        buyer.m_SuccessfulTrades++;
        buyer.m_TotalVolume += t.m_Amount;
        buyer.m_LastActive = Env::get_Height();
        buyer.m_Badges = UpdateBadges(buyer, buyer.m_Badges);
        SaveTrader(t.m_Buyer, buyer);
    }

    // Update order for partial fulfillment
    Order o;
    if (LoadOrder(t.m_OrderId, o)) {
        // Deduct trade amount from remaining
        o.m_RemainingAmount -= t.m_Amount;
        o.m_ActiveTradeId = 0;  // Clear active trade

        if (o.m_RemainingAmount > 0) {
            // PARTIAL ORDER: Still has remaining amount
            // Update max limit based on new remaining amount
            Amount newMaxFiat = (o.m_RemainingAmount * o.m_PriceInCents) / GROTH;
            if (newMaxFiat < o.m_MaxLimit) {
                o.m_MaxLimit = newMaxFiat;  // Can't trade more than remaining
            }
            // If remaining amount's fiat value is below min limit, close order
            if (newMaxFiat < o.m_MinLimit) {
                o.m_Status = OrderStatus::Completed;  // Too small to trade
            } else {
                o.m_Status = OrderStatus::Open;  // Reopen for more trades
            }
        } else {
            // FULLY FILLED: No remaining amount
            o.m_Status = OrderStatus::Completed;
        }
        SaveOrder(o);
    }
}

// Method 8: Open Dispute
// NO AddSig - no funds involved, state change only
BEAM_EXPORT void Method_8(const OpenDispute& r) {
    Trade t;
    Env::Halt_if(!LoadTrade(r.m_TradeId, t));
    Env::Halt_if(t.m_Status != TradeStatus::PaymentSent);

    // Must be buyer or seller
    bool isBuyer = (_POD_(t.m_Buyer) == r.m_pk);
    bool isSeller = (_POD_(t.m_Seller) == r.m_pk);
    Env::Halt_if(!isBuyer && !isSeller);

    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Create dispute
    Dispute d;
    d.m_Id = GetNextId(2);
    d.m_TradeId = r.m_TradeId;
    d.m_Reason = r.m_Reason;
    d.m_Resolved = 0;
    d.m_Winner = 0;
    d.m_OpenedAt = Env::get_Height();
    d.m_Deadline = d.m_OpenedAt + s.m_DisputeTimeout;

    // Initialize votes
    for (uint32_t i = 0; i < NUM_ESCROWS; i++) {
        _POD_(d.m_Escrows[i]).SetZero();
        d.m_Votes[i] = 0;
    }

    // TODO: Select random escrows from stake pool
    // For now, escrows are assigned externally

    SaveDispute(d);

    // Update trade status
    t.m_Status = TradeStatus::Disputed;
    SaveTrade(t);

    s.m_TotalDisputes++;
    SaveSettings(s);
}

// Method 9: Escrow Vote
// NO FundsUnlock - escrow only resolves dispute, winner calls ClaimDisputeWin
// Forfeited deposits: 50% to managers, 50% to escrow stakers
BEAM_EXPORT void Method_9(const EscrowVote& r) {
    Env::AddSig(r.m_pk);  // Verify escrow owns this pk

    Dispute d;
    Env::Halt_if(!LoadDispute(r.m_DisputeId, d));
    Env::Halt_if(d.m_Resolved);

    // Find escrow index
    int32_t escrowIdx = -1;
    for (uint32_t i = 0; i < NUM_ESCROWS; i++) {
        if (_POD_(d.m_Escrows[i]) == r.m_pk) {
            escrowIdx = i;
            break;
        }
    }
    Env::Halt_if(escrowIdx < 0);
    Env::Halt_if(d.m_Votes[escrowIdx] != 0);  // Already voted

    // Record vote
    d.m_Votes[escrowIdx] = r.m_Decision;

    // Check for majority
    uint32_t buyerVotes = 0, sellerVotes = 0;
    for (uint32_t i = 0; i < NUM_ESCROWS; i++) {
        if (d.m_Votes[i] == 1) buyerVotes++;
        else if (d.m_Votes[i] == 2) sellerVotes++;
    }

    // If majority reached, resolve dispute
    if (buyerVotes >= 2 || sellerVotes >= 2) {
        d.m_Resolved = 1;
        d.m_Winner = (buyerVotes >= 2) ? 1 : 2;

        Trade t;
        Env::Halt_if(!LoadTrade(d.m_TradeId, t));

        Settings s;
        Env::Halt_if(!LoadSettings(s));

        // Forfeit loser's deposit: 50% to managers, 50% to escrow stakers
        Amount forfeitedDeposit = (d.m_Winner == 1) ? t.m_SellerDeposit : t.m_BuyerDeposit;
        Amount managerShare = forfeitedDeposit / 2;
        Amount escrowShare = forfeitedDeposit - managerShare;

        s.m_TotalFees += managerShare;

        // Distribute escrow share to stakers (if any staked)
        if (s.m_TotalStaked > 0 && escrowShare > 0) {
            s.m_AccRewardPerShare += (escrowShare * 100000000) / s.m_TotalStaked;
        }

        s.m_TotalDisputes++;
        SaveSettings(s);

        if (d.m_Winner == 1) {
            // Buyer wins: mark as BuyerWonDispute, buyer calls ClaimDisputeWin
            t.m_Status = TradeStatus::BuyerWonDispute;

            // Update stats
            Trader buyer;
            if (LoadTrader(t.m_Buyer, buyer)) {
                buyer.m_DisputesWon++;
                SaveTrader(t.m_Buyer, buyer);
            }
            Trader seller;
            if (LoadTrader(t.m_Seller, seller)) {
                seller.m_DisputesLost++;
                SaveTrader(t.m_Seller, seller);
            }
        } else {
            // Seller wins: mark as SellerWonDispute, seller calls ClaimDisputeWin
            t.m_Status = TradeStatus::SellerWonDispute;

            // Update stats
            Trader seller;
            if (LoadTrader(t.m_Seller, seller)) {
                seller.m_DisputesWon++;
                SaveTrader(t.m_Seller, seller);
            }
            Trader buyer;
            if (LoadTrader(t.m_Buyer, buyer)) {
                buyer.m_DisputesLost++;
                SaveTrader(t.m_Buyer, buyer);
            }
        }

        SaveTrade(t);
    }

    // Update voting escrow stats
    EscrowStake es;
    if (LoadEscrowStake(r.m_pk, es)) {
        es.m_DisputesResolved++;
        // Accuracy: voted with majority (if resolved)
        if (d.m_Resolved) {
            if (r.m_Decision == d.m_Winner) {
                es.m_AccuracyScore = (es.m_AccuracyScore * (es.m_DisputesResolved - 1) + 100) / es.m_DisputesResolved;
            } else {
                es.m_AccuracyScore = (es.m_AccuracyScore * (es.m_DisputesResolved - 1)) / es.m_DisputesResolved;
            }
        }
        SaveEscrowStake(r.m_pk, es);
    }

    SaveDispute(d);
}

// Method 21: Claim Dispute Win (winner claims after dispute resolved)
// YES AddSig - FundsUnlock releases funds to winner
BEAM_EXPORT void Method_21(const ClaimDisputeWin& r) {
    Trade t;
    Env::Halt_if(!LoadTrade(r.m_TradeId, t));

    bool isBuyerWinner = (t.m_Status == TradeStatus::BuyerWonDispute && _POD_(t.m_Buyer) == r.m_pk);
    bool isSellerWinner = (t.m_Status == TradeStatus::SellerWonDispute && _POD_(t.m_Seller) == r.m_pk);
    Env::Halt_if(!isBuyerWinner && !isSellerWinner);

    Env::AddSig(r.m_pk);  // Verify winner owns this pk (FundsUnlock)

    if (isBuyerWinner) {
        // Buyer won: gets trade amount + buyer's deposit (no fee - seller was scammer)
        Env::FundsUnlock(t.m_AssetId, t.m_Amount);
        Env::FundsUnlock(174, t.m_BuyerDeposit);
        t.m_Status = TradeStatus::Completed;
    } else {
        // Seller won: gets trade amount back + seller's deposit (no fee - buyer was scammer)
        Env::FundsUnlock(t.m_AssetId, t.m_Amount);
        Env::FundsUnlock(174, t.m_SellerDeposit);
        t.m_Status = TradeStatus::Refunded;
    }

    t.m_CompletedAt = Env::get_Height();
    SaveTrade(t);

    // Initialize feedback status
    TradeFeedbackStatus fs;
    fs.m_TradeId = t.m_Id;
    fs.m_BuyerSubmitted = 0;
    fs.m_SellerSubmitted = 0;
    Key::TradeFeedbackStatus fsKey;
    fsKey.m_Tag = P2PEscrow::KeyTag::TradeFeedbackStatus;
    fsKey.m_TradeId = t.m_Id;
    Env::SaveVar_T(fsKey, fs);
}

// Method 10: Submit Feedback (verified)
// NO AddSig - no funds involved, state change only
BEAM_EXPORT void Method_10(const SubmitFeedback& r) {
    Env::Halt_if(r.m_Rating < 1 || r.m_Rating > 5);

    Trade t;
    Env::Halt_if(!LoadTrade(r.m_TradeId, t));
    Env::Halt_if(t.m_Status != TradeStatus::Completed && t.m_Status != TradeStatus::Refunded);

    // Verify caller was party to trade
    bool isBuyer = (_POD_(t.m_Buyer) == r.m_pk);
    bool isSeller = (_POD_(t.m_Seller) == r.m_pk);
    Env::Halt_if(!isBuyer && !isSeller);

    // Verify target is the OTHER party
    if (isBuyer) {
        Env::Halt_if(_POD_(t.m_Seller) != r.m_Target);
    } else {
        Env::Halt_if(_POD_(t.m_Buyer) != r.m_Target);
    }

    // Check if already submitted
    Key::TradeFeedbackStatus fsKey;
    fsKey.m_Tag = P2PEscrow::KeyTag::TradeFeedbackStatus;
    fsKey.m_TradeId = r.m_TradeId;
    TradeFeedbackStatus fs;
    if (Env::LoadVar_T(fsKey, fs)) {
        if (isBuyer) {
            Env::Halt_if(fs.m_BuyerSubmitted);
            fs.m_BuyerSubmitted = 1;
        } else {
            Env::Halt_if(fs.m_SellerSubmitted);
            fs.m_SellerSubmitted = 1;
        }
        Env::SaveVar_T(fsKey, fs);
    }

    // Create feedback
    Feedback f;
    f.m_Id = GetNextId(3);
    f.m_TradeId = r.m_TradeId;
    f.m_From = r.m_pk;
    f.m_To = r.m_Target;
    f.m_Rating = r.m_Rating;
    f.m_CreatedAt = Env::get_Height();

    Key::Feedback fKey;
    fKey.m_Tag = P2PEscrow::KeyTag::Feedback;
    fKey.m_Id = f.m_Id;
    Env::SaveVar_T(fKey, f);

    // Update target's reputation
    Trader target;
    if (LoadTrader(r.m_Target, target)) {
        target.m_FeedbackCount++;
        target.m_TotalRating += r.m_Rating;
        target.m_Badges = UpdateBadges(target, target.m_Badges);
        SaveTrader(r.m_Target, target);
    }
}

// Method 11: Stake for Escrow
// NO AddSig - FundsLock handles authorization (staker deposits own funds)
BEAM_EXPORT void Method_11(const StakeEscrow& r) {
    Settings s;
    Env::Halt_if(!LoadSettings(s));
    Env::Halt_if(r.m_Amount < s.m_MinEscrowStake);

    // Lock stake (using FOMO token - asset ID 174)
    Env::FundsLock(174, r.m_Amount);

    EscrowStake es;
    bool existing = LoadEscrowStake(r.m_pk, es);
    if (!existing) {
        _POD_(es).SetZero();
        es.m_pk = r.m_pk;
        es.m_AccuracyScore = 50;  // Start at 50%
    } else {
        // Claim pending rewards before adding new stake
        Amount pending = (es.m_Amount * s.m_AccRewardPerShare) / 100000000 - es.m_RewardDebt;
        if (pending > 0) {
            es.m_Rewards += pending;
        }
    }

    es.m_Amount += r.m_Amount;
    es.m_StakedAt = Env::get_Height();
    es.m_UnlockTime = es.m_StakedAt + s.m_LockPeriod;

    // Update reward debt for fair distribution
    es.m_RewardDebt = (es.m_Amount * s.m_AccRewardPerShare) / 100000000;

    SaveEscrowStake(r.m_pk, es);

    // Update total staked
    s.m_TotalStaked += r.m_Amount;
    SaveSettings(s);

    // Update trader badge
    Trader t;
    if (LoadTrader(r.m_pk, t)) {
        t.m_Badges |= 0x08;  // Escrow badge
        SaveTrader(r.m_pk, t);
    }
}

// Method 12: Unstake Escrow
// YES AddSig - FundsUnlock returns stake to escrow
BEAM_EXPORT void Method_12(const UnstakeEscrow& r) {
    Env::AddSig(r.m_pk);  // Verify escrow owns this pk (FundsUnlock)

    Settings s;
    Env::Halt_if(!LoadSettings(s));

    EscrowStake es;
    Env::Halt_if(!LoadEscrowStake(r.m_pk, es));
    Env::Halt_if(Env::get_Height() < es.m_UnlockTime);

    // Calculate and claim pending rewards before unstaking
    Amount pending = (es.m_Amount * s.m_AccRewardPerShare) / 100000000 - es.m_RewardDebt;
    Amount totalRewards = es.m_Rewards + pending;

    // Unlock stake
    Env::FundsUnlock(174, es.m_Amount);

    // Unlock rewards if any (in FOMO)
    if (totalRewards > 0) {
        Env::FundsUnlock(174, totalRewards);
    }

    // Update total staked
    s.m_TotalStaked -= es.m_Amount;
    SaveSettings(s);

    DeleteEscrowStake(r.m_pk);

    // Remove escrow badge
    Trader t;
    if (LoadTrader(r.m_pk, t)) {
        t.m_Badges &= ~0x08;
        SaveTrader(r.m_pk, t);
    }
}

// Method 13: Claim Escrow Rewards
// YES AddSig - FundsUnlock returns rewards to escrow
BEAM_EXPORT void Method_13(const ClaimRewards& r) {
    Env::AddSig(r.m_pk);  // Verify escrow owns this pk (FundsUnlock)

    Settings s;
    Env::Halt_if(!LoadSettings(s));

    EscrowStake es;
    Env::Halt_if(!LoadEscrowStake(r.m_pk, es));

    // Calculate pending rewards from accumulated rewards per share
    Amount pending = (es.m_Amount * s.m_AccRewardPerShare) / 100000000 - es.m_RewardDebt;
    Amount totalRewards = es.m_Rewards + pending;

    Env::Halt_if(totalRewards == 0);

    // Unlock rewards (in FOMO)
    Env::FundsUnlock(174, totalRewards);

    // Update reward debt and clear pending
    es.m_RewardDebt = (es.m_Amount * s.m_AccRewardPerShare) / 100000000;
    es.m_Rewards = 0;
    SaveEscrowStake(r.m_pk, es);
}

// Method 14: Withdraw Fees (Manager only)
// YES AddSig - FundsUnlock returns fees to manager
BEAM_EXPORT void Method_14(const WithdrawFees& r) {
    // Verify manager authorization
    Env::Halt_if(!IsManager(r.m_pk));
    Env::AddSig(r.m_pk);  // Verify manager owns this pk (FundsUnlock)

    Settings s;
    Env::Halt_if(!LoadSettings(s));
    Env::Halt_if(r.m_Amount > s.m_TotalFees);
    Env::Halt_if(r.m_Amount == 0);

    // Unlock accumulated fees
    Env::FundsUnlock(r.m_AssetId, r.m_Amount);

    s.m_TotalFees -= r.m_Amount;
    SaveSettings(s);
}

// Method 15: Assign Escrows to Dispute (Manager assigns escrow stakers)
// NO AddSig - no funds involved, manager authorization via IsManager check
BEAM_EXPORT void Method_15(const AssignEscrows& r) {
    // Verify manager authorization
    Env::Halt_if(!IsManager(r.m_pk));

    Dispute d;
    Env::Halt_if(!LoadDispute(r.m_DisputeId, d));
    Env::Halt_if(d.m_Resolved);

    // Verify all escrows have valid stakes
    for (uint32_t i = 0; i < NUM_ESCROWS; i++) {
        EscrowStake es;
        Env::Halt_if(!LoadEscrowStake(r.m_Escrows[i], es));
        Env::Halt_if(es.m_Amount < MIN_ESCROW_STAKE);

        d.m_Escrows[i] = r.m_Escrows[i];
        d.m_Votes[i] = 0;  // Reset votes
    }

    SaveDispute(d);
}

// Method 16: Update Settings (Manager can adjust parameters)
// NO AddSig - no funds involved, manager authorization via IsManager check
BEAM_EXPORT void Method_16(const UpdateSettings& r) {
    // Verify manager authorization
    Env::Halt_if(!IsManager(r.m_pk));

    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Update configurable settings
    if (r.m_MinEscrowStake > 0)
        s.m_MinEscrowStake = r.m_MinEscrowStake;
    if (r.m_TradeFeeBps > 0 && r.m_TradeFeeBps <= 1000)  // Max 10%
        s.m_TradeFeeBps = r.m_TradeFeeBps;
    if (r.m_DefaultDepositPct > 0 && r.m_DefaultDepositPct <= 50)  // Max 50%
        s.m_DefaultDepositPct = r.m_DefaultDepositPct;
    if (r.m_PaymentTimeout > 0)
        s.m_PaymentTimeout = r.m_PaymentTimeout;
    if (r.m_ConfirmTimeout > 0)
        s.m_ConfirmTimeout = r.m_ConfirmTimeout;
    if (r.m_DisputeTimeout > 0)
        s.m_DisputeTimeout = r.m_DisputeTimeout;

    SaveSettings(s);
}

// Method 17: Add Manager (Owner only)
// NO AddSig - no funds involved, owner authorization via LoadManager check
BEAM_EXPORT void Method_17(const AddManager& r) {
    // Verify owner authorization
    Manager owner;
    Env::Halt_if(!LoadManager(r.m_OwnerPk, owner));
    Env::Halt_if(!owner.m_IsOwner);  // Only owner can add managers

    // Check if new manager already exists
    Manager existing;
    Env::Halt_if(LoadManager(r.m_NewManager, existing));  // Must not exist

    // Add new manager
    Manager m;
    m.m_pk = r.m_NewManager;
    m.m_AddedAt = Env::get_Height();
    m.m_IsOwner = 0;  // Not owner, just manager
    SaveManager(r.m_NewManager, m);
}

// Method 18: Remove Manager (Owner only)
// NO AddSig - no funds involved, owner authorization via LoadManager check
BEAM_EXPORT void Method_18(const RemoveManager& r) {
    // Verify owner authorization
    Manager owner;
    Env::Halt_if(!LoadManager(r.m_OwnerPk, owner));
    Env::Halt_if(!owner.m_IsOwner);  // Only owner can remove managers

    // Load manager to remove
    Manager toRemove;
    Env::Halt_if(!LoadManager(r.m_ManagerToRemove, toRemove));
    Env::Halt_if(toRemove.m_IsOwner);  // Cannot remove owner

    // Remove manager
    DeleteManager(r.m_ManagerToRemove);
}

// Method 19: Upgrade Contract (Owner only)
// Marks this contract as upgraded, pointing to a new version
// Allows clients to discover the new contract ID
// NO AddSig - no funds involved, owner authorization via LoadManager check
BEAM_EXPORT void Method_19(const UpgradeContract& r) {
    // Verify owner authorization
    Manager owner;
    Env::Halt_if(!LoadManager(r.m_OwnerPk, owner));
    Env::Halt_if(!owner.m_IsOwner);  // Only owner can upgrade

    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Cannot upgrade if already upgraded
    ContractID zeroCid;
    _POD_(zeroCid).SetZero();
    Env::Halt_if(_POD_(s.m_UpgradedTo) != zeroCid);

    // Mark as upgraded to new contract
    s.m_UpgradedTo = r.m_NewContractId;
    SaveSettings(s);

    // Emit upgrade event
    Env::EmitLog_T(s.m_Version, r.m_NewContractId);
}
