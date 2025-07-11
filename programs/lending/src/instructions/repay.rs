use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::{
    calculate_accrued_interest, calculate_health_factor, error::LendingError, get_price_in_usd,
    Bank, User, BANK_SEED, SOL_USD_FEED_ID, TREASURY_SEED, USDC_USD_FEED_ID, USER_SEED,
};

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [BANK_SEED, mint_a.key().as_ref()],
        bump = bank.bump,
    )]
    pub bank: Account<'info, Bank>,
    #[account(
        mut,
        seeds = [USER_SEED, authority.key().as_ref()],
        bump = user.bump,
    )]
    pub user: Account<'info, User>,
    pub price_update_a: Account<'info, PriceUpdateV2>,
    pub price_update_b: Account<'info, PriceUpdateV2>,
    #[account(mint::token_program = token_program_a)]
    pub mint_a: InterfaceAccount<'info, Mint>,
    #[account(mint::token_program = token_program_b)]
    pub mint_b: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, mint_a.key().as_ref()],
        bump = bank.bank_ata_bump,
    )]
    pub bank_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint_a,
        associated_token::authority = authority,
        associated_token::token_program = token_program_a,
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program_a: Interface<'info, TokenInterface>,
    pub token_program_b: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl Repay<'_> {
    pub fn handler(ctx: Context<Repay>, amount: u64) -> Result<()> {
        require_gt!(amount, 0, LendingError::InvalidAmount);

        let bank = &mut ctx.accounts.bank;
        let user = &mut ctx.accounts.user;
        let price_update_a = &mut ctx.accounts.price_update_a;
        let price_update_b = &mut ctx.accounts.price_update_b;
        let clock = Clock::get()?;
        let mint_key = ctx.accounts.mint_a.key();

        let sol_price = get_price_in_usd(SOL_USD_FEED_ID, price_update_a, &clock)?;
        let usdc_price = get_price_in_usd(USDC_USD_FEED_ID, price_update_b, &clock)?;

        let (user_borrowed, user_borrow_shares, sol_decimal, usdc_decimal) = match mint_key {
            key if key == user.usdc_mint => (
                user.borrowed_usdc,
                user.borrowed_usdc_shares,
                ctx.accounts.mint_b.decimals,
                ctx.accounts.mint_a.decimals,
            ),
            _ => (
                user.borrowed_sol,
                user.borrowed_sol_shares,
                ctx.accounts.mint_a.decimals,
                ctx.accounts.mint_b.decimals,
            ),
        };

        let accrued_interest = calculate_accrued_interest(
            user_borrowed,
            bank.interest_rate,
            clock.unix_timestamp,
            user.last_updated,
        )?;

        let total_owed = user_borrowed
            .checked_add(accrued_interest)
            .ok_or(LendingError::Overflow)?;

        require!(amount <= total_owed, LendingError::ExceededBorrowedAmount);

        let principal_repayment = amount
            .checked_mul(user_borrowed)
            .ok_or(LendingError::Overflow)?
            .checked_div(total_owed)
            .ok_or(LendingError::DivisionByZero)?;

        let shares_to_remove = principal_repayment
            .checked_mul(bank.total_borrowed_shares)
            .ok_or(LendingError::Overflow)?
            .checked_div(bank.total_borrowed)
            .ok_or(LendingError::DivisionByZero)?;

        require!(
            shares_to_remove <= user_borrow_shares,
            LendingError::InsufficientShares
        );

        bank.total_borrowed = bank
            .total_borrowed
            .checked_sub(principal_repayment)
            .ok_or(LendingError::Underflow)?;
        bank.total_borrowed_shares = bank
            .total_borrowed_shares
            .checked_sub(shares_to_remove)
            .ok_or(LendingError::Underflow)?;

        match mint_key {
            key if key == user.usdc_mint => {
                user.borrowed_usdc = user
                    .borrowed_usdc
                    .checked_sub(principal_repayment)
                    .ok_or(LendingError::Underflow)?;
                user.borrowed_usdc_shares = user
                    .borrowed_usdc_shares
                    .checked_sub(shares_to_remove)
                    .ok_or(LendingError::Underflow)?;
            }
            _ => {
                user.borrowed_sol = user
                    .borrowed_sol
                    .checked_sub(principal_repayment)
                    .ok_or(LendingError::Underflow)?;
                user.borrowed_sol_shares = user
                    .borrowed_sol_shares
                    .checked_sub(shares_to_remove)
                    .ok_or(LendingError::Underflow)?;
            }
        };

        user.health_factor = calculate_health_factor(
            bank.liquidation_threshold,
            user,
            sol_price,
            usdc_price,
            sol_decimal,
            usdc_decimal,
        )?;

        bank.last_updated = clock.unix_timestamp;
        user.last_updated = clock.unix_timestamp;

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program_a.to_account_info(),
                TransferChecked {
                    authority: ctx.accounts.authority.to_account_info(),
                    from: ctx.accounts.user_ata.to_account_info(),
                    to: ctx.accounts.bank_ata.to_account_info(),
                    mint: ctx.accounts.mint_a.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint_a.decimals,
        )
    }
}
