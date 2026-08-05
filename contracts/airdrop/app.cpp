// Airdrop Contract - App Shader (Client-side) v2
// BEAM Privacy Blockchain Smart Contract
// View methods and transaction builders for voucher-based airdrops
//
// Changes from v1:
//   - CreateBatch now signs with creator key (AddSig enforcement)
//   - Ctor accepts owner PubKey
//   - Dtor requires owner PubKey + signature
//   - New admin actions: pause, unpause, withdraw_fees, view_fees
//   - View methods show owner, paused state, fee info

#include "common.h"
#include "contract.h"
#include "app_common_impl.h"

using namespace Airdrop;

// =========================================
// KEY DERIVATION
// =========================================

#pragma pack (push, 1)

// CID-dependent key (for user actions - used after contract exists)
struct MyAccountID
{
    ContractID m_Cid;
    uint8_t m_Ctx = 0;
};

// CID-independent key (for owner/admin - works during deployment when CID unknown)
struct OwnerAccountID
{
    uint8_t m_Tag = 0xAD;  // "AD" for AirDrop owner
    uint8_t m_Ctx = 42;    // Fixed context
};

#pragma pack (pop)

void DeriveMyPk(PubKey& pk, const ContractID& cid)
{
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::DerivePk(pk, &myid, sizeof(myid));
}

// Owner PK is always the same regardless of CID
// This ensures the owner PK stored during Ctor matches what we derive later
void DeriveOwnerPk(PubKey& pk)
{
    OwnerAccountID oid;
    Env::DerivePk(pk, &oid, sizeof(oid));
}

// =========================================
// ACTION MACROS
// =========================================

// Manager actions
#define Airdrop_manager_create(macro) \
    macro(ContractID, cid)

#define Airdrop_manager_destroy(macro) \
    macro(ContractID, cid)

#define Airdrop_manager_view(macro) \
    macro(ContractID, cid)

#define Airdrop_manager_view_stats(macro) \
    macro(ContractID, cid)

#define Airdrop_manager_pause(macro) \
    macro(ContractID, cid)

#define Airdrop_manager_unpause(macro) \
    macro(ContractID, cid)

#define Airdrop_manager_withdraw_fees(macro) \
    macro(ContractID, cid) \
    macro(AssetID, asset_id) \
    macro(Amount, amount)

#define Airdrop_manager_view_fees(macro) \
    macro(ContractID, cid)

#define Airdrop_manager_set_gas_per_claim(macro) \
    macro(ContractID, cid) \
    macro(Amount, per_claim)

#define Airdrop_manager_withdraw_gas(macro) \
    macro(ContractID, cid) \
    macro(Amount, amount)

#define AirdropRole_manager(macro) \
    macro(manager, create) \
    macro(manager, destroy) \
    macro(manager, view) \
    macro(manager, view_stats) \
    macro(manager, pause) \
    macro(manager, unpause) \
    macro(manager, withdraw_fees) \
    macro(manager, view_fees) \
    macro(manager, set_gas_per_claim) \
    macro(manager, withdraw_gas)

// User actions - pk is auto-derived
#define Airdrop_user_create_batch(macro) \
    macro(ContractID, cid) \
    macro(AssetID, asset_id) \
    macro(uint32_t, count)

#define Airdrop_user_redeem(macro) \
    macro(ContractID, cid)
    // 'code' is read manually via DocGetText (not via macro)

#define Airdrop_user_cancel_batch(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, batch_id)

// View methods
#define Airdrop_user_check_voucher(macro) \
    macro(ContractID, cid) \
    macro(HashValue, hash)

#define Airdrop_user_view_my_batches(macro) \
    macro(ContractID, cid)

#define Airdrop_user_view_batch_vouchers(macro) \
    macro(ContractID, cid) \
    macro(uint64_t, batch_id)

#define Airdrop_user_get_my_key(macro) \
    macro(ContractID, cid)

// Anyone can sponsor gas, so this lives under the user role, not manager.
#define Airdrop_user_sponsor_gas(macro) \
    macro(ContractID, cid) \
    macro(Amount, amount)

#define Airdrop_user_view_gas(macro) \
    macro(ContractID, cid)

