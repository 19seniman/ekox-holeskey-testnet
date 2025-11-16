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
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  magenta: "\x1b[35m", 
  blue: "\x1b[34m",    
  gray: "\x1b[90m",    
  bold: "\x1b[1m",
};

const logger = {
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.blue}[>] ${colors.bold}${msg}${colors.reset}`),
    critical: (msg) => console.log(`${colors.red}${colors.bold}[FATAL] ${msg}${colors.reset}`),
    summary: (msg) => console.log(`${colors.green}${colors.bold}[SUMMARY] ${msg}${colors.reset}`),
    banner: () => {
        const border = `${colors.blue}${colors.bold}╔═════════════════════════════════════════╗${colors.reset}`;
        const title = `${colors.blue}${colors.bold}║    🍉 19Seniman From Insider    🍉    ║${colors.reset}`;
        const bottomBorder = `${colors.blue}${colors.bold}╚═════════════════════════════════════════╝${colors.reset}`;

        console.log(`\n${border}`);
        console.log(title);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(40);
        console.log(`\n${colors.gray}${line}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bold} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${line}${colors.reset}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
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
    logger.critical("No PRIVATE_KEY_* found in .env");
    process.exit(1);
  }
  return keys;
}

function makeWallet(pk) {
  try { return new ethers.Wallet(pk, provider); }
  catch (e) { logger.critical(`Invalid private key: ${e.message}`); process.exit(1); }
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
  logger.loading(`Fetching balances (ETH Hoodi & exETH) ...`);
  const ex = new ethers.Contract(ADDR.EXETH, ERC20_ABI, provider);
  const exDec = await ex.decimals().catch(() => 18);
  const exSym = await ex.symbol().catch(() => 'exETH');

  logger.section('WALLET BALANCES');

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
      logger.error(`Insufficient ETH. Needed ${amountEth}, have ${formatEther(balEth)}`);
      continue;
    }

    logger.loading(`Calling depositETH(${nodeOperatorId}) with ${amountEth} ETH ...`);
    const txDep = await dep.depositETH(nodeOperatorId, { value: amountWei });
    const rcDep = await txDep.wait();
    logger.success(`Deposit confirmed. tx: ${isV6 ? rcDep.hash : txDep.hash || rcDep.transactionHash}`);
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
    logger.success(`Withdraw submitted. tx: ${isV6 ? rcW.hash : txW.hash || rcW.transactionHash}`);
    logger.info(`Typical unlock to claim is ~25 minutes after withdraw.`);
  }
}

