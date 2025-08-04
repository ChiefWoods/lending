use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::{
    error::LendingError, validate_bps, LastUpdate, Market, NewLastUpdateArgs, NewReserveConfigArgs,
    NewReserveFeesArgs, NewReserveLiquidityArgs, Reserve, ReserveConfig, ReserveFees,
    ReserveLiquidity, MARKET_SEED, RECEIPT_MINT_SEED, RESERVE_SEED,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeReserveArgs {
    pub optimal_utilization_rate_bps: u16,
    pub loan_to_value_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub liquidation_threshold_bps: u16,
    pub liquidation_close_factor_bps: u16,
    pub min_borrow_rate_bps: u16,
    pub optimal_borrow_rate_bps: u16,
    pub max_borrow_rate_bps: u16,
    pub flash_loan_fee_bps: u16,
    pub platform_fee_bps: u16,
}

#[derive(Accounts)]
pub struct InitializeReserve<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [MARKET_SEED, market.name.as_bytes()],
        bump = market.bump,
        has_one = authority @ LendingError::InvalidMarketAuthority,
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = authority,
        space = Reserve::DISCRIMINATOR.len() + Reserve::INIT_SPACE,
        seeds = [RESERVE_SEED, market.key().as_ref(), liquidity_mint.key().as_ref()],
        bump
    )]
    pub reserve: Account<'info, Reserve>,
    pub price_update_v2: Account<'info, PriceUpdateV2>,
    pub liquidity_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        seeds = [RECEIPT_MINT_SEED, reserve.key().as_ref()],
        bump,
        mint::decimals = 6,
        mint::authority = reserve,
        mint::token_program = token_program,
    )]
    pub receipt_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = liquidity_mint,
        associated_token::authority = reserve,
        associated_token::token_program = liquidity_token_program,
    )]
    pub reserve_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub liquidity_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl InitializeReserve<'_> {
    pub fn handler(ctx: Context<InitializeReserve>, args: InitializeReserveArgs) -> Result<()> {
        let InitializeReserveArgs {
            optimal_utilization_rate_bps,
            loan_to_value_bps,
            liquidation_bonus_bps,
            liquidation_threshold_bps,
            liquidation_close_factor_bps,
            min_borrow_rate_bps,
            optimal_borrow_rate_bps,
            max_borrow_rate_bps,
            flash_loan_fee_bps,
            platform_fee_bps,
        } = args;

        validate_bps(optimal_utilization_rate_bps)?;
        validate_bps(loan_to_value_bps)?;
        validate_bps(liquidation_bonus_bps)?;
        validate_bps(liquidation_threshold_bps)?;
        validate_bps(liquidation_close_factor_bps)?;
        validate_bps(min_borrow_rate_bps)?;
        validate_bps(optimal_borrow_rate_bps)?;
        validate_bps(max_borrow_rate_bps)?;
        validate_bps(flash_loan_fee_bps)?;
        validate_bps(platform_fee_bps)?;

        require_gt!(
            liquidation_threshold_bps,
            loan_to_value_bps,
            LendingError::InvalidLiquidationThreshold,
        );

        require_gt!(
            max_borrow_rate_bps,
            optimal_borrow_rate_bps,
            LendingError::InvalidMaxBorrowRate
        );

        require_gt!(
            optimal_borrow_rate_bps,
            min_borrow_rate_bps,
            LendingError::InvalidOptimalBorrowRate
        );

        let InitializeReserve {
            liquidity_mint,
            market,
            price_update_v2,
            reserve,
            ..
        } = ctx.accounts;

        reserve.set_inner(Reserve {
            bump: ctx.bumps.reserve,
            receipt_mint_bump: ctx.bumps.receipt_mint,
            config: ReserveConfig::new(NewReserveConfigArgs {
                fees: ReserveFees::new(NewReserveFeesArgs {
                    flash_loan_fee_bps,
                    platform_fee_bps,
                }),
                liquidation_bonus_bps,
                liquidation_threshold_bps,
                liquidation_close_factor_bps,
                loan_to_value_bps,
                max_borrow_rate_bps,
                optimal_borrow_rate_bps,
                min_borrow_rate_bps,
                optimal_utilization_rate_bps,
            }),
            last_update: LastUpdate::new(NewLastUpdateArgs {
                slot: Clock::get()?.slot,
            }),
            liquidity: ReserveLiquidity::new(NewReserveLiquidityArgs {
                mint: liquidity_mint.key(),
                price_update_v2: price_update_v2.key(),
            }),
            market: market.key(),
            liquidity_mint_decimals: liquidity_mint.decimals,
        });

        Ok(())
    }
}
