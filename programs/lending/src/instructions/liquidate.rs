use std::ops::{Add, Div, Mul};

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::{
    calculate_accrued_interest, error::LendingError, get_price_in_usd, get_total_from_usd,
    get_total_in_usd, Bank, User, BANK_SEED, MAX_BASIS_POINTS, SOL_USD_FEED_ID, TREASURY_SEED,
    USDC_USD_FEED_ID, USER_SEED,
};

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    pub borrower: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [BANK_SEED, collateral_mint.key().as_ref()],
        bump = collateral_bank.bump,
    )]
    pub collateral_bank: Box<Account<'info, Bank>>,
    #[account(
        mut,
        seeds = [BANK_SEED, borrowed_mint.key().as_ref()],
        bump = borrowed_bank.bump,
    )]
    pub borrowed_bank: Box<Account<'info, Bank>>,
    #[account(
        mut,
        seeds = [USER_SEED, borrower.key().as_ref()],
        bump = user.bump,
        constraint = user.authority.key() == borrower.key(),
    )]
    pub user: Account<'info, User>,
    pub price_update_a: Box<Account<'info, PriceUpdateV2>>,
    pub price_update_b: Box<Account<'info, PriceUpdateV2>>,
    #[account(mint::token_program = token_program_a)]
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(mint::token_program = token_program_b)]
    pub borrowed_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, collateral_mint.key().as_ref()],
        bump = collateral_bank.bank_ata_bump,
    )]
    pub collateral_bank_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, borrowed_mint.key().as_ref()],
        bump = borrowed_bank.bank_ata_bump,
    )]
    pub borrowed_bank_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = liquidator,
        associated_token::mint = collateral_mint,
        associated_token::authority = liquidator,
        associated_token::token_program = token_program_a,
    )]
    pub liquidator_collateral_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = borrowed_mint,
        associated_token::authority = liquidator,
        associated_token::token_program = token_program_a,
    )]
    pub liquidator_borrowed_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program_a: Interface<'info, TokenInterface>,
    pub token_program_b: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl Liquidate<'_> {
    pub fn handler(ctx: Context<Liquidate>) -> Result<()> {
        let collateral_bank = &mut ctx.accounts.collateral_bank;
        let borrowed_bank = &mut ctx.accounts.borrowed_bank;
        let user = &mut ctx.accounts.user;
        let price_update_a = &ctx.accounts.price_update_a;
        let price_update_b = &ctx.accounts.price_update_b;
        let clock = Clock::get()?;

        let sol_price = get_price_in_usd(SOL_USD_FEED_ID, price_update_a, &clock)?;
        let usdc_price = get_price_in_usd(USDC_USD_FEED_ID, price_update_b, &clock)?;

        let (sol_mint, usdc_mint, borrowed_mint_price, collateral_mint_price) =
            match ctx.accounts.collateral_mint.key() {
                key if key == user.usdc_mint => (
                    &ctx.accounts.borrowed_mint,
                    &ctx.accounts.collateral_mint,
                    sol_price,
                    usdc_price,
                ),
                _ => (
                    &ctx.accounts.collateral_mint,
                    &ctx.accounts.borrowed_mint,
                    usdc_price,
                    sol_price,
                ),
            };

        let accrued_sol_borrow_interest = calculate_accrued_interest(
            user.borrowed_sol,
            borrowed_bank.interest_rate,
            clock.unix_timestamp,
            user.last_updated,
        )?;

        let total_sol_borrowed = user
            .borrowed_sol
            .checked_add(accrued_sol_borrow_interest)
            .ok_or(LendingError::Overflow)?;

        let accrued_usdc_borrow_interest = calculate_accrued_interest(
            user.borrowed_usdc,
            borrowed_bank.interest_rate,
            clock.unix_timestamp,
            user.last_updated,
        )?;

        let total_usdc_borrowed = user
            .borrowed_usdc
            .checked_add(accrued_usdc_borrow_interest)
            .ok_or(LendingError::Overflow)?;

        let total_borrowed_in_usd =
            get_total_in_usd(total_sol_borrowed, sol_price, sol_mint.decimals)?.add(
                get_total_in_usd(total_usdc_borrowed, usdc_price, usdc_mint.decimals)?,
            );

        let accrued_sol_deposit_interest = calculate_accrued_interest(
            user.deposited_sol,
            collateral_bank.interest_rate,
            clock.unix_timestamp,
            user.last_updated,
        )?;

        let total_sol_collateral = user
            .deposited_sol
            .checked_add(accrued_sol_deposit_interest)
            .ok_or(LendingError::Overflow)?;

        let accrued_usdc_deposit_interest = calculate_accrued_interest(
            user.deposited_usdc,
            collateral_bank.interest_rate,
            clock.unix_timestamp,
            user.last_updated,
        )?;

        let total_usdc_collateral = user
            .deposited_usdc
            .checked_add(accrued_usdc_deposit_interest)
            .ok_or(LendingError::Overflow)?;

        let total_collateral_in_usd =
            get_total_in_usd(total_sol_collateral, sol_price, sol_mint.decimals)?.add(
                get_total_in_usd(total_usdc_collateral, usdc_price, usdc_mint.decimals)?,
            );

        let health_factor = total_collateral_in_usd.div(total_borrowed_in_usd);

        require!(
            health_factor < collateral_bank.min_health_factor,
            LendingError::NotUnderCollateralized
        );

        let total_borrowed = match ctx.accounts.collateral_mint.key() {
            key if key == user.usdc_mint => total_sol_borrowed,
            _ => total_usdc_borrowed,
        };

        let liquidation_amount = total_borrowed
            .checked_mul(borrowed_bank.liquidation_close_factor.into())
            .ok_or(LendingError::Overflow)?
            .checked_div(MAX_BASIS_POINTS)
            .ok_or(LendingError::DivisionByZero)?;

        let borrowed_shares_to_remove = liquidation_amount
            .checked_mul(borrowed_bank.total_borrowed_shares)
            .ok_or(LendingError::Overflow)?
            .checked_div(borrowed_bank.total_borrowed)
            .ok_or(LendingError::DivisionByZero)?;

        let liquidation_amount_in_usd = get_total_in_usd(
            liquidation_amount,
            borrowed_mint_price,
            ctx.accounts.borrowed_mint.decimals,
        )? as u64;

        let collateral_amount_in_usd = (liquidation_amount_in_usd as f64)
            .mul((MAX_BASIS_POINTS as f64).add(collateral_bank.liquidation_bonus as f64))
            .div(MAX_BASIS_POINTS as f64);

        let collateral_amount = get_total_from_usd(
            collateral_amount_in_usd,
            collateral_mint_price,
            ctx.accounts.collateral_mint.decimals,
        )?;

        let collateral_shares_to_remove = collateral_amount
            .checked_mul(collateral_bank.total_deposit_shares)
            .ok_or(LendingError::Overflow)?
            .checked_div(collateral_bank.total_deposits)
            .ok_or(LendingError::DivisionByZero)?;

        borrowed_bank.total_borrowed = borrowed_bank
            .total_borrowed
            .checked_sub(liquidation_amount)
            .ok_or(LendingError::Underflow)?;

        borrowed_bank.total_borrowed_shares = borrowed_bank
            .total_borrowed_shares
            .checked_sub(borrowed_shares_to_remove)
            .ok_or(LendingError::Underflow)?;

        collateral_bank.total_deposits = collateral_bank
            .total_deposits
            .checked_sub(collateral_amount)
            .ok_or(LendingError::Underflow)?;

        collateral_bank.total_deposit_shares = collateral_bank
            .total_deposit_shares
            .checked_sub(collateral_shares_to_remove)
            .ok_or(LendingError::Underflow)?;

        match ctx.accounts.borrowed_mint.key() {
            key if key == user.usdc_mint => {
                user.borrowed_usdc = user
                    .borrowed_usdc
                    .checked_sub(liquidation_amount)
                    .ok_or(LendingError::Underflow)?;
                user.borrowed_usdc_shares = user
                    .borrowed_usdc_shares
                    .checked_sub(borrowed_shares_to_remove)
                    .ok_or(LendingError::Underflow)?;
            }
            _ => {
                user.borrowed_sol = user
                    .borrowed_sol
                    .checked_sub(liquidation_amount)
                    .ok_or(LendingError::Underflow)?;
                user.borrowed_sol_shares = user
                    .borrowed_sol_shares
                    .checked_sub(borrowed_shares_to_remove)
                    .ok_or(LendingError::Underflow)?;
            }
        };

        match ctx.accounts.collateral_mint.key() {
            key if key == user.usdc_mint => {
                user.deposited_usdc = user
                    .deposited_usdc
                    .checked_sub(collateral_amount)
                    .ok_or(LendingError::Underflow)?;
                user.deposited_usdc_shares = user
                    .deposited_usdc_shares
                    .checked_sub(collateral_shares_to_remove)
                    .ok_or(LendingError::Underflow)?;
            }
            _ => {
                user.deposited_sol = user
                    .deposited_sol
                    .checked_sub(collateral_amount)
                    .ok_or(LendingError::Underflow)?;
                user.deposited_sol_shares = user
                    .deposited_sol_shares
                    .checked_sub(collateral_shares_to_remove)
                    .ok_or(LendingError::Underflow)?;
            }
        };

        borrowed_bank.last_updated = clock.unix_timestamp;
        collateral_bank.last_updated = clock.unix_timestamp;
        user.last_updated = clock.unix_timestamp;

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program_b.to_account_info(),
                TransferChecked {
                    authority: ctx.accounts.liquidator.to_account_info(),
                    from: ctx.accounts.liquidator_borrowed_ata.to_account_info(),
                    to: ctx.accounts.borrowed_bank_ata.to_account_info(),
                    mint: ctx.accounts.borrowed_mint.to_account_info(),
                },
            ),
            liquidation_amount as u64,
            ctx.accounts.borrowed_mint.decimals,
        )?;

        let mint_key = &ctx.accounts.collateral_mint.key();

        let signer_seeds: &[&[&[u8]]] = &[&[
            TREASURY_SEED,
            mint_key.as_ref(),
            &[collateral_bank.bank_ata_bump],
        ]];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program_a.to_account_info(),
                TransferChecked {
                    authority: ctx.accounts.collateral_bank_ata.to_account_info(),
                    from: ctx.accounts.collateral_bank_ata.to_account_info(),
                    to: ctx.accounts.liquidator_collateral_ata.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                },
                signer_seeds,
            ),
            collateral_amount as u64,
            ctx.accounts.collateral_mint.decimals,
        )
    }
}
