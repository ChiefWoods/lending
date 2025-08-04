use anchor_lang::prelude::*;

#[constant]
pub const MARKET_SEED: &[u8] = b"market";
#[constant]
pub const RESERVE_SEED: &[u8] = b"reserve";
#[constant]
pub const RECEIPT_MINT_SEED: &[u8] = b"receipt_mint";
#[constant]
pub const OBLIGATION_SEED: &[u8] = b"obligation";
#[constant]
pub const MAX_BASIS_POINTS: u16 = 10_000;
#[constant]
pub const SLOTS_PER_YEAR: u64 = 78840000; // 160 / 64 * 86400 * 365
#[constant]
#[cfg(feature = "no-staleness-check")]
pub const ORACLE_MAX_AGE: u32 = u32::MAX;
#[constant]
#[cfg(not(feature = "no-staleness-check"))]
pub const ORACLE_MAX_AGE: u32 = 15;
