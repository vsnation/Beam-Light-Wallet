// Airdrop Contract - Header (v2 - Security Hardened)
// BEAM Privacy Blockchain Smart Contract
// Voucher-based token airdrop: create batches, share codes, claim tokens
//
// Security features:
//   - Owner-controlled contract (only owner can destroy/pause/withdraw fees)
//   - AddSig on all state-changing methods (cryptographic identity verification)
//   - Pause mechanism for emergency stop
//   - 1% creation fee collected for contract owner

#pragma once

namespace Airdrop
{
    static const ShaderID s_SID = { 0x41, 0x69, 0x72, 0x64, 0x72, 0x6f, 0x70, 0x56,
                                     0x6f, 0x75, 0x63, 0x68, 0x65, 0x72, 0x42, 0x45,
                                     0x41, 0x4d, 0x50, 0x72, 0x69, 0x76, 0x61, 0x63,
                                     0x79, 0x32, 0x30, 0x32, 0x36, 0x56, 0x33, 0x00 };

    // =========================================
    // CONSTANTS
    // =========================================

    static const uint32_t CONTRACT_VERSION = 3;

    // Fee: 1% on batch creation (100 basis points)
    static const uint32_t FEE_BPS = 100;
    static const uint32_t BPS_TOTAL = 10000;

    // =========================================
    // KEY TAGS for storage
    // =========================================

    struct KeyTag {
        static const uint8_t Settings = 0;
        static const uint8_t VoucherBatch = 1;
        static const uint8_t Voucher = 2;
        static const uint8_t Counter = 3;
        static const uint8_t FeePool = 4;      // Per-asset fee accumulator
    };

    // =========================================
    // ALL STRUCTS PACKED (BEAM BVM convention)
    // =========================================

#pragma pack (push, 1)

    // Contract global settings
    struct Settings {
        uint32_t m_Version;
        PubKey m_Owner;                 // Contract owner/admin (set at deploy)
        uint8_t m_Paused;              // 0=active, 1=paused (owner can toggle)
        uint64_t m_TotalBatches;
        uint64_t m_TotalVouchers;
        uint64_t m_TotalRedeemed;
        Amount m_TotalValueLocked;      // Total voucher value locked
        Amount m_TotalFeesCollected;    // Lifetime fees collected
        Amount m_TotalFeesWithdrawn;    // Lifetime fees withdrawn by owner
    };

    // Per-asset fee accumulator
    struct FeePool {
        AssetID m_AssetId;
        Amount m_Accumulated;          // Total fees accumulated for this asset
        Amount m_Withdrawn;            // Total fees withdrawn for this asset
    };

    // A batch of vouchers created by one user
    struct VoucherBatch {
        uint64_t m_Id;
        PubKey m_Creator;
        AssetID m_AssetId;
        Amount m_ValuePerVoucher;      // Default value (individual vouchers can differ)
        uint32_t m_TotalCount;
        uint32_t m_RedeemedCount;
        uint64_t m_CreatedAt;
    };

    // Single voucher (keyed by hash of the secret code)
    struct Voucher {
        uint64_t m_BatchId;
        AssetID m_AssetId;
        Amount m_Value;
        uint8_t m_Redeemed;            // 0=available, 1=redeemed
        PubKey m_Creator;
        PubKey m_Redeemer;
        uint64_t m_RedeemedAt;
    };

    // Entry in the variable-length data appended to CreateBatch args
    // Each entry: 32-byte hash + 8-byte value = 40 bytes
    struct VoucherEntry {
        HashValue m_Hash;              // SHA-256 of the secret code
        Amount m_Value;                // Value of this voucher in groth
    };

    // =========================================
    // STORAGE KEYS
    // =========================================

    struct Key {
        struct Settings {
            uint8_t m_Tag = KeyTag::Settings;
        };

        struct VoucherBatch {
            uint8_t m_Tag = KeyTag::VoucherBatch;
            uint64_t m_Id;
        };

        struct Voucher {
            uint8_t m_Tag = KeyTag::Voucher;
            HashValue m_Hash;          // 32-byte voucher code hash
        };

        struct Counter {
            uint8_t m_Tag = KeyTag::Counter;
            uint8_t m_Type;            // 0=batch
        };

        struct FeePool {
            uint8_t m_Tag = KeyTag::FeePool;
            AssetID m_AssetId;
        };
    };

    // =========================================
    // METHOD PARAMETERS
    // =========================================

    namespace Method
    {
        // Method 0: Constructor - initialize contract with owner
        struct Create {
            static const uint32_t s_iMethod = 0;
            PubKey m_Owner;            // Contract owner (admin)
        };

        // Method 1: Destructor - void* (BEAM SDK convention)

        // Method 2: CreateBatch - create a batch with all vouchers in one tx
        // Variable-length data follows the struct: count * VoucherEntry (40 bytes each)
        // Total locked = sum of all voucher values + 1% fee
        // Requires AddSig from creator
        struct CreateBatch {
            static const uint32_t s_iMethod = 2;
            PubKey m_Creator;
            AssetID m_AssetId;
            uint32_t m_Count;          // Number of vouchers (1-100)
            // Followed by: m_Count * VoucherEntry
        };

        // Method 3: RedeemVoucher - claim a voucher's tokens
        // SECURITY: Requires the original voucher code (preimage), NOT the hash.
        // The contract hashes the preimage on-chain to derive the voucher key.
        // This prevents anyone who reads contract state (hashes) from redeeming.
        // Requires AddSig from redeemer
        struct RedeemVoucher {
            static const uint32_t s_iMethod = 3;
            PubKey m_Redeemer;
            uint32_t m_PreimageSize;   // Size of the preimage bytes that follow
            // Followed by: m_PreimageSize bytes of the normalized voucher code
        };

        // Method 4: CancelBatch - creator reclaims unclaimed vouchers
        // Variable-length data follows: m_Count * HashValue (32 bytes each)
        // Requires AddSig from creator (must match batch creator)
        struct CancelBatch {
            static const uint32_t s_iMethod = 4;
            PubKey m_Creator;
            uint64_t m_BatchId;
            uint32_t m_Count;          // Number of voucher hashes following
            // Followed by: m_Count * HashValue (32 bytes each)
        };

        // Method 5: SetPaused - owner pauses/unpauses contract
        // When paused, no new batches can be created
        // Redeem and Cancel still work (don't lock users out of funds)
        struct SetPaused {
            static const uint32_t s_iMethod = 5;
            PubKey m_Owner;            // Must match stored owner
            uint8_t m_Paused;          // 1=pause, 0=unpause
        };

        // Method 6: WithdrawFees - owner withdraws accumulated fees
        struct WithdrawFees {
            static const uint32_t s_iMethod = 6;
            PubKey m_Owner;            // Must match stored owner
            AssetID m_AssetId;         // Which asset to withdraw
            Amount m_Amount;           // Amount to withdraw (must be <= available)
        };
    }

#pragma pack (pop)

    // Legacy alias
    using Ctor = Method::Create;

} // namespace Airdrop
