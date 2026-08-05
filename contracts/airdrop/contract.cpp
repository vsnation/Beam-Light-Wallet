// Airdrop Contract - Implementation (Validator Shader) v2
// BEAM Privacy Blockchain Smart Contract
//
// Security model:
//   - Ctor: Sets owner PubKey (deployer)
//   - Dtor: Owner-only + AddSig (prevents unauthorized destruction)
//   - CreateBatch: AddSig(creator) verifies identity, 1% fee collected
//   - RedeemVoucher: AddSig(redeemer) ensures funds go to signer
//   - CancelBatch: Owner check + AddSig(creator) prevents cross-user cancel
//   - SetPaused: Owner-only + AddSig (emergency stop)
//   - WithdrawFees: Owner-only + AddSig (fee withdrawal)

#include "common.h"
#include "contract.h"

using namespace Airdrop;

// =========================================
// HELPER FUNCTIONS
// =========================================

namespace {

    // --- Settings ---

    bool LoadSettings(Settings& s) {
        Key::Settings key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::Settings;
        return Env::LoadVar_T(key, s);
    }

    void SaveSettings(const Settings& s) {
        Key::Settings key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::Settings;
        Env::SaveVar_T(key, s);
    }

    // --- Batches ---

    bool LoadBatch(uint64_t id, VoucherBatch& b) {
        Key::VoucherBatch key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::VoucherBatch;
        key.m_Id = id;
        return Env::LoadVar_T(key, b);
    }

    void SaveBatch(const VoucherBatch& b) {
        Key::VoucherBatch key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::VoucherBatch;
        key.m_Id = b.m_Id;
        Env::SaveVar_T(key, b);
    }

    void DeleteBatch(uint64_t id) {
        Key::VoucherBatch key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::VoucherBatch;
        key.m_Id = id;
        Env::DelVar_T(key);
    }

    // --- Vouchers ---

    bool LoadVoucher(const HashValue& hash, Voucher& v) {
        Key::Voucher key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::Voucher;
        key.m_Hash = hash;
        return Env::LoadVar_T(key, v);
    }

    void SaveVoucher(const HashValue& hash, const Voucher& v) {
        Key::Voucher key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::Voucher;
        key.m_Hash = hash;
        Env::SaveVar_T(key, v);
    }

    void DeleteVoucher(const HashValue& hash) {
        Key::Voucher key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::Voucher;
        key.m_Hash = hash;
        Env::DelVar_T(key);
    }

    // --- Fee Pool (per-asset) ---

    bool LoadFeePool(AssetID aid, FeePool& fp) {
        Key::FeePool key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::FeePool;
        key.m_AssetId = aid;
        return Env::LoadVar_T(key, fp);
    }

    void SaveFeePool(const FeePool& fp) {
        Key::FeePool key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::FeePool;
        key.m_AssetId = fp.m_AssetId;
        Env::SaveVar_T(key, fp);
    }

    // --- Gas pool ---

    bool LoadGasPool(GasPool& gp) {
        Key::GasPool key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::GasPool;
        return Env::LoadVar_T(key, gp);
    }

    void SaveGasPool(const GasPool& gp) {
        Key::GasPool key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::GasPool;
        Env::SaveVar_T(key, gp);
    }

    // --- Counters ---

    uint64_t GetNextBatchId() {
        Key::Counter key;
        _POD_(key).SetZero();
        key.m_Tag = Airdrop::KeyTag::Counter;
        key.m_Type = 0; // batch counter
        uint64_t id = 0;
        Env::LoadVar_T(key, id);
        id++;
        Env::SaveVar_T(key, id);
        return id;
    }

} // anonymous namespace

// =========================================
// CONTRACT METHODS
// =========================================

// Method 0: Constructor
// Sets the contract owner who has admin privileges
BEAM_EXPORT void Ctor(const Method::Create& arg)
{
    Settings s;
    _POD_(s).SetZero();
    s.m_Version = CONTRACT_VERSION;
    s.m_Owner = arg.m_Owner;
    s.m_Paused = 0;
    SaveSettings(s);
}

// Method 1: Destructor (BEAM SDK convention: void* parameter)
// SECURITY: Owner-only + AddSig + no locked funds/fees
BEAM_EXPORT void Dtor(void*)
{
    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Cannot destroy if any voucher funds are locked
    Env::Halt_if(s.m_TotalValueLocked != 0);

    // Cannot destroy if unclaimed fees exist
    Amount feesRemaining = s.m_TotalFeesCollected - s.m_TotalFeesWithdrawn;
    Env::Halt_if(feesRemaining != 0);

    // Require owner's cryptographic signature (from stored settings)
    Env::AddSig(s.m_Owner);

    // Delete settings
    Key::Settings key;
    _POD_(key).SetZero();
    key.m_Tag = Airdrop::KeyTag::Settings;
    Env::DelVar_T(key);
}

