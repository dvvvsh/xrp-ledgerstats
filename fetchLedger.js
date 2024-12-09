process.stdout.write('\x1Bc'); // Clear console

import numeral from 'numeral';
import fs from 'fs';
import path from 'path';
import JSONStream from 'JSONStream';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const defaultEndpoint = 'wss://s1.ripple.com';
let endpoint = process.env.WS_ENDPOINT || defaultEndpoint;

if (process.argv.length > 3) {
  endpoint = process.argv[3];
  if (!endpoint.match(/^ws[s]*:\/\//)) {
    endpoint = 'wss://' + endpoint;
  }
}

console.log(`Connecting to rippled running at: ${endpoint}\n`);
const ws = new WebSocket(endpoint);

let ledger = null;
let calls = 0;
let records = 0;
let lastMarker = '';
let transformStream;
let outputStream;

const send = (requestJson) => {
  calls++;
  ws.send(JSON.stringify(requestJson));
};

ws.on('open', () => {
  let requestLedgerIndex = 'closed';
  if (process.argv.length > 2 && /^[0-9]+$/.test(process.argv[2])) {
    requestLedgerIndex = parseInt(process.argv[2], 10);
  }
  send({ command: 'ledger', ledger_index: requestLedgerIndex });
});

const req = { command: 'ledger_data', ledger: null, type: 'account', limit: 20000 };

ws.on('message', (data) => {
  const response = JSON.parse(data);

  if (!ledger) {
    if (!response.error_message) {
      ledger = response.result.ledger;
      req.ledger = ledger.hash;

      console.log(`Now fetching XRP ledger ${ledger.ledger_index}\n`);
      console.log(` -- Ledger close time:  ${ledger.close_time_human}`);
      console.log(` -- Ledger hash:        ${ledger.hash}`);
      console.log(` -- Total XRP existing: ${numeral(parseInt(ledger.total_coins, 10) / 1_000_000).format('0,0.000000')}\n`);

      const filename = `${ledger.ledger_index}.json`;
      const stats = {
        hash: ledger.hash,
        ledger_index: parseInt(ledger.ledger_index, 10),
        close_time_human: ledger.close_time_human,
        total_coins: parseInt(ledger.total_coins, 10) / 1_000_000,
      };

      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
      }

      transformStream = JSONStream.stringify(
        `{\n  "stats": ${JSON.stringify(stats)},\n  "balances": [\n    `,
        ',\n    ',
        '\n  ]\n}\n'
      );
      outputStream = fs.createWriteStream(path.join(dataDir, filename));

      transformStream.pipe(outputStream);

      outputStream.on('finish', () => {
        console.log(`\nDone! Wrote ${records} records to: ${path.join('data', filename)}\n`);
        console.log(`Now you can retrieve the stats for this ledger by running:\n  npm run stats ${ledger.ledger_index}\n`);
        process.exit(0);
      });

      send(req);
    } else {
      console.error('Error from rippled:', response.error_message);
      ws.close();
    }
  } else {
    if (response.status === 'success' && response.type === 'response') {
      if (response.result.state) {
        response.result.state.forEach((i) => {
          records++;
          transformStream.write({ a: i.Account, b: parseInt(i.Balance, 10) / 1_000_000 });
        });
      }

      process.stdout.write(`  > Retrieved ${records} accounts in ${calls} calls to rippled...\r`);

      if (!response.result.marker || response.result.marker === lastMarker) {
        console.log('');
        transformStream.end();
      } else {
        req.marker = response.result.marker;
        lastMarker = req.marker;
        send(req);
      }
    } else {
      console.error('Unexpected response:', response);
      ws.close();
    }
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('\nWebSocket connection closed.');
});
