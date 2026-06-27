const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const defaults = {
  accounts: [],
  stocks: [],
  exchange_rates: [],
  _seq: { account: 1, stock: 1 },
};

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('DB load error:', e.message);
  }
  return JSON.parse(JSON.stringify(defaults));
}

const db = load();

function write() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

module.exports = { db, write };
