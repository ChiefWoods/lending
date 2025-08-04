use anchor_lang::prelude::*;

use crate::{error::LendingError, validate_bps, Market, Reserve, MARKET_SEED, RESERVE_SEED};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct UpdateReserveArgs {
    pub optimal_utilization_rate_bps: Option<u16>,
    pub loan_to_value_bps: Option<u16>,
    pub liquidation_bonus_bps: Option<u16>,
    pub liquidation_threshold_bps: Option<u16>,
    pub liquidation_close_factor_bps: Option<u16>,
    pub min_borrow_rate_bps: Option<u16>,
    pub optimal_borrow_rate_bps: Option<u16>,
    pub max_borrow_rate_bps: Option<u16>,
    pub flash_loan_fee_bps: Option<u16>,
    pub platform_fee_bps: Option<u16>,
}

#[derive(Accounts)]
pub struct UpdateReserve<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [MARKET_SEED, market.name.as_bytes()],
        bump = market.bump,
        has_one = authority @ LendingError::InvalidMarketAuthority,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [RESERVE_SEED, market.key().as_ref(), reserve.liquidity.mint.key().as_ref()],
        bump = reserve.bump,
    )]
    pub reserve: Account<'info, Reserve>,
}

impl UpdateReserve<'_> {
    pub fn handler(ctx: Context<UpdateReserve>, args: UpdateReserveArgs) -> Result<()> {
        let UpdateReserveArgs {
            optimal_utilization_rate_bps,
            loan_to_value_bps,
            liquidation_bonus_bps,
            liquidation_threshold_bps,
            liquidation_close_factor_bps,
            min_borrow_rate_bps,
            optimal_borrow_rate_bps,
            max_borrow_rate_bps,
            flash_loan_fee_bps,
            platform_fee_bps,
        } = args;

        let reserve = &mut ctx.accounts.reserve;

        if let Some(optimal_utilization_rate_bps) = optimal_utilization_rate_bps {
            validate_bps(optimal_utilization_rate_bps)?;

            reserve.config.optimal_utilization_rate_bps = optimal_utilization_rate_bps;
        }

        if let Some(loan_to_value_bps) = loan_to_value_bps {
            validate_bps(loan_to_value_bps)?;

            reserve.config.loan_to_value_bps = loan_to_value_bps;
        }

        if let Some(liquidation_bonus_bps) = liquidation_bonus_bps {
            validate_bps(liquidation_bonus_bps)?;

            reserve.config.liquidation_bonus_bps = liquidation_bonus_bps;
        }

        if let Some(liquidation_threshold_bps) = liquidation_threshold_bps {
            validate_bps(liquidation_threshold_bps)?;

            reserve.config.liquidation_threshold_bps = liquidation_threshold_bps;
        }

        if let Some(liquidation_close_factor_bps) = liquidation_close_factor_bps {
            validate_bps(liquidation_close_factor_bps)?;

            reserve.config.liquidation_close_factor_bps = liquidation_close_factor_bps;
        }

        if let Some(min_borrow_rate_bps) = min_borrow_rate_bps {
            validate_bps(min_borrow_rate_bps)?;

            reserve.config.min_borrow_rate_bps = min_borrow_rate_bps;
        }

        if let Some(optimal_borrow_rate_bps) = optimal_borrow_rate_bps {
            validate_bps(optimal_borrow_rate_bps)?;

            reserve.config.optimal_borrow_rate_bps = optimal_borrow_rate_bps;
        }

        if let Some(max_borrow_rate_bps) = max_borrow_rate_bps {
            validate_bps(max_borrow_rate_bps)?;

            reserve.config.max_borrow_rate_bps = max_borrow_rate_bps;
        }

        if let Some(flash_loan_fee_bps) = flash_loan_fee_bps {
            validate_bps(flash_loan_fee_bps)?;

            reserve.config.fees.flash_loan_fee_bps = flash_loan_fee_bps;
        }

        if let Some(platform_fee_bps) = platform_fee_bps {
            validate_bps(platform_fee_bps)?;

            reserve.config.fees.platform_fee_bps = platform_fee_bps;
        }

        Ok(())
    }
}
