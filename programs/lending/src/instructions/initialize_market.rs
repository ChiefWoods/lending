use anchor_lang::prelude::*;

use crate::{Market, MARKET_SEED};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Market::space(name.as_str()),
        seeds = [MARKET_SEED, name.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
    pub system_program: Program<'info, System>,
}

impl InitializeMarket<'_> {
    pub fn handler(ctx: Context<InitializeMarket>, name: String) -> Result<()> {
        let InitializeMarket {
            market, authority, ..
        } = ctx.accounts;

        market.set_inner(Market {
            bump: ctx.bumps.market,
            authority: authority.key(),
            name,
        });

        Ok(())
    }
}
