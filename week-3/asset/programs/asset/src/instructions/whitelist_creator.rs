use anchor_lang::prelude::*;

use crate::{error::MPLXCoreError, program::Asset, state::WhitelistedCreators};

#[derive(Accounts)] 
pub struct WhitelistCreator<'info> {
    #[account(
        mut
    )]
    pub payer: Signer<'info>,
    /// CHECK should be a keypair
    pub creator: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        space = WhitelistedCreators::DISCRIMINATOR.len() + WhitelistedCreators::INIT_SPACE,
        seeds = [b"whitelist"],
        bump,
    )]
    pub whitelisted_creators: Account<'info, WhitelistedCreators>,
    pub system_program: Program<'info, System>,
    #[account(
        constraint = this_program.programdata_address()? == Some(program_data.key()
    ))]
    pub this_program: Program<'info, Asset>,
    // Making sure only the program update authority can add creators to the array
    #[account(
        constraint = assert_and_log_addresses(program_data.upgrade_authority_address,payer.key()) @ 
            MPLXCoreError::NotAuthorized
    )]
    pub program_data: Account<'info, ProgramData>,
}

impl<'info> WhitelistCreator<'info> {
    pub fn whitelist_creator(&mut self, bump:u8) -> Result<()> {
        if self.whitelisted_creators.to_account_info().data_is_empty(){
            self.whitelisted_creators.bump = bump;
        }
        self.whitelisted_creators.whitelist_creator(&self.creator)
    }
}

pub fn assert_and_log_addresses(
    maybe_upgrade_authority:Option<Pubkey>,
    payer:Pubkey,
)->bool{
    msg!("Payer: {}", payer);
    if let Some(upgrade_authority) = maybe_upgrade_authority{
        msg!("Upgrade authority: {}", upgrade_authority);
    }else{
        msg!("Upgrade authority: None");    
    }

    maybe_upgrade_authority.eq(&Some(payer))
}