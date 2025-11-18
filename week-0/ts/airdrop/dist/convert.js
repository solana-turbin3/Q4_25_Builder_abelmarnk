#!/usr/bin/env node
import prompt from "prompt-sync";
import bs58 from "bs58";
const promptSync = prompt();
const option = promptSync("What formart would you like to convert to(Supported (To-From)base-58|Json array): ").
    toLowerCase();
if (option.includes("base") && option.includes("58")) {
    const base58Key = promptSync("Enter the base 58 key:");
    try {
        const decoded = bs58.decode(base58Key);
        const keyArray = Array.from(decoded);
        console.log("\nJSON array:");
        console.log(JSON.stringify(keyArray));
    }
    catch (err) {
        console.error("\nInvalid Base58 key.");
    }
}
else if (option.includes("json") && option.includes("array")) {
    const jsonArray = promptSync("Enter the json array:");
    try {
        const parsedArray = JSON.parse(jsonArray);
        if (!Array.isArray(parsedArray)) {
            throw new Error("Invalid Json array key");
        }
        const uint8Array = Uint8Array.from(parsedArray);
        const base58Key = bs58.encode(uint8Array);
        console.log("\nBase 58 key:");
        console.log(JSON.stringify(base58Key));
    }
    catch (err) {
        console.error("\nInvalid Json array key.");
    }
}
else {
    console.error("\nInvalid option.");
}
/*
#[test]
fn base58_to_wallet() {
println!("Enter your name:");
let stdin = io::stdin();
let base58 = stdin.lock().lines().next().unwrap().unwrap(); //
gdtKSTXYULQNx87fdD3YgXkzVeyFeqwtxHm6WdEb5a9YJRnHse7GQr7t5pbepsyvU Ck7Vv
ksUGhPt4SZ8JHVSkt
let wallet = bs58::decode(base58).into_vec().unwrap();
println!("{:?}", wallet);
}

#[test]
fn wallet_to_base58() {
let wallet: Vec<u8> =
vec![34,46,55,124,141,190,24,204,134,91,70,184,161,181,44,122,15,172,6
3,62,153,150,99,255,202,89,105,77,41,89,253,130,27,195,134,14,66,75,24
2,7,132,234,160,203,109,195,116,251,144,44,28,56,231,114,50,131,185,16
8,138,61,35,98,78,53];
let base58 = bs58::encode(wallet).into_string();
println!("{:?}", base58);
}
*/ 
//# sourceMappingURL=convert.js.map