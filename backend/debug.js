// Add this to your server.js after the database initialization
app.get('/api/debug', async (req, res) => {
  try {
    // Check if tables exist
    const tables = await query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);
    
    // Check recipes count
    const recipesCount = await query('SELECT COUNT(*) as count FROM recipes');
    
    res.json({
      tables: tables.rows,
      recipesCount: recipesCount.rows[0].count,
      databasePath: './database/pantryai.db'
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});