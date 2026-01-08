use std::cmp::Ordering;

use anchor_lang::prelude::*;
use fixed::types::I80F48;

use crate::{
    bps_to_i80f48, error::LendingError, i80f48_pow, LastUpdate, Obligation, ObligationCollateral,
    ObligationLiquidity, SafeConvert, SafeMath, SafeMathAssign, WrappedI80F48, MAX_BASIS_POINTS,
    SLOTS_PER_YEAR,
};

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone)]
pub struct ReserveFees {
    /// Flat percentage fee taken from flash loaned amount, in basis points.
    pub flash_loan_fee_bps: u16,
    /// Portion of borrow interest and flash loan fee that goes to the market authority before distributed to lenders, in basis points.
    pub platform_fee_bps: u16,
}

pub struct NewReserveFeesArgs {
    pub flash_loan_fee_bps: u16,
    pub platform_fee_bps: u16,
}

impl ReserveFees {
    pub fn new(args: NewReserveFeesArgs) -> Self {
        Self {
            flash_loan_fee_bps: args.flash_loan_fee_bps,
            platform_fee_bps: args.platform_fee_bps,
        }
    }

    pub fn calculate_flash_loan_fee(&self, amount: u64) -> Result<u64> {
        Ok(I80F48::from(amount)
            .safe_mul(bps_to_i80f48(
                self.flash_loan_fee_bps.safe_add(self.platform_fee_bps)?,
            )?)?
            .ceil()
            .safe_to_u64()?)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone)]
pub struct ReserveConfig {
    /// Optimal utilization rate, in basis points.
    pub optimal_utilization_rate_bps: u16,
    /// Target ratio of the value of borrows to deposits, in basis points. '0' if use as collateral is disabled.
    pub loan_to_value_bps: u16,
    /// Bonus a liquidator gets when repaying part of an unhealthy obligation, in basis points.
    pub liquidation_bonus_bps: u16,
    /// Loan to value ratio at which an obligation can be liquidated, in basis points.
    pub liquidation_threshold_bps: u16,
    /// Max portion of an obligation that can be liquidated at once, in basis points.
    pub liquidation_close_factor_bps: u16,
    /// Min borrow APY, in basis points.
    pub min_borrow_rate_bps: u16,
    /// Optimal (utilization) borrow APY, in basis points.
    pub optimal_borrow_rate_bps: u16,
    /// Max borrow APY, in basis points.
    pub max_borrow_rate_bps: u16,
    /// Program owner fees assessed, separate from gains due to interest accrual.
    pub fees: ReserveFees,
}

pub struct NewReserveConfigArgs {
    pub optimal_utilization_rate_bps: u16,
    pub loan_to_value_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub liquidation_threshold_bps: u16,
    pub liquidation_close_factor_bps: u16,
    pub min_borrow_rate_bps: u16,
    pub optimal_borrow_rate_bps: u16,
    pub max_borrow_rate_bps: u16,
    pub fees: ReserveFees,
}

