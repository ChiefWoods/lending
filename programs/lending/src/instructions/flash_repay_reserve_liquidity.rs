use crate::{
    error::LendingError, BpfInstructionLoader, InstructionLoader, Market, Reserve, ID, MARKET_SEED,
    RESERVE_SEED,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use core::mem::size_of;

#[derive(Accounts)]
pub struct FlashRepayReserveLiquidity<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: no deserialization needed
    pub market_authority: UncheckedAccount<'info>,
    #[account(
        seeds = [MARKET_SEED, market.name.as_bytes()],
        bump = market.bump,
        constraint = market.authority.key() == market_authority.key() @ LendingError::InvalidMarketAuthority,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [RESERVE_SEED, reserve.market.key().as_ref(), liquidity_mint.key().as_ref()],
        bump = reserve.bump,
    )]
    pub reserve: Account<'info, Reserve>,
    pub liquidity_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = liquidity_mint,
        associated_token::authority = reserve
    )]
    pub reserve_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = liquidity_mint,
        associated_token::authority = market_authority,
        associated_token::token_program = liquidity_token_program
    )]
    pub market_authority_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub liquidity_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: Instruction sysvar
    #[account(address = sysvar::instructions::ID)]
    pub instruction_sysvar: UncheckedAccount<'info>,
}

impl FlashRepayReserveLiquidity<'_> {
    pub fn handler(
        ctx: Context<FlashRepayReserveLiquidity>,
        repay_amount: u64,
        borrow_ix_index: u8,
    ) -> Result<()> {
        // check borrow ix
        // transfer fee
        // transfer repay amount
        let FlashRepayReserveLiquidity {
            instruction_sysvar,
            reserve,
            authority,
            authority_token_account,
            liquidity_mint,
            liquidity_token_program,
            reserve_token_account,
            market_authority_token_account,
            ..
        } = ctx.accounts;

        let instruction_loader = BpfInstructionLoader {
            instruction_sysvar_account_info: &instruction_sysvar.to_account_info(),
        };
        let current_index: usize = instruction_loader.load_current_index()?.into();

        if current_index < borrow_ix_index as usize {
            return Err(LendingError::InvalidFlashRepayInstructionData.into());
        }

        let borrow_ix = instruction_loader.load_instruction_at(borrow_ix_index as usize)?;

        require!(
            borrow_ix.program_id == ID,
            LendingError::InvalidFlashRepayProgramId
        );

        let borrow_discriminator = crate::instruction::FlashBorrowReserveLiquidity::DISCRIMINATOR;

        require!(
            borrow_ix.data[0..borrow_discriminator.len()].eq(borrow_discriminator),
            LendingError::InvalidBorrowInstructionIndex
        );

        require_keys_eq!(
            reserve.key(),
            borrow_ix.accounts[1].pubkey,
            LendingError::InvalidFlashRepayReserve
        );

        let borrowed_amount = u64::from_le_bytes(
            borrow_ix.data[8..8 + size_of::<u64>()]
                .try_into()
                .map_err(|_| LendingError::InvalidFlashBorrowInstructionData)?,
        );

        require_eq!(
            repay_amount,
            borrowed_amount,
            LendingError::InvalidFlashRepayAmount
        );

        let flash_loan_fee = reserve
            .config
            .fees
            .calculate_flash_loan_fee(borrowed_amount)?;

        reserve.liquidity.repay_liquidity(repay_amount)?;
        reserve.last_update.mark_stale();

        transfer_checked(
            CpiContext::new(
                liquidity_token_program.to_account_info(),
                TransferChecked {
                    authority: authority.to_account_info(),
                    from: authority_token_account.to_account_info(),
                    mint: liquidity_mint.to_account_info(),
                    to: reserve_token_account.to_account_info(),
                },
            ),
            repay_amount,
            liquidity_mint.decimals,
        )?;

        if flash_loan_fee > 0 {
            transfer_checked(
                CpiContext::new(
                    liquidity_token_program.to_account_info(),
                    TransferChecked {
                        authority: authority.to_account_info(),
                        from: authority_token_account.to_account_info(),
                        mint: liquidity_mint.to_account_info(),
                        to: market_authority_token_account.to_account_info(),
                    },
                ),
                flash_loan_fee,
                liquidity_mint.decimals,
            )?;
        }

        Ok(())
    }
}
