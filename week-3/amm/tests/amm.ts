import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import { Amm } from "../target/types/amm";
import crypto from "crypto"
import { assert } from "chai";
import { Assert, equal } from "assert";

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

  let seed = new anchor.BN(crypto.randomBytes(8).readBigUInt64LE().toString());
  console.log("Seed: ", seed);

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


    const configAccount = await program.account.config.fetch(config);
    assert.equal(configAccount.seed.toString(), seed.toString());
    assert.equal(configAccount.fee, fee);
    assert.equal(configAccount.mintX.toBase58(), mintX.toBase58());
    assert.equal(configAccount.mintY.toBase58(), mintY.toBase58());
    assert.equal(configAccount.authority.toBase58(), wallet.publicKey.toBase58());
    assert.equal(configAccount.locked, false);

    console.log("Successfully initialized transaction:", tx);
  });

  it("Fails to initialize again with the same seed", async () => {
    try {
      await program.methods
        .initialize(seed, fee + 1, wallet.publicKey)
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
    } catch (err) {
      assert(err.toString().includes("already in use"));
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
    const userAccount = await getAccount(connection, userLp);
    assert.equal(userAccount.amount.toString(), "100000000");
    const vaultXAccount = await getAccount(connection, vaultX);
    assert.equal(vaultXAccount.amount.toString(), "200000000");
    const vaultYAccount = await getAccount(connection, vaultY);
    assert.equal(vaultYAccount.amount.toString(), "200000000");
    
    console.log("Deposit successful:", tx);
  });

  it("Deposit fails with amount = 0", async () => {
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
    } catch (err) {
      assert.instanceOf(err, anchor.AnchorError);
      assert.equal(err.error.errorCode.code, "InvalidAmount");
    }
  });

  it("Deposit fails with slippage exceeded error", async () => {
    // Based on the last the deposit the current amount in the pool would be:-
    // pool x:- 200,000,000
    // pool y:- 200,000,000    
    // lp pool:- 100,000,000
    
    // so for a deposit of 100,000,000 200,000,000 would expect to be deposited to each pool
    // so 199,999,999 should trigger a slippage error

    await mintTo(connection, wallet.payer, mintX, userX, wallet.publicKey, 1_000_000_000);
    await mintTo(connection, wallet.payer, mintY, userY, wallet.publicKey, 1_000_000_000);

    userLp = await getAssociatedTokenAddress(mintLP, wallet.publicKey, true);

    try{
      await program.methods
        .deposit(new anchor.BN(100_000_000), new anchor.BN(199_999_999), new anchor.BN(200_000_000))
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
    } catch (err) {
      assert.instanceOf(err, anchor.AnchorError);
      assert.equal(err.error.errorCode.code, "SlippageExceeded");
    }
  });

  it("Swaps token from X to Y", async () => {
    const userXAccountBefore = new anchor.BN((await getAccount(connection, userX)).amount);
    const userYAccountBefore = new anchor.BN((await getAccount(connection, userY)).amount);
    const vaultXAccountBefore = new anchor.BN((await getAccount(connection, vaultX)).amount);
    const vaultYAccountBefore = new anchor.BN((await getAccount(connection, vaultY)).amount);

    const tx = await program.methods
      .swap(true, new anchor.BN(10_000_000), new anchor.BN(5_000_000))
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
    const userXAccountAfter = new anchor.BN((await getAccount(connection, userX)).amount);
    const userYAccountAfter = new anchor.BN((await getAccount(connection, userY)).amount);
    const vaultXAccountAfter = new anchor.BN((await getAccount(connection, vaultX)).amount);
    const vaultYAccountAfter = new anchor.BN((await getAccount(connection, vaultY)).amount);

    assert.equal(userXAccountAfter.toString(), userXAccountBefore.sub(new anchor.BN(10_000_000)).toString());
    const userYReceived = userYAccountAfter.sub(userYAccountBefore);
    assert(userYReceived.gte(new anchor.BN(5_000_000)));
    assert.equal(vaultXAccountAfter.toString(), vaultXAccountBefore.add(new anchor.BN(10_000_000)).toString());
    assert.equal(vaultYAccountBefore.sub(vaultYAccountAfter).toString(), userYReceived.toString());

    console.log("Swap successful:", tx);
  });

  it("Swap fails with amount = 0", async () => {
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
    } catch (err) {
      assert.instanceOf(err, anchor.AnchorError);
      assert.equal(err.error.errorCode.code, "InvalidAmount");    
    }
  });

  it("Swap fails with slippage exceeded error", async () => {
    const pool_x_balance = new anchor.BN((await getAccount(connection, vaultX)).amount);
    const pool_y_balance = new anchor.BN((await getAccount(connection, vaultY)).amount);

    const precision = new anchor.BN(6);

    const y_amount_receiving = pool_y_balance.sub(((pool_x_balance.mul(pool_y_balance).mul(precision)).
      div(pool_x_balance.add(new anchor.BN(5_000_000)))).
      div(precision))

    try {
      await program.methods
      .swap(true, new anchor.BN(5_000_000), y_amount_receiving.add(new anchor.BN(1))) // make it go past the slippage threshold
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
    } catch (err) {
      assert.instanceOf(err, anchor.AnchorError);
      assert.equal(err.error.errorCode.code, "SlippageExceeded");    
    }
  });

  it("Withdraws liquidity", async () => {
    const userXAccountBefore = new anchor.BN((await getAccount(connection, userX)).amount);
    const userYAccountBefore = new anchor.BN((await getAccount(connection, userY)).amount);
    const vaultXAccountBefore = new anchor.BN((await getAccount(connection, vaultX)).amount);
    const vaultYAccountBefore = new anchor.BN((await getAccount(connection, vaultY)).amount);
    const userLpAccountBefore = new anchor.BN((await getAccount(connection, userLp)).amount);

    const tx = await program.methods
      .withdraw(new anchor.BN(10_000_000), new anchor.BN(20_000_000), new anchor.BN(20_000_000))
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
    const userXAccountAfter = new anchor.BN((await getAccount(connection, userX)).amount);
    const userYAccountAfter = new anchor.BN((await getAccount(connection, userY)).amount);
    const vaultXAccountAfter = new anchor.BN((await getAccount(connection, vaultX)).amount);
    const vaultYAccountAfter = new anchor.BN((await getAccount(connection, vaultY)).amount);
    const userLpAccountAfter = new anchor.BN((await getAccount(connection, userLp)).amount);
    
    assert.equal(userLpAccountAfter.toString(), userLpAccountBefore.sub(new anchor.BN(10_000_000)).toString());
    const userXReceived = userXAccountAfter.sub(userXAccountBefore);
    assert(userXReceived.gte(new anchor.BN(20_000_000)));
    const userYReceived = userYAccountAfter.sub(userYAccountBefore);
    assert(userYReceived.gte(new anchor.BN(20_000_000)));
    assert.equal(vaultXAccountBefore.sub(vaultXAccountAfter).toString(), userXReceived.toString());
    assert.equal(vaultYAccountBefore.sub(vaultYAccountAfter).toString(), userYReceived.toString());
    
    console.log("Withdraw successful:", tx);
  });

  it("Withdraw fails with amount = 0", async () => {
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
    } catch (err) {
      assert.instanceOf(err, anchor.AnchorError);
      assert.equal(err.error.errorCode.code, "InvalidAmount");    
    }
  });

  it("Withdraw fails with slippage exceeded", async () => {

    const pool_x_amount = new anchor.BN((await getAccount(connection, vaultX)).amount);
    const lp_pool_amount = new anchor.BN((await getMint(connection, mintLP)).supply);

    const precision = new anchor.BN(6);

    const ratio_inverse = lp_pool_amount.
      mul(precision).
      div(lp_pool_amount.sub(new anchor.BN(5_000_000)));
    
    const x_amount_receiving = pool_x_amount.mul(precision).div(ratio_inverse);


    try {
      await program.methods
        .withdraw(new anchor.BN(5_000_000), new anchor.BN(x_amount_receiving.add(new anchor.BN(1))), new anchor.BN(0)) // make it go past the slippage threshold
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
    } catch (err) {
      assert.instanceOf(err, anchor.AnchorError);
      assert.equal(err.error.errorCode.code, "SlippageExceeded");    
    }
  });
});
