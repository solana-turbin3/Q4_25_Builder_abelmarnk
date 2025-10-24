use anchor_lang::prelude::*;

mod instructions;
mod state;
mod error;

use instructions::*;

declare_id!("FCYkNZSiRHuEutSJVCjgndQPXsmYkXk2YWSh3KB1cuKY");

#[program]
pub mod asset {
    use super::*;

    pub fn whitelist_creator(ctx: Context<WhitelistCreator>) -> Result<()> {
        ctx.accounts.whitelist_creator(ctx.bumps.whitelisted_creators)
    }
    
    pub fn create_collection(ctx: Context<CreateCollection>, args: CreateCollectionArgs) -> Result<()> {
        ctx.accounts.create_collection(args, &ctx.bumps)
    }

    pub fn mint_nft(ctx: Context<MintNft>) -> Result<()> {
        ctx.accounts.mint_nft()
    }

     pub fn freeze_nft(ctx: Context<FreezeThawNft>) -> Result<()> {
         ctx.accounts.freeze_thaw_nft(true)
     }

    pub fn thaw_nft(ctx: Context<FreezeThawNft>) -> Result<()> {
        ctx.accounts.freeze_thaw_nft(false)
    }

    pub fn update_nft(ctx: Context<UpdateNft>, new_name: String) -> Result<()> {
        ctx.accounts.update_nft(new_name)
    }
}
