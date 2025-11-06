require('dotenv').config();
let ethersLib = require('ethers');
const ethers = ethersLib.ethers ? ethersLib.ethers : ethersLib;
const isV6 = !!ethers.parseEther;

// --- Ethers.js v5/v6 Compatibility Helpers ---
const Provider = isV6 ? ethers.JsonRpcProvider : ethers.providers.JsonRpcProvider;
const toBigInt = (n) => (isV6 ? n : BigInt(n?.toString?.() ?? String(n)));
const parseUnits = (v, d) => (isV6 ? ethers.parseUnits(v, d) : ethers.utils.parseUnits(v, d));
const formatUnits = (v, d) => (isV6 ? ethers.formatUnits(v, d) : ethers.utils.formatUnits(v, d));
const formatEther = (v) => (isV6 ? ethers.formatEther(v) : ethers.utils.formatEther(v));
// ---------------------------------------------

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    bold: "\x1b[1m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    gray: "\x1b[90m",
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
        const title = `${colors.blue}${colors.bold}║   🍉 19Seniman From Insider    🍉   ║${colors.reset}`;
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

// --- KONFIGURASI JARINGAN HOODI ---
const RPC_URL = 'https://rpc.hoodi.ethpandaops.io'; // RPC HOODI

const ADDR = {
    // ✅ DIPERBARUI: Alamat Deposit diatur SAMA DENGAN EXETH
    DEPOSIT: '0x4d38Bd670764c49Cce1E59EeaEBD05974760aCbD', 
    WITHDRAW: '0x1d150609ee9edcc6143506ba55a4faaedd562cd9', 
    WETH: '0x4200000000000000000000000000000000000006', 
    EXETH: '0x4d38Bd670764c49Cce1E59EeaEBD05974760aCbD', // SAMA DENGAN DEPOSIT
    
    ETH_RECEIVER: '0xf01fb9a6855f175d3f3e28e00fa617009c38ef59',
};
const ETH_TRANSFER_AMOUNT = '0.0019'; 
// -----------------------------

const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function deposit() payable", 
];
// ABI Deposit disederhanakan: deposit(uint256)
const DEPOSIT_ABI = [
    "function deposit(uint256 _value) external",
];
const WITHDRAW_ABI = [
    "function withdraw(uint256 _value, address _addr) external",
    "function claim(uint256 withdrawRequestIndex, address user) external"
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
    try {
        const tx = await tokenCtr.approve(spender, amount);
        const rc = await tx.wait();
        logger.success(`Approve confirmed. tx: ${isV6 ? rc.hash : tx.hash || rc.transactionHash}`);
        return true;
    } catch (e) {
        const msg = e?.reason || e?.shortMessage || e?.message || String(e);
        logger.error(`Approve failed: ${msg}`);
        throw new Error(`Approve failed: ${msg}`); 
    }
}

async function showHeaderBalances(wallets) {
    logger.loading(`Fetching balances (ETH Hoodi & exETH) ...`);
    const ex = new ethers.Contract(ADDR.EXETH, ERC20_ABI, provider);
    
    let exDec = 18;
    let exSym = 'exETH';
    try {
        exDec = await ex.decimals();
        exSym = await ex.symbol();
    } catch (e) {
        logger.warn(`Could not fetch EXETH token details (symbol/decimals). Using default: 18 decimals, 'exETH' symbol.`);
    }

    for (const w of wallets) {
        let ethBal = toBigInt(0);
        let exBal = toBigInt(0);

        try {
            ethBal = await provider.getBalance(w.address);
            exBal = await ex.balanceOf(w.address);
        } catch (e) {
            logger.error(`Error fetching balances for ${w.address}: ${e.shortMessage || 'Decode Error'}`);
        }
        
        logger.info(`Wallet ${w.address}`);
        console.log(`ETH (Hoodi): ${formatEther(ethBal)}`);
        console.log(`${exSym}: ${formatUnits(exBal, exDec)}`);
    }
    console.log();
}

/**
 * Fungsi untuk transfer ETH Hoodi secara otomatis.
 */
