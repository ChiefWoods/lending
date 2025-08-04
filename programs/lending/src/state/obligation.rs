use std::cmp::Ordering;

use anchor_lang::prelude::*;
use fixed::types::I80F48;

use crate::{
    error::LendingError, LastUpdate, SafeConvert, SafeMath, SafeMathAssign, WrappedI80F48,
};

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default)]
pub struct ObligationCollateral {
    /// Reserve where collateral is deposited to.
    pub reserve: Pubkey,
    /// Amount of collateral deposited.
    pub deposited_amount: u64,
    /// Last refreshed value of deposited collateral.
    pub market_value: WrappedI80F48,
}

impl ObligationCollateral {
    pub fn deposit(&mut self, collateral_amount: u64) -> Result<()> {
        self.deposited_amount.safe_add_assign(collateral_amount)
    }

    pub fn withdraw(&mut self, collateral_amount: u64) -> Result<()> {
        self.deposited_amount.safe_sub_assign(collateral_amount)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default)]
pub struct ObligationLiquidity {
    /// Reserve where liquidity is borrowed from.
    pub reserve: Pubkey,
    /// Amount of liquidity borrowed plus interest.
    pub borrowed_amount: u64,
    /// Index that tracks cumulative borrow interest. Follows the reserve's cumulative borrow interest index and updates on refreshes.
    pub cumulative_borrow_index: WrappedI80F48,
    /// Last refreshed value of borrowed liquidity.
    pub market_value: WrappedI80F48,
}

impl ObligationLiquidity {
    pub fn accrue_interest(&mut self, cumulative_borrow_index: I80F48) -> Result<()> {
        match cumulative_borrow_index.cmp(&self.cumulative_borrow_index.into()) {
            Ordering::Less => return err!(LendingError::NegativeInterestRate),
            Ordering::Equal => {}
            Ordering::Greater => {
                let borrowed_amount = cumulative_borrow_index
                    .safe_mul(self.borrowed_amount.into())?
                    .safe_div(self.cumulative_borrow_index.into())?
                    .ceil()
                    .safe_to_u64()?;

                if borrowed_amount == self.borrowed_amount {
                    msg!("no borrow interest accrued after rounding");
                } else {
                    self.borrowed_amount = borrowed_amount;
                }

                self.cumulative_borrow_index = cumulative_borrow_index.into();
            }
        }

        Ok(())
    }

    pub fn borrow(&mut self, liquidity_amount: u64) -> Result<()> {
        self.borrowed_amount.safe_add_assign(liquidity_amount)
    }

    pub fn repay(&mut self, liquidity_amount: u64) -> Result<()> {
        self.borrowed_amount.safe_sub_assign(liquidity_amount)
    }
}

// Obligations track the collateral and borrowed liquidity for a given user in a market
#[account]
#[derive(InitSpace)]
pub struct Obligation {
    pub last_update: LastUpdate,
    /// Address of market.
    pub market: Pubkey,
    /// Address which can deposit collateral and borrow liquidity.
    pub authority: Pubkey,
    /// Deposited collateral for the obligation, unique by deposit reserve address
    #[max_len(5)]
    pub deposits: Vec<ObligationCollateral>,
    /// Borrowed liquidity for the obligation, unique by borrow reserve address
    #[max_len(5)]
    pub borrows: Vec<ObligationLiquidity>,
    /// Last refreshed value of deposits.
    pub deposited_value: WrappedI80F48,
    /// Last refreshed value of borrows.
    pub borrowed_value: WrappedI80F48,
    /// Maximum borrow value at the weighted average loan to value ratio.
    pub weighted_allowed_borrow_value: WrappedI80F48,
    /// Borrow value at which the obligation becomes eligible for liquidation.
    pub weighted_unhealthy_borrow_value: WrappedI80F48,
    /// Bump used for deriving signer seeds.
    pub bump: u8,
}

pub struct NewObligationArgs {
    pub last_update: LastUpdate,
    pub market: Pubkey,
    pub authority: Pubkey,
    pub bump: u8,
}

impl Obligation {
    pub fn new(args: NewObligationArgs) -> Self {
        Self {
            weighted_allowed_borrow_value: I80F48::ZERO.into(),
            authority: args.authority,
            borrowed_value: I80F48::ZERO.into(),
            borrows: Vec::new(),
            bump: args.bump,
            deposited_value: I80F48::ZERO.into(),
            deposits: Vec::new(),
            last_update: args.last_update,
            market: args.market,
            weighted_unhealthy_borrow_value: I80F48::ZERO.into(),
        }
    }

