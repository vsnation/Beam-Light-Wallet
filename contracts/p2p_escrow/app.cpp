// =============================================================================
// P2P Escrow Contract - App Shader
// =============================================================================
// BEAM Privacy Blockchain Smart Contract
// Client-side view and transaction builder
//
// =============================================================================
// DEVELOPMENT NUANCES & CRITICAL NOTES
// =============================================================================
//
// 1. KEY STRUCTURE PADDING (CRITICAL!)
//    - All Key structs MUST be wrapped in #pragma pack(push, 1) / #pragma pack(pop)
//    - Without packing, uint8_t + uint64_t = 16 bytes (7 bytes padding added)
//    - With packing, uint8_t + uint64_t = 9 bytes (no padding)
//    - This affects ALL key lookups - mismatched padding = "not found" errors
//    - See contract.h for the properly packed Key structs
//
// 2. KEY LOOKUP PATTERNS
//    - For direct lookups of keys with uint64_t fields (Order, Trade, Dispute):
//      ALWAYS use _POD_(key.m_KeyInContract).SetZero() BEFORE setting fields
//      This clears any potential garbage/padding bytes
//    - For Settings key (only m_Tag field): No SetZero needed, rely on default init
//    - For range scans: SetZero for 'from' key, SetObject(0xff) for 'to' key
//
// 3. ENV::KEYID CONSTRUCTION (CRITICAL!)
//    - NEVER use: Env::KeyID kid; GetMyKeyID(kid, cid);  // BUG!
//    - ALWAYS use: MyAccountID myid; _POD_(myid.m_Cid) = cid; Env::KeyID kid(myid);
//    - The default construction + assignment causes mem/bounds errors
//    - Use direct construction with the struct as parameter
//
// 4. SIGNATURE REQUIREMENTS
//    - Methods that UNLOCK funds (FundsUnlock) need signatures: cancel_order,
//      confirm_payment, unstake_escrow, claim_rewards, withdraw_fees, escrow_vote
//    - Methods that LOCK funds (FundsLock) don't need signatures: create_order,
//      accept_order, stake_escrow - the wallet signs implicitly when spending
//    - Methods with no funds involved don't need signatures: register_trader,
//      mark_payment_sent, open_dispute, submit_feedback
//
// 5. AMOUNT CALCULATIONS
//    - All amounts are in groth (1 BEAM = 100,000,000 groth)
//    - Fee calculation: fee = (amount * fee_bps) / 10000 (basis points)
//    - Deposit calculation: deposit = (amount * deposit_pct) / 100
//    - WATCH FOR: Integer underflow when amount * multiplier < divisor
//    - For small amounts, fee may round to 0 - this is acceptable
//
// 6. CHARGE ESTIMATES
//    - Methods with FundsChange need charge estimate (e.g., 1200000 groth)
//    - Methods without FundsChange can use 0 charge
//    - Insufficient charge causes transaction failures
//
// 7. TRADE FLOW
//    - Seller: create_order (locks amount + deposit)
//    - Buyer: accept_order (locks deposit, starts trade)
//    - Buyer: mark_payment_sent (updates status, no funds)
//    - Seller: confirm_payment (unlocks: buyer gets amount-fee, both get deposits)
//    - OR: open_dispute -> escrow_vote (escrows decide who gets what)
//
// 8. PARTIAL ORDER SUPPORT
//    - Orders track m_RemainingAmount for partial fills
//    - After trade completion, remaining amount is recalculated
//    - Order reopens if remaining amount's fiat value >= min_limit
//
// =============================================================================

#include "common.h"
#include "contract.h"
#include "app_common_impl.h"

using namespace P2PEscrow;

// =========================================
// USER KEY DERIVATION (Security Fix)
// =========================================
// The caller's public key is automatically derived from:
// 1. The contract ID
// 2. The wallet's master key (implicit)
// This prevents users from faking another user's identity.

// Key material for user account (matches vault pattern)
#pragma pack (push, 1)
struct MyAccountID
{
    ContractID m_Cid;
    uint8_t m_Ctx = 0;  // Context tag (0 for default user key)
};
#pragma pack (pop)

// Derive the caller's public key automatically
void DeriveMyPk(PubKey& pk, const ContractID& cid)
{
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::DerivePk(pk, &myid, sizeof(myid));
}

// NOTE: GetMyKeyID is NOT used anymore - it had a bug with default construction
// Use the inline pattern instead:
//   MyAccountID myid;
//   _POD_(myid.m_Cid) = cid;
//   Env::KeyID kid(myid);

// =========================================
// OWNER KEY DERIVATION (for contract deployment)
// =========================================
// The owner key is derived from a static string + wallet master key
// This ensures the deployer is automatically the owner
static const char g_szOwner[] = "p2p_escrow.owner";

struct OwnerKeyID : public Env::KeyID {
    OwnerKeyID() : Env::KeyID(g_szOwner, sizeof(g_szOwner)) {}
};

// =========================================
// ACTION MACROS - Manager Role
// =========================================

#define P2PEscrow_manager_create(macro) \
    macro(Amount, min_escrow_stake)

#define P2PEscrow_manager_destroy(macro) \
    macro(ContractID, cid)

#define P2PEscrow_manager_view(macro) \
    macro(ContractID, cid)

#define P2PEscrow_manager_withdraw_fees(macro) \
    macro(ContractID, cid) \
    macro(Amount, amount) \
    macro(AssetID, asset_id)

#define P2PEscrow_manager_assign_escrows(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, dispute_id) \
    macro(PubKey, escrow1) \
    macro(PubKey, escrow2) \
    macro(PubKey, escrow3)

#define P2PEscrow_manager_update_settings(macro) \
    macro(ContractID, cid) \
    macro(Amount, min_escrow_stake) \
    macro(uint32_t, trade_fee_bps) \
    macro(uint32_t, default_deposit_pct) \
    macro(uint32_t, payment_timeout) \
    macro(uint32_t, confirm_timeout) \
    macro(uint32_t, dispute_timeout)

#define P2PEscrow_manager_add_manager(macro) \
    macro(ContractID, cid) \
    macro(PubKey, new_manager)

#define P2PEscrow_manager_remove_manager(macro) \
    macro(ContractID, cid) \
    macro(PubKey, manager_to_remove)

#define P2PEscrow_manager_upgrade(macro) \
    macro(ContractID, cid) \
    macro(ContractID, new_cid)

#define P2PEscrow_manager_view_escrows(macro) \
    macro(ContractID, cid)

#define P2PEscrow_manager_view_stats(macro) \
    macro(ContractID, cid)

#define P2PEscrow_manager_view_managers(macro) \
    macro(ContractID, cid)

#define P2PEscrowRole_manager(macro) \
    macro(manager, create) \
    macro(manager, destroy) \
    macro(manager, view) \
    macro(manager, withdraw_fees) \
    macro(manager, assign_escrows) \
    macro(manager, update_settings) \
    macro(manager, add_manager) \
    macro(manager, remove_manager) \
    macro(manager, upgrade) \
    macro(manager, view_escrows) \
    macro(manager, view_stats) \
    macro(manager, view_managers)

// =========================================
// ACTION MACROS - User Role
// =========================================

// User methods - pk is AUTO-DERIVED (not a parameter!)
// This prevents identity spoofing since the wallet derives pk from its master key.

#define P2PEscrow_user_register_trader(macro) \
    macro(ContractID, cid)

