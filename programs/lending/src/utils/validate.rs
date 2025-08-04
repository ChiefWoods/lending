use anchor_lang::prelude::*;

use crate::{error::LendingError, MAX_BASIS_POINTS};

pub fn validate_bps(bps: u16) -> Result<()> {
    require_gte!(MAX_BASIS_POINTS, bps, LendingError::InvalidBasisPoints);

    Ok(())
}

pub fn validate_reserve_refreshed(is_stale: bool) -> Result<()> {
    require!(!is_stale, LendingError::ReserveStale);

    Ok(())
}

pub fn validate_obligation_refreshed(is_stale: bool) -> Result<()> {
    require!(!is_stale, LendingError::ObligationStale);

    Ok(())
}
