use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::{error::LendingError, Reserve, ORACLE_MAX_AGE};

#[derive(Accounts)]
pub struct RefreshReserve<'info> {
    #[account(mut)]
    pub reserve: Account<'info, Reserve>,
    #[account(
        address = reserve.liquidity.price_update_v2 @ LendingError::InvalidPriceUpdateV2
    )]
    pub price_update_v2: Account<'info, PriceUpdateV2>,
}

impl RefreshReserve<'_> {
    pub fn handler(ctx: Context<RefreshReserve>) -> Result<()> {
        let RefreshReserve {
            reserve,
            price_update_v2,
        } = ctx.accounts;

        let clock = Clock::get()?;

        let price = price_update_v2.get_price_no_older_than(
            &clock,
            ORACLE_MAX_AGE.into(),
            &price_update_v2.price_message.feed_id,
        )?;

        reserve.liquidity.market_price = price.try_into()?;
        reserve.accrue_interest_and_fees(clock.slot)?;
        reserve.last_update.update_slot(clock.slot);

        Ok(())
    }
}
