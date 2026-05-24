const { run, query } = require('../database/db');

const migrate = async () => {
  try {
    console.log('Starting database migration...');

    // Create tables
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        dietary_preferences TEXT DEFAULT '[]',
        allergies TEXT DEFAULT '[]',
        favorite_cuisines TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS pantry_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        expiry_date DATE,
        added_date DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        ingredients TEXT NOT NULL,
        instructions TEXT NOT NULL,
        cooking_time INTEGER NOT NULL,
        servings INTEGER NOT NULL,
        dietary_tags TEXT DEFAULT '[]',
        image_url TEXT,
        nutrition TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS grocery_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        items TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert sample recipes
    const sampleRecipes = [
      {
        title: 'Vegetable Stir Fry',
        ingredients: JSON.stringify([
          { name: "bell pepper", quantity: 2, unit: "pieces" },
          { name: "broccoli", quantity: 1, unit: "cup" },
          { name: "carrot", quantity: 2, unit: "pieces" },
          { name: "soy sauce", quantity: 3, unit: "tablespoons" },
          { name: "garlic", quantity: 2, unit: "cloves" },
          { name: "ginger", quantity: 1, unit: "tablespoon" },
          { name: "rice", quantity: 2, unit: "cups" }
        ]),
        instructions: JSON.stringify([
          "Chop all vegetables into bite-sized pieces",
          "Heat oil in a wok or large pan over high heat",
          "Add garlic and ginger, stir for 30 seconds",
          "Add vegetables and stir fry for 5-7 minutes until tender",
          "Add soy sauce and serve with cooked rice"
        ]),
        cooking_time: 20,
        servings: 2,
        dietary_tags: JSON.stringify(["vegetarian", "vegan"]),
        nutrition: JSON.stringify({ calories: 350, protein: 8, carbs: 65, fat: 6 })
      },
      {
        title: 'Chicken Salad',
        ingredients: JSON.stringify([
          { name: "chicken breast", quantity: 2, unit: "pieces" },
          { name: "lettuce", quantity: 1, unit: "head" },
          { name: "tomato", quantity: 2, unit: "pieces" },
          { name: "cucumber", quantity: 1, unit: "piece" },
          { name: "olive oil", quantity: 2, unit: "tablespoons" },
          { name: "lemon", quantity: 1, unit: "piece" }
        ]),
        instructions: JSON.stringify([
          "Cook chicken breast in boiling water for 15 minutes",
          "Let chicken cool, then shred or chop",
          "Wash and chop lettuce, tomato, and cucumber",
          "Mix vegetables with chicken in a large bowl",
          "Dress with olive oil and fresh lemon juice",
          "Serve chilled"
        ]),
        cooking_time: 15,
        servings: 2,
        dietary_tags: JSON.stringify(["gluten-free"]),
        nutrition: JSON.stringify({ calories: 280, protein: 25, carbs: 12, fat: 15 })
      }
    ];

    for (const recipe of sampleRecipes) {
      await run(
        `INSERT OR IGNORE INTO recipes (title, ingredients, instructions, cooking_time, servings, dietary_tags, nutrition) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [recipe.title, recipe.ingredients, recipe.instructions, recipe.cooking_time, recipe.servings, recipe.dietary_tags, recipe.nutrition]
      );
    }

    console.log('Database migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
  }
};

migrate().then(() => {
  console.log('Migration process finished');
  process.exit(0);
});