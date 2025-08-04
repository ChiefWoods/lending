use anchor_lang::prelude::*;

use crate::{
    LastUpdate, NewLastUpdateArgs, NewObligationArgs, Obligation, Reserve, OBLIGATION_SEED,
    RESERVE_SEED,
};

#[derive(Accounts)]
pub struct InitializeObligation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [RESERVE_SEED, reserve.market.key().as_ref(), reserve.liquidity.mint.key().as_ref()],
        bump = reserve.bump,
    )]
    pub reserve: Account<'info, Reserve>,
    #[account(
        init,
        payer = authority,
        space = Obligation::DISCRIMINATOR.len() + Obligation::INIT_SPACE,
        seeds = [OBLIGATION_SEED, authority.key().as_ref(), reserve.market.key().as_ref()],
        bump
    )]
    pub obligation: Account<'info, Obligation>,
    pub system_program: Program<'info, System>,
}

impl InitializeObligation<'_> {
    pub fn handler(ctx: Context<InitializeObligation>) -> Result<()> {
        let InitializeObligation {
            obligation,
            reserve,
            authority,
            ..
        } = ctx.accounts;

        **obligation = Obligation::new(NewObligationArgs {
            authority: authority.key(),
            bump: ctx.bumps.obligation,
            last_update: LastUpdate::new(NewLastUpdateArgs {
                slot: Clock::get()?.slot,
            }),
            market: reserve.market.key(),
        });

        Ok(())
    }
}