#define AirdropRole_user(macro) \
    macro(user, create_batch) \
    macro(user, redeem) \
    macro(user, cancel_batch) \
    macro(user, check_voucher) \
    macro(user, view_my_batches) \
    macro(user, view_batch_vouchers) \
    macro(user, get_my_key) \
    macro(user, sponsor_gas) \
    macro(user, view_gas)

#define AirdropRoles_All(macro) \
    macro(manager) \
    macro(user)

// =========================================
// METHOD 0: Schema
// =========================================

BEAM_EXPORT void Method_0()
{
    Env::DocGroup root("");
    {
        Env::DocGroup gr("roles");

#define THE_FIELD(type, name) Env::DocAddText(#name, #type);
#define THE_METHOD(role, name) { Env::DocGroup grMethod(#name); Airdrop_##role##_##name(THE_FIELD) }
#define THE_ROLE(name) { Env::DocGroup grRole(#name); AirdropRole_##name(THE_METHOD) }

        AirdropRoles_All(THE_ROLE)

#undef THE_ROLE
#undef THE_METHOD
#undef THE_FIELD
    }
}

// =========================================
// METHOD IMPLEMENTATIONS
// =========================================

#define THE_FIELD(type, name) const type& name,
#define ON_METHOD(role, name) void On_##role##_##name(Airdrop_##role##_##name(THE_FIELD) int unused = 0)

// =========================================
// MANAGER METHODS
// =========================================

ON_METHOD(manager, create)
{
    // Deploy contract with caller as owner
    // Uses CID-independent owner PK (cid doesn't exist yet during deployment)
    Method::Create arg;
    DeriveOwnerPk(arg.m_Owner);

    Env::GenerateKernel(nullptr, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, nullptr, 0,
        "Deploy Airdrop contract", 2000000);
}

ON_METHOD(manager, destroy)
{
    // Owner-only: Dtor takes void* (BEAM SDK convention), no args needed
    // Contract reads owner PK from stored settings
    OwnerAccountID oid;
    Env::KeyID kid(oid);

    Env::GenerateKernel(&cid, 1, nullptr, 0, nullptr, 0, &kid, 1,
        "Destroy Airdrop contract", 1200000);
}

