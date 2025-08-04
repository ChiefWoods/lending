#[macro_export]
macro_rules! reserve_signer {
    ($market_key: expr, $liquidity_mint_key: expr, $bump: expr) => {
        &[
            RESERVE_SEED,
            $market_key.as_ref(),
            $liquidity_mint_key.as_ref(),
            &[$bump],
        ]
    };
}