// Method 2: CreateBatch
// SECURITY: AddSig(creator) verifies caller identity
// FEE: 1% of total voucher value collected for contract owner
// Args struct is followed by m_Count VoucherEntry items (40 bytes each)
BEAM_EXPORT void Method_2(const Method::CreateBatch& arg)
{
    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Contract must not be paused
    Env::Halt_if(s.m_Paused != 0);

    // Validate count
    Env::Halt_if(arg.m_Count == 0);
    Env::Halt_if(arg.m_Count > 100);

    // SECURITY: Verify creator's identity with cryptographic signature
    // This ensures m_Creator matches the actual transaction signer
    Env::AddSig(arg.m_Creator);

    // Read the variable-length voucher entries that follow the struct
    const VoucherEntry* entries = (const VoucherEntry*)(&arg + 1);

    // Calculate total value to lock
    Amount totalValue = 0;
    for (uint32_t i = 0; i < arg.m_Count; i++)
    {
        Env::Halt_if(entries[i].m_Value == 0); // No zero-value vouchers

        // Check for overflow
        Amount prev = totalValue;
        totalValue += entries[i].m_Value;
        Env::Halt_if(totalValue < prev); // overflow check
    }

    // Calculate 1% fee
    Amount fee = (totalValue * FEE_BPS) / BPS_TOTAL;
    if (fee == 0 && totalValue > 0)
        fee = 1; // Minimum 1 groth fee

    // Overflow check for total with fee
    Amount totalWithFee = totalValue + fee;
    Env::Halt_if(totalWithFee < totalValue);

    // Get next batch ID
    uint64_t batchId = GetNextBatchId();

    // Create batch record
    VoucherBatch batch;
    _POD_(batch).SetZero();
    batch.m_Id = batchId;
    batch.m_Creator = arg.m_Creator;
    batch.m_AssetId = arg.m_AssetId;
    batch.m_ValuePerVoucher = entries[0].m_Value; // Use first voucher's value as default
    batch.m_TotalCount = arg.m_Count;
    batch.m_RedeemedCount = 0;
    batch.m_CreatedAt = Env::get_Height();
    SaveBatch(batch);

    // Create individual voucher records
    for (uint32_t i = 0; i < arg.m_Count; i++)
    {
        // Check voucher hash doesn't already exist (prevent collision/replay)
        Voucher existing;
        Env::Halt_if(LoadVoucher(entries[i].m_Hash, existing));

        Voucher v;
        _POD_(v).SetZero();
        v.m_BatchId = batchId;
        v.m_AssetId = arg.m_AssetId;
        v.m_Value = entries[i].m_Value;
        v.m_Redeemed = 0;
        v.m_Creator = arg.m_Creator;
        SaveVoucher(entries[i].m_Hash, v);
    }

    // Update global stats
    s.m_TotalBatches++;
    s.m_TotalVouchers += arg.m_Count;
    s.m_TotalValueLocked += totalValue;
    s.m_TotalFeesCollected += fee;
    SaveSettings(s);

    // Update per-asset fee pool
    FeePool fp;
    if (!LoadFeePool(arg.m_AssetId, fp)) {
        _POD_(fp).SetZero();
        fp.m_AssetId = arg.m_AssetId;
    }
    fp.m_Accumulated += fee;
    SaveFeePool(fp);

    // Lock the total value + fee from the creator
    Env::FundsLock(arg.m_AssetId, totalWithFee);
}

