use anchor_lang::prelude::*;
use mpl_core::{
    ID as CORE_PROGRAM_ID, instructions::{UpdatePluginV1CpiBuilder}, types::{FreezeDelegate, Plugin}
};

use crate::{error::MPLXCoreError, state::CollectionAuthority};

#[derive(Accounts)]
pub struct FreezeThawNft<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        owner = CORE_PROGRAM_ID @ MPLXCoreError::InvalidCollection
    )]
    /// CHECK: This will be checked by core
    pub asset: UncheckedAccount<'info>,
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

impl<'info> FreezeThawNft<'info> {
   pub fn freeze_thaw_nft(&mut self, frozen:bool) -> Result<()> {

        require_keys_eq!(
            *self.creator.key,
            self.collection_authority.creator,
            MPLXCoreError::NotAuthorized
        );

        UpdatePluginV1CpiBuilder::new(&self.core_program.to_account_info()).
            asset(&self.asset.to_account_info()).
            collection(Some(&self.collection.to_account_info())).
            authority(Some(&self.collection_authority.to_account_info())).
            // No additional data is being added(we are just editing) so no lamports
            // would actually be deducted from the `collection_authority` account
            payer(&self.collection_authority.to_account_info()).
            system_program(&self.system_program.to_account_info()).
            plugin(Plugin::FreezeDelegate(FreezeDelegate{
                frozen
            })).
            invoke_signed(&[&[
                b"collection_authority",
                &self.collection.key().as_ref(),
                &[self.collection_authority.bump],
            ]])?;        
        
        Ok(())
    }
}