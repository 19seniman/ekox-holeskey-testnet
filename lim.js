require('dotenv').config();
let ethersLib = require('ethers');
const ethers = ethersLib.ethers ? ethersLib.ethers : ethersLib;
const isV6 = !!ethers.parseEther;
const Provider    = isV6 ? ethers.JsonRpcProvider : ethers.providers.JsonRpcProvider;
const toBigInt    = (n) => (isV6 ? n : BigInt(n?.toString?.() ?? String(n)));
const parseUnits  = (v, d) => (isV6 ? ethers.parseUnits(v, d) : ethers.utils.parseUnits(v, d));
const formatUnits = (v, d) => (isV6 ? ethers.formatUnits(v, d) : ethers.utils.formatUnits(v, d));
const formatEther = (v) => (isV6 ? ethers.formatEther(v) : ethers.utils.formatEther(v));

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    bgRed: "\x1b[41m",
};

const logger = {
    // [🔫] 
    info: (msg) => console.log(`${colors.cyan}[🔫 LOADED] ${colors.reset}${msg}`),

    // [⚠️]
    warn: (msg) => console.log(`${colors.yellow}[⚡️ JAMMED] ${colors.reset}${msg}`),

    // [☠️] 
    error: (msg) => console.log(`${colors.red}${colors.bright}[☠️ FATAL HIT] ${colors.reset}${msg}`),

    // [🎯] 
    success: (msg) => console.log(`${colors.green}${colors.bright}[🎯 TARGET DOWN] ${colors.reset}${msg}`),

    // [⟳] 
    loading: (msg) => console.log(`${colors.magenta}[⟳ RELOADING] ${colors.reset}${msg}`),

    // [>] 
    step: (msg) => console.log(`${colors.blue}[⊕ AIMING] ${colors.bright}${msg}${colors.reset}`),

    banner: () => {
        console.clear();
        console.log(`${colors.green}${colors.dim}`);
        console.log(`   ▄██████████████▄▐█▄▄▄▄█▌`);
        console.log(`   ██████▌▄▌▄▐▐▌███▌▀▀██▀▀ `);
        console.log(`   ██████▌▀▌▀▐▐▌███▌▀M4X▀  `);
        console.log(`   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀        `);
        console.log(`${colors.reset}`);
        console.log(`${colors.green}   SYSTEM: ${colors.white}ONLINE ${colors.green}| MODE: ${colors.red}ASSAULT${colors.reset}`);
        console.log(`${colors.green}   TARGET: ${colors.cyan}ETHEREUM NETWORK${colors.reset}`);
        console.log(`${colors.dim}   -----------------------------------${colors.reset}`);
    },

    // Section 
    fire_line: (msg) => {
        console.log(`\n${colors.red}>>====> ${colors.white}${colors.bold}${msg.toUpperCase()} ${colors.red}<====<<${colors.reset}\n`);
    },

    // Countdown gaya bomb defusal
    countdown: (seconds) => {
        process.stdout.write(`\r${colors.yellow}[💣 DETONATION IN]: ${colors.red}${seconds}s ${colors.reset}   `);
    }
};

const RPC_URL = 'https://rpc.hoodi.ethpandaops.io';
const ADDR = {
  DEPOSIT:  '0x9E2DDb3386D5dCe991A2595E8bc44756F864C6E3',
  WITHDRAW: '0x1D150609EE9EdcC6143506Ba55A4FAaeDd562Cd9',
  EXETH:    '0x4d38Bd670764c49Cce1E59EeaEBD05974760aCbD',
  ETH_ADDR: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
};

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const DEPOSIT_ABI = [
  "function depositETH(uint256 nodeOperatorId) external payable"
];
const WITHDRAW_ABI = [
  "function withdraw(uint256 _amount, address _assetOut) external",
  "function claim(uint256 requestID, address requester) external"
];

const provider = new Provider(RPC_URL);

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, (ans) => res(ans.trim())));
const pressEnter = () => ask('\nPress Enter to return to the main menu...');

function loadPrivateKeysFromEnv() {
  const keys = Object.keys(process.env)
    .filter(k => k.startsWith('PRIVATE_KEY_'))
    .sort((a, b) => {
      const na = Number(a.replace('PRIVATE_KEY_', '')) || 0;
      const nb = Number(b.replace('PRIVATE_KEY_', '')) || 0;
      return na - nb;
    })
    .map(k => process.env[k])
    .filter(Boolean);

  if (keys.length === 0) {
    logger.error("No PRIVATE_KEY_* found in .env");
    process.exit(1);
  }
  return keys;
}

function makeWallet(pk) {
  try { return new ethers.Wallet(pk, provider); }
  catch (e) { logger.error(`Invalid private key: ${e.message}`); process.exit(1); }
}

