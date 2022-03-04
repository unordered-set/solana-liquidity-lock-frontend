import React, {useState} from 'react';
import logo from './logo.svg';
import './App.css';
import { PublicKey, Connection, Transaction, TransactionInstruction, SystemProgram, Keypair } from '@solana/web3.js';
import { Buffer } from 'buffer';

// const RPC = "http://127.0.0.1:8899";
const RPC = "https://api.devnet.solana.com";
const connection = new Connection(RPC);
const PERMANENT_LEN = 1 + 32 + 8 + 1 + 4 + 4 + 4 + 4;
const DYNAMIC_ITEM_SIZE =             32 + 8 + 1 + 1;

const EVENTS_PROGRAM = new PublicKey("9DfgGPSgX25deeqc59moqHvPUFpUjH7Wfa8LVeKbX2bZ");

function App() {
  const [wallet, setWallet] = useState(null);
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
    const max_bets = 3;
    const GAME_ACCOUNT_SIZE = PERMANENT_LEN + DYNAMIC_ITEM_SIZE * max_bets;
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
    date.setMinutes(date.getMinutes() + 5);
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

  return (
    <div className="App">
      { !wallet ?  <section><button onClick={connect}>Connect</button></section> : (
        !eventId ? <section className="Section">
                      <h1>Event Creation</h1>
                      <p>
                        <button onClick={createEvent}>Create Event</button> or
                        <input type="text" placeholder="Paste existing" id="event-id" /> <button onClick={setEventIdFromInput}>Use</button></p>
                    </section> :
        <>
        <h1>Event { (eventId as any).toBase58() }</h1>
        <h2>Admin</h2>
        <p><button onClick={()=>setWinner(1)}>Set Team A won</button> <button onClick={()=>setWinner(1)}>Set Team B won</button> <button onClick={()=>setWinner(3)}>Set Draw</button></p>
        <h2>Player</h2>
        <p>Bets are accepted until: { betsAcceptedUntil }</p>
        <p>Team A: {teamA_sol} SOL, Team B: {teamB_sol} SOL</p>
        <p><button onClick={()=>vote(1)}>Bet for Team A{ teamA_sol > 0 ? " " + (100 * teamB_sol / teamA_sol).toFixed(0) + "%" : ""}</button> <button onClick={()=>vote(2)}>Bet for Team B{ teamA_sol > 0 ? " " + (100 * teamA_sol / teamB_sol).toFixed(0) + "%" : ""}</button></p>
        </>
      )}
    </div>
  );
}

export default App;
