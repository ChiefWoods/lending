use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::{
    calculate_health_factor, error::LendingError, get_price_in_usd, state::*, BANK_SEED,
    SOL_USD_FEED_ID, TREASURY_SEED, USDC_USD_FEED_ID, USER_SEED,
};

#[derive(Accounts)]
pub struct Deposit<'info> {
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
        mut,
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

impl Deposit<'_> {
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require_gt!(amount, 0, LendingError::InvalidAmount);

        let bank = &mut ctx.accounts.bank;
        let user = &mut ctx.accounts.user;
        let price_update_a = &ctx.accounts.price_update_a;
        let price_update_b = &ctx.accounts.price_update_b;
        let clock = Clock::get()?;

        let sol_price = get_price_in_usd(SOL_USD_FEED_ID, price_update_a, &clock)?;
        let usdc_price = get_price_in_usd(USDC_USD_FEED_ID, price_update_b, &clock)?;

        let users_shares = if bank.total_deposits == 0 {
            bank.total_deposits = amount;
            bank.total_deposit_shares = amount;
            amount
        } else {
            let shares = amount
                .checked_mul(bank.total_deposit_shares)
                .ok_or(LendingError::Overflow)?
                .checked_div(bank.total_deposits)
                .ok_or(LendingError::DivisionByZero)?;

            bank.total_deposits = bank
                .total_deposits
                .checked_add(amount)
                .ok_or(LendingError::Overflow)?;
            bank.total_deposit_shares = bank
                .total_deposit_shares
                .checked_add(shares)
                .ok_or(LendingError::Overflow)?;

            shares
        };

        let (sol_decimal, usdc_decimal) = match ctx.accounts.mint_a.key() {
            key if key == user.usdc_mint => {
                user.deposited_usdc = user
                    .deposited_usdc
                    .checked_add(amount)
                    .ok_or(LendingError::Overflow)?;
                user.deposited_usdc_shares = user
                    .deposited_usdc_shares
                    .checked_add(users_shares)
                    .ok_or(LendingError::Overflow)?;

                (ctx.accounts.mint_b.decimals, ctx.accounts.mint_a.decimals)
            }
            _ => {
                user.deposited_sol = user
                    .deposited_sol
                    .checked_add(amount)
                    .ok_or(LendingError::Overflow)?;
                user.deposited_sol_shares = user
                    .deposited_sol_shares
                    .checked_add(users_shares)
                    .ok_or(LendingError::Overflow)?;

                (ctx.accounts.mint_a.decimals, ctx.accounts.mint_b.decimals)
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