impl ReserveConfig {
    pub fn new(args: NewReserveConfigArgs) -> Self {
        Self {
            optimal_utilization_rate_bps: args.optimal_utilization_rate_bps,
            loan_to_value_bps: args.loan_to_value_bps,
            liquidation_bonus_bps: args.liquidation_bonus_bps,
            liquidation_threshold_bps: args.liquidation_threshold_bps,
            liquidation_close_factor_bps: args.liquidation_close_factor_bps,
            min_borrow_rate_bps: args.min_borrow_rate_bps,
            optimal_borrow_rate_bps: args.optimal_borrow_rate_bps,
            max_borrow_rate_bps: args.max_borrow_rate_bps,
            fees: args.fees,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone)]
pub struct ReserveLiquidity {
    /// Mint of the liquidity token.
    pub mint: Pubkey,
    /// Pyth PriceUpdateV2
    pub price_update_v2: Pubkey,
    /// Total liquidity deposited available for borrowing.
    ///
    /// Increases with deposits, decreases with borrows. Increases with repayments to account for interest.
    pub available_amount: u64,
    /// Total liquidity borrowed.
    ///
    /// Increases with borrows, decreases with repayments.
    pub borrowed_amount: u64,
    /// Index that tracks cumulative borrow interest. Changes with utilization rate.
    pub cumulative_borrow_index: WrappedI80F48,
    /// Total claimable fees accumulated to the platform.
    pub accumulated_platform_fees: u64,
    /// Last refreshed price of reserve mint.
    pub market_price: WrappedI80F48,
}

pub struct NewReserveLiquidityArgs {
    pub mint: Pubkey,
    pub price_update_v2: Pubkey,
}

impl ReserveLiquidity {
    pub fn new(args: NewReserveLiquidityArgs) -> Self {
        Self {
            mint: args.mint,
            price_update_v2: args.price_update_v2,
            available_amount: 0,
            borrowed_amount: 0,
            cumulative_borrow_index: I80F48::ONE.into(),
            accumulated_platform_fees: 0,
            market_price: I80F48::ZERO.into(),
        }
    }

    pub fn total_supply(&self) -> Result<u64> {
        Ok(self.available_amount.safe_add(self.borrowed_amount)?)
    }

    pub fn receipt_exchange_rate(&self, mint_supply: u64) -> Result<I80F48> {
        let total_supply = self.total_supply()?;

        if total_supply == 0 || mint_supply == 0 {
            Ok(I80F48::ONE)
        } else {
            I80F48::from(mint_supply).safe_div(total_supply.into())
        }
    }

    pub fn receipt_to_liquidity(
        &self,
        receipt_mint_amount: u64,
        exchange_rate: I80F48,
    ) -> Result<u64> {
        Ok(I80F48::from(receipt_mint_amount)
            .safe_div(exchange_rate)?
            .floor()
            .to_num::<u64>())
    }

    pub fn liquidity_to_receipt(
        &self,
        liquidity_amount: u64,
        exchange_rate: I80F48,
    ) -> Result<u64> {
        Ok(I80F48::from(liquidity_amount)
            .safe_mul(exchange_rate)?
            .ceil()
            .to_num::<u64>())
    }

    pub fn utilization_rate(&self) -> Result<I80F48> {
        let supplied_amount = self.available_amount;

        if supplied_amount == 0 {
            Ok(I80F48::ZERO)
        } else {
            I80F48::from(self.borrowed_amount).safe_div(supplied_amount.into())
        }
    }

    pub fn deposit_liquidity(
        &mut self,
        liquidity_amount: u64,
        receipt_mint_supply: u64,
    ) -> Result<u64> {
        let exchange_rate = self.receipt_exchange_rate(receipt_mint_supply)?;
        let receipt_mint_amount = self.liquidity_to_receipt(liquidity_amount, exchange_rate)?;

        self.available_amount.safe_add_assign(liquidity_amount)?;

        Ok(receipt_mint_amount)
    }

    pub fn redeem_receipt(
        &mut self,
        receipt_mint_amount: u64,
        receipt_mint_supply: u64,
    ) -> Result<u64> {
        let exchange_rate = self.receipt_exchange_rate(receipt_mint_supply)?;
        let liquidity_amount = self.receipt_to_liquidity(receipt_mint_amount, exchange_rate)?;

        require!(
            liquidity_amount <= self.available_amount - self.borrowed_amount,
            LendingError::InsufficientLiquidity,
        );

        self.available_amount.safe_sub_assign(liquidity_amount)?;

        Ok(liquidity_amount)
    }

    pub fn borrow_liquidity(&mut self, borrow_amount: u64) -> Result<()> {
        require!(
            borrow_amount <= self.available_amount,
            LendingError::InsufficientLiquidity,
        );

        self.available_amount.safe_sub_assign(borrow_amount)?;
        self.borrowed_amount.safe_add_assign(borrow_amount)?;

        Ok(())
    }

