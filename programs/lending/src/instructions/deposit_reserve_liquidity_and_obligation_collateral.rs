use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_2022::{mint_to_checked, transfer_checked, MintToChecked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    error::LendingError, reserve_signer, validate_reserve_refreshed, Obligation, Reserve,
    RECEIPT_MINT_SEED, RESERVE_SEED,
};

#[derive(Accounts)]
pub struct DepositReserveLiquidityAndObligationCollateral<'info> {
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
    #[account(
        address = reserve.liquidity.mint @ LendingError::InvalidReserveMint
    )]
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [RECEIPT_MINT_SEED, reserve.key().as_ref()],
        bump = reserve.receipt_mint_bump,
    )]
    pub receipt_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = authority,
    )]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = receipt_mint,
        associated_token::authority = authority,
        associated_token::token_program = receipt_token_program,
    )]
    pub receipt_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = reserve,
    )]
    pub reserve_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub receipt_token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl DepositReserveLiquidityAndObligationCollateral<'_> {
    pub fn handler(
        ctx: Context<DepositReserveLiquidityAndObligationCollateral>,
        collateral_amount: u64,
    ) -> Result<()> {
        require!(collateral_amount > 0, LendingError::InvalidDepositAmount);

        let DepositReserveLiquidityAndObligationCollateral {
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

        require!(
            reserve.config.loan_to_value_bps > 0,
            LendingError::ReserveCollateralDisabled
        );

        transfer_checked(
            CpiContext::new(
                collateral_token_program.to_account_info(),
                TransferChecked {
                    authority: authority.to_account_info(),
                    from: authority_token_account.to_account_info(),
                    mint: collateral_mint.to_account_info(),
                    to: reserve_token_account.to_account_info(),
                },
            ),
            collateral_amount,
            collateral_mint.decimals,
        )?;

        obligation
            .find_or_add_collateral_to_deposits(reserve.key())?
            .deposit(collateral_amount)?;

        obligation.last_update.mark_stale();
        reserve.last_update.mark_stale();

        let receipt_mint_amount = reserve
            .liquidity
            .deposit_liquidity(collateral_amount, receipt_mint.supply)?;

        let market_key = reserve.market.key();
        let liquidity_mint_key = reserve.liquidity.mint.key();
        let reserve_signer: &[&[u8]] =
            reserve_signer!(market_key, liquidity_mint_key, reserve.bump);

        mint_to_checked(
            CpiContext::new(
                receipt_token_program.to_account_info(),
                MintToChecked {
                    authority: reserve.to_account_info(),
                    mint: receipt_mint.to_account_info(),
                    to: receipt_token_account.to_account_info(),
                },
            )
            .with_signer(&[reserve_signer]),
            receipt_mint_amount,
            receipt_mint.decimals,
        )?;

        Ok(())
    }
}