async function doClaim(wallet, attempts) {
  const signer = wallet.connect(provider);
  const wdr = new ethers.Contract(ADDR.WITHDRAW, WITHDRAW_ABI, signer);

  logger.info(`Proceeding claims`);
  const count = Math.max(1, parseInt(attempts || 1, 10));

  for (let idx = 0; idx < count; idx++) {
    logger.step(`Claiming index ${idx} for ${wallet.address} ...`);
    try {
      const tx = await wdr.claim(idx, wallet.address);
      const rc = await tx.wait();
      logger.success(`Claimed index ${idx}. tx: ${isV6 ? rc.hash : tx.hash || rc.transactionHash}`);
    } catch (e) {
      const msg = e?.reason || e?.shortMessage || e?.message || String(e);
      logger.warn(`Claim index ${idx} failed: ${msg}`);
    }
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatCountdown(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function showCountdown(totalSeconds) {
  let remaining = totalSeconds;
  
  while (remaining > 0) {
    // Menggunakan logger.countdown baru
    logger.countdown(`Next run in: ${formatCountdown(remaining)}   `);
    await delay(1000);
    remaining--;
  }
  
  process.stdout.write('\n');
}

async function doDailyRun(wallets) {
  logger.section('Cycle Run Configuration');
  
  const depositAmount = await ask('Amount per deposit tx (in ETH), e.g., 0.01: ');
  const withdrawAmount = await ask('Amount per withdraw tx (in exETH), e.g., 0.001: ');
  const numCycles = Math.max(1, parseInt(await ask('How many cycles to run (1 cycle = 1 deposit, 1 withdraw, 1 claim)?: ') || '1', 10));
  
  const nodeOpId = 0; 

  console.log();
  logger.success('Configuration saved! Starting run...\n');
  await delay(2000);

  for (let i = 1; i <= numCycles; i++) {
    logger.section(`Running Cycle ${i} of ${numCycles}`);
    
    try {
      logger.step(`Cycle ${i}/${numCycles}: Step 1 - Deposits`);
      for (const wallet of wallets) {
        console.log();
        logger.info(`>>> Deposit for ${wallet.address}`);
        await doDeposit(wallet, depositAmount, nodeOpId, 1); 
      }
      logger.summary('All deposits for this cycle completed!\n');
      await delay(2000); 

      logger.step(`Cycle ${i}/${numCycles}: Step 2 - Withdrawals`);
      for (const wallet of wallets) {
        console.log();
        logger.info(`>>> Withdraw for ${wallet.address}`);
        await doWithdraw(wallet, withdrawAmount, 1); 
      }
      logger.summary('All withdrawals for this cycle submitted!\n');

      logger.info('Waiting 1 minute for withdrawal unlock...');
      await showCountdown(1 * 60); 

      logger.step(`Cycle ${i}/${numCycles}: Step 3 - Claims`);
      for (const wallet of wallets) {
        console.log();
        logger.info(`>>> Claim for ${wallet.address}`);
        await doClaim(wallet, 1); 
      }
      
      logger.summary(`Cycle ${i} of ${numCycles} completed!\n`);

      if (i < numCycles) {
        logger.info(`Waiting 5 seconds before starting next cycle...`);
        await showCountdown(5);
      }

    } catch (e) {
      logger.error(`Error during cycle ${i}: ${e?.reason || e?.shortMessage || e?.message || String(e)}`);
      logger.warn('Skipping to the next cycle (if any) in 10 seconds...\n');
      await showCountdown(10); 
    }
  } 

  logger.summary('All cycles completed!\n');
  await pressEnter(); 
}

(async () => {
  logger.banner();

  const PKS = loadPrivateKeysFromEnv();
  const wallets = PKS.map(makeWallet);

  while (true) {
    await showHeaderBalances(wallets);

    logger.section('MAIN MENU');
    console.log('1. Deposit');
    console.log('2. Withdraw');
    console.log('3. Claim');
    console.log('4. Daily Run'); 
    console.log('5. Exit\n');
    const choice = await ask('Choose option (1-5): ');

    if (choice === '5') {
      rl.close();
      process.exit(0);
    }

    try {
      if (choice === '1') {
        const amountStr = await ask('Amount per tx (in ETH), e.g., 0.01: ');
        const nodeOpId  = 0;
        const timesStr  = await ask('How many transactions per wallet?: ');
        const times = Math.max(1, parseInt(timesStr || '1', 10));

        for (const wallet of wallets) {
          console.log();
          logger.info(`>>> Deposit for ${wallet.address}`);
          await doDeposit(wallet, amountStr, nodeOpId, times);
        }
        await pressEnter();

      } else if (choice === '2') {
        const amountStr = await ask('Amount per tx (in exETH), e.g., 0.001: ');
        const timesStr  = await ask('How many transactions per wallet?: ');
        const times = Math.max(1, parseInt(timesStr || '1', 10));

        for (const wallet of wallets) {
          console.log();
          logger.info(`>>> Withdraw for ${wallet.address}`);
          await doWithdraw(wallet, amountStr, times);
        }
        await pressEnter();

      } else if (choice === '3') {
        const attemptsStr = await ask('How many claims to attempt per wallet?: ');
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
        logger.error('Invalid option.');
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
  logger.critical(e?.message || String(e));
  rl.close();
  process.exit(1);
});
