import React, {useState} from 'react';
import logo from './logo.svg';
import './App.css';
import { PublicKey, Connection, Transaction, TransactionInstruction, SystemProgram, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import assert from 'assert';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// const RPC = "http://127.0.0.1:8899";
const RPC = "https://api.devnet.solana.com";
const connection = new Connection(RPC);
const GAME_ACCOUNT_SIZE = 58;

const EVENTS_PROGRAM = new PublicKey("9DfgGPSgX25deeqc59moqHvPUFpUjH7Wfa8LVeKbX2bZ");

function App() {
  const [wallet, setWallet] = useState(null);
  const [programID, setProgramID] = useState("9vp3FvFCrXeFmsi4hiH7G1maX1DcDoJgDNU3JMf3BrMb");
  const [seed, setSeed] = useState("[0x50, 0x00, 0x00, 0x10, 0x20, 0xad, 0x35]");
  const [pdaAddress, setPdaAddress] = useState("");
  const [stakingValue, setStakingValue] = useState("1");
  const [eventId, setEventId] = useState(null);
  const [betsAcceptedUntil, setBetsAcceptedUntil] = useState("");
  const [teamA_sol, setTeamA_sol] = useState(0);
  const [teamB_sol, setTeamB_sol] = useState(0);

  const connect = () => {
    const solana: any = (window as any).solana;
    solana.on("connect", () => { 
      setWallet(solana);
    });
    solana.connect();
  };

  const fetchEventData = async (event: PublicKey) => {
    const account = await connection.getAccountInfo(event);
    if (!account) return;
    const timestamp = account.data.readBigUInt64LE(33);
    setBetsAcceptedUntil((new Date(parseInt(timestamp.toString()) * 1000)).toString());
    console.log(account);
    const bets_amount = account.data.readUInt32LE(0x2a);
    console.log(bets_amount);
    let amounts = [0, 0, 0];
    for (let i = 0; i < bets_amount; ++i) {
      const amount = account.data.readBigInt64LE(0x2a + 4 + 32*bets_amount + 4 + i*8);
      const choice = account.data.readUint8(     0x2a + 4 + 32*bets_amount + 4 + 8*bets_amount + 4 + i);
      console.log(0x2a + 4 + 32*bets_amount + i*8, amount, choice);
      amounts[choice] += parseInt(amount.toString());
    }
    setTeamA_sol(1.0 * amounts[1] / 1e9);
    setTeamB_sol(1.0 * amounts[2] / 1e9);
  };

  const createEvent = async () => {
    const walletPubkey = (window as any).solana.publicKey;
    console.log("Wallet", walletPubkey);
    const latestBlockHash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: (window as any).solana.publicKey,
      recentBlockhash: latestBlockHash.blockhash,
    });
    const gameKey = Keypair.generate();
    transaction.add(SystemProgram.createAccount({
      fromPubkey: walletPubkey,
      lamports: (await connection.getMinimumBalanceForRentExemption(GAME_ACCOUNT_SIZE)),
      newAccountPubkey: gameKey.publicKey,
      programId: EVENTS_PROGRAM,
      space: GAME_ACCOUNT_SIZE,
    }));
    const command = Buffer.allocUnsafe(9);
    const date = new Date();
    date.setMinutes(date.getMinutes() + 5000);
    command.writeUInt8(0, 0);
    command.writeBigUInt64LE(BigInt(date.valueOf()) / BigInt(1000), 1);
    transaction.add(new TransactionInstruction({
      keys: [
        { pubkey: walletPubkey, isSigner: true,  isWritable: true  },
        { pubkey: gameKey.publicKey, isSigner: false, isWritable: true },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      ],
      programId: EVENTS_PROGRAM,
      data: command,
    }));
    transaction.partialSign(gameKey);
    const signedTransaction = await (window as any).solana.signTransaction(transaction);
    // const sendingResult = await connection.sendRawTransaction(signedTransaction.serialize(), {skipPreflight: true});
    const sendingResult = await connection.sendRawTransaction(signedTransaction.serialize(), {skipPreflight: false});
    console.log("Game account created!", signedTransaction, sendingResult);
    (window as any).gameKey = gameKey.publicKey;
    setEventId(gameKey.publicKey as any);
    window.setTimeout(()=>{ fetchEventData(gameKey.publicKey); }, 1000);
  }

  const setEventIdFromInput = () => {
    const gameKey = new PublicKey((window.document.getElementById("event-id") as HTMLInputElement).value);
    (window as any).gameKey = gameKey;
    setEventId(gameKey as any);
    fetchEventData(gameKey);
  };

  const vote = async (choice: number) => {
    const sols_str = window.prompt("How much SOLs?");
    if (!sols_str) return;
    const sol = BigInt(1e9*parseFloat(sols_str));

    function bnToBuf(bn: bigint) {
      var hex = BigInt(bn).toString(16);
      if (hex.length % 2) { hex = '0' + hex; }
    
      var len = hex.length / 2;
      var u8 = new Uint8Array(len);
    
      var i = 0;
      var j = hex.length - 2;
      while (i < len) {
        u8[i] = parseInt(hex.slice(j, j+2), 16);
        i += 1;
        j -= 2;
      }
    
      return u8;
    }

    const walletPubkey = (window as any).solana.publicKey;
    console.log("Wallet", walletPubkey, "game", (window as any).gameKey);
    const latestBlockHash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: (window as any).solana.publicKey,
      recentBlockhash: latestBlockHash.blockhash,
    });
    const instruction = [1, choice];
    bnToBuf(sol).forEach(n => instruction.push(n));
    const tmpStorageKey = Keypair.generate();
    transaction.add(SystemProgram.createAccount({
      fromPubkey: walletPubkey,
      lamports: parseInt(sol.toString()),
      newAccountPubkey: tmpStorageKey.publicKey,
      programId: EVENTS_PROGRAM,
      space: 0,
    }));
    while (instruction.length < 10) instruction.push(0);
    // transaction.add(SystemProgram.transfer({
    //   fromPubkey: walletPubkey,
    //   toPubkey: EVENTS_PROGRAM,
    //   lamports: parseInt(sol.toString()),
    // }));
    transaction.add(new TransactionInstruction({
      keys: [
        { pubkey: walletPubkey, isSigner: true,  isWritable: true  },
        { pubkey: (window as any).gameKey, isSigner: false, isWritable: true },
        { pubkey: tmpStorageKey.publicKey, isSigner: false, isWritable: true },
      ],
      programId: EVENTS_PROGRAM,
      data: Buffer.from(instruction),
    }));
    transaction.partialSign(tmpStorageKey);
    const signedTransaction = await (window as any).solana.signTransaction(transaction);
    const sendingResult = await connection.sendRawTransaction(signedTransaction.serialize(), {skipPreflight: false});
    console.log("Bet done!", signedTransaction, sendingResult);
  };

  const setWinner = async (choice: number) => {
    const walletPubkey = (window as any).solana.publicKey;
    console.log("Wallet", walletPubkey, "game", (window as any).gameKey);
    const latestBlockHash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: (window as any).solana.publicKey,
      recentBlockhash: latestBlockHash.blockhash,
    });
    const instruction = [2, choice];
    transaction.add(new TransactionInstruction({
      keys: [
        { pubkey: walletPubkey, isSigner: true,  isWritable: true  },
        { pubkey: (window as any).gameKey, isSigner: false, isWritable: true },
      ],
      programId: EVENTS_PROGRAM,
      data: Buffer.from(instruction),
    }));
    const signedTransaction = await (window as any).solana.signTransaction(transaction);
    const sendingResult = await connection.sendRawTransaction(signedTransaction.serialize(), {skipPreflight: false});
    console.log("SetResult done!", signedTransaction, sendingResult);
  };

  const onProgramIDChanged = async (newId: string, seed: string) => {
    setProgramID(newId);
    setSeed(seed);
    const [pda, bump] = await PublicKey.findProgramAddress([Buffer.from(eval(seed))], new PublicKey(programID));
    setPdaAddress(`${bump}, ${pda.toBase58()}`);
  };

  const STAKING_ACCOUNT_SEED = "KN5NSTQ/100003";  // Если надо иметь несколько аккаунтов, то надо менять это число.
  const PROGRAM = new PublicKey("9vp3FvFCrXeFmsi4hiH7G1maX1DcDoJgDNU3JMf3BrMb");
  // Все поля ниже вычислены, используя форму выше. Как только что-то поменяется, их надо будет перевычислить.
  const PROGRAM_ASSOCIATED_ACCOUNT = new PublicKey("6R5wZEKJPtm3EkV6n5W5u5r5o7nYCnnK9uA5dwtCU7P7");
  const POOL_ADDRESS = new PublicKey("DjHnG6xbtxyT297XZWKyqxPsAngtoy9GkuehavoGUcY4");
  const MINT_ADDRESS = new PublicKey("2R9BSYengJ8Hsecngam2w7uJxLLgEHcN86wigoerZTTn");
  const STAKING_ACCOUNT_SIZE = 1 + 32 + 8 + 2 + 8 + 8 + 8;
  const BUMP = 255;
  
  const stake = async () => {
    const walletPubkey: PublicKey = (window as any).solana.publicKey;
    const stakingAccountPubkey = await PublicKey.createWithSeed(walletPubkey, STAKING_ACCOUNT_SEED, PROGRAM);
    console.log("Computed PDA for", walletPubkey.toBase58(), " + ", STAKING_ACCOUNT_SEED, " = ", stakingAccountPubkey.toBase58());
    const latestBlockHash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
        feePayer: walletPubkey,
        recentBlockhash: latestBlockHash.blockhash,
    });
    transaction.add(SystemProgram.createAccountWithSeed({
        fromPubkey: walletPubkey,
        basePubkey: walletPubkey,
        newAccountPubkey: stakingAccountPubkey,
        seed: STAKING_ACCOUNT_SEED,
        lamports: await connection.getMinimumBalanceForRentExemption(STAKING_ACCOUNT_SIZE),
        space: STAKING_ACCOUNT_SIZE,
        programId: PROGRAM,
    }));
    const instruction = Buffer.alloc(12);
    instruction.writeUInt8(0, 0);
    instruction.writeInt16LE(180, 1); // можно передать 360. Тут продолжительность стейкинга.
    const tokenDenom = BigInt("1000000000");
    const value = BigInt(stakingValue);
    instruction.writeBigUInt64LE(tokenDenom * value, 3);
    instruction.writeUInt8(BUMP, 11);
    console.log(instruction);

    const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    );
    const ataAddress = (await PublicKey.findProgramAddress(
          [
            walletPubkey.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            MINT_ADDRESS.toBuffer(),
          ],
          SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    ))[0];
    console.log("Ata for", walletPubkey.toBase58(), "for mint", MINT_ADDRESS.toBase58(), "is", ataAddress.toBase58());

    transaction.add(new TransactionInstruction({
      keys: [
        { pubkey: stakingAccountPubkey, isSigner: false, isWritable: true },
        { pubkey: walletPubkey, isSigner: true,  isWritable: true  },
        { pubkey: ataAddress, isSigner: false, isWritable: true },
        { pubkey: POOL_ADDRESS, isSigner: false, isWritable: true },
        { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
      ],
      programId: PROGRAM,
      data: instruction,
    }));

    const signedTransaction = await (window as any).solana.signTransaction(transaction);
    const txSignature = await connection.sendRawTransaction(signedTransaction.serialize());
    console.log("Tx", txSignature, "sent");
    const status = (
      await connection.confirmTransaction(
        txSignature,
      )
    ).value;
  
    if (status.err) {
      throw new Error(
        `Transaction ${txSignature} failed (${JSON.stringify(status)})`,
      );
    }
  };

  const collect = async (policy: number) => {
    const walletPubkey: PublicKey = (window as any).solana.publicKey;
    const stakingAccountPubkey = await PublicKey.createWithSeed(walletPubkey, STAKING_ACCOUNT_SEED, PROGRAM);
    console.log("Computed PDA for", walletPubkey.toBase58(), " + ", STAKING_ACCOUNT_SEED, " = ", stakingAccountPubkey.toBase58());

    const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    );
    const ataAddress = (await PublicKey.findProgramAddress(
          [
            walletPubkey.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            MINT_ADDRESS.toBuffer(),
          ],
          SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    ))[0];
    console.log("Ata for", walletPubkey.toBase58(), "for mint", MINT_ADDRESS.toBase58(), "is", ataAddress.toBase58());

    const latestBlockHash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
        feePayer: walletPubkey,
        recentBlockhash: latestBlockHash.blockhash,
    });
    const instruction = Buffer.from([policy, BUMP]);
    transaction.add(new TransactionInstruction({
      keys: [
        { pubkey: stakingAccountPubkey, isSigner: false, isWritable: true },
        { pubkey: walletPubkey, isSigner: true,  isWritable: true  },
        { pubkey: ataAddress, isSigner: false, isWritable: true },
        { pubkey: POOL_ADDRESS, isSigner: false, isWritable: true },
        { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
        { pubkey: PROGRAM_ASSOCIATED_ACCOUNT, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM,
      data: instruction,
    }));

    const signedTransaction = await (window as any).solana.signTransaction(transaction);
    const txSignature = await connection.sendRawTransaction(signedTransaction.serialize());
    console.log("Tx", txSignature, "sent");
    const status = (
      await connection.confirmTransaction(
        txSignature,
      )
    ).value;
  
    if (status.err) {
      throw new Error(
        `Transaction ${txSignature} failed (${JSON.stringify(status)})`,
      );
    }
  };

  return (
    <div className="App">
      { !wallet ?  <section><button onClick={connect}>Connect</button></section> : <></>}
      <h2>Administrative fn</h2>
      <h3>Find PDA</h3>
      <p>
        <label>Program ID: <input type="text" value={programID} onChange={t=>onProgramIDChanged(t.target.value, seed)} /></label>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        <label>Seed: <input type="text" value={seed} onChange={t=>onProgramIDChanged(programID, t.target.value)} /></label>
      </p>
      <p>{pdaAddress}</p>
      { wallet ? <>
      <h2>Client Lounge</h2>
      <p>
        <input type="text" onChange={t=>setStakingValue(t.target.value)} value={stakingValue} />TKN&nbsp;&nbsp;<button onClick={()=>stake()}>Stake</button>
        &nbsp;&nbsp;&nbsp;
        <button onClick={()=>collect(1)}>Collect Interest</button>&nbsp;&nbsp;&nbsp;
        <button onClick={()=>collect(2)}>Compound Interest</button>&nbsp;&nbsp;&nbsp;
        <button onClick={()=>collect(3)}>Close Account</button>
      </p>
      </> : <></> }
    </div>
  );
}

export default App;