    fn find_collateral_index_in_deposits(&self, deposit_reserve: Pubkey) -> Option<usize> {
        self.deposits
            .iter()
            .position(|collateral| collateral.reserve == deposit_reserve)
    }

    pub fn find_or_add_collateral_to_deposits(
        &mut self,
        deposit_reserve: Pubkey,
    ) -> Result<&mut ObligationCollateral> {
        if let Some(index) = self.find_collateral_index_in_deposits(deposit_reserve) {
            Ok(&mut self.deposits[index])
        } else {
            let collateral = ObligationCollateral {
                deposited_amount: 0,
                reserve: deposit_reserve,
                market_value: I80F48::ZERO.into(),
            };

            self.deposits.push(collateral);

            Ok(self.deposits.last_mut().unwrap())
        }
    }

    pub fn withdraw(&mut self, withdraw_amount: u64, index: usize) -> Result<()> {
        let obligation_collateral = &mut self.deposits[index];

        if withdraw_amount == obligation_collateral.deposited_amount {
            self.deposits.remove(index);
        } else {
            obligation_collateral.withdraw(withdraw_amount)?;
        }

        Ok(())
    }

    pub fn repay(&mut self, repay_amount: u64, index: usize) -> Result<()> {
        let liquidity = &mut self.borrows[index];

        if repay_amount == liquidity.borrowed_amount {
            self.borrows.remove(index);
        } else {
            liquidity.repay(repay_amount)?;
        }

        Ok(())
    }

    pub fn find_collateral_in_deposits(
        &self,
        deposit_reserve: Pubkey,
    ) -> Result<(&ObligationCollateral, usize)> {
        require!(
            !self.deposits.is_empty(),
            LendingError::ObligationDepositsEmpty
        );

        let collateral_index = self
            .find_collateral_index_in_deposits(deposit_reserve)
            .ok_or(LendingError::InvalidObligationCollateral)?;

        Ok((&self.deposits[collateral_index], collateral_index))
    }

    fn find_liquidity_index_in_borrows(&self, borrow_reserve: Pubkey) -> Option<usize> {
        self.borrows
            .iter()
            .position(|liquidity| liquidity.reserve == borrow_reserve)
    }

    pub fn find_or_add_liquidity_to_borrows(
        &mut self,
        borrow_reserve: Pubkey,
    ) -> Result<&mut ObligationLiquidity> {
        if let Some(liquidity_index) = self.find_liquidity_index_in_borrows(borrow_reserve) {
            return Ok(&mut self.borrows[liquidity_index]);
        }

        let liquidity = ObligationLiquidity {
            borrowed_amount: 0,
            cumulative_borrow_index: I80F48::ONE.into(),
            market_value: I80F48::ZERO.into(),
            reserve: borrow_reserve,
        };

        self.borrows.push(liquidity);

        Ok(self.borrows.last_mut().unwrap())
    }

    pub fn find_liquidity_in_borrows(
        &self,
        borrow_reserve: Pubkey,
    ) -> Result<(&ObligationLiquidity, usize)> {
        require!(
            !self.borrows.is_empty(),
            LendingError::ObligationBorrowsEmpty
        );

        let liquidity_index = self
            .find_liquidity_index_in_borrows(borrow_reserve)
            .ok_or(LendingError::InvalidObligationLiquidity)?;

        Ok((&self.borrows[liquidity_index], liquidity_index))
    }

    pub fn remaining_borrow_value(&self) -> Result<I80F48> {
        I80F48::from(self.weighted_allowed_borrow_value).safe_sub(self.borrowed_value.into())
    }

    pub fn max_withdraw_value(&self, withdraw_collateral_ltv: I80F48) -> Result<I80F48> {
        if self.weighted_allowed_borrow_value <= self.borrowed_value {
            Ok(I80F48::ZERO)
        } else if withdraw_collateral_ltv == I80F48::ZERO {
            Ok(self.deposited_value.into())
        } else {
            Ok(self
                .remaining_borrow_value()?
                .safe_div(withdraw_collateral_ltv)?)
        }
    }

    pub fn max_liquidation_amount(
        &self,
        obligation_liquidity: &ObligationLiquidity,
        liquidation_close_factor: I80F48,
    ) -> Result<I80F48> {
        let max_liquidation_value = liquidation_close_factor
            .safe_mul(self.borrowed_value.into())?
            .min(obligation_liquidity.market_value.into());
        let max_liquidation_ratio =
            max_liquidation_value.safe_div(obligation_liquidity.market_value.into())?;
        max_liquidation_ratio.safe_mul(obligation_liquidity.borrowed_amount.into())
    }
}