    pub fn repay_liquidity(&mut self, repay_amount: u64) -> Result<()> {
        // net available amount increases with borrow interest accrued
        self.available_amount.safe_add_assign(repay_amount)?;
        self.borrowed_amount.safe_sub_assign(repay_amount)?;

        Ok(())
    }

    pub fn redeem_fees(&mut self) -> Result<u64> {
        let redeemable_fees = self.accumulated_platform_fees.min(self.available_amount);

        // net available amount decreases when fees are redeemed
        self.available_amount.safe_sub_assign(redeemable_fees)?;
        self.accumulated_platform_fees
            .safe_sub_assign(redeemable_fees)?;

        Ok(redeemable_fees)
    }
}

/// Reserves represent a mint of liquidity that can be supplied and borrowed that is unique to a market.
#[account]
#[derive(InitSpace)]
pub struct Reserve {
    pub market: Pubkey,
    pub last_update: LastUpdate,
    pub liquidity: ReserveLiquidity,
    pub config: ReserveConfig,
    /// Stored to avoid passing liquidity mint accounts on refresh obligation
    pub liquidity_mint_decimals: u8,
    pub bump: u8,
    pub receipt_mint_bump: u8,
}

pub struct NewReserveArgs {
    pub market: Pubkey,
    pub last_update: LastUpdate,
    pub liquidity: ReserveLiquidity,
    pub config: ReserveConfig,
    pub bump: u8,
    pub receipt_mint_bump: u8,
    pub slot: u64,
}

impl Reserve {
    fn current_borrow_rate(&self) -> Result<I80F48> {
        let utilization_rate = self.liquidity.utilization_rate()?;
        let optimal_utilization_rate = bps_to_i80f48(self.config.optimal_utilization_rate_bps)?;

        if utilization_rate < optimal_utilization_rate
            || self.config.optimal_utilization_rate_bps == MAX_BASIS_POINTS
        {
            let normalized_rate = utilization_rate.safe_div(optimal_utilization_rate)?;
            let min_rate = bps_to_i80f48(self.config.min_borrow_rate_bps)?;
            let rate_range = bps_to_i80f48(
                self.config
                    .optimal_borrow_rate_bps
                    .safe_sub(self.config.min_borrow_rate_bps)?,
            )?;

            Ok(normalized_rate.safe_mul(rate_range)?.safe_add(min_rate)?)
        } else {
            let normalized_rate = utilization_rate
                .safe_sub(optimal_utilization_rate)?
                .safe_div(bps_to_i80f48(
                    MAX_BASIS_POINTS.safe_sub(self.config.optimal_utilization_rate_bps)?,
                )?)?;
            let min_rate = bps_to_i80f48(self.config.optimal_borrow_rate_bps)?;
            let rate_range = bps_to_i80f48(
                self.config
                    .max_borrow_rate_bps
                    .safe_sub(self.config.optimal_borrow_rate_bps)?,
            )?;

            Ok(normalized_rate.safe_mul(rate_range)?.safe_add(min_rate)?)
        }
    }

    fn compound_interest_rate(&self, current_rate: I80F48, slots_elapsed: u64) -> Result<I80F48> {
        let slot_interest_rate = current_rate.safe_div(SLOTS_PER_YEAR.into())?;
        let base_interest_rate = I80F48::ONE.safe_add(slot_interest_rate)?;
        let compounded_interest_rate = i80f48_pow(base_interest_rate, slots_elapsed)?;

        Ok(compounded_interest_rate)
    }