async function doEthTransfer(wallet) {
    const signer = wallet.connect(provider);
    const amountWei = parseUnits(ETH_TRANSFER_AMOUNT, 18); 

    logger.step(`[AUTO] Transfer ${ETH_TRANSFER_AMOUNT} ETH to ${ADDR.ETH_RECEIVER} ...`);

    const balEth = await provider.getBalance(wallet.address);
    if (toBigInt(balEth) < toBigInt(amountWei) + parseUnits('0.0001', 18)) {
        logger.error(`Insufficient ETH. Needed ~${ETH_TRANSFER_AMOUNT}, have ${formatEther(balEth)}. Skipping transfer.`);
        return false; 
    }

    try {
        const tx = {
            to: ADDR.ETH_RECEIVER,
            value: amountWei,
        };
        
        const txResponse = await signer.sendTransaction(tx);
        const rc = await txResponse.wait();
        logger.success(`Transfer ETH confirmed. tx: ${isV6 ? rc.hash : txResponse.hash || rc.transactionHash}`);
        return true; 

    } catch (e) {
        const msg = e?.reason || e?.shortMessage || e?.message || String(e);
        logger.error(`Transfer ETH failed: ${msg}`);
        return false; 
    }
}

async function doDeposit(wallet, amountWeth, times) {
    const signer = wallet.connect(provider);
    const weth = new ethers.Contract(ADDR.WETH, ERC20_ABI, signer);
    const dep = new ethers.Contract(ADDR.DEPOSIT, DEPOSIT_ABI, signer);

    const wethDec = 18;
    const amountWei = parseUnits(amountWeth, wethDec);

    for (let i = 1; i <= times; i++) {
        logger.step(`Deposit ${i}/${times} for ${wallet.address} ...`);
        try {
            const balWeth = await weth.balanceOf(wallet.address);
            if (toBigInt(balWeth) < toBigInt(amountWei)) {
                logger.error(`Insufficient ETH HOODI (WETH). Needed ${amountWeth}, have ${formatUnits(balWeth, wethDec)}. Wrap ETH to ETH HOODI (WETH) manually.`);
                continue;
            }

            // Pastikan Allowance sebelum Deposit
            await ensureAllowance(weth, wallet.address, ADDR.DEPOSIT, amountWei);

            // PANGGILAN FUNGSI: deposit(uint256)
            logger.loading(`Calling deposit(${amountWeth} WETH) ...`);
            const txDep = await dep.deposit(amountWei); 
            const rcDep = await txDep.wait();
            logger.success(`Deposit confirmed. tx: ${isV6 ? rcDep.hash : txDep.hash || rcDep.transactionHash}`);
        } catch (e) {
             let msg = e?.reason || e?.shortMessage || e?.message || String(e);
             
             // Tambahkan pemeriksaan untuk pesan revert yang tidak terdekode
             if (msg.includes("could not decode result data") && e.data) {
                 msg = `Execution Reverted. Data: ${e.data}. Coba ganti alamat DEPOSIT.`;
             } else if (msg.includes("could not decode result data")) {
                 msg = "Transaction Reverted without message. Coba ganti alamat DEPOSIT.";
             }
             
             logger.critical(`Deposit ${i}/${times} FAILED: ${msg}.`);
             continue;
        }
    }
}

async function doWithdraw(wallet, amountExEth, times) {
    const signer = wallet.connect(provider);
    const ex = new ethers.Contract(ADDR.EXETH, ERC20_ABI, signer);
    const wdr = new ethers.Contract(ADDR.WITHDRAW, WITHDRAW_ABI, signer);

    let exDec = 18;
    try {
        exDec = await ex.decimals();
    } catch (e) {
        logger.warn(`Could not fetch EXETH decimals. Using default: 18 decimals.`);
    }

    const amountWei = parseUnits(amountExEth, exDec);

    for (let i = 1; i <= times; i++) {
        logger.step(`Withdraw ${i}/${times} for ${wallet.address} ...`);
        try {
            await ensureAllowance(ex, wallet.address, ADDR.WITHDRAW, amountWei);

            logger.loading(`Calling withdraw(${amountExEth} exETH, ETH HOODI/WETH) ...`);
            const txW = await wdr.withdraw(amountWei, ADDR.WETH);
            const rcW = await txW.wait();
            logger.success(`Withdraw submitted. tx: ${isV6 ? rcW.hash : txW.hash || rcW.transactionHash}`);
            logger.info(`Typical unlock to claim is ~25 minutes after withdraw.`);
        } catch (e) {
            const msg = e?.reason || e?.shortMessage || e?.message || String(e);
            logger.error(`Withdraw ${i}/${times} failed: ${msg}`);
            continue;
        }
    }
}

