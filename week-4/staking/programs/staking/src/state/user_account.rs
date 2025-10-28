use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct UserAccount {
    pub points: u32,
    pub amount_staked: u8,
    pub bump: u8,
}

impl UserAccount{
    pub fn reset_points(&mut self){
        self.points = 0;
    } 
}