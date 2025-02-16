use anchor_lang::prelude::*;

#[error_code]
pub enum LendingError {
    #[msg("Amount should be greater than 0")]
    InvalidAmount,
    #[msg("Insufficient funds to withdraw")]
    InsufficientFunds,
    #[msg("Insufficient shares to withdraw")]
    InsufficientShares,
    #[msg("Borrowed amount exceeds the maximum LTV")]
    ExceededLTV,
    #[msg("Attempting to repay more than borrowed")]
    ExceededBorrowedAmount,
    #[msg("User is not under-collateralized")]
    NotUnderCollateralized,
    #[msg("Withdrawal would result in liquidation")]
    BelowLiquidationThreshold,
    #[msg("Math operation overflow")]
    Overflow = 1000,
    #[msg("Math operation underflow")]
    Underflow,
    #[msg("Math operation division by zero")]
    DivisionByZero,
}
