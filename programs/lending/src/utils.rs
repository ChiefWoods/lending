use std::{
    f64::consts::E,
    ops::{Add, Div, Mul},
};

use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

use crate::{User, MAXIMUM_AGE, MAX_BASIS_POINTS};

pub fn calculate_health_factor(
    liquidation_threshold: u16,
    user: &mut Account<'_, User>,
    sol_price: f64,
    usdc_price: f64,
    sol_decimal: u8,
    usdc_decimal: u8,
) -> Result<f64> {
    if user.borrowed_sol == 0 && user.borrowed_usdc == 0 {
        return Ok(f64::MAX);
    };

    let total_collateral_in_usd = get_total_in_usd(user.deposited_sol, sol_price, sol_decimal)?
        .add(get_total_in_usd(
            user.deposited_usdc,
            usdc_price,
            usdc_decimal,
        )?);

    let adjusted_collateral_in_usd = total_collateral_in_usd
        .mul(liquidation_threshold as f64)
        .div(MAX_BASIS_POINTS as f64);

    let total_borrowed_in_usd = get_total_in_usd(user.borrowed_sol, sol_price, sol_decimal)?.add(
        get_total_in_usd(user.borrowed_usdc, usdc_price, usdc_decimal)?,
    );

    if total_borrowed_in_usd == 0.0 {
        Ok(f64::MAX)
    } else {
        Ok(adjusted_collateral_in_usd.div(total_borrowed_in_usd as f64))
    }
}

pub fn calculate_accrued_interest(
    amount_in_usd: u64,
    interest_rate: u16,
    current_time: i64,
    last_updated: i64,
) -> Result<u64> {
    let time_elapsed = current_time - last_updated;
    let interest_per_second_rate = interest_rate as u64 / MAX_BASIS_POINTS / (60 * 60 * 24 * 365);
    let total_value = (amount_in_usd as f64
        * E.powf(interest_per_second_rate as f64 * time_elapsed as f64))
        as u64;

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
