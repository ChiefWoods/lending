use anchor_lang::prelude::*;
use fixed::types::I80F48;
use std::panic::Location;

use crate::{error::LendingError, MAX_BASIS_POINTS};

pub trait SafeMath: Sized {
    fn safe_add(self, rhs: Self) -> Result<Self>;
    fn safe_sub(self, rhs: Self) -> Result<Self>;
    fn safe_mul(self, rhs: Self) -> Result<Self>;
    fn safe_div(self, rhs: Self) -> Result<Self>;
}

macro_rules! checked_impl {
    ($t:ty) => {
        impl SafeMath for $t {
            #[track_caller]
            #[inline(always)]
            fn safe_add(self, rhs: $t) -> Result<$t> {
                match self.checked_add(rhs) {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!("Math overflow at {}:{}", caller.file(), caller.line());
                        Err(LendingError::MathOverflow.into())
                    }
                }
            }

            #[track_caller]
            #[inline(always)]
            fn safe_sub(self, rhs: $t) -> Result<$t> {
                match self.checked_sub(rhs) {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!("Math underflow at {}:{}", caller.file(), caller.line());
                        Err(LendingError::MathOverflow.into())
                    }
                }
            }

            #[track_caller]
            #[inline(always)]
            fn safe_mul(self, rhs: $t) -> Result<$t> {
                match self.checked_mul(rhs) {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!("Math overflow at {}:{}", caller.file(), caller.line());
                        Err(LendingError::MathOverflow.into())
                    }
                }
            }

            #[track_caller]
            #[inline(always)]
            fn safe_div(self, rhs: $t) -> Result<$t> {
                match self.checked_div(rhs) {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!("Division error at {}:{}", caller.file(), caller.line());
                        Err(LendingError::MathOverflow.into())
                    }
                }
            }
        }
    };
}

checked_impl!(u16);
checked_impl!(u32);
checked_impl!(u64);
checked_impl!(u128);
checked_impl!(i64);
checked_impl!(I80F48);

pub trait SafeMathAssign: Sized {
    fn safe_add_assign(&mut self, rhs: Self) -> Result<()>;
    fn safe_sub_assign(&mut self, rhs: Self) -> Result<()>;
    fn safe_mul_assign(&mut self, rhs: Self) -> Result<()>;
    fn safe_div_assign(&mut self, rhs: Self) -> Result<()>;
}

macro_rules! assign_impl {
    ($t:ty) => {
        impl SafeMathAssign for $t {
            #[track_caller]
            #[inline(always)]
            fn safe_add_assign(&mut self, rhs: $t) -> Result<()> {
                *self = self.safe_add(rhs)?;
                Ok(())
            }

            #[track_caller]
            #[inline(always)]
            fn safe_sub_assign(&mut self, rhs: $t) -> Result<()> {
                *self = self.safe_sub(rhs)?;
                Ok(())
            }

            #[track_caller]
            #[inline(always)]
            fn safe_mul_assign(&mut self, rhs: $t) -> Result<()> {
                *self = self.safe_mul(rhs)?;
                Ok(())
            }

            #[track_caller]
            #[inline(always)]
            fn safe_div_assign(&mut self, rhs: $t) -> Result<()> {
                *self = self.safe_div(rhs)?;
                Ok(())
            }
        }
    };
}

assign_impl!(u16);
assign_impl!(u32);
assign_impl!(u64);
assign_impl!(I80F48);

pub trait SafePow: Sized {
    fn safe_pow(self, exp: u32) -> Result<Self>;
}

macro_rules! pow_impl {
    ($t:ty) => {
        impl SafePow for $t {
            #[track_caller]
            #[inline(always)]
            fn safe_pow(self, exp: u32) -> Result<$t> {
                match self.checked_pow(exp) {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!(
                            "Exponentiation overflow at {}:{}",
                            caller.file(),
                            caller.line()
                        );
                        Err(LendingError::MathOverflow.into())
                    }
                }
            }
        }
    };
}

pow_impl!(u64);

pub trait SafeConvert {
    fn safe_to_u16(self) -> Result<u16>;
    fn safe_to_u32(self) -> Result<u32>;
    fn safe_to_u64(self) -> Result<u64>;
}

macro_rules! to_impl {
    ($t:ty) => {
        impl SafeConvert for $t {
            #[track_caller]
            #[inline(always)]
            fn safe_to_u16(self) -> Result<u16> {
                match self.checked_to_num() {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!(
                            "Conversion to u16 failed at {}:{}",
                            caller.file(),
                            caller.line()
                        );
                        err!(LendingError::ConversionFailed)
                    }
                }
            }

            #[track_caller]
            #[inline(always)]
            fn safe_to_u32(self) -> Result<u32> {
                match self.checked_to_num() {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!(
                            "Conversion to u32 failed at {}:{}",
                            caller.file(),
                            caller.line()
                        );
                        err!(LendingError::ConversionFailed)
                    }
                }
            }

            #[track_caller]
            #[inline(always)]
            fn safe_to_u64(self) -> Result<u64> {
                match self.checked_to_num() {
                    Some(result) => Ok(result),
                    None => {
                        let caller = Location::caller();
                        msg!(
                            "Conversion to u64 failed at {}:{}",
                            caller.file(),
                            caller.line()
                        );
                        err!(LendingError::ConversionFailed)
                    }
                }
            }
        }
    };
}

to_impl!(I80F48);

pub fn i80f48_pow(base: I80F48, mut exp: u64) -> Result<I80F48> {
    if exp == 0 {
        return Ok(I80F48::ONE);
    }

    let mut result = I80F48::ONE;
    let mut current_base = base;

    while exp > 0 {
        if exp % 2 == 1 {
            result = result.safe_mul(current_base)?;
        }
        current_base = current_base.safe_mul(current_base)?;
        exp /= 2;
    }

    Ok(result)
}

pub fn bps_to_i80f48(bps: u16) -> Result<I80F48> {
    I80F48::from(bps).safe_div(MAX_BASIS_POINTS.into())
}