async function ensureAllowance(tokenCtr, ownerAddr, spender, amount) {
  const current = await tokenCtr.allowance(ownerAddr, spender);
  if (toBigInt(current) >= toBigInt(amount)) return false;

  logger.step(`Approving allowance to ${spender} ...`);
  const tx = await tokenCtr.approve(spender, amount);
  const rc = await tx.wait();
  logger.success(`Approve confirmed. tx: ${isV6 ? rc.hash : tx.hash || rc.transactionHash}`);
  return true;
}

async function showHeaderBalances(wallets) {
  logger.loading(`Calibrating balances (ETH Hoodi & exETH) ...`);
  const ex = new ethers.Contract(ADDR.EXETH, ERC20_ABI, provider);
  const exDec = await ex.decimals().catch(() => 18);
  const exSym = await ex.symbol().catch(() => 'exETH');

  logger.fire_line('WALLET AMMUNITION');

  for (const w of wallets) {
    const [ethBal, exBal] = await Promise.all([
      provider.getBalance(w.address),
      ex.balanceOf(w.address)
    ]);
    logger.info(`Wallet ${w.address}`);
    console.log(`    ETH (Hoodi): ${formatEther(ethBal)}`);
    console.log(`    ${exSym}:       ${formatUnits(exBal, exDec)}`);
  }
  console.log();
}

async function doDeposit(wallet, amountEth, nodeOperatorId, times) {
  const signer = wallet.connect(provider);
  const dep  = new ethers.Contract(ADDR.DEPOSIT, DEPOSIT_ABI, signer);

  const amountWei = parseUnits(amountEth, 18);

  for (let i = 1; i <= times; i++) {
    logger.step(`Deposit ${i}/${times} for ${wallet.address} ...`);

    const balEth = await provider.getBalance(wallet.address);
    if (toBigInt(balEth) < toBigInt(amountWei)) {
      logger.error(`Insufficient Ammo (ETH). Needed ${amountEth}, have ${formatEther(balEth)}`);
      continue;
    }

    logger.loading(`Calling depositETH(${nodeOperatorId}) with ${amountEth} ETH ...`);
    const txDep = await dep.depositETH(nodeOperatorId, { value: amountWei });
    const rcDep = await txDep.wait();
    logger.success(`Deposit confirmed. Hash: ${isV6 ? rcDep.hash : txDep.hash || rcDep.transactionHash}`);
  }
}

async function doWithdraw(wallet, amountExEth, times) {
  const signer = wallet.connect(provider);
  const ex  = new ethers.Contract(ADDR.EXETH, ERC20_ABI, signer);
  const wdr = new ethers.Contract(ADDR.WITHDRAW, WITHDRAW_ABI, signer);

  const exDec     = await ex.decimals().catch(() => 18);
  const amountWei = parseUnits(amountExEth, exDec);

  for (let i = 1; i <= times; i++) {
    logger.step(`Withdraw ${i}/${times} for ${wallet.address} ...`);

    await ensureAllowance(ex, wallet.address, ADDR.WITHDRAW, amountWei);

    logger.loading(`Calling withdraw(${amountExEth} exETH, ETH) ...`);
    const txW = await wdr.withdraw(amountWei, ADDR.ETH_ADDR);
    const rcW = await txW.wait();
    logger.success(`Withdraw submitted. Hash: ${isV6 ? rcW.hash : txW.hash || rcW.transactionHash}`);
    logger.info(`Intel: Typical unlock to claim is ~25 minutes after withdraw.`);
  }
}

