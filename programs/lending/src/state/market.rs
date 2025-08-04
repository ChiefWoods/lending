use anchor_lang::prelude::*;

/// Markets are group of reserves which may be borrowed against and supplied to.
#[account]
#[derive(InitSpace)]
pub struct Market {
    /// Address which can add new reserves.
    pub authority: Pubkey,
    /// Used for deriving signer seeds.
    pub bump: u8,
    /// Name of market
    #[max_len(0)] // used only for InitSpace.
    pub name: String,
}

impl Market {
    pub fn space(name: &str) -> usize {
        Market::DISCRIMINATOR.len() + Market::INIT_SPACE + name.len()
    }
}
