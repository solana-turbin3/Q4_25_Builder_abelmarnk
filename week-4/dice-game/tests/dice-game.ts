import * as anchor from "@coral-xyz/anchor";
import { Program , BN } from "@coral-xyz/anchor";
import {
  Ed25519Program, Keypair, LAMPORTS_PER_SOL, PublicKey, 
  SIGNATURE_LENGTH_IN_BYTES, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY, 
  TransactionInstruction
} from "@solana/web3.js"
import { DiceGame } from "../target/types/dice_game";
import { assert } from "chai";


function createEd25519Ix(
  message: Buffer,
  signingKey: Keypair
): TransactionInstruction {
  const instruction = Ed25519Program.createInstructionWithPrivateKey({
    privateKey: signingKey.secretKey,
    message: message,
  });

  return instruction;
}

function extractSignatureFromEd25519Ix(instruction: TransactionInstruction): Buffer {
  const signatureOffset = instruction.data.slice(2, 4).readInt16LE();
  const signature = instruction.data.slice(signatureOffset, signatureOffset + SIGNATURE_LENGTH_IN_BYTES); 
  return signature;
}

async function getBetMessage(betPdaAddress: PublicKey, program:Program<DiceGame>):Promise<Buffer> {
  const betAccount = await program.account.bet.fetch(betPdaAddress);
  
  // Construct the message that matches Bet.to_slice()
  const message = Buffer.concat([
    betAccount.player.toBuffer(),
    betAccount.seed.toArrayLike(Buffer, "le", 16),
    betAccount.slot.toArrayLike(Buffer, "le", 8),
    betAccount.amount.toArrayLike(Buffer, "le", 8),
    Buffer.from([betAccount.roll, betAccount.bump])
  ]);

  return message;
}

