use std::ops::{Add, Div, Rem, Sub};

use anchor_lang::{
    prelude::*, 
    system_program::{
        Transfer, 
        transfer
    },
};
use anchor_instruction_sysvar::Ed25519InstructionSignatures;
use solana_program::{
    sysvar::instructions::{load_instruction_at_checked, ID as INSTRUCTION_SYSVAR_ADDRESS},
    ed25519_program,
    hash::hashv
};
use crate::{state::Bet, errors::DiceError};

const HOUSE_EDGE:u16 = 150;

#[derive(Accounts)]
pub struct ResolveBet<'info>{
    pub house:Signer<'info>,

    /// CHECK: The player account
    #[account(
        mut
    )]
    pub player:UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"vault", house.key.as_ref()],
        bump
    )]
    pub vault:SystemAccount<'info>,

    #[account(
        mut,
        close = player,
        has_one = player,
        seeds = [b"bet", vault.key().as_ref(), bet.seed.to_le_bytes().as_ref()],
        bump = bet.bump
    )]
    pub bet:Account<'info, Bet>,

    /// CHECK: INSTRCTION SYSVAR ADDRESS
    #[account(
        address = INSTRUCTION_SYSVAR_ADDRESS
    )]
    pub instruction_sysvar:UncheckedAccount<'info>,

    pub system_program:Program<'info, System>
}

impl<'info> ResolveBet<'info>{
    pub fn verify_ed25519_signature(&self, sig:&[u8])->Result<()>{
        let ed2559_instruction = load_instruction_at_checked(
            0, 
            &self.instruction_sysvar.to_account_info()
        )?;

        require_keys_eq!(
            ed2559_instruction.program_id,
            ed25519_program::ID,
            DiceError::Ed25519Program
        );

        require_eq!(
            ed2559_instruction.accounts.len(),
            0,
            DiceError::Ed25519Accounts
        );

        let signatures = 
            Ed25519InstructionSignatures::unpack(&ed2559_instruction.data).
            map_err(|_| DiceError::Ed25519Header)?.0;

        require_eq!(
            signatures.len(),
            1,
            DiceError::Ed25519DataLength
        );

        let signature = &signatures[0];

        require!(signature.is_verifiable, DiceError::BumpError);

        // We can unwrap because if `is_verifiable` is true then the message, signature
        // and key are provided

        require!(
            signature.signature.unwrap().eq(sig),
            DiceError::Ed25519Signature
        );
        
        // We need to check the public key or else anyone can sign the message and call 
        // this instruction

        require!(
            signature.public_key.unwrap().eq(self.house.key),
            DiceError::Ed25519Pubkey
        );

        require!(
            signature.message.as_ref().unwrap().
            eq(&self.bet.to_slice()),
            DiceError::Ed25519Message
        );

        Ok(())
    }

    pub fn resolve_bet(&mut self, sig:&[u8], bumps: &ResolveBetBumps)->Result<()>{

        let sig_hash = hashv(&[sig]).to_bytes();

        let lower = u128::try_from_slice(&sig_hash[..16]).unwrap();

        let upper = u128::try_from_slice(&sig_hash[16..]).unwrap();

        let roll =  u8::try_from(lower.wrapping_add(upper).rem(100).add(1)).unwrap();

        if self.bet.roll.gt(&roll){
            let payout:u64 = u128::from(self.bet.amount).
                checked_mul(u128::from(10_000.sub(HOUSE_EDGE))).
                and_then(|result| 
                    result.div(100).
                    checked_div(u128::from(self.bet.roll.sub(1)))
                ).
                and_then(|result| 
                    TryInto::<u64>::try_into(result).ok()
                ).
                ok_or(DiceError::Overflow)?.
                // The vault cannot give more lamports than it has, for some values generated 
                // from this process the payout may exceed the balance of the vault.
                min(self.vault.lamports()); 

            
            let accounts = Transfer {
                from: self.vault.to_account_info(),
                to: self.player.to_account_info(),
            };

            let signer_seeds: &[&[&[u8]]] =
                &[&[b"vault", &self.house.key().to_bytes(), &[bumps.vault]]];

            let ctx = CpiContext::new_with_signer(
                self.system_program.to_account_info(),
                accounts,
                signer_seeds,
            );
            
            transfer(ctx, payout)?;
        }

        Ok(())
    }
} 