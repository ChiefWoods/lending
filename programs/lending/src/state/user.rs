use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct User {
    /// Bump used for seed derivation
    pub bump: u8,
    /// Amount of SOL deposited
    pub deposited_sol: u64,
    /// Amount of SOL deposit shares
    pub deposited_sol_shares: u64,
    /// Amount of SOL borrowed
    pub borrowed_sol: u64,
    /// Amount of SOL borrowed shares
    pub borrowed_sol_shares: u64,
    /// Amount of USDC deposited
    pub deposited_usdc: u64,
    /// Amount of USDC deposit shares
    pub deposited_usdc_shares: u64,
    /// Amount of USDC borrowed
    pub borrowed_usdc: u64,
    /// Amount of USDC borrowed shares
    pub borrowed_usdc_shares: u64,
    /// Health factor of the user
    pub health_factor: f64,
    /// Timestamp when the user was last updated
    pub last_updated: i64,
    /// Address that has authority over the user account
    pub authority: Pubkey,
    /// Address of USDC mint
    pub usdc_mint: Pubkey,
}