ON_METHOD(manager, view)
{
    Env::Key_T<Key::Settings> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    _POD_(key.m_KeyInContract).SetZero();
    key.m_KeyInContract.m_Tag = Airdrop::KeyTag::Settings;

    Settings s;
    if (!Env::VarReader::Read_T(key, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Env::DocGroup root("settings");
    Env::DocAddNum("version", s.m_Version);
    Env::DocAddBlob_T("owner", s.m_Owner);
    Env::DocAddNum("paused", (uint32_t)s.m_Paused);
    Env::DocAddNum("total_batches", s.m_TotalBatches);
    Env::DocAddNum("total_vouchers", s.m_TotalVouchers);
    Env::DocAddNum("total_redeemed", s.m_TotalRedeemed);
    Env::DocAddNum("total_value_locked", s.m_TotalValueLocked);
    Env::DocAddNum("total_fees_collected", s.m_TotalFeesCollected);
    Env::DocAddNum("total_fees_withdrawn", s.m_TotalFeesWithdrawn);

    // Check if caller is owner (CID-independent owner key)
    PubKey ownerPk;
    DeriveOwnerPk(ownerPk);
    Env::DocAddNum("is_owner", (uint32_t)(_POD_(s.m_Owner) == ownerPk ? 1 : 0));
}

ON_METHOD(manager, view_stats)
{
    Env::Key_T<Key::Settings> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    _POD_(key.m_KeyInContract).SetZero();
    key.m_KeyInContract.m_Tag = Airdrop::KeyTag::Settings;

    Settings s;
    if (!Env::VarReader::Read_T(key, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    Env::DocGroup root("stats");
    Env::DocAddNum("total_batches", s.m_TotalBatches);
    Env::DocAddNum("total_vouchers", s.m_TotalVouchers);
    Env::DocAddNum("total_redeemed", s.m_TotalRedeemed);
    Env::DocAddNum("total_value_locked", s.m_TotalValueLocked);
    Env::DocAddNum("available_vouchers", s.m_TotalVouchers - s.m_TotalRedeemed);
    Env::DocAddNum("total_fees_collected", s.m_TotalFeesCollected);
    Env::DocAddNum("total_fees_withdrawn", s.m_TotalFeesWithdrawn);
    Env::DocAddNum("fees_available", s.m_TotalFeesCollected - s.m_TotalFeesWithdrawn);
}

ON_METHOD(manager, pause)
{
    // Verify caller is owner
    Env::Key_T<Key::Settings> skey;
    _POD_(skey.m_Prefix.m_Cid) = cid;
    _POD_(skey.m_KeyInContract).SetZero();
    skey.m_KeyInContract.m_Tag = Airdrop::KeyTag::Settings;

    Settings s;
    if (!Env::VarReader::Read_T(skey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    PubKey ownerPk;
    DeriveOwnerPk(ownerPk);
    if (_POD_(s.m_Owner) != ownerPk) {
        Env::DocAddText("error", "Not contract owner");
        return;
    }

    if (s.m_Paused != 0) {
        Env::DocAddText("error", "Already paused");
        return;
    }

    Method::SetPaused arg;
    arg.m_Owner = ownerPk;
    arg.m_Paused = 1;

    OwnerAccountID oid;
    Env::KeyID kid(oid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Pause Airdrop contract", 1200000);
}

ON_METHOD(manager, unpause)
{
    // Verify caller is owner
    Env::Key_T<Key::Settings> skey;
    _POD_(skey.m_Prefix.m_Cid) = cid;
    _POD_(skey.m_KeyInContract).SetZero();
    skey.m_KeyInContract.m_Tag = Airdrop::KeyTag::Settings;

    Settings s;
    if (!Env::VarReader::Read_T(skey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    PubKey ownerPk;
    DeriveOwnerPk(ownerPk);
    if (_POD_(s.m_Owner) != ownerPk) {
        Env::DocAddText("error", "Not contract owner");
        return;
    }

    if (s.m_Paused == 0) {
        Env::DocAddText("error", "Not paused");
        return;
    }

    Method::SetPaused arg;
    arg.m_Owner = ownerPk;
    arg.m_Paused = 0;

    OwnerAccountID oid;
    Env::KeyID kid(oid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Unpause Airdrop contract", 1200000);
}

ON_METHOD(manager, withdraw_fees)
{
    // Verify caller is owner
    Env::Key_T<Key::Settings> skey;
    _POD_(skey.m_Prefix.m_Cid) = cid;
    _POD_(skey.m_KeyInContract).SetZero();
    skey.m_KeyInContract.m_Tag = Airdrop::KeyTag::Settings;

    Settings s;
    if (!Env::VarReader::Read_T(skey, s)) {
        Env::DocAddText("error", "Contract not found");
        return;
    }

    PubKey ownerPk;
    DeriveOwnerPk(ownerPk);
    if (_POD_(s.m_Owner) != ownerPk) {
        Env::DocAddText("error", "Not contract owner");
        return;
    }

    if (amount == 0) {
        Env::DocAddText("error", "Amount must be positive");
        return;
    }

    // Check fee pool for this asset
    Env::Key_T<Key::FeePool> fpkey;
    _POD_(fpkey.m_Prefix.m_Cid) = cid;
    _POD_(fpkey.m_KeyInContract).SetZero();
    fpkey.m_KeyInContract.m_Tag = Airdrop::KeyTag::FeePool;
    fpkey.m_KeyInContract.m_AssetId = asset_id;

    FeePool fp;
    if (!Env::VarReader::Read_T(fpkey, fp)) {
        Env::DocAddText("error", "No fees for this asset");
        return;
    }

    Amount available = fp.m_Accumulated - fp.m_Withdrawn;
    if (amount > available) {
        Env::DocAddText("error", "Insufficient fees");
        return;
    }

    Method::WithdrawFees arg;
    arg.m_Owner = ownerPk;
    arg.m_AssetId = asset_id;
    arg.m_Amount = amount;

    FundsChange fc;
    fc.m_Aid = asset_id;
    fc.m_Amount = amount;
    fc.m_Consume = 0;  // Receiving

    OwnerAccountID oid;
    Env::KeyID kid(oid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg),
        &fc, 1, &kid, 1, "Withdraw airdrop fees", 1200000);
}

ON_METHOD(manager, view_fees)
{
    // Scan all fee pools
    Env::Key_T<Key::FeePool> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    _POD_(keyFrom.m_KeyInContract).SetZero();
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);
    keyFrom.m_KeyInContract.m_Tag = Airdrop::KeyTag::FeePool;
    keyTo.m_KeyInContract.m_Tag = Airdrop::KeyTag::FeePool;

    {
        Env::DocArray arr("fees");

        for (Env::VarReader r(keyFrom, keyTo); ; )
        {
            Env::Key_T<Key::FeePool> fpkey;
            FeePool fp;
            if (!r.MoveNext_T(fpkey, fp))
                break;

            Amount available = fp.m_Accumulated - fp.m_Withdrawn;
            if (fp.m_Accumulated == 0)
                continue;

            Env::DocGroup gr("");
            Env::DocAddNum("asset_id", (uint32_t)fp.m_AssetId);
            Env::DocAddNum("accumulated", fp.m_Accumulated);
            Env::DocAddNum("withdrawn", fp.m_Withdrawn);
            Env::DocAddNum("available", available);
        }
    }
}

// =========================================
// USER METHODS
// =========================================

ON_METHOD(user, create_batch)
{
    if (count == 0 || count > 100) {
        Env::DocAddText("error", "Count must be 1-100");
        return;
    }

    // Read the voucher entries from the args (hex blob: hash1+value1+hash2+value2+...)
    // The frontend encodes these as "vouchers" hex field
    // Each entry: 32 bytes hash + 8 bytes value = 40 bytes
    uint32_t blobSize = count * sizeof(VoucherEntry);

    // Allocate buffer for CreateBatch struct + VoucherEntry array
    uint32_t totalSize = sizeof(Method::CreateBatch) + blobSize;
    uint8_t* pBuf = (uint8_t*)Env::StackAlloc(totalSize);

    Method::CreateBatch* pArg = (Method::CreateBatch*)pBuf;
    DeriveMyPk(pArg->m_Creator, cid);
    pArg->m_AssetId = asset_id;
    pArg->m_Count = count;

    // Read the voucher entries blob
    VoucherEntry* pEntries = (VoucherEntry*)(pArg + 1);
    if (!Env::DocGetBlob("vouchers", pEntries, blobSize)) {
        Env::DocAddText("error", "Missing vouchers blob");
        return;
    }

    // Calculate total value to lock
    Amount totalValue = 0;
    for (uint32_t i = 0; i < count; i++) {
        if (pEntries[i].m_Value == 0) {
            Env::DocAddText("error", "Zero-value voucher");
            return;
        }
        totalValue += pEntries[i].m_Value;
    }

    // Calculate 1% fee (must match contract calculation)
    Amount fee = (totalValue * FEE_BPS) / BPS_TOTAL;
    if (fee == 0 && totalValue > 0)
        fee = 1;

    Amount totalWithFee = totalValue + fee;

    FundsChange fc;
    fc.m_Aid = asset_id;
    fc.m_Amount = totalWithFee;  // User pays voucher value + 1% fee
    fc.m_Consume = 1;  // Spending (locking)

    // SECURITY: Sign with derived key (required by contract AddSig)
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, Method::CreateBatch::s_iMethod, pBuf, totalSize,
        &fc, 1, &kid, 1, "Create airdrop batch", 1200000);
}

ON_METHOD(user, redeem)
{
    // Read the voucher code (preimage)
    char szCode[0x100];
    uint32_t nCode = Env::DocGetText("code", szCode, sizeof(szCode));
    if (!nCode || nCode > sizeof(szCode)) {
        Env::DocAddText("error", "Missing or invalid code");
        return;
    }
    nCode--; // exclude null terminator

    // Normalize: uppercase and strip non-alphanumeric (must match frontend hashVoucherCode)
    uint8_t normalized[64];
    uint32_t nNorm = 0;
    for (uint32_t i = 0; i < nCode && nNorm < sizeof(normalized); i++) {
        char c = szCode[i];
        if (c >= 'a' && c <= 'z') c -= 32; // to uppercase
        if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))
            normalized[nNorm++] = (uint8_t)c;
    }

    if (nNorm == 0) {
        Env::DocAddText("error", "Empty code after normalization");
        return;
    }

    // Hash the normalized code to look up voucher (pre-check before building tx)
    HashValue hash;
    {
        HashProcessor::Sha256 hp;
        hp.Write(normalized, nNorm);
        hp >> hash;
    }

    // Check voucher exists and is unclaimed
    Env::Key_T<Key::Voucher> vkey;
    _POD_(vkey.m_Prefix.m_Cid) = cid;
    _POD_(vkey.m_KeyInContract).SetZero();
    vkey.m_KeyInContract.m_Tag = Airdrop::KeyTag::Voucher;
    vkey.m_KeyInContract.m_Hash = hash;

    Voucher v;
    if (!Env::VarReader::Read_T(vkey, v)) {
        Env::DocAddText("error", "Voucher not found");
        return;
    }

    if (v.m_Redeemed) {
        Env::DocAddText("error", "Voucher already redeemed");
        return;
    }

    // Build contract method args: RedeemVoucher struct + preimage bytes
    uint32_t totalSize = sizeof(Method::RedeemVoucher) + nNorm;
    uint8_t* pBuf = (uint8_t*)Env::StackAlloc(totalSize);

    Method::RedeemVoucher* pArg = (Method::RedeemVoucher*)pBuf;
    DeriveMyPk(pArg->m_Redeemer, cid);
    pArg->m_PreimageSize = nNorm;

    // Append normalized code bytes after the struct
    Env::Memcpy(pArg + 1, normalized, nNorm);

    FundsChange fc;
    fc.m_Aid = v.m_AssetId;
    fc.m_Amount = v.m_Value;
    fc.m_Consume = 0;  // Receiving (unlocking)

    // Signature required for FundsUnlock
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, Method::RedeemVoucher::s_iMethod, pBuf, totalSize,
        &fc, 1, &kid, 1, "Redeem airdrop voucher", 1200000);
}

ON_METHOD(user, cancel_batch)
{
    // Load batch to verify creator
    Env::Key_T<Key::VoucherBatch> bkey;
    _POD_(bkey.m_Prefix.m_Cid) = cid;
    _POD_(bkey.m_KeyInContract).SetZero();
    bkey.m_KeyInContract.m_Tag = Airdrop::KeyTag::VoucherBatch;
    bkey.m_KeyInContract.m_Id = batch_id;

    VoucherBatch batch;
    if (!Env::VarReader::Read_T(bkey, batch)) {
        Env::DocAddText("error", "Batch not found");
        return;
    }

    PubKey myPk;
    DeriveMyPk(myPk, cid);
    if (_POD_(batch.m_Creator) != myPk) {
        Env::DocAddText("error", "Not batch creator");
        return;
    }

    // Collect unclaimed voucher hashes by scanning (app-side enumeration)
    Env::Key_T<Key::Voucher> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    _POD_(keyFrom.m_KeyInContract).SetZero();
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);

    // First pass: count unclaimed vouchers and calculate value
    uint32_t unclaimedCount = 0;
    Amount unclaimedValue = 0;

    for (Env::VarReader r(keyFrom, keyTo); ; )
    {
        Env::Key_T<Key::Voucher> vkey;
        Voucher v;
        if (!r.MoveNext_T(vkey, v))
            break;

        if (v.m_BatchId == batch_id && v.m_Redeemed == 0) {
            unclaimedCount++;
            unclaimedValue += v.m_Value;
        }
    }

    if (unclaimedCount == 0 || unclaimedValue == 0) {
        Env::DocAddText("error", "No unclaimed vouchers");
        return;
    }

    // Allocate buffer for CancelBatch struct + HashValue array
    uint32_t totalSize = sizeof(Method::CancelBatch) + unclaimedCount * sizeof(HashValue);
    uint8_t* pBuf = (uint8_t*)Env::StackAlloc(totalSize);

    Method::CancelBatch* pArg = (Method::CancelBatch*)pBuf;
    DeriveMyPk(pArg->m_Creator, cid);
    pArg->m_BatchId = batch_id;
    pArg->m_Count = unclaimedCount;

    // Second pass: collect hashes
    HashValue* pHashes = (HashValue*)(pArg + 1);
    uint32_t idx = 0;

    for (Env::VarReader r2(keyFrom, keyTo); ; )
    {
        Env::Key_T<Key::Voucher> vkey;
        Voucher v;
        if (!r2.MoveNext_T(vkey, v))
            break;

        if (v.m_BatchId == batch_id && v.m_Redeemed == 0) {
            if (idx < unclaimedCount)
                pHashes[idx++] = vkey.m_KeyInContract.m_Hash;
        }
    }

    FundsChange fc;
    fc.m_Aid = batch.m_AssetId;
    fc.m_Amount = unclaimedValue;
    fc.m_Consume = 0;  // Receiving back

    // Signature required for FundsUnlock
    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, Method::CancelBatch::s_iMethod, pBuf, totalSize,
        &fc, 1, &kid, 1, "Cancel airdrop batch", 1800000);
}

// =========================================
// VIEW METHODS
// =========================================

ON_METHOD(user, check_voucher)
{
    Env::Key_T<Key::Voucher> vkey;
    _POD_(vkey.m_Prefix.m_Cid) = cid;
    _POD_(vkey.m_KeyInContract).SetZero();
    vkey.m_KeyInContract.m_Tag = Airdrop::KeyTag::Voucher;
    vkey.m_KeyInContract.m_Hash = hash;

    Voucher v;
    if (!Env::VarReader::Read_T(vkey, v)) {
        Env::DocAddText("error", "Voucher not found");
        return;
    }

    Env::DocGroup root("voucher");
    Env::DocAddNum("batch_id", v.m_BatchId);
    Env::DocAddNum("asset_id", (uint32_t)v.m_AssetId);
    Env::DocAddNum("value", v.m_Value);
    Env::DocAddNum("redeemed", (uint32_t)v.m_Redeemed);
    if (v.m_Redeemed) {
        Env::DocAddBlob_T("redeemer", v.m_Redeemer);
        Env::DocAddNum("redeemed_at", v.m_RedeemedAt);
    }
}

ON_METHOD(user, view_my_batches)
{
    PubKey myPk;
    DeriveMyPk(myPk, cid);

    Env::Key_T<Key::VoucherBatch> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    _POD_(keyFrom.m_KeyInContract).SetZero();
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);

    {
        Env::DocArray arr("batches");

        for (Env::VarReader r(keyFrom, keyTo); ; )
        {
            Env::Key_T<Key::VoucherBatch> bkey;
            VoucherBatch batch;
            if (!r.MoveNext_T(bkey, batch))
                break;

            // Only show batches created by caller
            if (_POD_(batch.m_Creator) != myPk)
                continue;

            Env::DocGroup gr("");
            Env::DocAddNum("id", batch.m_Id);
            Env::DocAddNum("asset_id", (uint32_t)batch.m_AssetId);
            Env::DocAddNum("value_per_voucher", batch.m_ValuePerVoucher);
            Env::DocAddNum("total_count", (uint32_t)batch.m_TotalCount);
            Env::DocAddNum("redeemed_count", (uint32_t)batch.m_RedeemedCount);
            Env::DocAddNum("created_at", batch.m_CreatedAt);
        }
    }
}

ON_METHOD(user, view_batch_vouchers)
{
    // Verify caller is the batch creator
    Env::Key_T<Key::VoucherBatch> bkey;
    _POD_(bkey.m_Prefix.m_Cid) = cid;
    _POD_(bkey.m_KeyInContract).SetZero();
    bkey.m_KeyInContract.m_Tag = Airdrop::KeyTag::VoucherBatch;
    bkey.m_KeyInContract.m_Id = batch_id;

    VoucherBatch batch;
    if (!Env::VarReader::Read_T(bkey, batch)) {
        Env::DocAddText("error", "Batch not found");
        return;
    }

    PubKey myPk;
    DeriveMyPk(myPk, cid);
    if (_POD_(batch.m_Creator) != myPk) {
        Env::DocAddText("error", "Not batch creator");
        return;
    }

    // Scan vouchers belonging to this batch
    Env::Key_T<Key::Voucher> keyFrom, keyTo;
    _POD_(keyFrom.m_Prefix.m_Cid) = cid;
    _POD_(keyTo.m_Prefix.m_Cid) = cid;
    _POD_(keyFrom.m_KeyInContract).SetZero();
    _POD_(keyTo.m_KeyInContract).SetObject(0xff);

    {
        Env::DocArray arr("vouchers");

        for (Env::VarReader r(keyFrom, keyTo); ; )
        {
            Env::Key_T<Key::Voucher> vkey;
            Voucher v;
            if (!r.MoveNext_T(vkey, v))
                break;

            if (v.m_BatchId != batch_id)
                continue;

            Env::DocGroup gr("");
            Env::DocAddBlob_T("hash", vkey.m_KeyInContract.m_Hash);
            Env::DocAddNum("value", v.m_Value);
            Env::DocAddNum("redeemed", (uint32_t)v.m_Redeemed);
            if (v.m_Redeemed) {
                Env::DocAddBlob_T("redeemer", v.m_Redeemer);
                Env::DocAddNum("redeemed_at", v.m_RedeemedAt);
            }
        }
    }
}

ON_METHOD(manager, set_gas_per_claim)
{
    PubKey ownerPk;
    DeriveOwnerPk(ownerPk);

    Method::SetGasPerClaim arg;
    arg.m_Owner = ownerPk;
    arg.m_PerClaim = per_claim;

    OwnerAccountID oid;
    Env::KeyID kid(oid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), nullptr, 0, &kid, 1,
        "Set airdrop gas per claim", 1200000);
}