#define P2PEscrow_user_create_order(macro) \
    macro(ContractID, cid) \
    macro(AssetID, asset_id) \
    macro(Amount, amount) \
    macro(uint64_t, price) \
    macro(uint32_t, currency_id) \
    macro(Amount, min_limit) \
    macro(Amount, max_limit) \
    macro(uint32_t, side)

#define P2PEscrow_user_cancel_order(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, order_id)

#define P2PEscrow_user_accept_order(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, order_id) \
    macro(Amount, amount)

#define P2PEscrow_user_mark_payment_sent(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, trade_id)

#define P2PEscrow_user_confirm_payment(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, trade_id) \
    macro(uint32_t, rating)

#define P2PEscrow_user_claim_trade(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, trade_id) \
    macro(uint32_t, rating)

#define P2PEscrow_user_claim_dispute_win(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, trade_id)

#define P2PEscrow_user_open_dispute(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, trade_id) \
    macro(uint32_t, reason)

#define P2PEscrow_user_escrow_vote(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, dispute_id) \
    macro(uint32_t, decision)

#define P2PEscrow_user_submit_feedback(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, trade_id) \
    macro(PubKey, target) \
    macro(uint32_t, rating)

#define P2PEscrow_user_stake_escrow(macro) \
    macro(ContractID, cid) \
    macro(Amount, amount)

#define P2PEscrow_user_unstake_escrow(macro) \
    macro(ContractID, cid)

#define P2PEscrow_user_claim_rewards(macro) \
    macro(ContractID, cid)

// View methods
#define P2PEscrow_user_view_orders(macro) \
    macro(ContractID, cid) \
    macro(AssetID, asset_id) \
    macro(uint32_t, side) \
    macro(uint32_t, skip) \
    macro(uint32_t, limit)

#define P2PEscrow_user_view_trader(macro) \
    macro(ContractID, cid) \
    macro(PubKey, pk)

#define P2PEscrow_user_view_trades(macro) \
    macro(ContractID, cid) \
    macro(PubKey, pk) \
    macro(uint32_t, skip) \
    macro(uint32_t, limit)

#define P2PEscrow_user_view_trade(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, trade_id)

#define P2PEscrow_user_view_feedback(macro) \
    macro(ContractID, cid) \
    macro(PubKey, pk) \
    macro(uint32_t, skip) \
    macro(uint32_t, limit)

#define P2PEscrow_user_view_escrow_stake(macro) \
    macro(ContractID, cid) \
    macro(PubKey, pk)

#define P2PEscrow_user_view_dispute(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, dispute_id)

#define P2PEscrow_user_get_my_key(macro) \
    macro(ContractID, cid)

#define P2PEscrowRole_user(macro) \
    macro(user, register_trader) \
    macro(user, create_order) \
    macro(user, cancel_order) \
    macro(user, accept_order) \
    macro(user, mark_payment_sent) \
    macro(user, confirm_payment) \
    macro(user, claim_trade) \
    macro(user, claim_dispute_win) \
    macro(user, open_dispute) \
    macro(user, escrow_vote) \
    macro(user, submit_feedback) \
    macro(user, stake_escrow) \
    macro(user, unstake_escrow) \
    macro(user, claim_rewards) \
    macro(user, view_orders) \
    macro(user, view_trader) \
    macro(user, view_trades) \
    macro(user, view_trade) \
    macro(user, view_feedback) \
    macro(user, view_escrow_stake) \
    macro(user, view_dispute) \
    macro(user, get_my_key)

#define P2PEscrowRoles_All(macro) \
    macro(manager) \
    macro(user)

// =========================================
// APP SHADER EXPORTS
// =========================================

// Method 0: Schema
BEAM_EXPORT void Method_0()
{
    Env::DocGroup root("");
    {
        Env::DocGroup gr("roles");

#define THE_FIELD(type, name) Env::DocAddText(#name, #type);
#define THE_METHOD(role, name) { Env::DocGroup grMethod(#name); P2PEscrow_##role##_##name(THE_FIELD) }
#define THE_ROLE(name) { Env::DocGroup grRole(#name); P2PEscrowRole_##name(THE_METHOD) }

        P2PEscrowRoles_All(THE_ROLE)

#undef THE_ROLE
#undef THE_METHOD
#undef THE_FIELD
    }
}

// =========================================
// METHOD IMPLEMENTATIONS
// =========================================

#define THE_FIELD(type, name) const type& name,
#define ON_METHOD(role, name) void On_##role##_##name(P2PEscrow_##role##_##name(THE_FIELD) int unused = 0)

// =========================================
// MANAGER METHODS
// =========================================

