use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{error::LendingError, validate_reserve_refreshed, Obligation, Reserve, RESERVE_SEED};

#[derive(Accounts)]
pub struct RepayObligationLiquidity<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [RESERVE_SEED, reserve.market.key().as_ref(), liquidity_mint.key().as_ref()],
        bump = reserve.bump,
    )]
    pub reserve: Account<'info, Reserve>,
    #[account(
        mut,
        has_one = authority @ LendingError::InvalidObligationAuthority,
        constraint = obligation.market == reserve.market @ LendingError::InvalidObligationMarket,
    )]
    pub obligation: Account<'info, Obligation>,
    pub liquidity_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = liquidity_mint,
        associated_token::authority = reserve
    )]
    pub reserve_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl RepayObligationLiquidity<'_> {
    pub fn handler(ctx: Context<RepayObligationLiquidity>, liquidity_amount: u64) -> Result<()> {
        require!(liquidity_amount > 0, LendingError::InvalidRepayAmount);

        let RepayObligationLiquidity {
            authority,
            authority_token_account,
            liquidity_mint,
            obligation,
            reserve,
            reserve_token_account,
            token_program,
            ..
        } = ctx.accounts;

        let slot = Clock::get()?.slot;

        validate_reserve_refreshed(reserve.last_update.is_stale(slot)?)?;
        validate_reserve_refreshed(obligation.last_update.is_stale(slot)?)?;

        let (obligation_liquidity, index) = obligation.find_liquidity_in_borrows(reserve.key())?;

        require!(
            obligation_liquidity.borrowed_amount > 0,
            LendingError::ObligationLiquidityEmpty
        );

        let repay_amount =
            reserve.calculate_repay(liquidity_amount, obligation_liquidity.borrowed_amount)?;

        require!(repay_amount > 0, LendingError::RepayTooSmall);

        obligation.repay(repay_amount, index)?;
        reserve.liquidity.repay_liquidity(repay_amount)?;
        obligation.last_update.mark_stale();
        reserve.last_update.mark_stale();

        transfer_checked(
            CpiContext::new(
                token_program.to_account_info(),
                TransferChecked {
                    authority: authority.to_account_info(),
                    from: authority_token_account.to_account_info(),
                    mint: liquidity_mint.to_account_info(),
                    to: reserve_token_account.to_account_info(),
                },
            ),
            repay_amount,
            liquidity_mint.decimals,
        )?;

        Ok(())
    }
}
