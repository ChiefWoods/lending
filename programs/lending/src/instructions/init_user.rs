use anchor_lang::{prelude::*, Discriminator};

use crate::{User, USER_SEED};

#[derive(Accounts)]
pub struct InitUser<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = User::DISCRIMINATOR.len() + User::INIT_SPACE,
        seeds = [USER_SEED, authority.key().as_ref()],
        bump,
    )]
    pub user: Account<'info, User>,
    pub system_program: Program<'info, System>,
}

impl InitUser<'_> {
    pub fn init_user(ctx: Context<InitUser>, usdc_mint: Pubkey) -> Result<()> {
        ctx.accounts.user.set_inner(User {
            bump: ctx.bumps.user,
            deposited_sol: 0,
            deposited_sol_shares: 0,
            borrowed_sol: 0,
            borrowed_sol_shares: 0,
            deposited_usdc: 0,
            deposited_usdc_shares: 0,
            borrowed_usdc: 0,
            borrowed_usdc_shares: 0,
            health_factor: 0.0,
            last_updated: Clock::get()?.unix_timestamp,
            authority: ctx.accounts.authority.key(),
            usdc_mint,
        });

        Ok(())
    }
}
