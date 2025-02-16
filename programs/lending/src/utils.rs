use std::{
    f64::consts::E,
    ops::{Add, Div, Mul},
};

use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

use crate::{error::LendingError, Bank, User, MAXIMUM_AGE, MAX_BASIS_POINTS};

pub fn update_health_factor(
    bank: &Account<'_, Bank>,
    user: &mut Account<'_, User>,
    price_a: f64,
    price_b: f64,
    decimal_a: u8,
    decimal_b: u8,
) -> Result<()> {
    if user.borrowed_sol == 0 && user.borrowed_usdc == 0 {
        user.health_factor = u64::MAX;
        return Ok(());
    };

    let total_collateral_value = get_total_in_usd(user.deposited_sol, price_a, decimal_a)?
        .add(get_total_in_usd(user.deposited_usdc, price_b, decimal_b)?)
        as u64;

    let adjusted_collateral_value = total_collateral_value
        .checked_mul(bank.liquidation_threshold)
        .ok_or(LendingError::Overflow)?
        .checked_div(MAX_BASIS_POINTS)
        .ok_or(LendingError::Overflow)?;

    let total_borrowed_value = get_total_in_usd(user.borrowed_sol, price_a, decimal_a)?
        .add(get_total_in_usd(user.borrowed_usdc, price_b, decimal_b)?)
        as u64;

    user.health_factor = if total_borrowed_value == 0 {
        u64::MAX
    } else {
        adjusted_collateral_value
            .checked_mul(MAX_BASIS_POINTS)
            .ok_or(LendingError::Overflow)?
            .checked_div(total_borrowed_value)
            .ok_or(LendingError::Overflow)?
    };

    Ok(())
}

pub fn calculate_accrued_interest(
    amount_in_usd: u64,
    interest_rate: u64,
    current_time: i64,
    last_updated: i64,
) -> Result<u64> {
    let time_elapsed = current_time - last_updated;
    let interest_per_second_rate = interest_rate as f64 / 10000.0 / 31536000.0;
    let total_value =
        (amount_in_usd as f64 * E.powf(interest_per_second_rate * time_elapsed as f64)) as u64;

    Ok(total_value - amount_in_usd)
}

pub fn get_price_in_usd(
    input: &str,
    price_update: &Account<'_, PriceUpdateV2>,
    clock: &Clock,
) -> Result<f64> {
    let feed_id = get_feed_id_from_hex(input)?;
    let price = price_update.get_price_no_older_than(clock, MAXIMUM_AGE, &feed_id)?;
    let price_in_usd = price.price as f64 / 10u64.pow(price.exponent.unsigned_abs()) as f64;

    Ok(price_in_usd)
}

pub fn get_total_in_usd(amount: u64, price: f64, decimals: u8) -> Result<f64> {
    Ok((amount as f64)
        .mul(price)
        .div(10u64.pow(decimals.into()) as f64))
}

pub fn get_total_from_usd(usd: f64, price: f64, decimals: u8) -> Result<u64> {
    Ok((usd.div(price).mul(10u64.pow(decimals.into()) as f64)) as u64)
}
