pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;
pub use utils::*;

declare_id!("DxekgdhR9ubX83YtgYH5gpARnNLKT3v5rbMqLJ4jgX3s");

#[program]
pub mod lending {
    use super::*;

    pub fn initialize_market(ctx: Context<InitializeMarket>, name: String) -> Result<()> {
        InitializeMarket::handler(ctx, name)
    }

    pub fn initialize_reserve(
        ctx: Context<InitializeReserve>,
        args: InitializeReserveArgs,
    ) -> Result<()> {
        InitializeReserve::handler(ctx, args)
    }

    pub fn update_reserve(ctx: Context<UpdateReserve>, args: UpdateReserveArgs) -> Result<()> {
        UpdateReserve::handler(ctx, args)
    }

    pub fn refresh_reserve(ctx: Context<RefreshReserve>) -> Result<()> {
        RefreshReserve::handler(ctx)
    }

    pub fn initialize_obligation(ctx: Context<InitializeObligation>) -> Result<()> {
        InitializeObligation::handler(ctx)
    }

    pub fn refresh_obligation(ctx: Context<RefreshObligation>) -> Result<()> {
        RefreshObligation::handler(ctx)
    }

    pub fn deposit_reserve_liquidity_and_obligation_collateral(
        ctx: Context<DepositReserveLiquidityAndObligationCollateral>,
        collateral_amount: u64,
    ) -> Result<()> {
        DepositReserveLiquidityAndObligationCollateral::handler(ctx, collateral_amount)
    }

    pub fn withdraw_obligation_collateral(
        ctx: Context<WithdrawObligationCollateral>,
        collateral_amount: u64,
    ) -> Result<()> {
        WithdrawObligationCollateral::handler(ctx, collateral_amount)
    }

    pub fn borrow_obligation_liquidity(
        ctx: Context<BorrowObligationLiquidity>,
        liquidity_amount: u64,
    ) -> Result<()> {
        BorrowObligationLiquidity::handler(ctx, liquidity_amount)
    }

    pub fn repay_obligation_liquidity(
        ctx: Context<RepayObligationLiquidity>,
        liquidity_amount: u64,
    ) -> Result<()> {
        RepayObligationLiquidity::handler(ctx, liquidity_amount)
    }

    pub fn liquidate_obligation(ctx: Context<LiquidateObligation>) -> Result<()> {
        LiquidateObligation::handler(ctx)
    }

    pub fn flash_borrow_reserve_liquidity(
        ctx: Context<FlashBorrowReserveLiquidity>,
        borrow_amount: u64,
    ) -> Result<()> {
        FlashBorrowReserveLiquidity::handler(ctx, borrow_amount)
    }

    pub fn flash_repay_reserve_liquidity(
        ctx: Context<FlashRepayReserveLiquidity>,
        repay_amount: u64,
        borrow_ix_index: u8,
    ) -> Result<()> {
        FlashRepayReserveLiquidity::handler(ctx, repay_amount, borrow_ix_index)
    }

    pub fn redeem_fees(ctx: Context<RedeemFees>) -> Result<()> {
        RedeemFees::handler(ctx)
    }
}
