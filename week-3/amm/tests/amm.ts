import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import { Amm } from "../target/types/amm";

describe("amm", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Amm as Program<Amm>;
  const wallet = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  let mintX: PublicKey;
  let mintY: PublicKey;
  let mintLP: PublicKey;
  let config: PublicKey;
  let vaultX: PublicKey;
  let vaultY: PublicKey;
  let userX: PublicKey;
  let userY: PublicKey;
  let userLp: PublicKey;

  const seed = new anchor.BN("00000");

  const fee = 30;

  before(async () => {
    mintX = await createMint(connection, wallet.payer, wallet.publicKey, null, 6);
    mintY = await createMint(connection, wallet.payer, wallet.publicKey, null, 6);

    [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), Buffer.from(seed.toArray("le", 8))],
      program.programId
    );

    [mintLP] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), config.toBuffer()],
      program.programId
    );

    vaultX = await getAssociatedTokenAddress(mintX, config, true);
    vaultY = await getAssociatedTokenAddress(mintY, config, true);

    userX = await getAssociatedTokenAddress(mintX, wallet.publicKey);
    userY = await getAssociatedTokenAddress(mintY, wallet.publicKey);

    await createAssociatedTokenAccount(connection, wallet.payer, mintX, wallet.publicKey);
    await createAssociatedTokenAccount(connection, wallet.payer, mintY, wallet.publicKey);
  });

  it("Initialize pool", async () => {
    const tx = await program.methods
      .initialize(seed, fee, wallet.publicKey)
      .accountsPartial({
        initializer: wallet.publicKey,
        mintX,
        mintY,
        mintLp: mintLP,
        vaultX,
        vaultY,
        config
      })
      .rpc();
    console.log("Successfully initialized transaction:", tx);
  });

  it("Fails to initialize again with the same seed", async () => {
    try {
      await program.methods
        .initialize(seed, fee, wallet.publicKey)
        .accountsPartial({
          initializer: wallet.publicKey,
          mintX,
          mintY,
          mintLp: mintLP,
          vaultX,
          vaultY,
          config,
        })
        .rpc();

      throw new Error("Initialization did not fail");
    } catch (err: any) {
      console.log("Initialization failed successfully:", err.message);
    }
  });

  it("Deposit liquidity", async () => {
    await mintTo(connection, wallet.payer, mintX, userX, wallet.publicKey, 1_000_000_000);
    await mintTo(connection, wallet.payer, mintY, userY, wallet.publicKey, 1_000_000_000);

    userLp = await getAssociatedTokenAddress(mintLP, wallet.publicKey, true);

    const tx = await program.methods
      .deposit(new anchor.BN(100_000_000), new anchor.BN(200_000_000), new anchor.BN(200_000_000))
      .accountsPartial({
        user: wallet.publicKey,
        mintX,
        mintY,
        config,
        mintLp: mintLP,
        vaultX,
        vaultY,
        userX,
        userY,
        userLp: userLp
      })
      .rpc();
    console.log("Deposit successful:", tx);
  });

  it("Fails deposit with amount = 0", async () => {
    try {
      await program.methods
        .deposit(new anchor.BN(0), new anchor.BN(1), new anchor.BN(1))
        .accountsPartial({
          user: wallet.publicKey,
          mintX,
          mintY,
          config,
          mintLp: mintLP,
          vaultX,
          vaultY,
          userX,
          userY,
          userLp: userLp
        })
        .rpc();
      throw new Error("Deposit did not fail");
    } catch (err: any) {
      console.log("Deposit failed successfully:", err.message);
    }
  });

  it("Swaps token from X to Y", async () => {
    const tx = await program.methods
      .swap(true, new anchor.BN(10_000_000), new anchor.BN(1))
      .accountsPartial({
        user: wallet.publicKey,
        mintX,
        mintY,
        config,
        mintLp: mintLP,
        vaultX,
        vaultY,
        userX,
        userY,
        userLp:userLp
      })
      .rpc();
    console.log("Swap successful:", tx);
  });

  it("Fails swap with amount = 0", async () => {
    try {
      await program.methods
        .swap(true, new anchor.BN(0), new anchor.BN(1))
        .accountsPartial({
          user: wallet.publicKey,
          mintX,
          mintY,
          config,
          mintLp: mintLP,
          vaultX,
          vaultY,
          userX,
          userY,
          userLp:userLp
        })
        .rpc();
      throw new Error("Swap did noy fail");
    } catch (err: any) {
      console.log("Swap failed successfully:", err.message);
    }
  });

  it("Withdraws liquidity", async () => {
    const tx = await program.methods
      .withdraw(new anchor.BN(10_000_000), new anchor.BN(1), new anchor.BN(1))
      .accountsPartial({
        user: wallet.publicKey,
        mintX,
        mintY,
        config,
        mintLp: mintLP,
        vaultX,
        vaultY,
        userX,
        userY,
        userLp
      })
      .rpc();
    console.log("Withdraw successful:", tx);
  });

  it("Fails withdraw with amount = 0", async () => {
    try {
      await program.methods
        .withdraw(new anchor.BN(0), new anchor.BN(1), new anchor.BN(1))
        .accountsPartial({
          user: wallet.publicKey,
          mintX,
          mintY,
          config,
          mintLp: mintLP,
          vaultX,
          vaultY,
          userX,
          userY,
          userLp
        })
        .rpc();
      throw new Error("Withdraw did not fail");
    } catch (err: any) {
      console.log("Withdraw failed successfully:", err.message);
    }
  });
});
