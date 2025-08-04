use anchor_lang::prelude::{
    instruction::Instruction,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
    *,
};

pub struct BpfInstructionLoader<'a, 'info> {
    pub instruction_sysvar_account_info: &'a AccountInfo<'info>,
}

pub trait InstructionLoader {
    fn load_instruction_at(&self, index: usize) -> std::result::Result<Instruction, ProgramError>;
    fn load_current_index(&self) -> std::result::Result<u16, ProgramError>;
}

impl<'a, 'info> InstructionLoader for BpfInstructionLoader<'a, 'info> {
    fn load_instruction_at(&self, index: usize) -> std::result::Result<Instruction, ProgramError> {
        load_instruction_at_checked(index, self.instruction_sysvar_account_info)
    }

    fn load_current_index(&self) -> std::result::Result<u16, ProgramError> {
        load_current_index_checked(self.instruction_sysvar_account_info)
    }
}

pub struct IxIterator<'a, IxLoader: InstructionLoader + ?Sized> {
    current_index: usize,
    instruction_loader: &'a IxLoader,
}

impl<'a, IxLoader: ?Sized> IxIterator<'a, IxLoader>
where
    IxLoader: InstructionLoader,
{
    pub fn new_at(start_index: usize, instruction_loader: &'a IxLoader) -> Self {
        Self {
            current_index: start_index,
            instruction_loader,
        }
    }
}

impl<IxLoader: ?Sized> Iterator for IxIterator<'_, IxLoader>
where
    IxLoader: InstructionLoader,
{
    type Item = std::result::Result<Instruction, ProgramError>;

    fn next(&mut self) -> Option<Self::Item> {
        match self
            .instruction_loader
            .load_instruction_at(self.current_index)
        {
            Ok(ix) => {
                self.current_index += 1;
                Some(Ok(ix))
            }
            Err(ProgramError::InvalidArgument) => None,
            Err(e) => Some(Err(e)),
        }
    }
}
