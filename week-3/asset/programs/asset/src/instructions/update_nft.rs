use anchor_lang::prelude::*;
use mpl_core::{
    ID as CORE_PROGRAM_ID, instructions::{UpdateV1CpiBuilder}
};

use crate::{error::MPLXCoreError, state::CollectionAuthority};

#[derive(Accounts)]
pub struct UpdateNft<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        owner = CORE_PROGRAM_ID @ MPLXCoreError::InvalidCollection
    )]
    /// CHECK: This would be checked by core
    pub asset: UncheckedAccount<'info>,
    #[account(
        mut
    )]
    pub payer: Signer<'info>,
    #[account(
        mut,
        owner = CORE_PROGRAM_ID @ MPLXCoreError::InvalidCollection
    )]
    /// CHECK: This will also be checked by core
    pub collection: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"collection_authority", collection.key().as_ref()],
        bump = collection_authority.bump,

    )]
    pub collection_authority: Account<'info, CollectionAuthority>,
    #[account(
        address = CORE_PROGRAM_ID
    )]
    /// CHECK: MPL_CORE_PROGRAM
    pub core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    
}

impl<'info> UpdateNft<'info> {
    pub fn update_nft(&mut self, new_name: String) -> Result<()> {

        require_keys_eq!(
            *self.creator.key,
            self.collection_authority.creator,
            MPLXCoreError::NotAuthorized
        );
        
        UpdateV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .authority(Some(&self.collection_authority.to_account_info()))
            .payer(&self.payer.to_account_info())
            .system_program(&self.system_program.to_account_info())
            .new_name(new_name)
            .invoke_signed(&[&[
                "collection_authority".as_ref(),
                self.collection.key().as_ref(),
                &[self.collection_authority.bump],
        ]])?;
            
        Ok(())
    }
}