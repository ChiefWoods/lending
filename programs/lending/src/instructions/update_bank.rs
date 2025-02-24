use anchor_lang::prelude::*;

use crate::{Bank, BANK_SEED};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateBankArgs {
    pub liquidation_threshold: Option<u16>,
    pub liquidation_bonus: Option<u16>,
    pub liquidation_close_factor: Option<u16>,
    pub max_ltv: Option<u16>,
    pub min_health_factor: Option<f64>,
    pub interest_rate: Option<u16>,
}

#[derive(Accounts)]
pub struct UpdateBank<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [BANK_SEED, bank.mint.key().as_ref()],
        bump = bank.bump,
        has_one = authority,
    )]
    pub bank: Account<'info, Bank>,
}

impl UpdateBank<'_> {
    pub fn update_bank(ctx: Context<UpdateBank>, args: UpdateBankArgs) -> Result<()> {
        let bank = &mut ctx.accounts.bank;

        if let Some(liquidation_threshold) = args.liquidation_threshold {
            bank.liquidation_threshold = liquidation_threshold;
        }

        if let Some(liquidation_bonus) = args.liquidation_bonus {
            bank.liquidation_bonus = liquidation_bonus;
        }

        if let Some(liquidation_close_factor) = args.liquidation_close_factor {
            bank.liquidation_close_factor = liquidation_close_factor;
        }

        if let Some(max_ltv) = args.max_ltv {
            bank.max_ltv = max_ltv;
        }

        if let Some(min_health_factor) = args.min_health_factor {
            bank.min_health_factor = min_health_factor;
        }

        if let Some(interest_rate) = args.interest_rate {
            bank.interest_rate = interest_rate;
        }

        bank.last_updated = Clock::get()?.unix_timestamp;

        Ok(())
    }
}
