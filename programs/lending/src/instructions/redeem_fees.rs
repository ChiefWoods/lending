use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    error::LendingError, reserve_signer, validate_reserve_refreshed, Market, Reserve, MARKET_SEED,
    RESERVE_SEED,
};

#[derive(Accounts)]
pub struct RedeemFees<'info> {
    #[account(
        mut,
        address = market.authority @ LendingError::InvalidMarketAuthority
    )]
    pub authority: Signer<'info>,
    #[account(
        seeds = [MARKET_SEED, market.name.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [RESERVE_SEED, market.key().as_ref(), liquidity_mint.key().as_ref()],
        bump = reserve.bump
    )]
    pub reserve: Account<'info, Reserve>,
    pub liquidity_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = liquidity_mint,
        associated_token::authority = authority,
    )]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub reserve_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl RedeemFees<'_> {
    pub fn handler(ctx: Context<RedeemFees>) -> Result<()> {
        let RedeemFees {
            authority_token_account,
            liquidity_mint,
            reserve,
            reserve_token_account,
            token_program,
            ..
        } = ctx.accounts;

        let slot = Clock::get()?.slot;
        validate_reserve_refreshed(reserve.last_update.is_stale(slot)?)?;

        let redeemable_fees = reserve.liquidity.redeem_fees()?;

        let market_key = reserve.market.key();
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
            redeemable_fees,
            liquidity_mint.decimals,
        )?;

        Ok(())
    }
}
