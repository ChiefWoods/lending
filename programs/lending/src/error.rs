use anchor_lang::prelude::*;

#[error_code]
pub enum LendingError {
    #[msg("Basis points cannot be greater than 10000")]
    InvalidBasisPoints,
    #[msg("Price update v2 does not match the one in reserve")]
    InvalidPriceUpdateV2,
    #[msg("Authority does not match the one in market")]
    InvalidMarketAuthority,
    #[msg("Market does not match the one in reserve")]
    InvalidReserveMarket,
    #[msg("Authority does not match the one in obligation")]
    InvalidObligationAuthority,
    #[msg("Market does not match the one in obligation")]
    InvalidObligationMarket,
    #[msg("Mint does not match the one in reserve")]
    InvalidReserveMint,
    #[msg("Deposit reserve not found in obligation deposits")]
    InvalidObligationCollateral,
    #[msg("Borrow reserve not found in obligation borrows")]
    InvalidObligationLiquidity,
    #[msg("Amount to deposit must be greater than 0")]
    InvalidDepositAmount,
    #[msg("Amount to withdraw must be greater than 0")]
    InvalidWithdrawAmount,
    #[msg("Amount to borrow must be greater than 0")]
    InvalidBorrowAmount,
    #[msg("Amount to repay must be greater than 0")]
    InvalidRepayAmount,
    #[msg("Amount to liquidate must be greater than 0")]
    InvalidLiquidationAmount,
    #[msg("Account is not owned by program")]
    InvalidAccountOwner,
    #[msg("Reserve account does not match with obligation reserve")]
    InvalidReserve,
    #[msg("Receipt mint is invalid")]
    InvalidReceiptMint,
    #[msg("Reserve must be refreshed in the current slot")]
    ReserveStale,
    #[msg("Obligation must be refreshed in the current slot")]
    ObligationStale,
    #[msg("Reserve cannot be used as collateral")]
    ReserveCollateralDisabled,
    #[msg("Obligation has no deposits")]
    ObligationDepositsEmpty,
    #[msg("Obligation deposit has no collateral")]
    ObligationCollateralEmpty,
    #[msg("Obligation deposit value is zero")]
    ObligationDepositsValueZero,
    #[msg("Obligation has no borrows")]
    ObligationBorrowsEmpty,
    #[msg("Obligation borrow has no liquidity")]
    ObligationLiquidityEmpty,
    #[msg("Obligation cannot be liquidated")]
    ObligationHealthy,
    #[msg("Maximum withdraw value is zero")]
    MaxWithdrawValueZero,
    #[msg("Maximum borrow value is zero")]
    MaxBorrowValueZero,
    #[msg("Withdraw exceeded maximum withdraw value")]
    WithdrawTooLarge,
    #[msg("Borrow exceeded maximum borrow value")]
    BorrowTooLarge,
    #[msg("Actual withdraw amount is zero")]
    WithdrawTooSmall,
    #[msg("Actual borrow amount is zero")]
    BorrowTooSmall,
    #[msg("Actual repay amount is zero")]
    RepayTooSmall,
    #[msg("Actual liquidation amount is zero")]
    LiquidationTooSmall,
    #[msg("Amount of deposit and borrow reserve accounts passed do not match with obligation")]
    TooManyAccounts,
    #[msg("Interest rate cannot be negative")]
    NegativeInterestRate,
    #[msg("Reserve does not have enough liquidity")]
    InsufficientLiquidity,
    #[msg("Math operation overflow")]
    MathOverflow,
    #[msg("Math conversion failed")]
    ConversionFailed,
    #[msg("Price provided is below or equal to zero")]
    InvalidPrice,
    #[msg("Collateral mint cannot match reserve mint")]
    CollateralAndLiquidityMintMatch,
    #[msg("Liquidation threshold must be greater than loan to value")]
    InvalidLiquidationThreshold,
    #[msg("Max borrow rate must be greater than optimal borrow rate")]
    InvalidMaxBorrowRate,
    #[msg("Optimal borrow rate must be greater than min borrow rate")]
    InvalidOptimalBorrowRate,
    #[msg("Only one flash borrow per transaction is allowed")]
    MultipleFlashBorrowsNotAllowed,
    #[msg("Only one flash repay per transaction is allowed")]
    MultipleFlashRepaysNotAllowed,
    #[msg("Flash repay instruction data is invalid")]
    InvalidFlashRepayInstructionData,
    #[msg("Flash repay amount does not match borrow amount")]
    InvalidFlashRepayAmount,
    #[msg("Flash repay instruction program ID does not match current program ID")]
    InvalidFlashRepayProgramId,
    #[msg("No flash repay instruction found in transaction")]
    NoFlashRepayInstruction,
    #[msg("Instruction at index is not a flash borrow")]
    InvalidBorrowInstructionIndex,
    #[msg("Flash repay reserve does not match the flash borrow reserve")]
    InvalidFlashRepayReserve,
    #[msg("Flash borrow instruction data is invalid")]
    InvalidFlashBorrowInstructionData,
    #[msg("No more instructions to introspect")]
    OutOfInstructions,
}
