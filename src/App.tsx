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

function App() {
  const [wallet, setWallet] = useState(null);
  const [programID, setProgramID] = useState("9vp3FvFCrXeFmsi4hiH7G1maX1DcDoJgDNU3JMf3BrMb");
  const [seed, setSeed] = useState("[0x50, 0x00, 0x00, 0x10, 0x20, 0xad, 0x35]");
  const [pdaAddress, setPdaAddress] = useState("");
  const [stakingValue, setStakingValue] = useState("1");
  const [newStakeID, setNewStakeID] = useState("KN5NSTQ/100003");  // Да, это нормально что у всех будет одно и то же, но если кому-то нужно два стейка то надо увеличивать число
  const [fetchStakeID, setFetchStakeID] = useState("KN5NSTQ/100003");
  const [stakeInfo, setStakeInfo] = useState("");

  const connect = () => {
    const solana: any = (window as any).solana;
    solana.on("connect", () => { 
      setWallet(solana);
    });
    solana.connect();
  };

  const onProgramIDChanged = async (newId: string, seed: string) => {
    setProgramID(newId);
    setSeed(seed);
    const [pda, bump] = await PublicKey.findProgramAddress([Buffer.from(eval(seed))], new PublicKey(programID));
    setPdaAddress(`${bump}, ${pda.toBase58()}`);
  };

  const PROGRAM = new PublicKey("9vp3FvFCrXeFmsi4hiH7G1maX1DcDoJgDNU3JMf3BrMb");
  // Все поля ниже вычислены, используя форму выше. Как только что-то поменяется, их надо будет перевычислить.
  const PROGRAM_ASSOCIATED_ACCOUNT = new PublicKey("6R5wZEKJPtm3EkV6n5W5u5r5o7nYCnnK9uA5dwtCU7P7");
  const POOL_ADDRESS = new PublicKey("DjHnG6xbtxyT297XZWKyqxPsAngtoy9GkuehavoGUcY4");
  const MINT_ADDRESS = new PublicKey("2R9BSYengJ8Hsecngam2w7uJxLLgEHcN86wigoerZTTn");
  const STAKING_ACCOUNT_SIZE = 1 + 32 + 8 + 2 + 8 + 8 + 8;
  const BUMP = 255;
  
  const stake = async (stakeID: string) => {
    const walletPubkey: PublicKey = (window as any).solana.publicKey;
    const stakingAccountPubkey = await PublicKey.createWithSeed(walletPubkey, stakeID, PROGRAM);
    console.log("Computed PDA for", walletPubkey.toBase58(), " + ", stakeID, " = ", stakingAccountPubkey.toBase58());
    const latestBlockHash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
        feePayer: walletPubkey,
        recentBlockhash: latestBlockHash.blockhash,
    });
    transaction.add(SystemProgram.createAccountWithSeed({
        fromPubkey: walletPubkey,
        basePubkey: walletPubkey,
        newAccountPubkey: stakingAccountPubkey,
        seed: stakeID,
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

  const collect = async (policy: number, stakeID: string) => {
    const walletPubkey: PublicKey = (window as any).solana.publicKey;
    const stakingAccountPubkey = await PublicKey.createWithSeed(walletPubkey, stakeID, PROGRAM);
    console.log("Computed PDA for", walletPubkey.toBase58(), " + ", stakeID, " = ", stakingAccountPubkey.toBase58());

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

  const fetchStakeState = async (stakeID: string) => {
    const walletPubkey: PublicKey = (window as any).solana.publicKey;
    const stakingAccountPubkey = await PublicKey.createWithSeed(walletPubkey, stakeID, PROGRAM);
    console.log("Computed PDA for", walletPubkey.toBase58(), " + ", stakeID, " = ", stakingAccountPubkey.toBase58());
    const account = await connection.getAccountInfo(stakingAccountPubkey);
    if (!account) {
      console.log("Unable to get account, nothingt to do");
      return;
    }
    const stakedAmount = account.data.readBigUInt64LE(43);

    const balanceAtoms = stakedAmount.toString();
    const balance = balanceAtoms.substr(0, balanceAtoms.length - 9) + "," + balanceAtoms.substr(balanceAtoms.length - 9);
    const lockStarted = new Date(parseInt((account.data.readBigUInt64LE(33) * BigInt(1000)).toString()));
    const stakingStarted = new Date(parseInt((account.data.readBigUInt64LE(51) * BigInt(1000)).toString()));

    const ANNUAL_INTEREST_NOMITATORS = [15, 17];
    const ANNUAL_INTEREST_DENOMITATORS = [100, 100];
    const SECONDS_PER_YEAR = 360 * 24 * 3600;
    const INTEREST_ALLOCATION_PERIOD_SECONDS = 60;

    const interestWithdrawable = ((new Date() as any) - (stakingStarted as any)) / 1000 / INTEREST_ALLOCATION_PERIOD_SECONDS;
    console.log("interestWithdrawable", interestWithdrawable, "events happened");
    const singleIntervalInterest = 1.0 * ANNUAL_INTEREST_NOMITATORS[0] / ANNUAL_INTEREST_DENOMITATORS[0] / SECONDS_PER_YEAR * INTEREST_ALLOCATION_PERIOD_SECONDS;
    const totalInterest = parseInt(balanceAtoms) * singleIntervalInterest * interestWithdrawable / 1e9;
    setStakeInfo(`Locked amount ${balance} + ${totalInterest}`)
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
      <h3>Existing Stake</h3>
      <p>
        <input type="text" value={fetchStakeID} onChange={t=>setFetchStakeID(t.target.value)} />
        <button onClick={()=>fetchStakeState(fetchStakeID)}>Fetch</button>
        <span>{ stakeInfo }</span>
      </p>
      <h3>Create Stake</h3>
      <p>
        <input type="text" value={newStakeID} onChange={t=>setNewStakeID(t.target.value)} />&nbsp;<input type="text" onChange={t=>setStakingValue(t.target.value)} value={stakingValue} />&thinsp;TKN&nbsp;&nbsp;<button onClick={()=>stake(newStakeID)}>Stake</button>
        &nbsp;&nbsp;&nbsp;
        <button onClick={()=>collect(1, newStakeID)}>Collect Interest</button>&nbsp;&nbsp;&nbsp;
        <button onClick={()=>collect(2, newStakeID)}>Compound Interest</button>&nbsp;&nbsp;&nbsp;
        <button onClick={()=>collect(3, newStakeID)}>Close Account</button>
      </p>
      </> : <></> }
    </div>
  );
}

export default App;
