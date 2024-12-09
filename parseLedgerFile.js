const fs = require('fs/promises');
const { table } = require('table');
const numeral = require('numeral');

const DATA_DIR = __dirname + '/data/';

// Instructions for missing input
const showInstructions = () => {
    console.log('Error: please provide the ledger number as an argument.');
    console.log('Example: npm run stats 32570');
    console.log('');
    console.log('If the ledger data is not fetched yet, run:');
    console.log('  npm run fetch');
    console.log('');
    process.exit(1);
};

// Parse command-line arguments
if (process.argv.length < 3) {
    showInstructions();
}

const filename = `${parseInt(process.argv[2].split('.')[0])}.json`;
const filePath = `${DATA_DIR}${filename}`;
const exportJson = {
    meta: {},
    top100Balance: 0,
    accountPercentageBalance: [],
    accountNumberBalanceRange: []
};

// Main function
const processLedgerStats = async () => {
    try {
        console.log(`Reading ledger stats: ${filename}`);

        const rawData = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(rawData);

        // Sort balances in descending order
        data.balances.sort((a, b) => b.b - a.b);

        const numAccounts = data.balances.length;
        console.log(` -- Accounts:             ${numAccounts}`);
        console.log(` -- Ledger close time:    ${data.stats.close_time_human}`);
        console.log(` -- Ledger hash:          ${data.stats.hash}`);
        console.log(` -- Ledger index:         ${data.stats.ledger_index}`);
        console.log(` -- Total XRP existing:   ${numeral(data.stats.total_coins).format('0,0.000000')}`);
        console.log('');

        // Calculate total balance sum
        const totalBalanceSum = data.balances.reduce((sum, acc) => sum + acc.b, 0);
        console.log(` -- Accounts balance sum: ${numeral(totalBalanceSum).format('0,0.000000')}`);
        exportJson.meta = {
            numberAccounts: numAccounts,
            ledgerClosedAt: data.stats.close_time_human,
            ledgerHash: data.stats.hash,
            ledgerIndex: data.stats.ledger_index,
            existingXRP: data.stats.total_coins
        };
        exportJson.top100Balance = totalBalanceSum;

        // Top 100 balance stats
        console.log('');
        console.log('Stats 🎉');
        const top100Sum = data.balances.slice(0, 100).reduce((sum, acc) => sum + acc.b, 0);
        console.log(`  > Top 100 Balance Sum:  ${numeral(top100Sum).format('0,0.000000')}`);
        console.log(`  > Percentage of Total XRP: ${numeral((top100Sum / data.stats.total_coins) * 100).format('0.00')} %`);

        // Account percentage balance
        console.log('');
        console.log(' -- Percentage of accounts with balance starting at...');
        const percentages = [0.01, 0.1, 0.2, 0.5, 1, 2, 3, 4, 5, 10];
        const percentageStats = [['Percentage', '# Accounts', 'Balance >=']];
        percentages.forEach((p) => {
            const accountCount = Math.round((numAccounts * p) / 100);
            const thresholdBalance = data.balances.slice(0, accountCount).pop()?.b || 0;
            percentageStats.push([
                `${p} %`,
                numeral(accountCount).format('0,0'),
                `${numeral(thresholdBalance).format('0,0.000000')} XRP`
            ]);
            exportJson.accountPercentageBalance.push({
                percentage: p,
                numberAccounts: accountCount,
                balanceEqGt: thresholdBalance
            });
        });
        console.log(table(percentageStats));

        // Balance range stats
        console.log('');
        console.log(' -- Accounts and sum of balance ranges...');
        const balanceRanges = [
            1000000000, 500000000, 100000000, 20000000, 10000000, 5000000,
            1000000, 500000, 100000, 75000, 50000, 25000, 10000, 5000, 1000,
            500, 20, 0
        ];
        const rangeStats = [['# Accounts', 'From', 'To', 'Sum (XRP)']];
        let sliceIndex = 0;
        let lastRange = 0;

        balanceRanges.forEach((range) => {
            const accountsInRange = [];
            let sum = 0;
            for (let i = sliceIndex; i < numAccounts; i++) {
                if (data.balances[i].b < range) {
                    sliceIndex = i;
                    break;
                }
                sum += data.balances[i].b;
                accountsInRange.push(data.balances[i]);
            }
            rangeStats.push([
                numeral(accountsInRange.length).format('0,0'),
                numeral(range).format('0,0'),
                lastRange === 0 ? '∞' : numeral(lastRange).format('0,0'),
                numeral(sum).format('0,0.000000')
            ]);
            exportJson.accountNumberBalanceRange.push({
                numberAccounts: accountsInRange.length,
                balanceFrom: range,
                balanceTo: lastRange || '∞',
                balanceSum: sum
            });
            lastRange = range;
        });
        console.log(table(rangeStats));

        // Write export JSON file
        const exportFilename = `${DATA_DIR}${filename.replace('.json', '.stats.json')}`;
        await fs.writeFile(exportFilename, JSON.stringify(exportJson, null, 2), 'utf-8');
        console.log(`Stats written to: ${exportFilename}`);
    } catch (err) {
        console.error('Error processing ledger stats:', err.message);
    }
};

// Run the script
processLedgerStats();
