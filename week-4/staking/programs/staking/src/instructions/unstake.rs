use std::ops::{Div, Sub};

use anchor_lang::prelude::*;
use mpl_core::{
    instructions::{RemovePluginV1CpiBuilder, UpdatePluginV1CpiBuilder},
    types::{FreezeDelegate, Plugin, PluginType},
    ID as CORE_PROGRAM_ID,
};

use crate::{
    errors::StakeError,
    state::{StakeAccount, StakeConfig, UserAccount},
};

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(
        mut
    )]
    pub user: Signer<'info>,

    #[account(
        mut,
        owner = CORE_PROGRAM_ID,
    )]
    /// CHECK: This will be checked by core
    pub asset: UncheckedAccount<'info>,

    #[account(
        mut,
        owner = CORE_PROGRAM_ID,
    )]
    /// CHECK: This will be checked by core
    pub collection: UncheckedAccount<'info>,

    #[account(
        mut,
        close = user,
        seeds = [b"stake", config.key().as_ref(), asset.key().as_ref()],
        bump = stake_account.bump,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    pub config: Account<'info, StakeConfig>,

    #[account(
        mut,
        seeds = [b"user", user.key.as_ref()],
        bump = user_account.bump,
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        address = CORE_PROGRAM_ID
    )]
    /// CHECK: This is the MPL_CORE_PROGRAM
    pub core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Unstake<'info> {
    pub fn unstake(&mut self) -> Result<()> {

        require_keys_eq!(self.stake_account.owner, *self.user.key, StakeError::NotOwner);

        let time_elapsed = 
            u32::try_from(Clock::get()?.unix_timestamp.sub(self.stake_account.staked_at).div(86400)).
            map_err(|_| ProgramError::ArithmeticOverflow)?;

        require_gte!(time_elapsed, self.config.freeze_period, StakeError::FreezePeriodNotPassed);

        let points_earned = time_elapsed.checked_mul(u32::from(self.config.points_per_stake)).
            ok_or(ProgramError::ArithmeticOverflow)?;

        self.user_account.points.checked_add(points_earned).ok_or(ProgramError::ArithmeticOverflow)?;

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"stake",
            &self.config.key().to_bytes(),
            &self.asset.key().to_bytes(),
            &[self.stake_account.bump]
        ]];

        UpdatePluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .payer(&self.user.to_account_info())
            .authority(Some(&self.stake_account.to_account_info()))
            .system_program(&self.system_program.to_account_info())
            .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: false }))
            .invoke_signed(signer_seeds)?;

        RemovePluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .payer(&self.user.to_account_info())
            .authority(None)
            .system_program(&self.system_program.to_account_info())
            .plugin_type(PluginType::FreezeDelegate)
            .invoke()?;

        self.user_account.amount_staked -= 1;

        Ok(())
    }
}