describe("dice-game", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DiceGame as Program<DiceGame>;
  const connection = provider.connection;
  const house = Keypair.generate();

  let roll = crypto.getRandomValues(new Uint8Array(1))[0];

  const seed = new BN(crypto.getRandomValues(new Uint8Array(16)));

  let amount = new BN(0.5 * LAMPORTS_PER_SOL);

  let player = Keypair.generate();

  const vaultPda = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), house.publicKey.toBuffer()],
    program.programId
  )[0];

  const betPda = PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), vaultPda.toBuffer(), seed.toArrayLike(Buffer, "le", 16)],
    program.programId
  )[0];  

  before(async () => {
    await connection.requestAirdrop(house.publicKey, 100 * LAMPORTS_PER_SOL);    
    await connection.requestAirdrop(player.publicKey, 100 * LAMPORTS_PER_SOL);
  });
  
  it("Initialize vault", async () => {
      const amount = new BN(0.5 * LAMPORTS_PER_SOL);

      const beforeVaultBalance = await connection.getBalance(vaultPda);
      const beforeHouseBalance = await connection.getBalance(house.publicKey);     

      await program.methods
        .initialize(amount)
        .accountsPartial({
          house: house.publicKey,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        }).
        signers([house])
        .rpc();

      const afterVaultBalance = await connection.getBalance(vaultPda);
      const afterHouseBalance = await connection.getBalance(house.publicKey);
      
      assert.equal(
        beforeHouseBalance - afterHouseBalance,
        amount.toNumber()
      );
  
      assert.equal(
        afterVaultBalance - beforeVaultBalance,
        amount.toNumber()
      );
  });

  it("Place bet", async () => {
    const beforeVaultBalance = await connection.getBalance(vaultPda);
    const beforePlayerBalance = await connection.getBalance(player.publicKey);

    await program.methods
      .placeBet(seed, roll, amount)
      .accountsPartial({
        player: player.publicKey,
        house: house.publicKey,
        vault: vaultPda,
        bet: betPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([player])
      .rpc();

    const afterVaultBalance = await connection.getBalance(vaultPda);
    const afterPlayerBalance = await connection.getBalance(player.publicKey);

    assert.equal(
      afterVaultBalance - beforeVaultBalance,
      amount.toNumber()
    );
    
    assert.isAbove( // Amount + rent
      beforePlayerBalance - afterPlayerBalance,
      amount.toNumber() 
    );

    const betAccount = await program.account.bet.fetch(betPda);

    assert.equal(
      betAccount.player.toBase58(),
      player.publicKey.toBase58()
    );

    assert.equal(
      betAccount.seed.toString(),
      seed.toString()
    );

    assert.equal(
      betAccount.roll,
      roll
    );

    assert.equal(
      betAccount.amount.toString(),
      amount.toString()     
    );
  });

  it("Refund bet", async () => {
    const beforeVaultBalance = await connection.getBalance(vaultPda);
    const beforePlayerBalance = await connection.getBalance(player.publicKey);

    await program.methods
      .refundBet()
      .accountsPartial({
        player: player.publicKey,
        house: house.publicKey,
        vault: vaultPda,
        bet: betPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([player])
      .rpc();

    const afterVaultBalance = await connection.getBalance(vaultPda);
    const afterPlayerBalance = await connection.getBalance(player.publicKey);

    assert.equal(
      beforeVaultBalance - afterVaultBalance, 
      amount.toNumber()
    );

    assert.isAbove( // Amount + rent
      afterPlayerBalance - beforePlayerBalance,
      amount.toNumber()
    );
  });

  it("Place bet again", async () => {
    const beforeVaultBalance = await connection.getBalance(vaultPda);
    const beforePlayerBalance = await connection.getBalance(player.publicKey);

    // The transaction might fail since it has been proceesed previously, change the amount
    // so the transaction would change
    amount = amount.mul(new BN(2));

    await program.methods
      .placeBet(seed, roll, amount)
      .accountsPartial({
        player: player.publicKey,
        house: house.publicKey,
        vault: vaultPda,
        bet: betPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([player])
      .rpc();

    const afterVaultBalance = await connection.getBalance(vaultPda);
    const afterPlayerBalance = await connection.getBalance(player.publicKey);

    assert.equal(
      afterVaultBalance - beforeVaultBalance,
      amount.toNumber()
    );

    assert.isAbove( // Amount + rent
      beforePlayerBalance - afterPlayerBalance,
      amount.toNumber() 
    );

    const betAccount = await program.account.bet.fetch(betPda);

    assert.equal(
      betAccount.player.toBase58(),
      player.publicKey.toBase58()
    );

    assert.equal(
      betAccount.seed.toString(),
      seed.toString()
    );

    assert.equal(
      betAccount.roll,
      roll
    );

    assert.equal(
      betAccount.amount.toString(),
      amount.toString()      
    );
  });  

  it("Fail refund with invalid player", async () => {
    const invalidPlayer = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .refundBet()
        .accountsPartial({
          player: invalidPlayer.publicKey,
          house: house.publicKey,
          vault: vaultPda,
          bet: betPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([invalidPlayer])
        .rpc();
      assert.fail();
    } catch (err) {
      
      assert.include(err.message.toLowerCase(), "has one constraint was violated")
    }  
  });

  it("Fail to resolve bet with invalid house account", async () => {
    const invalidHouse = Keypair.generate();

    await connection.requestAirdrop(invalidHouse.publicKey, 5 * LAMPORTS_PER_SOL);
    
    const message = await getBetMessage(betPda, program);

    const ed25519Ix = createEd25519Ix(message, house);
    
    const sig = extractSignatureFromEd25519Ix(ed25519Ix);

    try {
      await program.methods
        .resolveBet(sig)
        .accountsPartial({
          house: invalidHouse.publicKey,
          player: player.publicKey,
          vault: vaultPda,
          bet: betPda,
          instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([ed25519Ix], true)
        .signers([invalidHouse])
        .rpc();

      assert.fail("Should have failed with wrong house");
    } catch (err) {
      assert.include(err.message.toLowerCase(), "seeds constraint was violated");
    }
  });

  it("Fail to resolve bet with wrong signature", async () => {

    const invalidHouse = Keypair.generate();

    const message = await getBetMessage(betPda, program);
  
    const ed25519Ix = createEd25519Ix(message, invalidHouse);
    
    const sig = extractSignatureFromEd25519Ix(ed25519Ix);

    try {
      await program.methods
        .resolveBet(sig)
        .accountsPartial({
          house: house.publicKey,
          player: player.publicKey,
          vault: vaultPda,
          bet: betPda,
          instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .signers([house])
        .preInstructions([ed25519Ix], true)
        .rpc();

      assert.fail("Should have failed with incorrect signature");
    } catch (err) {

      assert.include(err.message.toLowerCase(), "ed25519pubkey");
    }
  });

  it("Resolve bet", async () => {

    const message = await getBetMessage(betPda, program);

    const ed25519Ix = createEd25519Ix(message, house);
    
    const sig = extractSignatureFromEd25519Ix(ed25519Ix);

    const beforePlayerBalance = await connection.getBalance(player.publicKey);

    await program.methods
      .resolveBet(sig)
      .accountsPartial({
        house: house.publicKey,
        player: player.publicKey,
        vault: vaultPda,
        bet: betPda,
        instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .signers([house])
      .preInstructions([ed25519Ix], true)
      .rpc();

    const afterPlayerBalance = await connection.getBalance(player.publicKey);

    // Check that bet account is closed
    try {
      await program.account.bet.fetch(betPda);
      assert.fail("Bet account should be closed");
    } catch (err) {
      assert.include(err.message, "not exist");
    }

    // The rent from closing the bet account should be returned to the player
    assert.isAbove(afterPlayerBalance, beforePlayerBalance);
  });

});  
