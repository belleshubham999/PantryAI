require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-change-in-production';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for admin operations
const supabase = createClient(supabaseUrl, supabaseKey);

const allowedOrigins = [
  'http://localhost:5173',
  'https://your-frontend-url.onrender.com', // Add your frontend Render URL here
   'https://pantry-ai-frontend.onrender.com'
];

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      console.log('CORS blocked origin:', origin);
      // For now, allow all origins for debugging
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
app.use(express.json());

// Root route - API status
app.get('/', (req, res) => {
  res.json({
    message: 'PantryAI API is running',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/register',
        login: 'POST /api/login',
        user: 'GET /api/user'
      },
      pantry: {
        get: 'GET /api/pantry',
        add: 'POST /api/pantry',
        delete: 'DELETE /api/pantry/:id'
      },
      recipes: 'GET /api/recipes?query=chicken',
      favorites: 'GET /api/favorites',
      mealPlans: 'GET /api/meal-plans',
      groceryLists: 'GET /api/grocery-lists',
      recentActivities: 'GET /api/recent-activities'
    }
  });
});

// API routes
app.get('/api/recipes', async (req, res) => {
  // ... your recipes code
});
// ... other routes

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Add activity log function
const logActivity = async (user_id, activity_type, description, recipe_id = null, recipe_title = null) => {
  try {
    const { error } = await supabase
      .from('recent_activities')
      .insert({
        user_id,
        activity_type,
        description,
        recipe_id,
        recipe_title
      });
    
    if (error) throw error;
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

// Auth Routes
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const { data: user, error } = await supabase
      .from('users')
      .insert([{
        email,
        password: hashedPassword,
        name: name || email.split('@')[0]
      }])
      .select('id, email, name')
      .single();

    if (error) throw error;

    const token = jwt.sign({ 
      id: user.id, 
      email: user.email 
    }, JWT_SECRET, { expiresIn: '7d' });
    
    await logActivity(user.id, 'account', 'Account created');

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ 
      id: user.id, 
      email: user.email 
    }, JWT_SECRET, { expiresIn: '7d' });
    
    await logActivity(user.id, 'account', 'User logged in');

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// User Routes
app.get('/api/user', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Pantry Routes
app.get('/api/pantry', authenticateToken, async (req, res) => {
  try {
    const { data: items, error } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('user_id', req.user.id)
      .order('category')
      .order('name');

    if (error) throw error;
    res.json(items || []);
  } catch (error) {
    console.error('Pantry fetch error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/pantry', authenticateToken, async (req, res) => {
  const { name, category, quantity, unit } = req.body;

  try {
    const { data, error } = await supabase
      .from('pantry_items')
      .insert([{
        user_id: req.user.id,
        name,
        category,
        quantity,
        unit
      }])
      .select()
      .single();

    if (error) throw error;
    await logActivity(req.user.id, 'pantry', `Added ${name} to pantry`, null, name);
    res.json(data);
  } catch (error) {
    console.error('Pantry add error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/pantry/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: item, error: fetchError } = await supabase
      .from('pantry_items')
      .select('name')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    await logActivity(req.user.id, 'pantry', `Removed ${item.name} from pantry`);
    res.json({ message: 'Item deleted' });
  } catch (error) {
    console.error('Pantry delete error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Favorites Routes
app.get('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const { data: favorites, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(favorites || []);
  } catch (error) {
    console.error('Favorites fetch error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/favorites', authenticateToken, async (req, res) => {
  const { recipe_id, recipe_title, recipe_image } = req.body;

  try {
    // Check if already favorited
    const { data: existing } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('recipe_id', recipe_id)
      .single();

    if (existing) {
      // Remove from favorites
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', req.user.id)
        .eq('recipe_id', recipe_id);

      if (error) throw error;
      await logActivity(req.user.id, 'favorite', `Removed ${recipe_title} from favorites`, recipe_id, recipe_title);
    } else {
      // Add to favorites
      const { error } = await supabase
        .from('favorites')
        .insert([{
          user_id: req.user.id,
          recipe_id,
          recipe_title,
          recipe_image
        }]);

      if (error) throw error;
      await logActivity(req.user.id, 'favorite', `Added ${recipe_title} to favorites`, recipe_id, recipe_title);
    }

    // Return updated favorites
    const { data: favorites, error: fetchError } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;
    res.json(favorites || []);
  } catch (error) {
    console.error('Favorites toggle error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Meal Plans Routes
app.get('/api/meal-plans', authenticateToken, async (req, res) => {
  try {
    const { data: plans, error } = await supabase
      .from('meal_plans')
      .select('*')
      .eq('user_id', req.user.id)
      .order('day')
      .order('meal_type');

    if (error) throw error;
    res.json(plans || []);
  } catch (error) {
    console.error('Meal plans fetch error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/meal-plans', authenticateToken, async (req, res) => {
  const { meals } = req.body;

  try {
    // Clear existing meal plans
    const { error: deleteError } = await supabase
      .from('meal_plans')
      .delete()
      .eq('user_id', req.user.id);

    if (deleteError) throw deleteError;

    // Insert new meal plans
    const mealPlans = meals.map(meal => ({
      user_id: req.user.id,
      day: meal.day,
      meal_type: meal.meal_type,
      recipe_id: meal.recipe_id,
      recipe_title: meal.recipe_title,
      recipe_image: meal.recipe_image
    }));

    const { error: insertError } = await supabase
      .from('meal_plans')
      .insert(mealPlans);

    if (insertError) throw insertError;
    await logActivity(req.user.id, 'meal_plan', 'Updated meal plan');
    res.json({ message: 'Meal plan saved successfully' });
  } catch (error) {
    console.error('Meal plan save error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Grocery Lists Routes
app.get('/api/grocery-lists', authenticateToken, async (req, res) => {
  try {
    const { data: lists, error } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Parse items JSON
    const parsedLists = (lists || []).map(list => ({
      ...list,
      items: typeof list.items === 'string' ? JSON.parse(list.items) : list.items
    }));

    res.json(parsedLists);
  } catch (error) {
    console.error('Grocery lists fetch error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/grocery-lists', authenticateToken, async (req, res) => {
  const { name, items } = req.body;

  try {
    const { data, error } = await supabase
      .from('grocery_lists')
      .insert([{
        user_id: req.user.id,
        name,
        items: JSON.stringify(items)
      }])
      .select()
      .single();

    if (error) throw error;
    
    await logActivity(req.user.id, 'grocery', `Created grocery list: ${name}`);
    
    res.json({
      ...data,
      items: typeof data.items === 'string' ? JSON.parse(data.items) : data.items
    });
  } catch (error) {
    console.error('Grocery list create error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/grocery-lists/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, items } = req.body;

  try {
    const { error } = await supabase
      .from('grocery_lists')
      .update({ 
        name, 
        items: JSON.stringify(items) 
      })
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ message: 'Grocery list updated' });
  } catch (error) {
    console.error('Grocery list update error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/grocery-lists/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('grocery_lists')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    await logActivity(req.user.id, 'grocery', 'Deleted grocery list');
    res.json({ message: 'Grocery list deleted' });
  } catch (error) {
    console.error('Grocery list delete error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Recent Activities Routes
app.get('/api/recent-activities', authenticateToken, async (req, res) => {
  try {
    const { data: activities, error } = await supabase
      .from('recent_activities')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;
    res.json(activities || []);
  } catch (error) {
    console.error('Recent activities error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// User Data Routes
app.get('/api/user/data', authenticateToken, async (req, res) => {
  try {
    // Get user basic info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name, dietary_preferences, created_at')
      .eq('id', req.user.id)
      .single();

    if (userError) throw userError;

    // Get counts for different data types
    const [
      pantryCount,
      mealPlansCount,
      favoritesCount,
      groceryListsCount
    ] = await Promise.all([
      supabase.from('pantry_items').select('id', { count: 'exact' }).eq('user_id', req.user.id),
      supabase.from('meal_plans').select('id', { count: 'exact' }).eq('user_id', req.user.id),
      supabase.from('favorites').select('id', { count: 'exact' }).eq('user_id', req.user.id),
      supabase.from('grocery_lists').select('id', { count: 'exact' }).eq('user_id', req.user.id)
    ]);

    res.json({
      user,
      data_summary: {
        pantry_items: pantryCount.count || 0,
        meal_plans: mealPlansCount.count || 0,
        favorites: favoritesCount.count || 0,
        grocery_lists: groceryListsCount.count || 0
      }
    });
  } catch (err) {
    console.error('Error fetching user data:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Other existing routes (recipes, feedback, etc.) remain the same...
// Sitemap route
app.get('/sitemap.xml', (req, res) => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://pantry-ai-frontend.onrender.com/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://pantry-ai-frontend.onrender.com/login</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://pantry-ai-frontend.onrender.com/register</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://pantry-ai-frontend.onrender.com/recipes</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://pantry-ai-frontend.onrender.com/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>`;
  
  res.header('Content-Type', 'application/xml');
  res.send(sitemap);
});

// Keep your recipes routes from the previous version

// Recipes routes (keep your existing recipes API routes)
app.get('/api/recipes', async (req, res) => {
  const { query = 'chicken' } = req.query;
  const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;

  try {
    const response = await fetch(
      `https://api.spoonacular.com/recipes/complexSearch?apiKey=${SPOONACULAR_API_KEY}&query=${encodeURIComponent(query)}&number=20&addRecipeInformation=true`
    );
    
    if (!response.ok) {
      throw new Error('Spoonacular API error');
    }

    const data = await response.json();
    const recipes = data.results.map(recipe => ({
      id: recipe.id,
      title: recipe.title,
      image: recipe.image,
      readyInMinutes: recipe.readyInMinutes,
      servings: recipe.servings,
      summary: recipe.summary,
      instructions: recipe.instructions,
      extendedIngredients: recipe.extendedIngredients
    }));

    res.json(recipes);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    // Return mock data
    const mockRecipes = [
      {
        id: 1,
        title: 'Chicken Stir Fry with Vegetables',
        image: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=400&h=300&fit=crop',
        readyInMinutes: 25,
        servings: 4,
        summary: 'A quick and healthy chicken stir fry loaded with fresh vegetables and savory sauce.',
        instructions: '1. Cut chicken into bite-sized pieces. 2. Chop vegetables. 3. Heat oil in a wok. 4. Stir-fry chicken until cooked. 5. Add vegetables and sauce. 6. Cook until vegetables are tender-crisp.',
        extendedIngredients: [
          { name: 'chicken breast', amount: 2, unit: 'pieces' },
          { name: 'bell peppers', amount: 2, unit: 'pieces' },
          { name: 'broccoli', amount: 1, unit: 'cup' },
          { name: 'soy sauce', amount: 3, unit: 'tablespoons' }
        ]
      }
    ];
    res.json(mockRecipes);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Supabase: ${supabaseUrl ? 'Configured' : 'Not configured'}`);
});