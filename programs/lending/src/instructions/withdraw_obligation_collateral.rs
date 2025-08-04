use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_2022::{burn_checked, transfer_checked, BurnChecked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use fixed::types::I80F48;

use crate::{
    error::LendingError, reserve_signer, validate_reserve_refreshed, Obligation, Reserve,
    SafeConvert, SafeMath, RECEIPT_MINT_SEED, RESERVE_SEED,
};

#[derive(Accounts)]
pub struct WithdrawObligationCollateral<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [RESERVE_SEED, reserve.market.key().as_ref(), collateral_mint.key().as_ref()],
        bump = reserve.bump,
    )]
    pub reserve: Account<'info, Reserve>,
    #[account(
        mut,
        has_one = authority @ LendingError::InvalidObligationAuthority,
        constraint = obligation.market == reserve.market @ LendingError::InvalidObligationMarket,
    )]
    pub obligation: Account<'info, Obligation>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [RECEIPT_MINT_SEED, reserve.key().as_ref()],
        bump = reserve.receipt_mint_bump,
    )]
    pub receipt_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = collateral_mint,
        associated_token::authority = authority,
        associated_token::token_program = collateral_token_program,
    )]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub reserve_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub receipt_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub receipt_token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl WithdrawObligationCollateral<'_> {
    pub fn handler(ctx: Context<WithdrawObligationCollateral>, receipt_amount: u64) -> Result<()> {
        require!(receipt_amount > 0, LendingError::InvalidWithdrawAmount);

        let WithdrawObligationCollateral {
            authority,
            authority_token_account,
            collateral_mint,
            obligation,
            reserve,
            reserve_token_account,
            collateral_token_program,
            receipt_mint,
            receipt_token_account,
            receipt_token_program,
            ..
        } = ctx.accounts;

        let slot = Clock::get()?.slot;

        validate_reserve_refreshed(reserve.last_update.is_stale(slot)?)?;
        validate_reserve_refreshed(obligation.last_update.is_stale(slot)?)?;

        burn_checked(
            CpiContext::new(
                receipt_token_program.to_account_info(),
                BurnChecked {
                    authority: authority.to_account_info(),
                    from: receipt_token_account.to_account_info(),
                    mint: receipt_mint.to_account_info(),
                },
            ),
            receipt_amount,
            receipt_mint.decimals,
        )?;

        let (obligation_collateral, index) =
            obligation.find_collateral_in_deposits(reserve.key())?;

        require!(
            obligation_collateral.deposited_amount > 0,
            LendingError::ObligationCollateralEmpty
        );

        let liquidity_amount = reserve
            .liquidity
            .redeem_receipt(receipt_amount, receipt_mint.supply)?;

        let withdrawable_amount = if obligation.borrows.is_empty() {
            if receipt_amount == u64::MAX {
                obligation_collateral.deposited_amount
            } else {
                obligation_collateral.deposited_amount.min(liquidity_amount)
            }
        } else {
            require!(
                I80F48::from(obligation.deposited_value) > I80F48::ZERO,
                LendingError::ObligationDepositsValueZero
            );

            let max_withdraw_value =
                obligation.max_withdraw_value(I80F48::from(reserve.config.loan_to_value_bps))?;

            require!(
                max_withdraw_value > I80F48::ZERO,
                LendingError::MaxWithdrawValueZero
            );

            let withdraw_amount = if receipt_amount == u64::MAX {
                let withdraw_value =
                    max_withdraw_value.min(obligation_collateral.market_value.into());
                let withdraw_pct =
                    withdraw_value.safe_div(obligation_collateral.market_value.into())?;
                withdraw_pct
                    .safe_mul(obligation_collateral.deposited_amount.into())?
                    .floor()
                    .safe_to_u64()?
                    .min(obligation_collateral.deposited_amount)
            } else {
                let withdraw_amount = liquidity_amount.min(obligation_collateral.deposited_amount);
                let withdraw_pct = I80F48::from(withdraw_amount)
                    .safe_div(obligation_collateral.deposited_amount.into())?;
                let withdraw_value =
                    I80F48::from(obligation_collateral.market_value).safe_mul(withdraw_pct)?;

                require!(
                    withdraw_value <= max_withdraw_value,
                    LendingError::WithdrawTooLarge
                );

                withdraw_amount
            };

            withdraw_amount
        };

        require!(withdrawable_amount > 0, LendingError::WithdrawTooSmall);

        obligation.withdraw(liquidity_amount, index)?;
        obligation.last_update.mark_stale();
        reserve.last_update.mark_stale();

        let market_key = reserve.market.key();
        let liquidity_mint_key = reserve.liquidity.mint.key();
        let reserve_signer: &[&[u8]] =
            reserve_signer!(market_key, liquidity_mint_key, reserve.bump);

        transfer_checked(
            CpiContext::new(
                collateral_token_program.to_account_info(),
                TransferChecked {
                    authority: reserve.to_account_info(),
                    from: reserve_token_account.to_account_info(),
                    mint: collateral_mint.to_account_info(),
                    to: authority_token_account.to_account_info(),
                },
            )
            .with_signer(&[reserve_signer]),
            withdrawable_amount,
            collateral_mint.decimals,
        )?;

        Ok(())
    }
}