    pub fn accrue_interest_and_fees(&mut self, current_slot: u64) -> Result<()> {
        let slots_elapsed = self.last_update.slots_elapsed(current_slot)?;

        if slots_elapsed > 0 {
            self.last_update.update_slot(current_slot);
            let current_borrow_rate = self.current_borrow_rate()?;
            let old_borrowed_amount = self.liquidity.borrowed_amount;

            let compounded_interest_rate =
                self.compound_interest_rate(current_borrow_rate, slots_elapsed)?;
            self.liquidity.cumulative_borrow_index = compounded_interest_rate
                .safe_mul(self.liquidity.cumulative_borrow_index.into())?
                .into();
            self.liquidity.borrowed_amount = compounded_interest_rate
                .safe_mul(self.liquidity.borrowed_amount.into())?
                .ceil()
                .safe_to_u64()?;

            let new_debt = self
                .liquidity
                .borrowed_amount
                .safe_sub(old_borrowed_amount)?;

            let platform_fee = I80F48::from(new_debt)
                .safe_mul(bps_to_i80f48(self.config.fees.platform_fee_bps)?)?
                .ceil()
                .safe_to_u64()?;

            self.liquidity
                .accumulated_platform_fees
                .safe_add_assign(platform_fee)?;
        }

        Ok(())
    }

    pub fn calculate_borrow(&self, amount_to_borrow: u64, max_borrow_value: I80F48) -> Result<u64> {
        if amount_to_borrow == u64::MAX {
            let borrow_amount = max_borrow_value
                .safe_div(self.liquidity.market_price.into())?
                .floor()
                .safe_to_u64()?
                .min(self.liquidity.available_amount);

            Ok(borrow_amount)
        } else {
            let borrow_value =
                I80F48::from(amount_to_borrow).safe_mul(self.liquidity.market_price.into())?;

            require!(
                borrow_value <= max_borrow_value,
                LendingError::BorrowTooLarge,
            );

            Ok(amount_to_borrow)
        }
    }

    pub fn calculate_repay(&self, amount_to_repay: u64, borrowed_amount: u64) -> Result<u64> {
        let repay_amount = if amount_to_repay == u64::MAX {
            borrowed_amount
        } else {
            amount_to_repay.min(borrowed_amount)
        };

        Ok(repay_amount)
    }

    pub fn calculate_liquidation(
        &self,
        obligation: &Obligation,
        obligation_liquidity: &ObligationLiquidity,
        obligation_collateral: &ObligationCollateral,
    ) -> Result<(u64, u64)> {
        let bonus_rate = I80F48::ONE.safe_add(bps_to_i80f48(self.config.liquidation_bonus_bps)?)?;

        let repay_amount: u64;
        let withdraw_amount: u64;

        let liquidation_amount = obligation
            .max_liquidation_amount(
                obligation_liquidity,
                bps_to_i80f48(self.config.liquidation_close_factor_bps)?,
            )?
            .min(obligation_liquidity.borrowed_amount.into());
        let liquidation_ratio =
            liquidation_amount.safe_div(obligation_liquidity.borrowed_amount.into())?;
        let liquidation_value = liquidation_ratio
            .safe_mul(obligation_liquidity.market_value.into())?
            .safe_mul(bonus_rate)?;

        match liquidation_value.cmp(&obligation_collateral.market_value.into()) {
            Ordering::Greater => {
                let repay_ratio =
                    I80F48::from(obligation_collateral.market_value).safe_div(liquidation_value)?;
                repay_amount = liquidation_amount
                    .safe_mul(repay_ratio)?
                    .ceil()
                    .safe_to_u64()?;
                withdraw_amount = obligation_collateral.deposited_amount;
            }
            Ordering::Equal => {
                repay_amount = liquidation_amount.ceil().safe_to_u64()?;
                withdraw_amount = obligation_collateral.deposited_amount;
            }
            Ordering::Less => {
                repay_amount = liquidation_amount.ceil().safe_to_u64()?;
                let withdraw_ratio =
                    liquidation_value.safe_div(obligation_collateral.market_value.into())?;
                withdraw_amount = withdraw_ratio
                    .safe_mul(obligation_collateral.deposited_amount.into())?
                    .floor()
                    .safe_to_u64()?;
            }
        }

        Ok((repay_amount, withdraw_amount))
    }
}
