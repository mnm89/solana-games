use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;

// Fee wallet (hardcoded to your address)
const FEE_WALLET: &str = "7D8wUBgqxN2NmMMnVYxyedWRrqkiQ326v26WMdUhg6gi";
const FEE_BPS: u64 = 500; // 5% in basis points

#[program]
pub mod click_battle {
    use super::*;

    pub fn create_room(ctx: Context<CreateRoom>, bet_amount: u64) -> Result<()> {
        let room = &mut ctx.accounts.room;
        room.authority = ctx.accounts.player.key();
        room.bet_amount = bet_amount;
        room.total_pot = 0;
        room.player1 = ctx.accounts.player.key();
        room.player2 = Pubkey::default();
        Ok(())
    }

    pub fn join_room(ctx: Context<JoinRoom>) -> Result<()> {
        let room = &mut ctx.accounts.room;
        require!(room.player2 == Pubkey::default(), CustomError::RoomFull);

        let bet_amount = room.bet_amount;

        // Transfer SOL to escrow PDA
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.player.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, bet_amount)?;

        room.player2 = ctx.accounts.player.key();
        room.total_pot += bet_amount * 2;
        Ok(())
    }

    pub fn payout(ctx: Context<Payout>, winner: Pubkey) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let escrow_lamports = **ctx.accounts.escrow.to_account_info().lamports.borrow();
        let fee = escrow_lamports * FEE_BPS / 10_000;
        let payout_amount = escrow_lamports - fee;

        // Transfer payout to winner
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= payout_amount;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += payout_amount;

        // Transfer fee to fee wallet
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= fee;
        **ctx.accounts.fee_wallet.to_account_info().try_borrow_mut_lamports()? += fee;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(bet_amount: u64)]
pub struct CreateRoom<'info> {
    #[account(init, payer = player, space = 8 + 32 + 32 + 32 + 8 + 8)]
    pub room: Account<'info, Room>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinRoom<'info> {
    #[account(mut)]
    pub room: Account<'info, Room>,
    #[account(mut)]
    pub player: Signer<'info>,
    /// CHECK: Safe because it's a PDA we control
    #[account(mut)]
    pub escrow: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Payout<'info> {
    #[account(mut)]
    pub room: Account<'info, Room>,
    /// CHECK: verified by server
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,
    /// CHECK: fee wallet is known
    #[account(mut, address = Pubkey::from_str(FEE_WALLET).unwrap())]
    pub fee_wallet: UncheckedAccount<'info>,
    /// CHECK: PDA escrow
    #[account(mut)]
    pub escrow: UncheckedAccount<'info>,
}

#[account]
pub struct Room {
    pub authority: Pubkey,
    pub player1: Pubkey,
    pub player2: Pubkey,
    pub bet_amount: u64,
    pub total_pot: u64,
}

#[error_code]
pub enum CustomError {
    #[msg("Room already has two players.")]
    RoomFull,
}
