use anchor_lang::prelude::*;

#[constant]
pub const BANK_SEED: &[u8] = b"bank";
pub const USER_SEED: &[u8] = b"user";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const SOL_USD_FEED_ID: &str =
    "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
pub const USDC_USD_FEED_ID: &str =
    "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a";
#[cfg(feature = "no-staleness-check")]
pub const MAXIMUM_AGE: u64 = 999999;
#[cfg(not(feature = "no-staleness-check"))]
pub const MAXIMUM_AGE: u64 = 120;
pub const MAX_BASIS_POINTS: u64 = 10000;
