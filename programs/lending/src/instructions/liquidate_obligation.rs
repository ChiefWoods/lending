use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use fixed::types::I80F48;

use crate::{
    error::LendingError, reserve_signer, validate_obligation_refreshed, validate_reserve_refreshed,
    Obligation, Reserve, RESERVE_SEED,
};

#[derive(Accounts)]
pub struct LiquidateObligation<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    #[account(
        mut,
        seeds = [RESERVE_SEED, repay_reserve.market.key().as_ref(), liquidity_mint.key().as_ref()],
        bump = repay_reserve.bump,
    )]
    pub repay_reserve: Account<'info, Reserve>,
    #[account(
        mut,
        seeds = [RESERVE_SEED, withdraw_reserve.market.key().as_ref(), collateral_mint.key().as_ref()],
        bump = withdraw_reserve.bump,
    )]
    pub withdraw_reserve: Account<'info, Reserve>,
    #[account(
        mut,
        constraint = obligation.market == withdraw_reserve.market @ LendingError::InvalidObligationMarket,
        constraint = obligation.market == repay_reserve.market @ LendingError::InvalidObligationMarket,
        constraint = I80F48::from(obligation.deposited_value) > I80F48::ZERO @ LendingError::ObligationDepositsEmpty,
        constraint = I80F48::from(obligation.borrowed_value) > I80F48::ZERO @ LendingError::ObligationBorrowsEmpty,
        constraint = obligation.borrowed_value < obligation.weighted_unhealthy_borrow_value @ LendingError::ObligationHealthy,
    )]
    pub obligation: Account<'info, Obligation>,
    pub liquidity_mint: InterfaceAccount<'info, Mint>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = liquidity_mint,
        associated_token::authority = repay_reserve
    )]
    pub reserve_liquidity_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub reserve_collateral_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub liquidator_liquidity_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = liquidator,
        associated_token::mint = collateral_mint,
        associated_token::authority = liquidator,
        associated_token::token_program = collateral_token_program,
    )]
    pub liquidator_collateral_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub liquidity_token_program: Interface<'info, TokenInterface>,
    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl LiquidateObligation<'_> {
    pub fn handler(ctx: Context<LiquidateObligation>) -> Result<()> {
        let LiquidateObligation {
            collateral_mint,
            collateral_token_program,
            liquidator,
            liquidator_collateral_token_account,
            liquidator_liquidity_token_account,
            liquidity_mint,
            obligation,
            repay_reserve,
            reserve_collateral_token_account,
            reserve_liquidity_token_account,
            withdraw_reserve,
            liquidity_token_program,
            ..
        } = ctx.accounts;

        let slot = Clock::get()?.slot;

        validate_reserve_refreshed(repay_reserve.last_update.is_stale(slot)?)?;
        validate_reserve_refreshed(withdraw_reserve.last_update.is_stale(slot)?)?;
        validate_obligation_refreshed(obligation.last_update.is_stale(slot)?)?;

        let (obligation_liquidity, liquidity_index) =
            obligation.find_liquidity_in_borrows(repay_reserve.key())?;

        require!(
            I80F48::from(obligation_liquidity.market_value) > I80F48::ZERO,
            LendingError::ObligationLiquidityEmpty
        );

        let (obligation_collateral, collateral_index) =
            obligation.find_collateral_in_deposits(withdraw_reserve.key())?;

        require!(
            I80F48::from(obligation_collateral.market_value) > I80F48::ZERO,
            LendingError::ObligationLiquidityEmpty
        );

        let (repay_amount, withdraw_amount) = withdraw_reserve.calculate_liquidation(
            &obligation,
            obligation_liquidity,
            obligation_collateral,
        )?;

        require!(
            repay_amount > 0 && withdraw_amount > 0,
            LendingError::LiquidationTooSmall
        );

        transfer_checked(
            CpiContext::new(
                liquidity_token_program.to_account_info(),
                TransferChecked {
                    authority: liquidator.to_account_info(),
                    from: liquidator_liquidity_token_account.to_account_info(),
                    mint: liquidity_mint.to_account_info(),
                    to: reserve_liquidity_token_account.to_account_info(),
                },
            ),
            repay_amount,
            liquidity_mint.decimals,
        )?;

        let market_key = withdraw_reserve.market;
        let liquidity_mint_key = withdraw_reserve.liquidity.mint.key();
        let reserve_signer: &[&[u8]] =
            reserve_signer!(market_key, liquidity_mint_key, withdraw_reserve.bump);

        transfer_checked(
            CpiContext::new(
                collateral_token_program.to_account_info(),
                TransferChecked {
                    authority: withdraw_reserve.to_account_info(),
                    from: reserve_collateral_token_account.to_account_info(),
                    mint: collateral_mint.to_account_info(),
                    to: liquidator_collateral_token_account.to_account_info(),
                },
            )
            .with_signer(&[reserve_signer]),
            withdraw_amount,
            collateral_mint.decimals,
        )?;

        obligation.repay(repay_amount, liquidity_index)?;
        obligation.withdraw(withdraw_amount, collateral_index)?;
        repay_reserve.liquidity.repay_liquidity(repay_amount)?;
        obligation.last_update.mark_stale();
        repay_reserve.last_update.mark_stale();

        Ok(())
    }
}