ON_METHOD(manager, create)
{
    if (!min_escrow_stake) {
        Env::DocAddText("error", "min_escrow_stake should be non-zero");
        return;
    }

    Method::Create arg;
    arg.m_MinEscrowStake = min_escrow_stake;

    // Auto-derive owner pk from wallet master key (faucet2 pattern)
    // This ensures only the deployer can become owner - secure and deterministic
    OwnerKeyID().get_Pk(arg.m_Owner);

    Env::GenerateKernel(nullptr, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Deploy P2P Escrow contract", 0);
}

ON_METHOD(manager, destroy)
{
    Method::Destroy arg;
    OwnerKeyID kid;
    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Destroy P2P Escrow contract", 0);
}

ON_METHOD(manager, view)
{
    Env::Key_T<Key::Settings> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    key.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Settings;  // Explicit tag set

    Settings s;
    if (!Env::VarReader::Read_T(key, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Env::DocGroup root("settings");
    Env::DocAddNum("version", s.m_Version);
    Env::DocAddNum("min_escrow_stake", s.m_MinEscrowStake);
    Env::DocAddNum("lock_period", s.m_LockPeriod);
    Env::DocAddNum("trade_fee_bps", (uint32_t)s.m_TradeFeeBps);
    Env::DocAddNum("default_deposit_pct", (uint32_t)s.m_DefaultDepositPct);
    Env::DocAddNum("payment_timeout", s.m_PaymentTimeout);
    Env::DocAddNum("confirm_timeout", s.m_ConfirmTimeout);
    Env::DocAddNum("dispute_timeout", s.m_DisputeTimeout);
    Env::DocAddNum("total_fees", s.m_TotalFees);
    Env::DocAddNum("total_trades", s.m_TotalTrades);
    Env::DocAddNum("total_disputes", s.m_TotalDisputes);

    // Check if contract has been upgraded to new version
    ContractID zeroCid;
    _POD_(zeroCid).SetZero();
    if (_POD_(s.m_UpgradedTo) != zeroCid) {
        Env::DocAddBlob_T("upgraded_to", s.m_UpgradedTo);
        Env::DocAddText("status", "UPGRADED - use new contract");
    }
}

// -----------------------------------------------------------------------------
// WITHDRAW_FEES - Manager withdraws accumulated trading fees
// -----------------------------------------------------------------------------
// MONEY FLOW:
//   Fees are accumulated in Settings.m_TotalFees from completed trades
//   Manager can withdraw up to the total accumulated fees
//
//   NOTE: In production, fees should be distributed to escrow stakers
//   as rewards, not directly withdrawn by managers. This method is
//   for contract administration and may be restricted in future versions.
//
// REQUIREMENTS: Caller must be registered manager, amount <= total_fees
// -----------------------------------------------------------------------------
ON_METHOD(manager, withdraw_fees)
{
    // Get settings to verify fees available
    Env::Key_T<Key::Settings> settingsKey;
    _POD_(settingsKey.m_Prefix.m_Cid) = cid;
    settingsKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Settings;
    settingsKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Settings;
    Settings s;
    if (!Env::VarReader::Read_T(settingsKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    // Validate withdrawal amount
    if (amount > s.m_TotalFees) {
        Env::DocAddText("error", "Insufficient fees");
        return;
    }

    WithdrawFees arg;
    // Manager pk must use OwnerKeyID - matches how owner was registered in Ctor
    OwnerKeyID().get_Pk(arg.m_pk);
    arg.m_Amount = amount;
    arg.m_AssetId = asset_id;

    FundsChange fc;
    fc.m_Aid = asset_id;
    fc.m_Amount = amount;
    fc.m_Consume = 0;  // Receiving fees

    // YES signature needed - FundsUnlock returns fees to manager
    // Use OwnerKeyID for signature to match the pk derivation
    OwnerKeyID kid;

    Env::GenerateKernel(&cid, 14, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Withdraw accumulated P2P fees", 0);
}

ON_METHOD(manager, assign_escrows)
{
    AssignEscrows arg;
    // Manager pk must use OwnerKeyID - matches how owner was registered in Ctor
    OwnerKeyID().get_Pk(arg.m_pk);
    arg.m_DisputeId = dispute_id;
    arg.m_Escrows[0] = escrow1;
    arg.m_Escrows[1] = escrow2;
    arg.m_Escrows[2] = escrow3;

    // NO signature needed - no funds involved
    Env::GenerateKernel(&cid, 15, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Assign escrows to dispute", 0);
}

ON_METHOD(manager, update_settings)
{
    UpdateSettings arg;
    // Manager pk must use OwnerKeyID - matches how owner was registered in Ctor
    OwnerKeyID().get_Pk(arg.m_pk);
    arg.m_MinEscrowStake = min_escrow_stake;
    arg.m_TradeFeeBps = trade_fee_bps;
    arg.m_DefaultDepositPct = default_deposit_pct;
    arg.m_PaymentTimeout = payment_timeout;
    arg.m_ConfirmTimeout = confirm_timeout;
    arg.m_DisputeTimeout = dispute_timeout;

    // NO signature needed - no funds involved
    Env::GenerateKernel(&cid, 16, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Update P2P contract settings", 0);
}

ON_METHOD(manager, add_manager)
{
    AddManager arg;
    // Owner pk must use OwnerKeyID - matches how owner was registered in Ctor
    OwnerKeyID().get_Pk(arg.m_OwnerPk);
    arg.m_NewManager = new_manager;

    // NO signature needed - no funds involved
    Env::GenerateKernel(&cid, 17, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Add new manager to P2P contract", 0);
}

ON_METHOD(manager, remove_manager)
{
    RemoveManager arg;
    // Owner pk must use OwnerKeyID - matches how owner was registered in Ctor
    OwnerKeyID().get_Pk(arg.m_OwnerPk);
    arg.m_ManagerToRemove = manager_to_remove;

    // NO signature needed - no funds involved
    Env::GenerateKernel(&cid, 18, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Remove manager from P2P contract", 0);
}

ON_METHOD(manager, upgrade)
{
    UpgradeContract arg;
    // Owner pk must use OwnerKeyID - matches how owner was registered in Ctor
    OwnerKeyID().get_Pk(arg.m_OwnerPk);
    arg.m_NewContractId = new_cid;

    // NO signature needed - no funds involved
    Env::GenerateKernel(&cid, 19, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Upgrade contract to new version", 0);
}

ON_METHOD(manager, view_escrows)
{
    Env::Key_T<Key::EscrowStake> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    // Use POD zeroing like official BEAM shaders (vault pattern)
    _POD_(keyFrom.m_KeyInContract).SetZero();
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);

    Env::DocArray arrEscrows("escrows");

    Amount totalStaked = 0;
    uint32_t count = 0;

    for (Env::VarReader r(keyFrom, keyTo); ; )
    {
        Env::Key_T<Key::EscrowStake> key;
        EscrowStake es;
        if (!r.MoveNext_T(key, es))
            break;

        Env::DocGroup gr("");
        Env::DocAddBlob_T("pk", es.m_pk);
        Env::DocAddNum("amount", es.m_Amount);
        Env::DocAddNum("staked_at", es.m_StakedAt);
        Env::DocAddNum("unlock_time", es.m_UnlockTime);
        Env::DocAddNum("disputes_resolved", es.m_DisputesResolved);
        Env::DocAddNum("accuracy_score", es.m_AccuracyScore);
        Env::DocAddNum("rewards", es.m_Rewards);

        totalStaked += es.m_Amount;
        count++;
    }

    Env::DocAddNum("total_escrows", count);
    Env::DocAddNum("total_staked", totalStaked);
}

ON_METHOD(manager, view_stats)
{
    Env::Key_T<Key::Settings> settingsKey;
    _POD_(settingsKey.m_Prefix.m_Cid) = cid;
    settingsKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Settings;
    Settings s;
    if (!Env::VarReader::Read_T(settingsKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Env::DocGroup root("stats");
    Env::DocAddNum("total_fees_collected", s.m_TotalFees);
    Env::DocAddNum("total_trades", s.m_TotalTrades);
    Env::DocAddNum("total_disputes", s.m_TotalDisputes);
    Env::DocAddNum("trade_fee_rate_bps", (uint32_t)s.m_TradeFeeBps);

    // Count active orders
    Env::Key_T<Key::Order> orderFrom, orderTo;
    _POD_(orderFrom.m_Prefix.m_Cid) = cid;
    _POD_(orderTo.m_Prefix.m_Cid) = cid;
    _POD_(orderFrom.m_KeyInContract).SetZero();
    _POD_(orderTo.m_KeyInContract).SetObject(0xff);

    uint32_t openOrders = 0;
    Amount totalVolume = 0;
    for (Env::VarReader r(orderFrom, orderTo); ; ) {
        Env::Key_T<Key::Order> key;
        Order o;
        if (!r.MoveNext_T(key, o)) break;
        if (o.m_Status == OrderStatus::Open) {
            openOrders++;
            totalVolume += o.m_Amount;
        }
    }
    Env::DocAddNum("open_orders", openOrders);
    Env::DocAddNum("total_order_volume", totalVolume);

    // Count active trades
    Env::Key_T<Key::Trade> tradeFrom, tradeTo;
    _POD_(tradeFrom.m_Prefix.m_Cid) = cid;
    _POD_(tradeTo.m_Prefix.m_Cid) = cid;
    _POD_(tradeFrom.m_KeyInContract).SetZero();
    _POD_(tradeTo.m_KeyInContract).SetObject(0xff);

    uint32_t activeTrades = 0;
    uint32_t pendingDisputes = 0;
    for (Env::VarReader r(tradeFrom, tradeTo); ; ) {
        Env::Key_T<Key::Trade> key;
        Trade t;
        if (!r.MoveNext_T(key, t)) break;
        if (t.m_Status < TradeStatus::Completed) activeTrades++;
        if (t.m_Status == TradeStatus::Disputed) pendingDisputes++;
    }
    Env::DocAddNum("active_trades", activeTrades);
    Env::DocAddNum("pending_disputes", pendingDisputes);
}

ON_METHOD(manager, view_managers)
{
    Env::Key_T<Key::Manager> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    _POD_(keyFrom.m_KeyInContract).SetZero();
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);

    Env::DocArray arrManagers("managers");

    uint32_t count = 0;

    for (Env::VarReader r(keyFrom, keyTo); ; )
    {
        Env::Key_T<Key::Manager> key;
        Manager m;
        if (!r.MoveNext_T(key, m))
            break;

        Env::DocGroup gr("");
        Env::DocAddBlob_T("pk", m.m_pk);
        Env::DocAddNum("added_at", m.m_AddedAt);
        Env::DocAddNum("is_owner", (uint32_t)m.m_IsOwner);

        count++;
    }

    Env::DocAddNum("total_managers", count);
}

// =========================================
// USER METHODS
// =========================================

ON_METHOD(user, register_trader)
{
    RegisterTrader arg;
    DeriveMyPk(arg.m_pk, cid);  // Auto-derive caller's pk (secure)

    // NO signature needed - registration stores data, no FundsUnlock
    Env::GenerateKernel(&cid, 2, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Register as trader on P2P market", 0);
}

// -----------------------------------------------------------------------------
// CREATE_ORDER - Seller creates a new sell order
// -----------------------------------------------------------------------------
// MONEY FLOW:
//   Seller locks: amount + deposit
//   deposit = amount * default_deposit_pct / 100 (e.g., 10% of amount)
//   Example: 100 FOMO order with 10% deposit = locks 110 FOMO
//
// After this: Order status = Open, awaiting buyer
// Can be cancelled with cancel_order (returns amount + deposit)
// -----------------------------------------------------------------------------
ON_METHOD(user, create_order)
{
    CreateOrder arg;
    DeriveMyPk(arg.m_pk, cid);  // Auto-derive caller's pk (secure)
    arg.m_AssetId = asset_id;
    arg.m_Amount = amount;
    arg.m_Price = price;
    arg.m_CurrencyId = (uint16_t)currency_id;  // Cast from uint32_t to uint16_t
    arg.m_MinLimit = min_limit;
    arg.m_MaxLimit = max_limit;

    // Parse payment_methods from comma-separated string (e.g., "1001,3002,3003")
    char szPaymentMethods[64];
    uint32_t nPaymentMethodsLen = sizeof(szPaymentMethods);
    if (!Env::DocGetText("payment_methods", szPaymentMethods, nPaymentMethodsLen)) {
        // Default to bank_transfer if not specified
        arg.m_PaymentMethods[0] = 1001;
        arg.m_PaymentMethodCount = 1;
    } else {
        // Parse comma-separated IDs
        arg.m_PaymentMethodCount = 0;
        uint16_t currentId = 0;

        for (uint32_t i = 0; i <= nPaymentMethodsLen && arg.m_PaymentMethodCount < MAX_PAYMENT_METHODS; i++) {
            char c = szPaymentMethods[i];
            if (c >= '0' && c <= '9') {
                currentId = currentId * 10 + (c - '0');
            } else if (c == ',' || c == '\0' || c == ' ') {
                if (currentId > 0) {
                    arg.m_PaymentMethods[arg.m_PaymentMethodCount] = currentId;
                    arg.m_PaymentMethodCount++;
                    currentId = 0;
                }
                if (c == '\0') break;
            }
        }

        // If no valid IDs found, default to bank_transfer
        if (arg.m_PaymentMethodCount == 0) {
            arg.m_PaymentMethods[0] = 1001;
            arg.m_PaymentMethodCount = 1;
        }
    }

    // Zero out unused slots
    for (uint8_t i = arg.m_PaymentMethodCount; i < MAX_PAYMENT_METHODS; i++) {
        arg.m_PaymentMethods[i] = 0;
    }

    arg.m_Side = (uint8_t)side;

    // Read settings to get deposit percentage
    Env::Key_T<Key::Settings> settingsKey;
    _POD_(settingsKey.m_Prefix.m_Cid) = cid;
    settingsKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Settings;
    Settings s;
    if (!Env::VarReader::Read_T(settingsKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    // MONEY CALCULATION: deposit = amount * deposit_pct / 100
    // NOTE: For very small amounts where amount * pct < 100, deposit rounds to 0
    Amount deposit = (amount * s.m_DefaultDepositPct) / 100;
    Amount totalLock = amount + deposit;

    FundsChange fc;
    fc.m_Aid = asset_id;
    fc.m_Amount = totalLock;
    fc.m_Consume = 1;  // Spending (locking) funds

    // NO signature needed - FundsLock handles auth (spending own funds)
    Env::GenerateKernel(&cid, 3, &arg, sizeof(arg), &fc, 1, nullptr, 0,
        "Create P2P order", 1200000);
}

// -----------------------------------------------------------------------------
// CANCEL_ORDER - Seller cancels their open order
// -----------------------------------------------------------------------------
// MONEY FLOW:
//   Seller receives back: amount + deposit (everything they locked)
//   Example: 110 FOMO locked -> gets back 110 FOMO
//
// REQUIREMENTS: Order must be in Open status (not InTrade)
// After this: Order status = Cancelled, funds returned to seller
// -----------------------------------------------------------------------------
ON_METHOD(user, cancel_order)
{
    // Get order to know how much to unlock
    Env::Key_T<Key::Order> orderKey;
    _POD_(orderKey.m_Prefix.m_Cid) = cid;
    // IMPORTANT: SetZero clears potential garbage/padding bytes in packed struct
    _POD_(orderKey.m_KeyInContract).SetZero();
    orderKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Order;
    orderKey.m_KeyInContract.m_Id = order_id;

    Order o;
    if (!Env::VarReader::Read_T(orderKey, o)) {
        Env::DocAddText("error", "Order not found");
        return;
    }

    if (o.m_Status != OrderStatus::Open) {
        Env::DocAddText("error", "Order not open");
        return;
    }

    CancelOrder arg;
    DeriveMyPk(arg.m_pk, cid);
    arg.m_OrderId = order_id;

    // MONEY CALCULATION: Return everything seller locked
    Amount totalUnlock = o.m_Amount + o.m_Deposit;

    FundsChange fc;
    fc.m_Aid = o.m_AssetId;
    fc.m_Amount = totalUnlock;
    fc.m_Consume = 0;  // Receiving (unlocking) funds

    // YES signature needed - FundsUnlock requires proof of ownership
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, 4, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Cancel P2P order", 1200000);
}

// -----------------------------------------------------------------------------
// ACCEPT_ORDER - Buyer accepts a sell order, starting a trade
// -----------------------------------------------------------------------------
// MONEY FLOW:
//   Buyer locks: deposit only (amount * deposit_pct / 100)
//   The seller's funds (amount + their deposit) remain locked in contract
//   Example: Buyer accepts 100 FOMO order with 10% deposit = locks 10 FOMO
//
// PARTIAL ORDERS: Buyer can accept less than full order amount
//   If order is 100 FOMO and buyer accepts 50 FOMO:
//   - Trade is created for 50 FOMO
//   - Order's remaining_amount becomes 50 FOMO
//   - Order stays Open for other buyers (if remaining >= min_limit)
//
// After this: Trade status = Accepted, awaiting buyer's mark_payment_sent
// -----------------------------------------------------------------------------
ON_METHOD(user, accept_order)
{
    // Get order details
    Env::Key_T<Key::Order> orderKey;
    _POD_(orderKey.m_Prefix.m_Cid) = cid;
    // IMPORTANT: SetZero clears potential garbage/padding bytes in packed struct
    _POD_(orderKey.m_KeyInContract).SetZero();
    orderKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Order;
    orderKey.m_KeyInContract.m_Id = order_id;

    Order o;
    if (!Env::VarReader::Read_T(orderKey, o)) {
        Env::DocAddText("error", "Order not found");
        return;
    }

    // Get settings for deposit calculation
    Env::Key_T<Key::Settings> settingsKey;
    _POD_(settingsKey.m_Prefix.m_Cid) = cid;
    settingsKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Settings;
    Settings s;
    if (!Env::VarReader::Read_T(settingsKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    AcceptOrder arg;
    DeriveMyPk(arg.m_pk, cid);
    arg.m_OrderId = order_id;
    arg.m_Amount = amount;

    // MONEY CALCULATION: Buyer locks deposit on the trade amount they're accepting
    // NOTE: For partial orders, deposit is calculated on 'amount' (trade amount), not order amount
    Amount buyerDeposit = (amount * s.m_DefaultDepositPct) / 100;

    FundsChange fc;
    fc.m_Aid = o.m_AssetId;
    fc.m_Amount = buyerDeposit;
    fc.m_Consume = 1;

    // NO signature needed - FundsLock handles auth (buyer deposits own funds)
    Env::GenerateKernel(&cid, 5, &arg, sizeof(arg), &fc, 1, nullptr, 0,
        "Accept P2P order and start trade", 1200000);
}

// -----------------------------------------------------------------------------
// MARK_PAYMENT_SENT - Buyer marks that they've sent fiat payment
// -----------------------------------------------------------------------------
// NO MONEY FLOW - just status update
// After this: Trade status = PaymentSent, awaiting seller's confirm_payment
// -----------------------------------------------------------------------------
ON_METHOD(user, mark_payment_sent)
{
    MarkPaymentSent arg;
    DeriveMyPk(arg.m_pk, cid);
    arg.m_TradeId = trade_id;

    // NO signature needed - no funds involved, state change only
    Env::GenerateKernel(&cid, 6, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Mark fiat payment as sent", 0);
}

// -----------------------------------------------------------------------------
// CONFIRM_PAYMENT - Seller confirms receiving fiat, releases crypto to buyer
// -----------------------------------------------------------------------------
// MONEY FLOW (most complex calculation in the contract):
//
//   Total locked in contract:
//     - Seller's: trade_amount + seller_deposit
//     - Buyer's: buyer_deposit
//
//   Fee calculation:
//     fee = (trade_amount * fee_bps) / 10000
//     Example: 100 FOMO * 50 bps = 100 * 50 / 10000 = 0.5 FOMO fee
//
//   Distribution on confirm:
//     - Buyer receives: trade_amount - fee
//     - Both deposits returned (to their respective owners via contract)
//     - Fee: stays in contract's escrow pool (for escrow rewards)
//
//   What this app shader calculates for unlock:
//     totalUnlock = (trade_amount - fee) + buyer_deposit + seller_deposit
//     NOTE: This is what the CALLER (seller) receives initially, then
//     the contract distributes to buyer via separate FundsUnlock calls
//
// PARTIAL ORDER HANDLING (in contract.cpp):
//   - Order's remaining_amount is reduced by trade_amount
//   - If remaining >= min_limit: order reopens for more trades
//   - If remaining < min_limit: order marked Completed
//
// After this: Trade status = Completed, order may reopen if partial
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// CONFIRM_PAYMENT - Seller confirms fiat received, releases seller's deposit
// -----------------------------------------------------------------------------
// TWO-STEP TRADE COMPLETION:
//   Step 1: Seller calls confirm_payment → releases seller's deposit minus fee
//   Step 2: Buyer calls claim_trade → releases trade amount + buyer's deposit minus fee
//
// MONEY FLOW (this method):
//   Seller receives: seller_deposit - 0.5% fee (in FOMO)
//   Fee (seller's portion): 40% to escrow stakers, 60% to manager pool
//
// After this: Trade status = SellerConfirmed, buyer can call claim_trade
// -----------------------------------------------------------------------------
ON_METHOD(user, confirm_payment)
{
    // Get trade - MUST use SetZero for direct key lookup
    Env::Key_T<Key::Trade> tradeKey;
    _POD_(tradeKey.m_Prefix.m_Cid) = cid;
    _POD_(tradeKey.m_KeyInContract).SetZero();  // Clear padding bytes!
    tradeKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Trade;
    tradeKey.m_KeyInContract.m_Id = trade_id;

    Trade t;
    if (!Env::VarReader::Read_T(tradeKey, t)) {
        Env::DocAddText("error", "Trade not found");
        return;
    }

    // Get settings for fee rate
    Env::Key_T<Key::Settings> settingsKey;
    _POD_(settingsKey.m_Prefix.m_Cid) = cid;
    settingsKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Settings;
    Settings s;
    if (!Env::VarReader::Read_T(settingsKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    // Validate rating (1-5 required)
    if (rating < 1 || rating > 5) {
        Env::DocAddText("error", "Rating must be between 1 and 5");
        return;
    }

    ConfirmPayment arg;
    DeriveMyPk(arg.m_pk, cid);
    arg.m_TradeId = trade_id;
    arg.m_Rating = (uint8_t)rating;

    // Seller receives their deposit minus 0.5% fee (in FOMO, asset 174)
    Amount sellerFee = (t.m_SellerDeposit * s.m_TradeFeeBps) / 10000;
    Amount sellerReceives = t.m_SellerDeposit - sellerFee;

    // Create FundsChange for FOMO (seller's deposit return)
    FundsChange fc;
    fc.m_Aid = 174;  // FOMO
    fc.m_Amount = sellerReceives;
    fc.m_Consume = 0;

    // Create KeyID for signing (use vault pattern - direct construction)
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, 7, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Confirm payment received - seller deposit returned", 1200000);
}

// -----------------------------------------------------------------------------
// CLAIM_TRADE - Buyer claims crypto after seller confirmed
// -----------------------------------------------------------------------------
// MONEY FLOW:
//   Buyer receives: trade_amount (in trade asset) + buyer_deposit - 0.5% fee (in FOMO)
//   Fee (buyer's portion): 40% to escrow stakers, 60% to manager pool
//
// REQUIREMENTS: Trade must be in SellerConfirmed status
// After this: Trade status = Completed
// -----------------------------------------------------------------------------
ON_METHOD(user, claim_trade)
{
    // Get trade
    Env::Key_T<Key::Trade> tradeKey;
    _POD_(tradeKey.m_Prefix.m_Cid) = cid;
    _POD_(tradeKey.m_KeyInContract).SetZero();
    tradeKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Trade;
    tradeKey.m_KeyInContract.m_Id = trade_id;

    Trade t;
    if (!Env::VarReader::Read_T(tradeKey, t)) {
        Env::DocAddText("error", "Trade not found");
        return;
    }

    if (t.m_Status != TradeStatus::SellerConfirmed) {
        Env::DocAddText("error", "Trade not ready for claim (seller must confirm first)");
        return;
    }

    // Get settings for fee rate
    Env::Key_T<Key::Settings> settingsKey;
    _POD_(settingsKey.m_Prefix.m_Cid) = cid;
    settingsKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Settings;
    Settings s;
    if (!Env::VarReader::Read_T(settingsKey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    // Validate rating (1-5 required)
    if (rating < 1 || rating > 5) {
        Env::DocAddText("error", "Rating must be between 1 and 5");
        return;
    }

    ClaimTrade arg;
    DeriveMyPk(arg.m_pk, cid);
    arg.m_TradeId = trade_id;
    arg.m_Rating = (uint8_t)rating;

    // Calculate fee from buyer's FOMO deposit
    Amount buyerFee = (t.m_BuyerDeposit * s.m_TradeFeeBps) / 10000;
    Amount buyerDepositReturn = t.m_BuyerDeposit - buyerFee;

    // Buyer receives: trade amount (in trade asset) + deposit minus fee (in FOMO)
    FundsChange fc[2];
    fc[0].m_Aid = t.m_AssetId;
    fc[0].m_Amount = t.m_Amount;
    fc[0].m_Consume = 0;

    fc[1].m_Aid = 174;  // FOMO
    fc[1].m_Amount = buyerDepositReturn;
    fc[1].m_Consume = 0;

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, 20, &arg, sizeof(arg), fc, 2, &kid, 1,
        "Claim trade - receive crypto and deposit", 1200000);
}

// -----------------------------------------------------------------------------
// CLAIM_DISPUTE_WIN - Winner claims after dispute resolved
// -----------------------------------------------------------------------------
// MONEY FLOW:
//   Winner receives: trade_amount (in trade asset) + winner's deposit (in FOMO, no fee!)
//   Loser's deposit was forfeited during escrow_vote: 50% to managers, 50% to escrows
//
// REQUIREMENTS: Trade must be in BuyerWonDispute or SellerWonDispute status
// After this: Trade status = Completed (buyer won) or Refunded (seller won)
// -----------------------------------------------------------------------------
ON_METHOD(user, claim_dispute_win)
{
    // Get trade
    Env::Key_T<Key::Trade> tradeKey;
    _POD_(tradeKey.m_Prefix.m_Cid) = cid;
    _POD_(tradeKey.m_KeyInContract).SetZero();
    tradeKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Trade;
    tradeKey.m_KeyInContract.m_Id = trade_id;

    Trade t;
    if (!Env::VarReader::Read_T(tradeKey, t)) {
        Env::DocAddText("error", "Trade not found");
        return;
    }

    // Check if caller is the winner
    PubKey myPk;
    DeriveMyPk(myPk, cid);

    bool isBuyerWinner = (t.m_Status == TradeStatus::BuyerWonDispute && _POD_(t.m_Buyer) == myPk);
    bool isSellerWinner = (t.m_Status == TradeStatus::SellerWonDispute && _POD_(t.m_Seller) == myPk);

    if (!isBuyerWinner && !isSellerWinner) {
        Env::DocAddText("error", "Not eligible to claim (not the dispute winner)");
        return;
    }

    ClaimDisputeWin arg;
    arg.m_pk = myPk;
    arg.m_TradeId = trade_id;

    // Winner receives: trade amount + their deposit (no fee - other party was scammer)
    Amount winnerDeposit = isBuyerWinner ? t.m_BuyerDeposit : t.m_SellerDeposit;

    FundsChange fc[2];
    fc[0].m_Aid = t.m_AssetId;
    fc[0].m_Amount = t.m_Amount;
    fc[0].m_Consume = 0;

    fc[1].m_Aid = 174;  // FOMO
    fc[1].m_Amount = winnerDeposit;
    fc[1].m_Consume = 0;

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, 21, &arg, sizeof(arg), fc, 2, &kid, 1,
        "Claim dispute win - receive crypto and deposit", 1200000);
}

ON_METHOD(user, open_dispute)
{
    OpenDispute arg;
    DeriveMyPk(arg.m_pk, cid);  // Auto-derive caller's pk (secure)
    arg.m_TradeId = trade_id;
    arg.m_Reason = (uint8_t)reason;

    // NO signature needed - no funds involved, state change only
    // Charge: 1800000 to cover BVM execution cost (min was 1629190)
    Env::GenerateKernel(&cid, 8, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Open dispute for trade", 1800000);
}

ON_METHOD(user, escrow_vote)
{
    // First verify dispute exists
    Env::Key_T<Key::Dispute> disputeKey;
    _POD_(disputeKey.m_Prefix.m_Cid) = cid;
    _POD_(disputeKey.m_KeyInContract).SetZero();  // Clear padding bytes!
    disputeKey.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Dispute;
    disputeKey.m_KeyInContract.m_Id = dispute_id;

    Dispute d;
    if (!Env::VarReader::Read_T(disputeKey, d)) {
        Env::DocAddText("error", "Dispute not found");
        return;
    }

    if (d.m_Resolved) {
        Env::DocAddText("error", "Dispute already resolved");
        return;
    }

    EscrowVote arg;
    DeriveMyPk(arg.m_pk, cid);  // Auto-derive caller's pk (secure)
    arg.m_DisputeId = dispute_id;
    arg.m_Decision = (uint8_t)decision;

    // YES signature needed - may trigger FundsUnlock if dispute resolved
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, 9, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Vote on dispute as escrow", 0);
}

ON_METHOD(user, submit_feedback)
{
    SubmitFeedback arg;
    DeriveMyPk(arg.m_pk, cid);  // Auto-derive caller's pk (secure)
    arg.m_TradeId = trade_id;
    arg.m_Target = target;
    arg.m_Rating = (uint8_t)rating;

    // NO signature needed - no funds involved, state change only
    // Charge: 1600000 to cover BVM execution cost (min was 1505130)
    Env::GenerateKernel(&cid, 10, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Submit verified feedback for trade", 1600000);
}

ON_METHOD(user, stake_escrow)
{
    StakeEscrow arg;
    DeriveMyPk(arg.m_pk, cid);  // Auto-derive caller's pk (secure)
    arg.m_Amount = amount;

    // Lock FOMO tokens (asset ID 174)
    FundsChange fc;
    fc.m_Aid = 174;  // FOMO asset ID
    fc.m_Amount = amount;
    fc.m_Consume = 1;

    // NO signature needed - FundsLock handles auth (staking own funds)
    Env::GenerateKernel(&cid, 11, &arg, sizeof(arg), &fc, 1, nullptr, 0,
        "Stake FOMO to become escrow", 1200000);
}

ON_METHOD(user, unstake_escrow)
{
    // Derive caller's pk first
    PubKey myPk;
    DeriveMyPk(myPk, cid);

    // Get stake to know amount to unlock
    Env::Key_T<Key::EscrowStake> stakeKey;
    _POD_(stakeKey.m_Prefix.m_Cid) = cid;
    stakeKey.m_KeyInContract.m_pk = myPk;

    EscrowStake es;
    if (!Env::VarReader::Read_T(stakeKey, es)) {
        Env::DocAddText("error", "No stake found");
        return;
    }

    UnstakeEscrow arg;
    arg.m_pk = myPk;

    FundsChange fc;
    fc.m_Aid = 174;  // FOMO
    fc.m_Amount = es.m_Amount;
    fc.m_Consume = 0;

    // YES signature needed - FundsUnlock returns stake to escrow
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, 12, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Unstake FOMO from escrow pool", 1200000);
}

ON_METHOD(user, claim_rewards)
{
    // Derive caller's pk first
    PubKey myPk;
    DeriveMyPk(myPk, cid);

    // Get stake to know rewards amount
    Env::Key_T<Key::EscrowStake> stakeKey;
    _POD_(stakeKey.m_Prefix.m_Cid) = cid;
    stakeKey.m_KeyInContract.m_pk = myPk;

    EscrowStake es;
    if (!Env::VarReader::Read_T(stakeKey, es)) {
        Env::DocAddText("error", "No stake found");
        return;
    }

    if (es.m_Rewards == 0) {
        Env::DocAddText("error", "No rewards to claim");
        return;
    }

    ClaimRewards arg;
    arg.m_pk = myPk;

    FundsChange fc;
    fc.m_Aid = 174;  // FOMO
    fc.m_Amount = es.m_Rewards;
    fc.m_Consume = 0;

    // YES signature needed - FundsUnlock returns rewards to escrow
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, 13, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Claim escrow rewards", 1200000);
}

// =========================================
// IDENTITY METHODS
// =========================================

ON_METHOD(user, get_my_key)
{
    // Returns the caller's public key using the SAME derivation as DeriveMyPk
    PubKey pk;
    DeriveMyPk(pk, cid);
    Env::DocAddBlob_T("pk", pk);
}

// =========================================
// VIEW METHODS
// =========================================

ON_METHOD(user, view_orders)
{
    Env::Key_T<Key::Order> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    // Use POD zeroing like official BEAM shaders (vault pattern)
    _POD_(keyFrom.m_KeyInContract).SetZero();
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);

    uint32_t count = 0;
    uint32_t skipped = 0;

    // Array scope block - closes array before adding total
    {
        Env::DocArray arrOrders("orders");

        for (Env::VarReader r(keyFrom, keyTo); ; )
        {
            Env::Key_T<Key::Order> key;
            Order o;
            if (!r.MoveNext_T(key, o))
                break;

            // Filter by asset
            if (asset_id != 0 && o.m_AssetId != asset_id)
                continue;

            // Filter by side (255 = all)
            if (side != 255 && o.m_Side != (uint8_t)side)
                continue;

            // Only show open orders
            if (o.m_Status != OrderStatus::Open)
                continue;

            // Skip
            if (skipped < skip) {
                skipped++;
                continue;
            }

            // Limit
            if (count >= limit)
                break;

            Env::DocGroup grOrder("");
            Env::DocAddNum("id", o.m_Id);
            Env::DocAddBlob_T("seller", o.m_Seller);
            Env::DocAddNum("asset_id", o.m_AssetId);
            Env::DocAddNum("amount", o.m_Amount);
            Env::DocAddNum("remaining_amount", o.m_RemainingAmount);  // For partial orders
            Env::DocAddNum("deposit", o.m_Deposit);
            Env::DocAddNum("price", o.m_PriceInCents);
            Env::DocAddNum("currency_id", (uint32_t)o.m_CurrencyId);  // ISO 4217 code
            Env::DocAddNum("min_limit", o.m_MinLimit);
            Env::DocAddNum("max_limit", o.m_MaxLimit);

            // Output payment methods as array
            Env::DocAddNum("payment_method_count", (uint32_t)o.m_PaymentMethodCount);
            {
                Env::DocArray arrPm("payment_methods");
                for (uint8_t i = 0; i < o.m_PaymentMethodCount && i < MAX_PAYMENT_METHODS; i++) {
                    Env::DocAddNum("", (uint32_t)o.m_PaymentMethods[i]);
                }
            }

            Env::DocAddNum("side", (uint32_t)o.m_Side);
            Env::DocAddNum("status", (uint32_t)o.m_Status);
            Env::DocAddNum("created_at", o.m_CreatedAt);
            Env::DocAddNum("active_trade_id", o.m_ActiveTradeId);

            count++;
        }
    } // arrOrders destructor runs here, closing the array

    Env::DocAddNum("total", count);
}

ON_METHOD(user, view_trader)
{
    Env::Key_T<Key::Trader> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    key.m_KeyInContract.m_pk = pk;

    Trader t;
    if (!Env::VarReader::Read_T(key, t)) {
        Env::DocAddText("error", "Trader not found");
        return;
    }

    Env::DocGroup root("trader");
    Env::DocAddBlob_T("pk", t.m_pk);
    Env::DocAddNum("registered_at", t.m_RegisteredAt);
    Env::DocAddNum("last_active", t.m_LastActive);
    Env::DocAddNum("total_trades", t.m_TotalTrades);
    Env::DocAddNum("successful_trades", t.m_SuccessfulTrades);
    Env::DocAddNum("disputes_won", t.m_DisputesWon);
    Env::DocAddNum("disputes_lost", t.m_DisputesLost);
    Env::DocAddNum("total_volume", t.m_TotalVolume);
    Env::DocAddNum("feedback_count", t.m_FeedbackCount);
    Env::DocAddNum("total_rating", t.m_TotalRating);
    Env::DocAddNum("badges", (uint32_t)t.m_Badges);

    // Calculate average rating
    if (t.m_FeedbackCount > 0) {
        uint32_t avgRating = (t.m_TotalRating * 100) / t.m_FeedbackCount;
        Env::DocAddNum("avg_rating", avgRating);
    }

    // Calculate trust score
    uint32_t trustScore = 50;
    if (t.m_TotalTrades > 0) {
        uint32_t completionRate = (t.m_SuccessfulTrades * 100) / t.m_TotalTrades;
        trustScore = completionRate / 2;
        int32_t disputeScore = (int32_t)t.m_DisputesWon - ((int32_t)t.m_DisputesLost * 3);
        if (disputeScore > 10) disputeScore = 10;
        if (disputeScore < -10) disputeScore = -10;
        trustScore += 10 + disputeScore;
        if (t.m_FeedbackCount > 0) {
            uint32_t avgR = (t.m_TotalRating * 100) / t.m_FeedbackCount;
            trustScore += (avgR - 300) / 10;
        }
        if (trustScore > 100) trustScore = 100;
    }
    Env::DocAddNum("trust_score", trustScore);
}

ON_METHOD(user, view_trades)
{
    Env::Key_T<Key::Trade> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    _POD_(keyFrom.m_KeyInContract).SetZero();
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);

    uint32_t count = 0;
    uint32_t skipped = 0;

    // Scope block to ensure array closes before adding total
    {
        Env::DocArray arrTrades("trades");

        for (Env::VarReader r(keyFrom, keyTo); ; )
        {
            Env::Key_T<Key::Trade> key;
            Trade t;
            if (!r.MoveNext_T(key, t))
                break;

            // Filter by user (pk=0 means all trades)
            PubKey zeroPk;
            _POD_(zeroPk).SetZero();
            if (_POD_(pk) != zeroPk) {
                if (_POD_(t.m_Buyer) != pk && _POD_(t.m_Seller) != pk)
                    continue;
            }

            // Skip
            if (skipped < skip) {
                skipped++;
                continue;
            }

            // Limit
            if (count >= limit)
                break;

            Env::DocGroup grTrade("");
            Env::DocAddNum("id", t.m_Id);
            Env::DocAddNum("order_id", t.m_OrderId);
            Env::DocAddBlob_T("buyer", t.m_Buyer);
            Env::DocAddBlob_T("seller", t.m_Seller);
            Env::DocAddNum("asset_id", t.m_AssetId);
            Env::DocAddNum("amount", t.m_Amount);
            Env::DocAddNum("buyer_deposit", t.m_BuyerDeposit);
            Env::DocAddNum("seller_deposit", t.m_SellerDeposit);
            Env::DocAddNum("pay_amount", t.m_PayAmount);
            Env::DocAddNum("currency_id", (uint32_t)t.m_CurrencyId);  // ISO 4217 code

            // Output payment methods as array
            Env::DocAddNum("payment_method_count", (uint32_t)t.m_PaymentMethodCount);
            {
                Env::DocArray arrPm("payment_methods");
                for (uint8_t i = 0; i < t.m_PaymentMethodCount && i < MAX_PAYMENT_METHODS; i++) {
                    Env::DocAddNum("", (uint32_t)t.m_PaymentMethods[i]);
                }
            }

            Env::DocAddNum("status", (uint32_t)t.m_Status);
            Env::DocAddNum("started_at", t.m_StartedAt);
            Env::DocAddNum("payment_sent_at", t.m_PaymentSentAt);
            Env::DocAddNum("confirm_deadline", t.m_ConfirmDeadline);
            Env::DocAddNum("completed_at", t.m_CompletedAt);

            count++;
        }
    }

    Env::DocAddNum("total", count);
}

ON_METHOD(user, view_trade)
{
    Env::Key_T<Key::Trade> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    _POD_(key.m_KeyInContract).SetZero();  // Clear any padding
    key.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Trade;
    key.m_KeyInContract.m_Id = trade_id;

    Trade t;
    if (!Env::VarReader::Read_T(key, t)) {
        Env::DocAddText("error", "Trade not found");
        return;
    }

    Env::DocGroup root("trade");
    Env::DocAddNum("id", t.m_Id);
    Env::DocAddNum("order_id", t.m_OrderId);
    Env::DocAddBlob_T("buyer", t.m_Buyer);
    Env::DocAddBlob_T("seller", t.m_Seller);
    Env::DocAddNum("asset_id", t.m_AssetId);
    Env::DocAddNum("amount", t.m_Amount);
    Env::DocAddNum("buyer_deposit", t.m_BuyerDeposit);
    Env::DocAddNum("seller_deposit", t.m_SellerDeposit);
    Env::DocAddNum("pay_amount", t.m_PayAmount);
    Env::DocAddNum("currency_id", (uint32_t)t.m_CurrencyId);  // ISO 4217 code

    // Output payment methods as array
    Env::DocAddNum("payment_method_count", (uint32_t)t.m_PaymentMethodCount);
    {
        Env::DocArray arrPm("payment_methods");
        for (uint8_t i = 0; i < t.m_PaymentMethodCount && i < MAX_PAYMENT_METHODS; i++) {
            Env::DocAddNum("", (uint32_t)t.m_PaymentMethods[i]);
        }
    }

    Env::DocAddNum("status", (uint32_t)t.m_Status);
    Env::DocAddNum("started_at", t.m_StartedAt);
    Env::DocAddNum("payment_sent_at", t.m_PaymentSentAt);
    Env::DocAddNum("confirm_deadline", t.m_ConfirmDeadline);
    Env::DocAddNum("completed_at", t.m_CompletedAt);
}

ON_METHOD(user, view_feedback)
{
    Env::Key_T<Key::Feedback> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    _POD_(keyFrom.m_KeyInContract).SetZero();
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);

    uint32_t count = 0;
    uint32_t skipped = 0;

    // Scope block to ensure array closes before adding total
    {
        Env::DocArray arrFeedback("feedback");

        for (Env::VarReader r(keyFrom, keyTo); ; )
        {
            Env::Key_T<Key::Feedback> key;
            Feedback f;
            if (!r.MoveNext_T(key, f))
                break;

            // Filter by target
            if (_POD_(f.m_To) != pk)
                continue;

            // Skip
            if (skipped < skip) {
                skipped++;
                continue;
            }

            // Limit
            if (count >= limit)
                break;

            Env::DocGroup grFeedback("");
            Env::DocAddNum("id", f.m_Id);
            Env::DocAddNum("trade_id", f.m_TradeId);
            Env::DocAddBlob_T("from", f.m_From);
            Env::DocAddBlob_T("to", f.m_To);
            Env::DocAddNum("rating", (uint32_t)f.m_Rating);
            Env::DocAddNum("created_at", f.m_CreatedAt);

            count++;
        }
    }

    Env::DocAddNum("total", count);
}

ON_METHOD(user, view_escrow_stake)
{
    Env::Key_T<Key::EscrowStake> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    key.m_KeyInContract.m_pk = pk;

    EscrowStake es;
    if (!Env::VarReader::Read_T(key, es)) {
        Env::DocAddText("error", "Stake not found");
        return;
    }

    Env::DocGroup root("stake");
    Env::DocAddBlob_T("pk", es.m_pk);
    Env::DocAddNum("amount", es.m_Amount);
    Env::DocAddNum("staked_at", es.m_StakedAt);
    Env::DocAddNum("unlock_time", es.m_UnlockTime);
    Env::DocAddNum("disputes_resolved", es.m_DisputesResolved);
    Env::DocAddNum("accuracy_score", es.m_AccuracyScore);
    Env::DocAddNum("rewards", es.m_Rewards);
}

ON_METHOD(user, view_dispute)
{
    Env::Key_T<Key::Dispute> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    _POD_(key.m_KeyInContract).SetZero();  // Clear padding bytes!
    key.m_KeyInContract.m_Tag = P2PEscrow::KeyTag::Dispute;
    key.m_KeyInContract.m_Id = dispute_id;

    Dispute d;
    if (!Env::VarReader::Read_T(key, d)) {
        Env::DocAddText("error", "Dispute not found");
        return;
    }

    Env::DocGroup root("dispute");
    Env::DocAddNum("id", d.m_Id);
    Env::DocAddNum("trade_id", d.m_TradeId);
    Env::DocAddNum("reason", (uint32_t)d.m_Reason);
    Env::DocAddNum("resolved", (uint32_t)d.m_Resolved);
    Env::DocAddNum("winner", (uint32_t)d.m_Winner);
    Env::DocAddNum("opened_at", d.m_OpenedAt);
    Env::DocAddNum("deadline", d.m_Deadline);

    // Escrows and votes
    Env::DocArray arrEscrows("escrows");
    for (uint32_t i = 0; i < NUM_ESCROWS; i++) {
        Env::DocGroup gr("");
        Env::DocAddBlob_T("pk", d.m_Escrows[i]);
        Env::DocAddNum("vote", (uint32_t)d.m_Votes[i]);
    }
}

#undef ON_METHOD
#undef THE_FIELD

// =========================================
// METHOD DISPATCHER
// =========================================

BEAM_EXPORT void Method_1()
{
    Env::DocGroup root("");

    char szRole[0x20], szAction[0x40];

    if (!Env::DocGetText("role", szRole, sizeof(szRole)))
        return Env::DocAddText("error", "role not specified");

    if (!Env::DocGetText("action", szAction, sizeof(szAction)))
        return Env::DocAddText("error", "action not specified");

#define PAR_READ(type, name) type arg_##name; Env::DocGet(#name, arg_##name);
#define PAR_PASS(type, name) arg_##name,

#define THE_METHOD(role, name) \
    if (!Env::Strcmp(szAction, #name)) { \
        P2PEscrow_##role##_##name(PAR_READ) \
        On_##role##_##name(P2PEscrow_##role##_##name(PAR_PASS) 0); \
        return; \
    }

#define THE_ROLE(name) \
    if (!Env::Strcmp(szRole, #name)) { \
        P2PEscrowRole_##name(THE_METHOD) \
        return Env::DocAddText("error", "invalid action"); \
    }

    P2PEscrowRoles_All(THE_ROLE)

#undef THE_ROLE
#undef THE_METHOD
#undef PAR_PASS
#undef PAR_READ

    Env::DocAddText("error", "unknown role");
}
