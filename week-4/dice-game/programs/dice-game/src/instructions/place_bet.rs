use anchor_lang::{prelude::*, system_program::{Transfer, transfer}};

use crate::state::Bet;

#[derive(Accounts)]
#[instruction(seed:u128)]
pub struct PlaceBet<'info> {
    #[account(
        mut
    )]
    pub player: Signer<'info>,
    ///CHECK: This is safe
    pub house: UncheckedAccount<'info>,
    // For the vault since we are not setting one vault to be the canonical vault
    // any player can by pass the interface and pass in a different house which woud result may a 
    // result in a different vault from intended, but they would not be able to exploit the game
    // as we can just assume that a game is valid if they use this canonical vault because we have
    // the keys to the house which would be used to sign the transaction that would pay them off
    // in the case where they use a different vault they basically just threw away their funds 
    // since it may be possible that no one controls the house key that they used, in the case someone
    // does, all the funds used to pay them off would come from their own deposit and not from the program
    // vault, so the canonical program vault would still be safe
    #[account(
        mut,
        seeds = [b"vault", house.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        init,
        payer = player,
        space = Bet::DISCRIMINATOR.len() + Bet::INIT_SPACE,
        seeds = [b"bet", vault.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub bet: Account<'info, Bet>,
    pub system_program: Program<'info, System>
}

impl<'info> PlaceBet<'info> {
    pub fn create_bet(&mut self, bumps: &PlaceBetBumps, seed: u128, roll: u8, amount: u64) -> Result<()> {
        self.bet.set_inner(Bet{
            slot : Clock::get()?.slot,
            player: self.player.key(),
            seed,
            roll,
            amount,
            bump : bumps.bet,
        });
        Ok(())
    }

    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        let accounts = Transfer {
            from: self.player.to_account_info(),
            to: self.vault.to_account_info()
        };

        let ctx = CpiContext::new(
            self.system_program.to_account_info(),
            accounts
        );
        transfer(ctx, amount)
    }
}