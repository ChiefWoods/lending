use anchor_lang::prelude::*;

use crate::SafeMath;

#[constant]
pub const STALE_AFTER_SLOTS_ELAPSED: u8 = 1;

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone)]
pub struct LastUpdate {
    /// True when refresh required, false when slot has changed.
    pub is_stale: bool,
    /// Slot when the last update occurred.
    pub slot: u64,
}

pub struct NewLastUpdateArgs {
    pub slot: u64,
}

impl LastUpdate {
    pub fn new(args: NewLastUpdateArgs) -> Self {
        Self {
            is_stale: true,
            slot: args.slot,
        }
    }

    pub fn slots_elapsed(&self, slot: u64) -> Result<u64> {
        slot.safe_sub(self.slot)
    }

    pub fn mark_stale(&mut self) {
        self.is_stale = true;
    }

    pub fn update_slot(&mut self, slot: u64) {
        self.slot = slot;
        self.is_stale = false;
    }

    pub fn is_stale(&self, slot: u64) -> Result<bool> {
        Ok(self.is_stale || self.slots_elapsed(slot)? >= STALE_AFTER_SLOTS_ELAPSED as u64)
    }
}