ON_METHOD(manager, withdraw_gas)
{
    PubKey ownerPk;
    DeriveOwnerPk(ownerPk);

    Method::WithdrawGas arg;
    arg.m_Owner = ownerPk;
    arg.m_Amount = amount;

    FundsChange fc;
    fc.m_Aid = 0;
    fc.m_Amount = amount;
    fc.m_Consume = 0;  // receiving

    OwnerAccountID oid;
    Env::KeyID kid(oid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Withdraw airdrop gas", 1200000);
}

// Anyone may sponsor. No signature is required by the contract — the funds come
// from this transaction, which is proof enough that the sponsor paid.
ON_METHOD(user, sponsor_gas)
{
    if (!amount) {
        Env::DocAddText("error", "Amount must be positive");
        return;
    }

    Method::SponsorGas arg;
    DeriveMyPk(arg.m_Sponsor, cid);
    arg.m_Amount = amount;

    FundsChange fc;
    fc.m_Aid = 0;
    fc.m_Amount = amount;
    fc.m_Consume = 1;  // spending

    MyAccountID myid;
    _POD_(myid.m_Cid) = cid;
    Env::KeyID kid(myid);

    Env::GenerateKernel(&cid, arg.s_iMethod, &arg, sizeof(arg), &fc, 1, &kid, 1,
        "Sponsor airdrop gas", 1200000);
}

ON_METHOD(user, view_gas)
{
    Env::Key_T<Key::GasPool> key;
    _POD_(key.m_Prefix.m_Cid) = cid;
    _POD_(key.m_KeyInContract).SetZero();
    key.m_KeyInContract.m_Tag = Airdrop::KeyTag::GasPool;

    GasPool gp;
    if (!Env::VarReader::Read_T(key, gp)) {
        // No pool yet is a normal state, not an error: report zeroes so the UI
        // can show "not funded" instead of an error box.
        Env::DocGroup root("gas");
        Env::DocAddNum("balance", (Amount) 0);
        Env::DocAddNum("per_claim", (Amount) 0);
        Env::DocAddNum("total_sponsored", (Amount) 0);
        Env::DocAddNum("total_spent", (Amount) 0);
        Env::DocAddNum("claims_funded", (Amount) 0);
        Env::DocAddNum("claims_remaining", (Amount) 0);
        return;
    }

    Env::DocGroup root("gas");
    Env::DocAddNum("balance", gp.m_Balance);
    Env::DocAddNum("per_claim", gp.m_PerClaim);
    Env::DocAddNum("total_sponsored", gp.m_TotalSponsored);
    Env::DocAddNum("total_spent", gp.m_TotalSpent);
    Env::DocAddNum("claims_funded", gp.m_ClaimsFunded);
    Env::DocAddNum("claims_remaining", gp.m_PerClaim ? (gp.m_Balance / gp.m_PerClaim) : (Amount) 0);
}

ON_METHOD(user, get_my_key)
{
    PubKey pk;
    DeriveMyPk(pk, cid);
    Env::DocAddBlob_T("pk", pk);
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
        Airdrop_##role##_##name(PAR_READ) \
        On_##role##_##name(Airdrop_##role##_##name(PAR_PASS) 0); \
        return; \
    }

#define THE_ROLE(name) \
    if (!Env::Strcmp(szRole, #name)) { \
        AirdropRole_##name(THE_METHOD) \
        return Env::DocAddText("error", "invalid action"); \
    }

    AirdropRoles_All(THE_ROLE)

#undef THE_ROLE
#undef THE_METHOD
#undef PAR_PASS
#undef PAR_READ

    Env::DocAddText("error", "unknown role");
}
