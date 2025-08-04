use std::fmt::Debug;

use crate::{error::LendingError, utils::safe_math::SafeMath};
use anchor_lang::prelude::*;
use fixed::types::I80F48;
use pyth_solana_receiver_sdk::price_update::Price;

/// Borsh serializable wrapper for [`fixed::types::I80F48`].
/// Calculations are never performed on this type directly as Solana's runtime has limited support for floating operations.
#[repr(C, align(8))]
#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    InitSpace,
    Default,
    Debug,
    Clone,
    Copy,
    Eq,
    PartialEq,
    PartialOrd,
)]
pub struct WrappedI80F48 {
    pub value: [u8; 16],
}

impl From<I80F48> for WrappedI80F48 {
    fn from(i: I80F48) -> Self {
        Self {
            value: i.to_le_bytes(),
        }
    }
}

impl From<WrappedI80F48> for I80F48 {
    fn from(w: WrappedI80F48) -> Self {
        Self::from_le_bytes(w.value)
    }
}

// converts a Price from PriceUpdateV2 to a WrappedI80F48
impl TryFrom<Price> for WrappedI80F48 {
    type Error = Error;

    fn try_from(price: Price) -> Result<Self> {
        let exp = price.exponent;
        let multiplier = 10_u128
            .checked_pow(price.exponent.unsigned_abs())
            .ok_or(ProgramError::ArithmeticOverflow)?;

        let op = if exp >= 0 {
            I80F48::safe_mul
        } else {
            I80F48::safe_div
        };

        require_gt!(price.price, 0, LendingError::InvalidPrice);

        let scaled = op(
            I80F48::from_num(price.price),
            I80F48::from_num(u64::try_from(multiplier)?),
        )?;

        Ok(scaled.into())
    }
}

impl TryFrom<WrappedI80F48> for u64 {
    type Error = Error;

    fn try_from(w: WrappedI80F48) -> Result<Self> {
        let i80f48: I80F48 = w.into();

        Ok(i80f48
            .checked_to_num::<Self>()
            .ok_or(LendingError::ConversionFailed)?)
    }
}
