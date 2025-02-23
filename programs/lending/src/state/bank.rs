use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Bank {
    /// Bump used for seed derivation
    pub bump: u8,
    /// Bump used for bank_ata seed derivation
    pub bank_ata_bump: u8,
    /// Total amount of deposits in the bank
    pub total_deposits: u64,
    /// Total amount of deposit shares in the bank
    pub total_deposit_shares: u64,
    /// Total amount of borrows in the bank
    pub total_borrowed: u64,
    /// Total amount of borrowed shares in the bank
    pub total_borrowed_shares: u64,
    /// /// LTV at which the loan is defined as under collateralized and can be liquidated in basis points
    pub liquidation_threshold: u16,
    /// Bonus percentage of collateral that can be liquidated in basis points
    pub liquidation_bonus: u16,
    /// Percentage of collateral that can be liquidated in basis points
    pub liquidation_close_factor: u16,
    /// Max percentage of collateral that can be borrowed in basis points
    pub max_ltv: u16,
    /// Minimum health factor at which the loan can be liquidated
    pub min_health_factor: f64,
    /// Interest rate for deposits and borrows in basis points
    pub interest_rate: u16,
    /// Timestamp when the bank was last updated
    pub last_updated: i64,
    /// Address that has authority over the bank account
    pub authority: Pubkey,
    /// Address of the bank mint
    pub mint: Pubkey,
}
