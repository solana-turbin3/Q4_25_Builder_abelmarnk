import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Asset } from "../target/types/asset";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { MPL_CORE_PROGRAM_ID, AssetV1, fetchAssetV1, getPluginAuthorityPairSerializer} from "@metaplex-foundation/mpl-core";
import { getAssetV1AccountDataSerializer } from "@metaplex-foundation/mpl-core/dist/src/generated/types/assetV1AccountData";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {fromWeb3JsPublicKey} from "@metaplex-foundation/umi-web3js-adapters" 

describe("asset", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Asset as Program<Asset>;
  const connection = provider.connection;
  fetchAssetV1
  // Accounts
  const payer = provider.wallet;
  const creator = Keypair.generate();
  const nonWhitelistedCreator = Keypair.generate();
  const collection = Keypair.generate();
  const asset = Keypair.generate();
  const unauthorizedAuthority = Keypair.generate();
  const invalidCollection = Keypair.generate();


  console.log(`payer / system_wallet ${payer.publicKey.toString()}`);
  console.log(`creator ${creator.publicKey.toString()}`);
  console.log(`nonWhitelistedCreator ${nonWhitelistedCreator.publicKey.toString()}`);
  console.log(`collection ${collection.publicKey.toString()}`);
  console.log(`asset ${asset.publicKey.toString()}`);
  console.log(`unauthorizedAuthority ${unauthorizedAuthority.publicKey.toString()}`);
  console.log(`invalidCollection ${invalidCollection.publicKey.toString()}`);

  // PDAs
  let whitelistedCreatorsPda: PublicKey;
  let collectionAuthorityPda: PublicKey;
  let programDataAccount: PublicKey;
  let invalidCollectionAuthorityPda: PublicKey;


  before(async () => {
    // Fund accounts
    await provider.connection.requestAirdrop(creator.publicKey, 2_000_000_000); // 2 SOL
    await provider.connection.requestAirdrop(nonWhitelistedCreator.publicKey, 2_000_000_000);
    await provider.connection.requestAirdrop(unauthorizedAuthority.publicKey, 2_000_000_000);
    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for airdrops

    // Derive PDAs
    whitelistedCreatorsPda = PublicKey.findProgramAddressSync(
      [Buffer.from("whitelist")],
      program.programId
    )[0];
    console.log(`whitelistedCreatorsPda ${whitelistedCreatorsPda.toString()}`);

    collectionAuthorityPda = PublicKey.findProgramAddressSync(
      [Buffer.from("collection_authority"), collection.publicKey.toBuffer()],
      program.programId
    )[0];
    console.log(`collectionAuthorityPda ${collectionAuthorityPda.toString()}`);

    invalidCollectionAuthorityPda = PublicKey.findProgramAddressSync(
      [Buffer.from("collection_authority"), invalidCollection.publicKey.toBuffer()],
      program.programId
    )[0];
    console.log(`invalidCollectionAuthorityPda ${invalidCollectionAuthorityPda.toString()}`);

    // Derive ProgramData PDA using the BPF Loader Upgradeable program ID BPFLoaderUpgradeab1e11111111111111111111111
    const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    programDataAccount = PublicKey.findProgramAddressSync(
      [
        program.programId.toBuffer(),
      ],
      BPF_LOADER_UPGRADEABLE_PROGRAM_ID
    )[0];
    console.log(`programDataAccount ${programDataAccount.toString()}`);
    // Verify ProgramData exists after deployment
    const programData = await connection.getAccountInfo(programDataAccount);
    assert.ok(programData, "ProgramData should exist after deployment");
  });

  describe("WhitelistCreator", () => {
    it("Whitelist a creator", async () => {
      try {
        const sig = await program.methods
          .whitelistCreator()
          .accountsStrict({
            payer: payer.publicKey,
            creator: creator.publicKey,
            whitelistedCreators: whitelistedCreatorsPda,
            systemProgram: SystemProgram.programId,
            thisProgram: program.programId,
            programData: programDataAccount,
          })
          .rpc();
        console.log(`sig ${sig}`);
      } catch (error: any) {
        console.error(`Oops, something went wrong: ${error}`);
        if (error.logs && Array.isArray(error.logs)) {
          console.log("Transaction Logs:");
          error.logs.forEach((log: string) => console.log(log));
        } else {
          console.log("No logs available in the error.");
        }
      }

      const whitelistedCreators = await program.account.whitelistedCreators.fetch(whitelistedCreatorsPda);
      console.log(`whitelistedCreators ${whitelistedCreators.creators}`);
      const creatorPubkeyStr = creator.publicKey.toString();
      assert.include(
        whitelistedCreators.creators.map(c => c.toString()),
        creatorPubkeyStr,
        "Creator should be whitelisted"
      );
    });
  });

  describe("CreateCollection", () => {
    it("Create a collection", async () => {
      const args = {
        name: "Test Collection",
        uri: "https://devnet.irys.xyz/yourhashhere",
        defaultNftName: "Test NFT",
        defaultNftUri: "https://gateway.irys.xyz/yourhashhere",
      };

      try {
        const sig = await program.methods
          .createCollection(args)
          .accountsStrict({
            creator: creator.publicKey,
            collection: collection.publicKey,
            whitelistedCreators: whitelistedCreatorsPda,
            collectionAuthority: collectionAuthorityPda,
            coreProgram: MPL_CORE_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([creator, collection])
          .rpc();
        console.log(`sig ${sig}`);
      } catch (error: any) {
        console.error(`Oops, something went wrong: ${error}`);
        if (error.logs && Array.isArray(error.logs)) {
          console.log("Transaction Logs:");
          error.logs.forEach((log: string) => console.log(log));
        } else {
          console.log("No logs available in the error.");
        }
      }
      const collectionAuthority = await program.account.collectionAuthority.fetch(collectionAuthorityPda);
      assert.equal(collectionAuthority.creator.toString(), creator.publicKey.toString(), "Creator should be the collection authority");
      assert.equal(collectionAuthority.collection.toString(), collection.publicKey.toString());
      assert.equal(collectionAuthority.defaultNftName, args.defaultNftName);
      assert.equal(collectionAuthority.defaultNftUri, args.defaultNftUri);
    });

    it("Non-whitelisted creator cannot create a collection", async () => {
      const args = {
        name: "Invalid Collection",
        uri: "https://example.com/invalid-uri",
        defaultNftName: "Invalid NFT",
        defaultNftUri: "https://example.com/invalid-nft-uri",
      };

      try {
        await program.methods
          .createCollection(args)
          .accountsPartial({
            creator: nonWhitelistedCreator.publicKey,
            collection: invalidCollection.publicKey,
            whitelistedCreators: whitelistedCreatorsPda,
            collectionAuthority: invalidCollectionAuthorityPda,
            coreProgram: MPL_CORE_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([nonWhitelistedCreator, invalidCollection])
          .rpc();
        assert.fail("Should have failed with non-whitelisted creator");
      } catch (error: any) {
        console.error(`Oops, something went wrong: ${error}`);
        if (error.logs && Array.isArray(error.logs)) {
          console.log("Transaction Logs:");
          error.logs.forEach((log: string) => console.log(log));
        } else {
          console.log("No logs available in the error.");
        }
      }
    });
  });

  describe("MintNft", () => {
    it("Mints an NFT", async () => {
      await program.methods
        .mintNft()
        .accountsStrict({
          minter: payer.publicKey,
          asset: asset.publicKey,
          collection: collection.publicKey,
          collectionAuthority: collectionAuthorityPda,
          coreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([asset])
        .rpc();

    });

    it("Fails to mint with invalid collection", async () => {
      const invalidCollection = Keypair.generate();
      const invalidAsset = Keypair.generate();

      try {
        await program.methods
          .mintNft()
          .accountsPartial({
            minter: creator.publicKey,
            asset: invalidAsset.publicKey,
            collection: invalidCollection.publicKey,
            collectionAuthority: collectionAuthorityPda,
            coreProgram: MPL_CORE_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([creator, invalidAsset])
          .rpc();
        assert.fail("Should have failed with invalid collection");
      } catch (err) {
        assert.equal(err.error.errorCode.code, "InvalidCollection", "Expected InvalidCollection error");
      }
    });
  });

  describe("FreezeNft", () => {
    it("Freeze an NFT", async () => {
      await program.methods
        .freezeNft()
        .accountsStrict({
          asset: asset.publicKey,
          creator: creator.publicKey,
          collection: collection.publicKey,
          collectionAuthority: collectionAuthorityPda,
          coreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

        let umi = createUmi(connection.rpcEndpoint);

        let assetv1 = fetchAssetV1(umi, fromWeb3JsPublicKey(asset.publicKey));        

        assert.equal(true, (await assetv1).freezeDelegate.frozen)
    });

    it("Fails to freeze with unauthorized authority", async () => {
      try {
        await program.methods
          .freezeNft()
          .accountsStrict({
            asset: asset.publicKey,
            creator: unauthorizedAuthority.publicKey, // Unauthorized authority
            collection: collection.publicKey,
            collectionAuthority: collectionAuthorityPda,
            coreProgram: MPL_CORE_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedAuthority])
          .rpc();
        assert.fail("Should have failed with unauthorized authority");
      } catch (err) {
        assert.equal(err.error.errorCode.code, "NotAuthorized", "Expected NotAuthorized error");
      }
    });
  });

  describe("ThawNft", () => {
    it("Thaw an NFT", async () => {
      await program.methods
        .thawNft()
        .accountsStrict({
          asset: asset.publicKey,
          creator: creator.publicKey,
          collection: collection.publicKey,
          collectionAuthority: collectionAuthorityPda,
          coreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

        let umi = createUmi(connection.rpcEndpoint);

        let assetv1 = fetchAssetV1(umi, fromWeb3JsPublicKey(asset.publicKey));        

        assert.equal(false, (await assetv1).freezeDelegate.frozen)        
    });

    it("Fails to thaw with unauthorized authority", async () => {
      try {
        await program.methods
          .thawNft()
          .accountsStrict({
            asset: asset.publicKey,
            creator: unauthorizedAuthority.publicKey, // Unauthorized authority
            collection: collection.publicKey,
            collectionAuthority: collectionAuthorityPda,
            coreProgram: MPL_CORE_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedAuthority])
          .rpc();
        assert.fail("Should have failed with unauthorized authority");
      } catch (err) {
        assert.equal(err.error.errorCode.code, "NotAuthorized", "Expected NotAuthorized error");
      }
    });
  });

  describe("Update NFT", ()=>{
    it("Update an NFT name", async () => {
      
      await program.methods.
        updateNft("New NFT name").
        accountsStrict({
          asset:asset.publicKey,
          creator:creator.publicKey,
          payer:payer.publicKey,
          collection:collection.publicKey,
          collectionAuthority:collectionAuthorityPda,
          coreProgram:MPL_CORE_PROGRAM_ID,
          systemProgram:SystemProgram.programId
        })
        .signers([creator])
        .rpc()

        const assetRawAccount = (await connection.getAccountInfo(asset.publicKey));

        const assetSerializer = getAssetV1AccountDataSerializer();

        const assetAccount = assetSerializer.deserialize(assetRawAccount.data)[0];
        
        assert.equal("New NFT name", assetAccount.name);
    })

    it("Fails to update NFT with unauthorized authority", async ()=> {
      try {
        await program.methods.
        updateNft("New NFT name").
        accountsStrict({
          asset:asset.publicKey,
          creator:unauthorizedAuthority.publicKey,
          payer:payer.publicKey,
          collection:collection.publicKey,
          collectionAuthority:collectionAuthorityPda,
          coreProgram:MPL_CORE_PROGRAM_ID,
          systemProgram:SystemProgram.programId
        })
        .signers([unauthorizedAuthority])
        .rpc();
        assert.fail("Should have failed with unauthorized authority");
      } catch (err) {
        assert.instanceOf(err, anchor.AnchorError);
        assert.equal(err.error.errorCode.code, "NotAuthorized", "Expected NotAuthorized error");
      }
    })
  });
});