const sqlite3 = require('sqlite3').verbose();

console.log('🔍 Testing database connection...');

const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Connected to SQLite database');
  }
});

// Check if users table exists
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('❌ Error checking tables:', err.message);
  } else {
    console.log('📋 Found tables:', tables.map(t => t.name));
    
    // Check if users table has data
    db.all('SELECT * FROM users', (err, users) => {
      if (err) {
        console.error('❌ Error reading users:', err.message);
      } else {
        console.log(`👥 Found ${users.length} users in database:`);
        users.forEach(user => {
          console.log(`   - ID: ${user.id}, Email: ${user.email}, Name: ${user.name}`);
        });
      }
      db.close();
    });
  }
});