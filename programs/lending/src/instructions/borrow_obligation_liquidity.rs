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
pub struct BorrowObligationLiquidity<'info> {
    #[account(mut)]
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
        constraint = !obligation.deposits.is_empty() @ LendingError::ObligationDepositsEmpty,
        constraint = I80F48::from(obligation.deposited_value) != I80F48::ZERO @ LendingError::ObligationDepositsValueZero,
    )]
    pub obligation: Account<'info, Obligation>,
    pub liquidity_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = liquidity_mint,
        associated_token::authority = authority,
        associated_token::token_program = token_program,
    )]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub reserve_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl BorrowObligationLiquidity<'_> {
    pub fn handler(ctx: Context<BorrowObligationLiquidity>, liquidity_amount: u64) -> Result<()> {
        require!(liquidity_amount > 0, LendingError::InvalidBorrowAmount);

        let BorrowObligationLiquidity {
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
        validate_obligation_refreshed(obligation.last_update.is_stale(slot)?)?;

        let remaining_borrow_value = obligation.remaining_borrow_value()?;

        require!(
            remaining_borrow_value >= I80F48::ZERO,
            LendingError::MaxBorrowValueZero
        );

        let borrowable_amount =
            reserve.calculate_borrow(liquidity_amount, remaining_borrow_value)?;

        require!(borrowable_amount > 0, LendingError::BorrowTooSmall);

        obligation
            .find_or_add_liquidity_to_borrows(reserve.key())?
            .borrow(borrowable_amount)?;
        reserve.liquidity.borrow_liquidity(borrowable_amount)?;
        obligation.last_update.mark_stale();
        reserve.last_update.mark_stale();

        let market_key = reserve.market;
        let liquidity_mint_key = reserve.liquidity.mint.key();
        let reserve_signer: &[&[u8]] =
            reserve_signer!(market_key, liquidity_mint_key, reserve.bump);

        transfer_checked(
            CpiContext::new(
                token_program.to_account_info(),
                TransferChecked {
                    authority: reserve.to_account_info(),
                    from: reserve_token_account.to_account_info(),
                    mint: liquidity_mint.to_account_info(),
                    to: authority_token_account.to_account_info(),
                },
            )
            .with_signer(&[reserve_signer]),
            borrowable_amount,
            liquidity_mint.decimals,
        )?;

        Ok(())
    }
}