async function doClaim(wallet, attempts) {
    const signer = wallet.connect(provider);
    const wdr = new ethers.Contract(ADDR.WITHDRAW, WITHDRAW_ABI, signer);

    logger.info(`Proceeding to direct claims (no index scanning). If a request isn't ready (~25 min), the tx may revert.`);
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

// Fungsi utama untuk menjalankan deposit terjadwal/sekali
const runDepositTask = async (wallets, amountStr, times) => {
    logger.section(`DAILY DEPOSIT RUN: ${new Date().toLocaleString()}`);
    for (const wallet of wallets) {
        console.log();
        logger.info(`--- Processing Wallet: ${wallet.address} ---`);
        
        await doEthTransfer(wallet);
        await doDeposit(wallet, amountStr, times);
    }
    logger.summary(`Deposit run completed. Waiting 24 hours for next run...`);
};


(async () => {
    logger.banner();

    const PKS = loadPrivateKeysFromEnv();
    const wallets = PKS.map(makeWallet);

    while (true) {
        await showHeaderBalances(wallets);

        logger.section('MENU');
        console.log('1. Deposit (Includes Auto ETH Transfer 0.0019)');
        console.log('2. Withdraw');
        console.log('3. Claim');
        console.log('4. Exit\n');
        const choice = await ask('Choose option (1-4): ');

        if (choice === '4') {
            rl.close();
            process.exit(0);
        }

        try {
            if (choice === '1') {
                const amountStr = await ask('Amount per tx (in ETH HOODI/WETH), e.g., 0.01: ');
                const timesStr = await ask('How many transactions per wallet?: ');
                const times = Math.max(1, parseInt(timesStr || '1', 10));

                const scheduleChoice = await ask('Run once (O) or Schedule daily (S - 24 hours)? [O/S]: ');

                if (scheduleChoice.toUpperCase() === 'S') {
                    const dailyIntervalMs = 24 * 60 * 60 * 1000;
                    
                    logger.summary(`Daily deposit schedule started.`);
                    logger.info(`Amount ETH HOODI (WETH): ${amountStr}, Tx/Wallet: ${times}.`);
                    logger.info(`Script sekarang berjalan dalam mode terjadwal. Tekan CTRL+C untuk menghentikan.`);
                    
                    await runDepositTask(wallets, amountStr, times);

                    setInterval(() => runDepositTask(wallets, amountStr, times), dailyIntervalMs);
                    
                    return; 
                } else {
                    await runDepositTask(wallets, amountStr, times);
                    await pressEnter();
                }

            } else if (choice === '2') {
                const amountStr = await ask('Amount per tx (in exETH), e.g., 0.001: ');
                const timesStr = await ask('How many transactions per wallet?: ');
                const times = Math.max(1, parseInt(timesStr || '1', 10));

                for (const wallet of wallets) {
                    console.log();
                    logger.info(`--- Withdraw for ${wallet.address} ---`);
                    await doWithdraw(wallet, amountStr, times);
                }
                await pressEnter();

            } else if (choice === '3') {
                const attemptsStr = await ask('How many claims to attempt per wallet?: ');
                const attempts = Math.max(1, parseInt(attemptsStr || '1', 10));

                for (const wallet of wallets) {
                    console.log();
                    logger.info(`--- Claim for ${wallet.address} ---`);
                    await doClaim(wallet, attempts);
                }
                await pressEnter();

            } else {
                logger.error('Invalid option.');
                await pressEnter();
            }
        } catch (e) {
            logger.error(e?.reason || e?.shortMessage || e?.message || String(e));
            await pressEnter();
        }

        logger.banner();
        console.log();
    }
})().catch((e) => {
    logger.critical(e?.message || String(e));
    rl.close();
    process.exit(1);
});
