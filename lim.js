require('dotenv').config();
let ethersLib = require('ethers');
const ethers = ethersLib.ethers ? ethersLib.ethers : ethersLib;
const isV6 = !!ethers.parseEther;
const Provider = isV6 ? ethers.JsonRpcProvider : ethers.providers.JsonRpcProvider;
const toBigInt = (n) => (isV6 ? n : BigInt(n?.toString?.() ?? String(n)));
const parseUnits = (v, d) => (isV6 ? ethers.parseUnits(v, d) : ethers.utils.parseUnits(v, d));
const formatUnits = (v, d) => (isV6 ? ethers.formatUnits(v, d) : ethers.utils.formatUnits(v, d));
const formatEther = (v) => (isV6 ? ethers.formatEther(v) : ethers.utils.formatEther(v));

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
        const title = `${colors.blue}${colors.bold}║   🍉 19Seniman From Insider   🍉    ║${colors.reset}`;
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

const RPC_URL = 'https://ethereum-holesky-rpc.publicnode.com/';
const ADDR = {
    DEPOSIT: '0x0c6A085e9d17A51DEA2A7e954ACcAb1429213B75',
    WITHDRAW: '0x3Cc99498dea7a164C9d6D02C7710FF63f36A60ed',
    WETH: '0x94373a4919B3240D86eA41593D5eBa789FEF3848',
    EXETH: '0xDD1ec7e2c5408aB7199302d481a1b77FdA0267A3',
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
    "function deposit(address _token, uint256 _value) external"
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
    const tx = await tokenCtr.approve(spender, amount);
    const rc = await tx.wait();
    logger.success(`Approve confirmed. tx: ${isV6 ? rc.hash : tx.hash || rc.transactionHash}`);
    return true;
}

async function showHeaderBalances(wallets) {
    logger.loading(`Fetching balances (ETH Holesky & exETH) ...`);
    const ex = new ethers.Contract(ADDR.EXETH, ERC20_ABI, provider);
    const exDec = await ex.decimals().catch(() => 18);
    const exSym = await ex.symbol().catch(() => 'exETH');

    for (const w of wallets) {
        const [ethBal, exBal] = await Promise.all([
            provider.getBalance(w.address),
            ex.balanceOf(w.address)
        ]);
        logger.info(`Wallet ${w.address}`);
        console.log(`ETH (Holesky): ${formatEther(ethBal)}`);
        console.log(`${exSym}: ${formatUnits(exBal, exDec)}`);
    }
    console.log();
}

async function doDeposit(wallet, amountWeth, times) {
    const signer = wallet.connect(provider);
    const weth = new ethers.Contract(ADDR.WETH, ERC20_ABI, signer);
    const dep = new ethers.Contract(ADDR.DEPOSIT, DEPOSIT_ABI, signer);

    const wethDec = 18;
    const amountWei = parseUnits(amountWeth, wethDec);

    for (let i = 1; i <= times; i++) {
        logger.step(`Deposit ${i}/${times} for ${wallet.address} ...`);

        const balWeth = await weth.balanceOf(wallet.address);
        if (toBigInt(balWeth) < toBigInt(amountWei)) {
            logger.error(`Insufficient WETH. Needed ${amountWeth}, have ${formatUnits(balWeth, wethDec)}. Wrap ETH to WETH`);
            continue;
        }

        await ensureAllowance(weth, wallet.address, ADDR.DEPOSIT, amountWei);

        logger.loading(`Calling deposit(WETH, ${amountWeth}) ...`);
        const txDep = await dep.deposit(ADDR.WETH, amountWei);
        const rcDep = await txDep.wait();
        logger.success(`Deposit confirmed. tx: ${isV6 ? rcDep.hash : txDep.hash || rcDep.transactionHash}`);
    }
}

async function doWithdraw(wallet, amountExEth, times) {
    const signer = wallet.connect(provider);
    const ex = new ethers.Contract(ADDR.EXETH, ERC20_ABI, signer);
    const wdr = new ethers.Contract(ADDR.WITHDRAW, WITHDRAW_ABI, signer);

    const exDec = await ex.decimals().catch(() => 18);
    const amountWei = parseUnits(amountExEth, exDec);

    for (let i = 1; i <= times; i++) {
        logger.step(`Withdraw ${i}/${times} for ${wallet.address} ...`);

        await ensureAllowance(ex, wallet.address, ADDR.WITHDRAW, amountWei);

        logger.loading(`Calling withdraw(${amountExEth} exETH, WETH) ...`);
        const txW = await wdr.withdraw(amountWei, ADDR.WETH);
        const rcW = await txW.wait();
        logger.success(`Withdraw submitted. tx: ${isV6 ? rcW.hash : txW.hash || rcW.transactionHash}`);
        logger.info(`Typical unlock to claim is ~25 minutes after withdraw.`);
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

// Fungsi utama untuk menjalankan deposit terjadwal
const runDepositTask = async (wallets, amountStr, times) => {
    logger.section(`DAILY DEPOSIT RUN: ${new Date().toLocaleString()}`);
    for (const wallet of wallets) {
        console.log();
        logger.info(`--- Deposit for ${wallet.address} ---`);
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
        console.log('1. Deposit');
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
                const amountStr = await ask('Amount per tx (in WETH), e.g., 0.01: ');
                const timesStr = await ask('How many transactions per wallet?: ');
                const times = Math.max(1, parseInt(timesStr || '1', 10));

                const scheduleChoice = await ask('Run once (O) or Schedule daily (S - 24 hours)? [O/S]: ');

                if (scheduleChoice.toUpperCase() === 'S') {
                    const dailyIntervalMs = 24 * 60 * 60 * 1000; // 24 jam
                    
                    logger.summary(`Daily deposit schedule started.`);
                    logger.info(`Amount: ${amountStr} WETH, Tx/Wallet: ${times}.`);
                    logger.info(`Script sekarang berjalan dalam mode terjadwal. Tekan CTRL+C untuk menghentikan.`);
                    
                    // Jalankan untuk pertama kali segera
                    await runDepositTask(wallets, amountStr, times);

                    // Mulai interval 24 jam
                    setInterval(() => runDepositTask(wallets, amountStr, times), dailyIntervalMs);
                    
                    // Kita keluar dari loop menu utama dan membiarkan interval berjalan
                    // Note: Karena proses CLI sekarang didominasi oleh interval, 
                    // Anda harus me-restart script untuk kembali ke menu.
                    return; 
                } else {
                    // Jalankan sekali (seperti sebelumnya)
                    for (const wallet of wallets) {
                        console.log();
                        logger.info(`--- Deposit for ${wallet.address} ---`);
                        await doDeposit(wallet, amountStr, times);
                    }
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
