pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;
pub use utils::*;

declare_id!("DdjBM9scqgaLvE4iskb1cYqqJYFMScRXmi1xnvHPsANt");

#[program]
pub mod lending {
    use super::*;

    pub fn init_bank(ctx: Context<InitBank>, args: InitBankArgs) -> Result<()> {
        InitBank::handler(ctx, args)
    }

    pub fn update_bank(ctx: Context<UpdateBank>, args: UpdateBankArgs) -> Result<()> {
        UpdateBank::handler(ctx, args)
    }

    pub fn init_user(ctx: Context<InitUser>, usdc_mint: Pubkey) -> Result<()> {
        InitUser::handler(ctx, usdc_mint)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        Deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        Withdraw::handler(ctx, amount)
    }

    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        Borrow::handler(ctx, amount)
    }

    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        Repay::handler(ctx, amount)
    }

    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        Liquidate::handler(ctx)
    }
}
