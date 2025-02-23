use anchor_lang::{prelude::*, Discriminator};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{Bank, BANK_SEED, TREASURY_SEED};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitBankArgs {
    pub liquidation_threshold: u16,
    pub liquidation_bonus: u16,
    pub liquidation_close_factor: u16,
    pub max_ltv: u16,
    pub min_health_factor: f64,
    pub interest_rate: u16,
}

#[derive(Accounts)]
pub struct InitBank<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Bank::DISCRIMINATOR.len() + Bank::INIT_SPACE,
        seeds = [BANK_SEED, mint.key().as_ref()],
        bump,
    )]
    pub bank: Account<'info, Bank>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        seeds = [TREASURY_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = bank_ata,
        token::token_program = token_program,
    )]
    pub bank_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl InitBank<'_> {
    pub fn init_bank(ctx: Context<InitBank>, args: InitBankArgs) -> Result<()> {
        ctx.accounts.bank.set_inner(Bank {
            bump: ctx.bumps.bank,
            bank_ata_bump: ctx.bumps.bank_ata,
            total_deposits: 0,
            total_deposit_shares: 0,
            total_borrowed: 0,
            total_borrowed_shares: 0,
            liquidation_threshold: args.liquidation_threshold,
            liquidation_bonus: args.liquidation_bonus,
            liquidation_close_factor: args.liquidation_close_factor,
            max_ltv: args.max_ltv,
            min_health_factor: args.min_health_factor,
            interest_rate: args.interest_rate,
            last_updated: Clock::get()?.unix_timestamp,
            authority: ctx.accounts.authority.key(),
            mint: ctx.accounts.mint.key(),
        });

        Ok(())
    }
}