// Method 3: RedeemVoucher
// SECURITY: Requires the original voucher code (preimage), NOT the hash.
// The contract hashes the preimage on-chain to derive the voucher storage key.
// This prevents attackers who read contract state (hashes are public) from redeeming.
// AddSig(redeemer) ensures funds are unlocked only to the signer.
BEAM_EXPORT void Method_3(const Method::RedeemVoucher& arg)
{
    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Validate preimage size (normalized code is 16 chars for XXXX-XXXX-XXXX-XXXX, max 64)
    Env::Halt_if(arg.m_PreimageSize == 0);
    Env::Halt_if(arg.m_PreimageSize > 64);

    // Read preimage bytes that follow the struct
    const uint8_t* pPreimage = (const uint8_t*)(&arg + 1);

    // Hash the preimage on-chain to derive the voucher key
    // Must match: SHA-256 of the normalized code (uppercase alphanumeric, no dashes)
    HashValue hash;
    {
        HashProcessor::Sha256 hp;
        hp.Write(pPreimage, arg.m_PreimageSize);
        hp >> hash;
    }

    // Load voucher by the computed hash
    Voucher v;
    Env::Halt_if(!LoadVoucher(hash, v));

    // Must not be already redeemed
    Env::Halt_if(v.m_Redeemed != 0);

    // Mark as redeemed
    v.m_Redeemed = 1;
    v.m_Redeemer = arg.m_Redeemer;
    v.m_RedeemedAt = Env::get_Height();
    SaveVoucher(hash, v);

    // Update batch
    VoucherBatch batch;
    Env::Halt_if(!LoadBatch(v.m_BatchId, batch));
    batch.m_RedeemedCount++;
    SaveBatch(batch);

    // Update global stats
    s.m_TotalRedeemed++;
    s.m_TotalValueLocked -= v.m_Value;
    SaveSettings(s);

    // Gasless claim.
    //
    // A user holding zero BEAM cannot pay a kernel fee, so without this they
    // cannot claim a FOMO/BEAMX voucher at all — they would have to acquire
    // BEAM first, which is the exact barrier an airdrop is meant to remove.
    // Releasing BEAM from the sponsorship pool in the same transaction makes it
    // self-funding: the wallet adds the fee to its BEAM balance and the unlock
    // cancels it out, so no inputs are required.
    //
    // Skipped when the voucher already pays out enough BEAM to cover its own
    // fee, and when the pool is empty or disabled — a claim must still succeed
    // for a user who does have BEAM.
    Amount gas = 0;
    {
        GasPool gp;
        if (LoadGasPool(gp) && gp.m_PerClaim && (gp.m_Balance >= gp.m_PerClaim))
        {
            bool bSelfFunding = (v.m_AssetId == 0) && (v.m_Value >= gp.m_PerClaim);
            if (!bSelfFunding)
            {
                gas = gp.m_PerClaim;
                gp.m_Balance -= gas;
                gp.m_TotalSpent += gas;
                gp.m_ClaimsFunded++;
                SaveGasPool(gp);
            }
        }
    }

    // SECURITY: Require redeemer's cryptographic signature
    // Combined with FundsUnlock, this ensures only the signer receives funds
    Env::AddSig(arg.m_Redeemer);
    Env::FundsUnlock(v.m_AssetId, v.m_Value);
    if (gas)
        Env::FundsUnlock(0, gas);
}

// Method 7: SponsorGas - anyone adds BEAM to the gasless-claim pool.
// Not owner-gated: it only ever increases the contract's BEAM balance, and the
// transaction itself proves the sponsor paid for it.
BEAM_EXPORT void Method_7(const Method::SponsorGas& arg)
{
    Settings s;
    Env::Halt_if(!LoadSettings(s));
    Env::Halt_if(arg.m_Amount == 0);

    GasPool gp;
    if (!LoadGasPool(gp))
        _POD_(gp).SetZero();

    Amount prev = gp.m_Balance;
    gp.m_Balance += arg.m_Amount;
    Env::Halt_if(gp.m_Balance < prev);       // overflow

    gp.m_TotalSponsored += arg.m_Amount;
    SaveGasPool(gp);

    Env::FundsLock(0, arg.m_Amount);
}

// Method 8: SetGasPerClaim - owner tunes the subsidy.
BEAM_EXPORT void Method_8(const Method::SetGasPerClaim& arg)
{
    Settings s;
    Env::Halt_if(!LoadSettings(s));
    Env::Halt_if(_POD_(s.m_Owner) != arg.m_Owner);

    GasPool gp;
    if (!LoadGasPool(gp))
        _POD_(gp).SetZero();

    gp.m_PerClaim = arg.m_PerClaim;
    SaveGasPool(gp);

    Env::AddSig(arg.m_Owner);
}

// Method 9: WithdrawGas - owner reclaims unspent sponsorship.
BEAM_EXPORT void Method_9(const Method::WithdrawGas& arg)
{
    Settings s;
    Env::Halt_if(!LoadSettings(s));
    Env::Halt_if(_POD_(s.m_Owner) != arg.m_Owner);
    Env::Halt_if(arg.m_Amount == 0);

    GasPool gp;
    Env::Halt_if(!LoadGasPool(gp));
    Env::Halt_if(arg.m_Amount > gp.m_Balance);

    gp.m_Balance -= arg.m_Amount;
    SaveGasPool(gp);

    Env::AddSig(arg.m_Owner);
    Env::FundsUnlock(0, arg.m_Amount);
}