async function doClaim(wallet, attempts) {
  const signer = wallet.connect(provider);
  const wdr = new ethers.Contract(ADDR.WITHDRAW, WITHDRAW_ABI, signer);

  logger.info(`Proceeding claims operation`);
  const count = Math.max(1, parseInt(attempts || 1, 10));

  for (let idx = 0; idx < count; idx++) {
    logger.step(`Claiming index ${idx} for ${wallet.address} ...`);
    try {
      const tx = await wdr.claim(idx, wallet.address);
      const rc = await tx.wait();
      logger.success(`Claimed index ${idx}. Hash: ${isV6 ? rc.hash : tx.hash || rc.transactionHash}`);
    } catch (e) {
      const msg = e?.reason || e?.shortMessage || e?.message || String(e);
      logger.warn(`Claim index ${idx} missed: ${msg}`);
    }
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function showCountdown(totalSeconds) {
  let remaining = totalSeconds;
  
  while (remaining > 0) {
    // Menggunakan logger.countdown baru (Bomb Defusal Style)
    logger.countdown(remaining);
    await delay(1000);
    remaining--;
  }
  
  process.stdout.write('\n');
}

async function doDailyRun(wallets) {
  logger.fire_line('MISSION CONFIGURATION');
  
  const depositAmount = await ask('Amount per deposit tx (in ETH), e.g., 0.01: ');
  const withdrawAmount = await ask('Amount per withdraw tx (in exETH), e.g., 0.001: ');
  const numCycles = Math.max(1, parseInt(await ask('How many cycles to run (1 cycle = 1 deposit, 1 withdraw, 1 claim)?: ') || '1', 10));
  
  const nodeOpId = 0; 

  console.log();
  logger.success('Config locked in! Initiating run sequence...\n');
  await delay(2000);

  for (let i = 1; i <= numCycles; i++) {
    logger.fire_line(`ENGAGING CYCLE ${i} OF ${numCycles}`);
    
    try {
      logger.step(`Cycle ${i}/${numCycles}: Phase 1 - Deposits`);
      for (const wallet of wallets) {
        console.log();
        logger.info(`>>> Deposit Ops for ${wallet.address}`);
        await doDeposit(wallet, depositAmount, nodeOpId, 1); 
      }
      logger.fire_line('DEPOSIT PHASE COMPLETE');
      await delay(2000); 

      logger.step(`Cycle ${i}/${numCycles}: Phase 2 - Withdrawals`);
      for (const wallet of wallets) {
        console.log();
        logger.info(`>>> Withdraw Ops for ${wallet.address}`);
        await doWithdraw(wallet, withdrawAmount, 1); 
      }
      logger.fire_line('WITHDRAW PHASE COMPLETE');

      logger.info('Holding position for 1 minute (Withdrawal Unlock)...');
      await showCountdown(1 * 60); 

      logger.step(`Cycle ${i}/${numCycles}: Phase 3 - Claims`);
      for (const wallet of wallets) {
        console.log();
        logger.info(`>>> Claim Ops for ${wallet.address}`);
        await doClaim(wallet, 1); 
      }
      
      logger.fire_line(`CYCLE ${i} MISSION ACCOMPLISHED`);

      if (i < numCycles) {
        logger.info(`Cooling down 5 seconds before next engagement...`);
        await showCountdown(5);
      }

    } catch (e) {
      logger.error(`Error during cycle ${i}: ${e?.reason || e?.shortMessage || e?.message || String(e)}`);
      logger.warn('Tactical Retreat. Skipping to next cycle in 10 seconds...\n');
      await showCountdown(10); 
    }
  } 

  logger.fire_line('ALL MISSIONS COMPLETED');
  await pressEnter(); 
}

(async () => {
  logger.banner();

  const PKS = loadPrivateKeysFromEnv();
  const wallets = PKS.map(makeWallet);

  while (true) {
    await showHeaderBalances(wallets);

    logger.fire_line('COMMAND CENTER');
    console.log('1. Deposit Operation');
    console.log('2. Withdraw Operation');
    console.log('3. Claim Operation');
    console.log('4. Daily Mission (Auto)'); 
    console.log('5. Abort\n');
    const choice = await ask('Select Protocol (1-5): ');

    if (choice === '5') {
      rl.close();
      process.exit(0);
    }

    try {
      if (choice === '1') {
        const amountStr = await ask('Amount per tx (in ETH), e.g., 0.01: ');
        const nodeOpId  = 0;
        const timesStr  = await ask('How many bursts per wallet?: ');
        const times = Math.max(1, parseInt(timesStr || '1', 10));

        for (const wallet of wallets) {
          console.log();
          logger.info(`>>> Deposit for ${wallet.address}`);
          await doDeposit(wallet, amountStr, nodeOpId, times);
        }
        await pressEnter();

      } else if (choice === '2') {
        const amountStr = await ask('Amount per tx (in exETH), e.g., 0.001: ');
        const timesStr  = await ask('How many bursts per wallet?: ');
        const times = Math.max(1, parseInt(timesStr || '1', 10));

        for (const wallet of wallets) {
          console.log();
          logger.info(`>>> Withdraw for ${wallet.address}`);
          await doWithdraw(wallet, amountStr, times);
        }
        await pressEnter();

      } else if (choice === '3') {
        const attemptsStr = await ask('How many claim attempts per wallet?: ');
        const attempts = Math.max(1, parseInt(attemptsStr || '1', 10));

        for (const wallet of wallets) {
          console.log();
          logger.info(`>>> Claim for ${wallet.address}`);
          await doClaim(wallet, attempts);
        }
        await pressEnter();

      } else if (choice === '4') {
        await doDailyRun(wallets);

      } else {
        logger.error('Invalid Protocol Selected.');
        await pressEnter();
      }
    } catch (e) {
      logger.error(e?.reason || e?.shortMessage || e?.message || String(e));
      await pressEnter();
    }

    console.clear?.();
    logger.banner();
    console.log();
  }
})().catch((e) => {
  logger.error(e?.message || String(e));
  rl.close();
  process.exit(1);
});
