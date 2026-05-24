const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure database directory exists
const dbDir = path.join(__dirname);
const dbPath = path.join(dbDir, 'pantryai.db');

console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database');
  }
});

// Promise wrapper for SQLite
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    console.log('Executing query:', sql);
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Query error:', err);
        reject(err);
      } else {
        resolve({ rows });
      }
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    console.log('Executing run:', sql);
    db.run(sql, params, function(err) {
      if (err) {
        console.error('Run error:', err);
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
};

module.exports = { query, run, db };