// Method 4: CancelBatch - creator reclaims unclaimed vouchers
// SECURITY: Creator ownership check + AddSig prevents cross-user cancellation
// App shader provides the list of unclaimed voucher hashes
BEAM_EXPORT void Method_4(const Method::CancelBatch& arg)
{
    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Load batch
    VoucherBatch batch;
    Env::Halt_if(!LoadBatch(arg.m_BatchId, batch));

    // SECURITY: Only the original batch creator can cancel
    Env::Halt_if(_POD_(batch.m_Creator) != arg.m_Creator);

    // Validate count
    Env::Halt_if(arg.m_Count == 0);

    // Read the voucher hashes that follow the struct
    const HashValue* hashes = (const HashValue*)(&arg + 1);

    // Process each voucher hash
    Amount unclaimedValue = 0;
    uint32_t unclaimedCount = 0;

    for (uint32_t i = 0; i < arg.m_Count; i++)
    {
        Voucher v;
        if (!LoadVoucher(hashes[i], v))
            continue; // Skip if voucher doesn't exist

        // Must belong to this batch, not be redeemed, and be from this creator
        if (v.m_BatchId != arg.m_BatchId || v.m_Redeemed != 0)
            continue;

        // Extra safety: verify voucher creator matches batch creator
        if (_POD_(v.m_Creator) != arg.m_Creator)
            continue;

        unclaimedValue += v.m_Value;
        unclaimedCount++;
        DeleteVoucher(hashes[i]);
    }

    // Must have cancelled at least one voucher
    Env::Halt_if(unclaimedCount == 0);

    // Update global stats
    s.m_TotalVouchers -= unclaimedCount;
    s.m_TotalValueLocked -= unclaimedValue;
    SaveSettings(s);

    // If all vouchers are now gone, delete batch
    if (batch.m_RedeemedCount + unclaimedCount >= batch.m_TotalCount)
    {
        DeleteBatch(arg.m_BatchId);
        s.m_TotalBatches--;
        SaveSettings(s);
    }
    else
    {
        batch.m_TotalCount -= unclaimedCount;
        SaveBatch(batch);
    }

    // SECURITY: Require creator's cryptographic signature
    // This is the critical check - even if someone knows the creator PK,
    // they cannot sign without the private key
    Env::AddSig(arg.m_Creator);
    Env::FundsUnlock(batch.m_AssetId, unclaimedValue);
}

// Method 5: SetPaused - owner pauses/unpauses the contract
// SECURITY: Owner-only + AddSig
// When paused: CreateBatch blocked. Redeem/Cancel still work (user fund safety)
BEAM_EXPORT void Method_5(const Method::SetPaused& arg)
{
    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Only owner can pause/unpause
    Env::Halt_if(_POD_(s.m_Owner) != arg.m_Owner);

    // Require owner's cryptographic signature
    Env::AddSig(arg.m_Owner);

    // Update paused state
    s.m_Paused = arg.m_Paused;
    SaveSettings(s);
}

// Method 6: WithdrawFees - owner withdraws accumulated fees for an asset
// SECURITY: Owner-only + AddSig + amount validation
BEAM_EXPORT void Method_6(const Method::WithdrawFees& arg)
{
    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Only owner can withdraw fees
    Env::Halt_if(_POD_(s.m_Owner) != arg.m_Owner);

    // Must withdraw a positive amount
    Env::Halt_if(arg.m_Amount == 0);

    // Load fee pool for this asset
    FeePool fp;
    Env::Halt_if(!LoadFeePool(arg.m_AssetId, fp));

    // Check available fees (accumulated minus already withdrawn)
    Amount available = fp.m_Accumulated - fp.m_Withdrawn;
    Env::Halt_if(arg.m_Amount > available);

    // Update fee pool
    fp.m_Withdrawn += arg.m_Amount;
    SaveFeePool(fp);

    // Update global stats
    s.m_TotalFeesWithdrawn += arg.m_Amount;
    SaveSettings(s);

    // SECURITY: Require owner's cryptographic signature
    Env::AddSig(arg.m_Owner);

    // Unlock fee funds to owner
    Env::FundsUnlock(arg.m_AssetId, arg.m_Amount);
}
