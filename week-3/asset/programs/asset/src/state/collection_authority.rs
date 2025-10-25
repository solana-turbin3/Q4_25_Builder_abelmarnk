use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct CollectionAuthority {
    pub creator: Pubkey,
    pub collection: Pubkey,
    #[max_len(32)]
    pub default_nft_name: String, // If we allow for the nft name to be updated, 
                                  // then this can only be considered to be a default
                                  // the old nft names would go out of sync with the new
                                  // ones
    #[max_len(200)]
    pub default_nft_uri: String, // Same as above
    pub bump: u8,
}