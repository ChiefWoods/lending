use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use fixed::types::I80F48;

use crate::{
    error::LendingError, validate_reserve_refreshed, Obligation, Reserve, SafeMath, SafeMathAssign,
    SafePow, ID, RECEIPT_MINT_SEED,
};

#[derive(Accounts)]
pub struct RefreshObligation<'info> {
    #[account(mut)]
    pub obligation: Account<'info, Obligation>,
}

impl RefreshObligation<'_> {
    pub fn handler(ctx: Context<RefreshObligation>) -> Result<()> {
        let obligation = &mut ctx.accounts.obligation;

        let slot = Clock::get()?.slot;
        let account_info_iter = &mut ctx.remaining_accounts.iter().peekable();

        let mut deposited_value = I80F48::ZERO;
        let mut borrowed_value = I80F48::ZERO;
        let mut weighted_allowed_borrow_value = I80F48::ZERO;
        let mut weighted_unhealthy_borrow_value = I80F48::ZERO;

        for obligation_collateral in obligation.deposits.iter_mut() {
            let deposit_reserve_info = next_account_info(account_info_iter)?;

            require_keys_eq!(
                *deposit_reserve_info.owner,
                ID,
                LendingError::InvalidAccountOwner
            );

            require_keys_eq!(
                obligation_collateral.reserve,
                deposit_reserve_info.key(),
                LendingError::InvalidReserve
            );

            let deposit_reserve =
                Reserve::try_deserialize(&mut deposit_reserve_info.data.borrow().as_ref())?;

            validate_reserve_refreshed(deposit_reserve.last_update.is_stale(slot)?)?;

            let receipt_mint_info = next_account_info(account_info_iter)?;
            let receipt_mint =
                Mint::try_deserialize(&mut receipt_mint_info.data.borrow().as_ref())?;

            let receipt_mint_key = Pubkey::create_program_address(
                &[
                    RECEIPT_MINT_SEED,
                    deposit_reserve_info.key().as_ref(),
                    &[deposit_reserve.receipt_mint_bump],
                ],
                &ID,
            )
            .unwrap();

            require_keys_eq!(
                receipt_mint_info.key(),
                receipt_mint_key,
                LendingError::InvalidReceiptMint
            );

            let exchange_rate = deposit_reserve
                .liquidity
                .receipt_exchange_rate(receipt_mint.supply)?;
            let liquidity_amount = deposit_reserve
                .liquidity
                .receipt_to_liquidity(obligation_collateral.deposited_amount, exchange_rate)?;
            let market_value = I80F48::from(liquidity_amount)
                .safe_mul(deposit_reserve.liquidity.market_price.into())?
                .safe_div(
                    10_u64
                        .safe_pow(deposit_reserve.liquidity_mint_decimals.into())?
                        .into(),
                )?;

            obligation_collateral.market_value = market_value.into();
            deposited_value.safe_add_assign(market_value)?;
            weighted_allowed_borrow_value.safe_add_assign(
                market_value.safe_mul(I80F48::from(deposit_reserve.config.loan_to_value_bps))?,
            )?;
            weighted_unhealthy_borrow_value.safe_add_assign(market_value.safe_mul(
                I80F48::from(deposit_reserve.config.liquidation_threshold_bps),
            )?)?;
        }

        for obligation_liquidity in obligation.borrows.iter_mut() {
            let borrow_reserve_info = next_account_info(account_info_iter)?;

            require_keys_eq!(
                *borrow_reserve_info.owner,
                ID,
                LendingError::InvalidAccountOwner
            );

            require_keys_eq!(
                obligation_liquidity.reserve,
                *borrow_reserve_info.key,
                LendingError::InvalidReserve
            );

            let borrow_reserve =
                Reserve::try_deserialize(&mut borrow_reserve_info.data.borrow().as_ref())?;

            validate_reserve_refreshed(borrow_reserve.last_update.is_stale(slot)?)?;

            obligation_liquidity
                .accrue_interest(borrow_reserve.liquidity.cumulative_borrow_index.into())?;

            let market_value = I80F48::from(obligation_liquidity.borrowed_amount)
                .safe_mul(borrow_reserve.liquidity.market_price.into())?
                .safe_div(
                    10_u64
                        .safe_pow(borrow_reserve.liquidity_mint_decimals.into())?
                        .into(),
                )?;

            obligation_liquidity.market_value = market_value.into();
            borrowed_value.safe_add_assign(market_value)?;
        }

        require!(
            account_info_iter.peek().is_none(),
            LendingError::TooManyAccounts
        );

        obligation.deposited_value = deposited_value.into();
        obligation.borrowed_value = borrowed_value.into();
        obligation.weighted_allowed_borrow_value = weighted_allowed_borrow_value.into();
        obligation.weighted_unhealthy_borrow_value = weighted_unhealthy_borrow_value.into();

        obligation.last_update.update_slot(slot);

        Ok(())
    }
}
