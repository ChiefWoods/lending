use crate::{
    error::LendingError, reserve_signer, BpfInstructionLoader, InstructionLoader, IxIterator,
    Reserve, ID, RESERVE_SEED,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

#[derive(Accounts)]
pub struct FlashBorrowReserveLiquidity<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [RESERVE_SEED, reserve.market.key().as_ref(), liquidity_mint.key().as_ref()],
        bump = reserve.bump,
    )]
    pub reserve: Account<'info, Reserve>,
    pub liquidity_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = liquidity_mint,
        associated_token::authority = authority,
        associated_token::token_program = liquidity_token_program,
    )]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = liquidity_mint,
        associated_token::authority = reserve
    )]
    pub reserve_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub liquidity_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: Instruction sysvar
    #[account(address = sysvar::instructions::ID)]
    pub instruction_sysvar: UncheckedAccount<'info>,
}

impl FlashBorrowReserveLiquidity<'_> {
    pub fn handler(ctx: Context<FlashBorrowReserveLiquidity>, borrow_amount: u64) -> Result<()> {
        let FlashBorrowReserveLiquidity {
            instruction_sysvar,
            authority_token_account,
            reserve_token_account,
            reserve,
            liquidity_mint,
            liquidity_token_program,
            ..
        } = ctx.accounts;

        let instruction_loader = BpfInstructionLoader {
            instruction_sysvar_account_info: &instruction_sysvar.to_account_info(),
        };
        let current_index: usize = instruction_loader.load_current_index()?.into();
        let ix_iterator = IxIterator::new_at((current_index + 1) as usize, &instruction_loader);
        let mut found_repay_ix = false;

        let borrow_discriminator = crate::instruction::FlashBorrowReserveLiquidity::DISCRIMINATOR;
        let repay_discriminator = crate::instruction::FlashRepayReserveLiquidity::DISCRIMINATOR;

        for ix in ix_iterator {
            let ix = ix?;

            // skip if not current program
            if ix.program_id != ID {
                continue;
            }

            require!(
                ix.data[0..borrow_discriminator.len()].ne(borrow_discriminator),
                LendingError::MultipleFlashBorrowsNotAllowed
            );

            if ix.data[0..repay_discriminator.len()].eq(repay_discriminator) {
                if found_repay_ix {
                    return Err(LendingError::MultipleFlashRepaysNotAllowed.into());
                }

                let repay_ix_data = &ix.data[8..];
                let repay_amount = u64::from_le_bytes(
                    repay_ix_data[0..8]
                        .try_into()
                        .map_err(|_| LendingError::InvalidFlashRepayInstructionData)?,
                );

                require_eq!(
                    repay_amount,
                    borrow_amount,
                    LendingError::InvalidFlashRepayAmount
                );

                let borrow_ix_index = repay_ix_data[8];

                require_eq!(
                    borrow_ix_index as usize,
                    current_index,
                    LendingError::InvalidFlashRepayInstructionData
                );

                found_repay_ix = true;
            }
        }

        require!(found_repay_ix, LendingError::NoFlashRepayInstruction);

        reserve.liquidity.borrow_liquidity(borrow_amount)?;
        reserve.last_update.mark_stale();

        let market_key = reserve.market;
        let liquidity_mint_key = reserve.liquidity.mint.key();
        let reserve_signer: &[&[u8]] =
            reserve_signer!(market_key, liquidity_mint_key, reserve.bump);

        transfer_checked(
            CpiContext::new(
                liquidity_token_program.to_account_info(),
                TransferChecked {
                    authority: reserve.to_account_info(),
                    from: reserve_token_account.to_account_info(),
                    mint: liquidity_mint.to_account_info(),
                    to: authority_token_account.to_account_info(),
                },
            )
            .with_signer(&[reserve_signer]),
            borrow_amount,
            liquidity_mint.decimals,
        )?;

        Ok(())
    }
}
