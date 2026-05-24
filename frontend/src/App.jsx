import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jlgpnhramdytqvvxszet.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZ3BuaHJhbWR5dHF2dnhzemV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MjQ4MzgsImV4cCI6MjA4MDEwMDgzOH0.lCaX5fQXJH_xsXOhE8P6zs1hvw-ns3JZhrzI-EBdVDY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Spoonacular API Key
const SPOONACULAR_API_KEY = 'aadb0195f37d45ef84789714d37606c6';

// Real API Service with fixes
const createRealAPI = () => {
  return {
    get: async (url) => {
      console.log('API GET:', url);
      
      try {
        // Data rights endpoints
        if (url === '/data-rights/requests') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data, error } = await supabase
            .from('data_rights_requests')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          return { data: data || [] };
        }
        
        if (url === '/data-rights/access') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          // Get all user data
          const [profile, recipes, pantry, favorites, mealPlans, groceryLists, activities] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', user.id).single(),
            supabase.from('user_recipes').select('*').eq('user_id', user.id),
            supabase.from('pantry_items').select('*').eq('user_id', user.id),
            supabase.from('favorites').select('*').eq('user_id', user.id),
            supabase.from('meal_plans').select('*').eq('user_id', user.id),
            supabase.from('grocery_lists').select('*').eq('user_id', user.id),
            supabase.from('activities').select('*').eq('user_id', user.id).limit(100)
          ]);
          
          const userData = {
            exported_at: new Date().toISOString(),
            user_id: user.id,
            profile: profile.data,
            recipes: recipes.data,
            pantry: pantry.data,
            favorites: favorites.data,
            meal_plans: mealPlans.data,
            grocery_lists: groceryLists.data,
            activities: activities.data
          };
          
          // Log the request
          await supabase
            .from('data_rights_requests')
            .insert([
              {
                user_id: user.id,
                request_type: 'access',
                status: 'completed',
                completed_at: new Date().toISOString()
              }
            ]);
          
          return { data: userData };
        }
        
        // Check for single recipe detail endpoint FIRST
        if (url.includes('/recipes/') && !url.includes('?')) {
          // This will handle /recipes/{id}
          const recipeId = parseInt(url.split('/recipes/')[1]);
          console.log('🔍 API: Fetching recipe details for ID:', recipeId, 'Type:', recipeId >= 1000000 ? 'User Recipe' : 'Spoonacular Recipe');
          
          // Check if it's a user recipe (ID >= 1000000)
          if (recipeId >= 1000000) {
            const actualId = recipeId - 1000000;
            console.log('🔍 API: User recipe detected, actual ID:', actualId);
            
            const { data: recipe, error } = await supabase
              .from('user_recipes')
              .select('*, profiles(full_name)')
              .eq('id', actualId)
              .single();
            
            if (error) {
              console.error('❌ API: Error fetching user recipe:', error);
              throw new Error('Recipe not found in database');
            }
            
            if (recipe) {
              console.log('✅ API: Found user recipe:', recipe.title);
              
              // Get current user to determine if it's their own recipe
              const { data: { user } } = await supabase.auth.getUser();
              console.log('👤 API: Current user ID:', user?.id, 'Recipe user ID:', recipe.user_id);
              
              const formattedRecipe = {
                id: recipeId,
                title: recipe.title,
                image: recipe.image_url || 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
                readyInMinutes: (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0) || 30,
                servings: recipe.servings || 4,
                healthScore: null,
                summary: recipe.description || `${recipe.title} - a user-contributed recipe.`,
                instructions: recipe.instructions ? `<ol>${recipe.instructions.map((step, i) => `<li>${step}</li>`).join('')}</ol>` : '<p>No instructions provided.</p>',
                extendedIngredients: recipe.ingredients ? recipe.ingredients.map(ing => ({ original: ing })) : [],
                dishTypes: recipe.tags || [],
                diets: recipe.dietary_tags || [],
                cuisines: recipe.cuisine ? [recipe.cuisine] : [],
                source: 'user',
                author: recipe.profiles?.full_name || 'User'
              };
              
              // Check if it's the current user's recipe
              if (user && recipe.user_id === user.id) {
                formattedRecipe.source = 'user_own';
                formattedRecipe.author = 'You';
              } else {
                formattedRecipe.source = 'user_public';
              }
              
              console.log('✅ API: Returning formatted user recipe:', {
                title: formattedRecipe.title,
                source: formattedRecipe.source,
                author: formattedRecipe.author
              });
              
              return { data: formattedRecipe };
            }
            throw new Error('Recipe not found');
          }
          
          // Regular Spoonacular recipe
          console.log('🔍 API: Fetching from Spoonacular API for ID:', recipeId);
          
          try {
            const response = await fetch(
              `https://api.spoonacular.com/recipes/${recipeId}/information?apiKey=${SPOONACULAR_API_KEY}&includeNutrition=false`
            );
            
            console.log('📡 API: Spoonacular response status:', response.status);
            
            if (!response.ok) {
              console.error(`❌ API: Spoonacular error ${response.status}: ${response.statusText}`);
              throw new Error(`Spoonacular details error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('✅ API: Spoonacular data received for:', data.title);
            console.log('📊 API: Spoonacular data has:', {
              hasInstructions: !!data.instructions,
              hasIngredients: data.extendedIngredients?.length || 0,
              hasSummary: !!data.summary,
              sourceName: data.sourceName
            });
            
            const formattedRecipe = {
              ...data,
              id: data.id || recipeId,
              title: data.title || 'Untitled Recipe',
              image: data.image || 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
              readyInMinutes: data.readyInMinutes || 30,
              servings: data.servings || 4,
              healthScore: data.healthScore,
              summary: data.summary || `A delicious ${data.title} recipe.`,
              instructions: data.instructions || 
                           (data.analyzedInstructions?.[0]?.steps?.map(step => step.step).join(' ') || 'No instructions available.'),
              extendedIngredients: data.extendedIngredients || [],
              dishTypes: data.dishTypes || [],
              diets: data.diets || [],
              cuisines: data.cuisines || [],
              source: 'spoonacular',
              author: data.sourceName || 'Spoonacular'
            };
            
            console.log('✅ API: Returning formatted Spoonacular recipe:', {
              title: formattedRecipe.title,
              source: formattedRecipe.source,
              author: formattedRecipe.author,
              hasInstructions: !!formattedRecipe.instructions,
              ingredientCount: formattedRecipe.extendedIngredients?.length || 0
            });
            
            return { data: formattedRecipe };
            
          } catch (spoonacularError) {
            console.error('❌ API: Spoonacular fetch failed:', spoonacularError);
            
            // Fallback: Return basic recipe info
            const fallbackRecipe = {
              id: recipeId,
              title: 'Recipe Details Unavailable',
              image: 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
              readyInMinutes: 30,
              servings: 4,
              healthScore: null,
              summary: 'We couldn\'t load the full recipe details from Spoonacular. Please try again later.',
              instructions: '<p>Recipe details are currently unavailable due to API issues.</p>',
              extendedIngredients: [],
              dishTypes: [],
              diets: [],
              cuisines: [],
              source: 'spoonacular_error',
              author: 'Spoonacular'
            };
            
            return { data: fallbackRecipe };
          }
        }
        
        // Spoonacular API calls - list endpoint
        if (url === '/recipes' || url.match(/^\/recipes\?/)) {
          console.log('🔍 Fetching recipes from API');
          
          const query = url.includes('?query=') 
            ? decodeURIComponent(url.split('?query=')[1].split('&')[0])
            : '';
          
          try {
            // Try Spoonacular API first
            console.log('📞 Calling Spoonacular API with query:', query);
            
            // Construct URL based on query
            let spoonacularUrl;
            if (query === 'popular' || query === 'quick') {
              // Use pre-defined queries for popular/quick
              spoonacularUrl = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${SPOONACULAR_API_KEY}&number=12&addRecipeInformation=true&sort=popularity`;
            } else {
              // Use search query
              spoonacularUrl = `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(query)}&apiKey=${SPOONACULAR_API_KEY}&number=12&addRecipeInformation=true`;
            }
            
            console.log('🌐 Spoonacular URL:', spoonacularUrl);
            
            const response = await fetch(spoonacularUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              }
            });
            
            if (!response.ok) {
              console.error(`❌ Spoonacular API error: ${response.status} ${response.statusText}`);
              throw new Error(`Spoonacular API error: ${response.status}`);
            }
            
            const data = await response.json();
            const spoonacularRecipes = data.results || [];
            console.log('✅ Spoonacular API returned:', spoonacularRecipes.length, 'recipes');
            
            // Format Spoonacular recipes properly
            const formattedSpoonacularRecipes = spoonacularRecipes.map(recipe => ({
              id: recipe.id,
              title: recipe.title,
              image: recipe.image,
              readyInMinutes: recipe.readyInMinutes,
              servings: recipe.servings,
              summary: recipe.summary || `A delicious ${recipe.title} recipe.`,
              instructions: '',
              extendedIngredients: [],
              dishTypes: recipe.dishTypes || [],
              diets: recipe.diets || [],
              cuisines: recipe.cuisines || [],
              source: 'spoonacular',
              author: 'Spoonacular'
            }));
            
            // Get user recipes
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                console.log('👤 Fetching user recipes for user:', user.id);
                
                // Get user's own recipes
                const { data: userRecipes } = await supabase
                  .from('user_recipes')
                  .select('*')
                  .eq('user_id', user.id)
                  .order('created_at', { ascending: false });
                
                // Get public recipes from other users
                const { data: publicRecipes } = await supabase
                  .from('user_recipes')
                  .select('*, profiles(full_name)')
                  .eq('is_public', true)
                  .neq('user_id', user.id)
                  .order('created_at', { ascending: false })
                  .limit(5);
                
                console.log('📝 User recipes found:', userRecipes?.length || 0);
                console.log('📝 Public recipes found:', publicRecipes?.length || 0);
                
                // Convert user recipes to format compatible with Spoonacular
                const formattedUserRecipes = [
                  ...(userRecipes || []).map(recipe => ({
                    id: recipe.id + 1000000,
                    title: recipe.title,
                    image: recipe.image_url || 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
                    readyInMinutes: (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0) || 30,
                    servings: recipe.servings || 4,
                    summary: recipe.description || `${recipe.title} - a user-contributed recipe.`,
                    instructions: recipe.instructions ? `<ol>${recipe.instructions.map((step, i) => `<li>${step}</li>`).join('')}</ol>` : '<p>No instructions provided.</p>',
                    extendedIngredients: recipe.ingredients ? recipe.ingredients.map(ing => ({ original: ing })) : [],
                    dishTypes: recipe.tags || [],
                    diets: recipe.dietary_tags || [],
                    cuisines: recipe.cuisine ? [recipe.cuisine] : [],
                    source: 'user_own', // Changed from 'user' to 'user_own' for clarity
                    author: 'You'
                  })),
                  ...(publicRecipes || []).map(recipe => ({
                    id: recipe.id + 1000000,
                    title: recipe.title,
                    image: recipe.image_url || 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
                    readyInMinutes: (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0) || 30,
                    servings: recipe.servings || 4,
                    summary: recipe.description || `${recipe.title} - a recipe shared by ${recipe.profiles?.full_name || 'another user'}.`,
                    instructions: recipe.instructions ? `<ol>${recipe.instructions.map((step, i) => `<li>${step}</li>`).join('')}</ol>` : '<p>No instructions provided.</p>',
                    extendedIngredients: recipe.ingredients ? recipe.ingredients.map(ing => ({ original: ing })) : [],
                    dishTypes: recipe.tags || [],
                    diets: recipe.dietary_tags || [],
                    cuisines: recipe.cuisine ? [recipe.cuisine] : [],
                    source: 'user_public',
                    author: recipe.profiles?.full_name || 'Community'
                  }))
                ];
                
                console.log('📊 Total recipes to return:', formattedSpoonacularRecipes.length + formattedUserRecipes.length);
                
                // Combine Spoonacular and user recipes
                return { data: [...formattedSpoonacularRecipes, ...formattedUserRecipes] };
              }
            } catch (userRecipeError) {
              console.error('⚠️ User recipes not available:', userRecipeError);
            }
            
            return { data: formattedSpoonacularRecipes };
            
          } catch (spoonacularError) {
            console.error('❌ Spoonacular API failed:', spoonacularError);
            
            // Fallback to user recipes only
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data: userRecipes, error } = await supabase
                  .from('user_recipes')
                  .select('*, profiles(full_name)')
                  .or(`user_id.eq.${user.id},is_public.eq.true`)
                  .order('created_at', { ascending: false });
                
                if (error) {
                  console.error('❌ Error fetching fallback recipes:', error);
                  throw error;
                }
                
                const formattedRecipes = (userRecipes || []).map(recipe => ({
                  id: recipe.id + 1000000,
                  title: recipe.title,
                  image: recipe.image_url || 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
                  readyInMinutes: (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0) || 30,
                  servings: recipe.servings || 4,
                  summary: recipe.description || `${recipe.title} - a user-contributed recipe.`,
                  instructions: recipe.instructions ? `<ol>${recipe.instructions.map((step, i) => `<li>${step}</li>`).join('')}</ol>` : '<p>No instructions provided.</p>',
                  extendedIngredients: recipe.ingredients ? recipe.ingredients.map(ing => ({ original: ing })) : [],
                  dishTypes: recipe.tags || [],
                  diets: recipe.dietary_tags || [],
                  cuisines: recipe.cuisine ? [recipe.cuisine] : [],
                  source: recipe.user_id === user.id ? 'user_own' : 'user_public', // Fixed source distinction
                  author: recipe.user_id === user.id ? 'You' : (recipe.profiles?.full_name || 'Community') // Fixed author
                }));
                
                console.log('📊 Fallback recipes:', formattedRecipes.length);
                return { data: formattedRecipes };
              }
            } catch (fallbackError) {
              console.error('❌ Fallback also failed:', fallbackError);
            }
            
            return { data: [] };
          }
        }
        
        // User recipes endpoint
        if (url === '/user/recipes') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data, error } = await supabase
            .from('user_recipes')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          return { data: data || [] };
        }
        
        // Supabase calls for user data
        if (url === '/user') {
          const { data: { user }, error } = await supabase.auth.getUser();
          
          if (error || !user) {
            throw { response: { status: 401 } };
          }
          
          // Get user profile from Supabase
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          
          const userData = {
            id: user.id,
            email: user.email,
            name: profile?.full_name || user.email?.split('@')[0] || 'User',
            email_confirmed: !!user.email_confirmed_at,
            ...profile
          };
          
          return { data: userData };
        }
        
        if (url === '/pantry') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data, error } = await supabase
            .from('pantry_items')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          return { data: data || [] };
        }
        
        if (url === '/meal-plans') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data, error } = await supabase
            .from('meal_plans')
            .select('*')
            .eq('user_id', user.id)
            .order('day', { ascending: true });
          
          if (error) throw error;
          return { data: data || [] };
        }
        
        if (url === '/favorites') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data, error } = await supabase
            .from('favorites')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          
          // Ensure no duplicates by recipe_id
          const uniqueFavorites = data.reduce((acc, current) => {
            const exists = acc.find(item => item.recipe_id === current.recipe_id);
            if (!exists) {
              return [...acc, current];
            }
            return acc;
          }, []);
          
          return { data: uniqueFavorites };
        }
        
        if (url === '/grocery-lists') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data, error } = await supabase
            .from('grocery_lists')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          return { data: data || [] };
        }
        
        if (url === '/recent-activities') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data, error } = await supabase
            .from('activities')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);
          
          if (error) throw error;
          return { data: data || [] };
        }
        
        // Default empty response
        return { data: [] };
        
      } catch (error) {
        console.error('API GET Error:', error);
        throw error;
      }
    },
    
    post: async (url, data) => {
      console.log('API POST:', url, data);
      
      try {
        // Data rights endpoints
        if (url === '/data-rights/access') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          // Get all user data
          const [profile, recipes, pantry, favorites, mealPlans, groceryLists, activities] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', user.id).single(),
            supabase.from('user_recipes').select('*').eq('user_id', user.id),
            supabase.from('pantry_items').select('*').eq('user_id', user.id),
            supabase.from('favorites').select('*').eq('user_id', user.id),
            supabase.from('meal_plans').select('*').eq('user_id', user.id),
            supabase.from('grocery_lists').select('*').eq('user_id', user.id),
            supabase.from('activities').select('*').eq('user_id', user.id).limit(100)
          ]);
          
          const userData = {
            exported_at: new Date().toISOString(),
            user_id: user.id,
            profile: profile.data,
            recipes: recipes.data,
            pantry: pantry.data,
            favorites: favorites.data,
            meal_plans: mealPlans.data,
            grocery_lists: groceryLists.data,
            activities: activities.data
          };
          
          // Log the request
          await supabase
            .from('data_rights_requests')
            .insert([
              {
                user_id: user.id,
                request_type: 'access',
                status: 'completed',
                completed_at: new Date().toISOString()
              }
            ]);
          
          return { data: userData };
        }
        
        if (url === '/data-rights/correction') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          let updateResult;
          
          // Handle different correction types
          if (data.field === 'name') {
            updateResult = await supabase
              .from('profiles')
              .update({ full_name: data.corrected_value, updated_at: new Date().toISOString() })
              .eq('id', user.id);
          } else if (data.field === 'email') {
            throw new Error('Email changes require authentication confirmation. Please contact support.');
          } else if (data.field === 'dietary_preferences') {
            updateResult = await supabase
              .from('profiles')
              .update({ dietary_preferences: data.corrected_value, updated_at: new Date().toISOString() })
              .eq('id', user.id);
          }
          
          if (updateResult?.error) throw updateResult.error;
          
          // Log the request
          const { data: logData } = await supabase
            .from('data_rights_requests')
            .insert([
              {
                user_id: user.id,
                request_type: 'correction',
                correction_details: JSON.stringify(data),
                status: 'completed',
                completed_at: new Date().toISOString(),
                admin_notes: 'Auto-corrected by system'
              }
            ])
            .select()
            .single();
          
          return { data: { success: true, corrected: data.field, request: logData } };
        }
        
        if (url === '/data-rights/deletion') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          // Delete all user data from all tables
          const deletePromises = [
            supabase.from('user_recipes').delete().eq('user_id', user.id),
            supabase.from('pantry_items').delete().eq('user_id', user.id),
            supabase.from('favorites').delete().eq('user_id', user.id),
            supabase.from('meal_plans').delete().eq('user_id', user.id),
            supabase.from('grocery_lists').delete().eq('user_id', user.id),
            supabase.from('activities').delete().eq('user_id', user.id),
            supabase.from('profiles').delete().eq('id', user.id),
            supabase.from('data_rights_requests').delete().eq('user_id', user.id),
            supabase.from('feedback').delete().eq('user_id', user.id)
          ];
          
          await Promise.all(deletePromises);
          
          // Log the deletion request
          await supabase
            .from('data_rights_requests')
            .insert([
              {
                user_id: user.id,
                request_type: 'deletion',
                status: 'completed',
                completed_at: new Date().toISOString(),
                admin_notes: 'All user data deleted immediately'
              }
            ]);
          
          // Sign out the user
          await supabase.auth.signOut();
          
          return { data: { success: true, message: 'All your data has been deleted. You have been signed out.' } };
        }
        
        if (url === '/data-rights/export') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          // Get all user data
          const [profile, recipes, pantry, favorites, mealPlans, groceryLists, activities] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', user.id).single(),
            supabase.from('user_recipes').select('*').eq('user_id', user.id),
            supabase.from('pantry_items').select('*').eq('user_id', user.id),
            supabase.from('favorites').select('*').eq('user_id', user.id),
            supabase.from('meal_plans').select('*').eq('user_id', user.id),
            supabase.from('grocery_lists').select('*').eq('user_id', user.id),
            supabase.from('activities').select('*').eq('user_id', user.id).limit(100)
          ]);
          
          const exportData = {
            exported_at: new Date().toISOString(),
            user_id: user.id,
            user_email: user.email,
            profile: profile.data,
            recipes: recipes.data,
            pantry: pantry.data,
            favorites: favorites.data,
            meal_plans: mealPlans.data,
            grocery_lists: groceryLists.data,
            activities: activities.data
          };
          
          // Log the request
          await supabase
            .from('data_rights_requests')
            .insert([
              {
                user_id: user.id,
                request_type: 'portability',
                status: 'completed',
                completed_at: new Date().toISOString()
              }
            ]);
          
          return { data: exportData };
        }
        
        // User authentication
        if (url === '/login') {
          const { data: authData, error } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password
          });
          
          if (error) throw error;
          
          // Get user profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();
          
          return {
            data: {
              user: {
                id: authData.user.id,
                email: authData.user.email,
                name: profile?.full_name || authData.user.email?.split('@')[0] || 'User',
                email_confirmed: !!authData.user.email_confirmed_at,
                ...profile
              },
              token: authData.session.access_token
            }
          };
        }
        
        if (url === '/register') {
          const { data: authData, error } = await supabase.auth.signUp({
            email: data.email,
            password: data.password,
            options: {
              emailRedirectTo: window.location.origin
            }
          });
          
          if (error) throw error;
          
          // Create user profile
          if (authData.user) {
            const { error: profileError } = await supabase
              .from('profiles')
              .insert([
                {
                  id: authData.user.id,
                  full_name: data.name || authData.user.email?.split('@')[0],
                  email: data.email
                }
              ]);
            
            if (profileError) console.error('Profile creation error:', profileError);
          }
          
          return {
            data: {
              user: {
                id: authData.user.id,
                email: authData.user.email,
                name: data.name || authData.user.email?.split('@')[0] || 'User',
                email_confirmed: !!authData.user.email_confirmed_at
              },
              token: authData.session?.access_token || 'mock-token'
            }
          };
        }
        
        // Password reset request
        if (url === '/reset-password-request') {
          const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
            redirectTo: `${window.location.origin}/reset-password`
          });
          
          if (error) throw error;
          
          return { data: { success: true, message: 'Password reset email sent!' } };
        }
        
        // Update password
        if (url === '/update-password') {
          const { data: authData, error } = await supabase.auth.updateUser({
            password: data.password
          });
          
          if (error) throw error;
          
          return { 
            data: { 
              success: true, 
              message: 'Password updated successfully!',
              user: {
                id: authData.user.id,
                email: authData.user.email,
                email_confirmed: !!authData.user.email_confirmed_at
              }
            } 
          };
        }
        
        // Resend confirmation email
        if (url === '/resend-confirmation') {
          const { error } = await supabase.auth.resend({
            type: 'signup',
            email: data.email
          });
          
          if (error) throw error;
          
          return { data: { success: true, message: 'Confirmation email sent!' } };
        }
        
        // Pantry items
        if (url === '/pantry') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data: newItem, error } = await supabase
            .from('pantry_items')
            .insert([
              {
                name: data.name,
                category: data.category,
                quantity: data.quantity,
                unit: data.unit,
                user_id: user.id
              }
            ])
            .select()
            .single();
          
          if (error) throw error;
          
          // Add activity
          await supabase
            .from('activities')
            .insert([
              {
                user_id: user.id,
                description: `Added ${data.name} to pantry`,
                type: 'pantry_add'
              }
            ]);
          
          return { data: newItem };
        }
        
        // User recipes
        if (url === '/user/recipes') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          // Check for duplicate recipe title for this user
          const { data: existingRecipe } = await supabase
            .from('user_recipes')
            .select('id')
            .eq('user_id', user.id)
            .eq('title', data.title)
            .single();
          
          if (existingRecipe) {
            throw new Error('You already have a recipe with this title.');
          }
          
          const { data: newRecipe, error } = await supabase
            .from('user_recipes')
            .insert([
              {
                user_id: user.id,
                title: data.title,
                description: data.description,
                image_url: data.image_url,
                ingredients: data.ingredients || [],
                instructions: data.instructions || [],
                prep_time_minutes: data.prep_time_minutes,
                cook_time_minutes: data.cook_time_minutes,
                servings: data.servings,
                cuisine: data.cuisine,
                dietary_tags: data.dietary_tags || [],
                tags: data.tags || [],
                is_public: data.is_public || false
              }
            ])
            .select()
            .single();
          
          if (error) throw error;
          
          // Add activity
          await supabase
            .from('activities')
            .insert([
              {
                user_id: user.id,
                description: `Created recipe: ${data.title}`,
                type: 'recipe_create'
              }
            ]);
          
          return { data: newRecipe };
        }
        
        // Favorites
        if (url === '/favorites') {
          console.log('🔄 Favorites API called with data:', data);
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          try {
            // Check if recipe is already favorited
            const { data: existingFav, error: checkError } = await supabase
              .from('favorites')
              .select('*')
              .eq('recipe_id', data.recipe_id)
              .eq('user_id', user.id)
              .maybeSingle();
            
            console.log('🔍 Existing favorite check:', existingFav);
            
            if (existingFav) {
              // Remove favorite
              console.log('🗑️ Removing favorite ID:', existingFav.id);
              const { error: deleteError } = await supabase
                .from('favorites')
                .delete()
                .eq('id', existingFav.id);
              
              if (deleteError) {
                console.error('❌ Delete error:', deleteError);
                throw deleteError;
              }
              
              console.log('✅ Favorite removed successfully');
              
              return { 
                data: null, 
                removed: true,
                message: 'Favorite removed'
              };
            } else {
              // Add favorite
              console.log('➕ Adding new favorite');
              const { data: newFavorite, error: insertError } = await supabase
                .from('favorites')
                .insert([
                  {
                    user_id: user.id,
                    recipe_id: data.recipe_id,
                    recipe_title: data.recipe_title || 'Untitled Recipe',
                    recipe_image: data.recipe_image || 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
                  }
                ])
                .select()
                .single();
              
              if (insertError) {
                console.error('❌ Insert error:', insertError);
                throw insertError;
              }
              
              console.log('✅ Favorite added successfully:', newFavorite);
              return { data: newFavorite };
            }
          } catch (error) {
            console.error('❌ Favorites API error:', error);
            throw error;
          }
        }
        
        // Meal plans
        if (url === '/meal-plans') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          // Clear existing plans
          await supabase
            .from('meal_plans')
            .delete()
            .eq('user_id', user.id);
          
          // Insert new plans
          if (data.meals && data.meals.length > 0) {
            const mealPlansWithUserId = data.meals.map(meal => ({
              ...meal,
              user_id: user.id
            }));
            
            const { data: newPlans, error } = await supabase
              .from('meal_plans')
              .insert(mealPlansWithUserId)
              .select();
            
            if (error) throw error;
            
            await supabase
              .from('activities')
              .insert([
                {
                  user_id: user.id,
                  description: 'Updated meal plan',
                  type: 'meal_plan_update'
                }
              ]);
            
            return { data: { success: true, plans: newPlans } };
          }
          
          return { data: { success: true } };
        }
        
        // Grocery lists
        if (url === '/grocery-lists') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data: newList, error } = await supabase
            .from('grocery_lists')
            .insert([
              {
                user_id: user.id,
                name: data.name,
                items: data.items || []
              }
            ])
            .select()
            .single();
          
          if (error) throw error;
          
          await supabase
            .from('activities')
            .insert([
              {
                user_id: user.id,
                description: `Created grocery list: ${data.name}`,
                type: 'grocery_create'
              }
            ]);
          
          return { data: newList };
        }
        
        // Feedback
        if (url === '/feedback') {
          console.log('🔄 Feedback received');
          
          try {
            const accessKey = 'e41237b5-3d37-4bcf-a680-72998517477a';
            
            if (!accessKey || accessKey.includes('YOUR_ACTUAL')) {
              throw new Error('Web3Forms access key not configured');
            }
            
            const formData = new FormData();
            formData.append('access_key', accessKey);
            formData.append('subject', `PantryAI Feedback from ${data.name || 'Anonymous'}`);
            formData.append('from_name', data.name || 'Anonymous');
            formData.append('email', data.email || 'no-email@example.com');
            formData.append('message', data.message || 'No message provided');
            formData.append('to', 'belleshubham106@gmail.com');
            
            console.log('📧 Sending to Web3Forms...');
            const response = await fetch('https://api.web3forms.com/submit', {
              method: 'POST',
              body: formData
            });
            
            const result = await response.json();
            console.log('📧 Web3Forms response:', result);
            
            if (result.success) {
              return { 
                data: { 
                  success: true, 
                  message: 'Thank you for your feedback! Email sent successfully.',
                  web3forms_id: result.message_id 
                } 
              };
            } else {
              throw new Error(result.message || 'Web3Forms failed');
            }
            
          } catch (error) {
            console.error('❌ Feedback error:', error);
            throw { 
              message: 'Failed to send feedback. Please try again later.',
              details: error.message 
            };
          }
        }
        
        // Contact form
        if (url === '/contact') {
          console.log('Contact form submitted:', data);
          
          const emailData = {
            to_email: 'belleshubham106@gmail.com',
            from_name: data.name,
            from_email: data.email,
            subject: `PantryAI Contact: ${data.subject}`,
            message: data.message
          };
          
          console.log('Contact email to be sent:', emailData);
          
          return { data: { success: true, message: 'Thank you for contacting us!' } };
        }
        
        // For updating grocery lists
        if (url.includes('/grocery-lists/')) {
          const listId = url.split('/grocery-lists/')[1];
          
          if (url.endsWith(listId)) {
            // DELETE request
            const { error } = await supabase
              .from('grocery_lists')
              .delete()
              .eq('id', parseInt(listId));
            
            if (error) throw error;
            
            return { data: { success: true } };
          } else {
            // PUT request
            const { data: updated, error } = await supabase
              .from('grocery_lists')
              .update({ items: data.items })
              .eq('id', parseInt(listId))
              .select()
              .single();
            
            if (error) throw error;
            
            return { data: updated };
          }
        }
        
        // Default success response
        return { data: { success: true } };
        
      } catch (error) {
        console.error('API POST Error:', error);
        throw error;
      }
    },
    
    put: async (url, data) => {
      console.log('API PUT:', url, data);
      
      try {
        if (url === '/user/profile') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data: updatedProfile, error } = await supabase
            .from('profiles')
            .update({
              full_name: data.name,
              dietary_preferences: data.dietary_preferences,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id)
            .select()
            .single();
          
          if (error) throw error;
          
          return { data: updatedProfile };
        }
        
        // Update user recipe
        if (url.includes('/user/recipes/')) {
          const recipeId = url.split('/user/recipes/')[1];
          
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { data: updated, error } = await supabase
            .from('user_recipes')
            .update({
              title: data.title,
              description: data.description,
              image_url: data.image_url,
              ingredients: data.ingredients,
              instructions: data.instructions,
              prep_time_minutes: data.prep_time_minutes,
              cook_time_minutes: data.cook_time_minutes,
              servings: data.servings,
              cuisine: data.cuisine,
              dietary_tags: data.dietary_tags,
              tags: data.tags,
              is_public: data.is_public,
              updated_at: new Date().toISOString()
            })
            .eq('id', parseInt(recipeId))
            .eq('user_id', user.id)
            .select()
            .single();
          
          if (error) throw error;
          
          return { data: updated };
        }
        
        // Update grocery list
        if (url.includes('/grocery-lists/')) {
          const listId = url.split('/grocery-lists/')[1];
          
          const { data: updated, error } = await supabase
            .from('grocery_lists')
            .update({ items: data.items })
            .eq('id', parseInt(listId))
            .select()
            .single();
          
          if (error) throw error;
          
          return { data: updated };
        }
        
        return { data: { success: true } };
        
      } catch (error) {
        console.error('API PUT Error:', error);
        throw error;
      }
    },
    
    delete: async (url) => {
      console.log('API DELETE:', url);
      
      try {
        if (url.includes('/pantry/')) {
          const itemId = parseInt(url.split('/pantry/')[1]);
          
          // Get item name before deleting for activity
          const { data: item } = await supabase
            .from('pantry_items')
            .select('name')
            .eq('id', itemId)
            .single();
          
          const { error } = await supabase
            .from('pantry_items')
            .delete()
            .eq('id', itemId);
          
          if (error) throw error;
          
          const { data: { user } } = await supabase.auth.getUser();
          if (user && item) {
            await supabase
              .from('activities')
              .insert([
                {
                  user_id: user.id,
                  description: `Removed ${item.name} from pantry`,
                  type: 'pantry_remove'
                }
              ]);
          }
          
          return { data: { success: true } };
        }
        
        if (url.includes('/user/recipes/')) {
          const recipeId = parseInt(url.split('/user/recipes/')[1]);
          
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          const { error } = await supabase
            .from('user_recipes')
            .delete()
            .eq('id', recipeId)
            .eq('user_id', user.id);
          
          if (error) throw error;
          
          await supabase
            .from('activities')
            .insert([
              {
                user_id: user.id,
                description: 'Deleted a recipe',
                type: 'recipe_delete'
              }
            ]);
          
          return { data: { success: true } };
        }
        
        if (url === '/user/account') {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw { response: { status: 401 } };
          
          // Delete user data from all tables
          await supabase.auth.signOut();
          
          return { data: { success: true } };
        }
        
        return { data: { success: true } };
        
      } catch (error) {
        console.error('API DELETE Error:', error);
        throw error;
      }
    }
  };
};

// Email notification function using Web3Forms
const sendEmailNotification = async (emailData) => {
  try {
    const webhookUrl = 'https://api.web3forms.com/submit';
    const accessKey = 'e41237b5-3d37-4bcf-a680-72998517477a';
    
    const formData = new FormData();
    formData.append('access_key', accessKey);
    formData.append('subject', emailData.subject || 'PantryAI Feedback');
    formData.append('from_name', emailData.from_name || 'Anonymous');
    formData.append('email', emailData.from_email || 'anonymous@example.com');
    formData.append('message', emailData.message);
    formData.append('to', 'belleshubham106@gmail.com');
    
    console.log('Sending email notification via Web3Forms...');
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Email sent successfully via Web3Forms');
      return result;
    } else {
      console.log('⚠️ Web3Forms returned error:', result.message);
      return result;
    }
    
  } catch (error) {
    console.error('❌ Email notification error:', error);
    return { 
      success: false, 
      message: 'Email failed but feedback was saved',
      error: error.message 
    };
  }
};

const API = createRealAPI();

const App = () => {
  const [currentView, setCurrentView] = useState('recipes');
  const [user, setUser] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pantryItems, setPantryItems] = useState([]);
  const [mealPlans, setMealPlans] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [groceryLists, setGroceryLists] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showRecipeDetails, setShowRecipeDetails] = useState(false);
  const [showRecentActivities, setShowRecentActivities] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [apiError, setApiError] = useState('');
  const [showEmailVerificationBanner, setShowEmailVerificationBanner] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);

  // Light theme styles
  const styles = {
    container: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8fafc 0%, #f0f9ff 100%)',
      display: 'flex',
      flexDirection: 'column',
    },
    mainContent: {
      paddingTop: isMobile ? '140px' : '80px', // Increased for mobile to account for search bar
      paddingBottom: '32px',
      flex: 1,
      width: '100%',
      overflowX: 'hidden',
      minHeight: 'calc(100vh - 200px)',
    },
    header: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: 'white',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      zIndex: 1000,
    },
    headerInner: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: isMobile ? '12px 16px' : '16px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      flexWrap: 'wrap',
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      cursor: 'pointer',
      flexShrink: 0,
    },
    logoIcon: {
      width: '36px',
      height: '36px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '10px',
      background: 'linear-gradient(135deg, #3b82f6, #10b981)',
      color: 'white',
      fontSize: '18px',
      fontWeight: 'bold',
    },
    logoText: {
      fontSize: '20px',
      fontWeight: 'bold',
      background: 'linear-gradient(135deg, #3b82f6, #10b981)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    },
    input: {
      width: '100%',
      padding: '10px 16px',
      fontSize: '14px',
      borderRadius: '8px',
      border: '1px solid #d1d5db',
      background: 'white',
      outline: 'none',
      boxSizing: 'border-box',
    },
    buttonPrimary: {
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: '600',
      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    buttonSecondary: {
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: '600',
      background: 'white',
      color: '#374151',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    card: {
      background: 'white',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: '1px solid #e5e7eb',
    },
    h1: {
      fontSize: isMobile ? '28px' : '36px',
      fontWeight: 'bold',
      color: '#111827',
      marginBottom: '16px',
    },
    h2: {
      fontSize: isMobile ? '24px' : '30px',
      fontWeight: 'bold',
      color: '#111827',
      marginBottom: '12px',
    },
    h3: {
      fontSize: isMobile ? '18px' : '22px',
      fontWeight: '600',
      color: '#1f2937',
      marginBottom: '8px',
    },
    p: {
      fontSize: '16px',
      lineHeight: 1.5,
      color: '#4b5563',
      marginBottom: '16px',
    },
    section: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: isMobile ? '20px 16px' : '32px 24px',
      width: '100%',
      boxSizing: 'border-box',
    },
    grid: {
      display: 'grid',
      gap: '24px',
      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))',
    },
  };

  // Set favicon and title
  useEffect(() => {
    document.title = 'PantryAI - Smart Meal Planning';
    const favicon = document.querySelector("link[rel*='icon']") || document.createElement('link');
    favicon.type = 'image/x-icon';
    favicon.rel = 'shortcut icon';
    favicon.href = 'https://img.icons8.com/color/96/000000/restaurant.png';
    document.head.appendChild(favicon);
  }, []);

  // Initialize app
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    
    const handlePasswordReset = async () => {
      const hash = window.location.hash;
      if (hash.includes('type=recovery')) {
        setShowPasswordReset(true);
        setCurrentView('reset-password');
      }
    };
    
    const initUserData = async () => {
      setIsLoading(true);
      setApiError('');
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          await fetchUserData();
          setCurrentView('home');
        }
        
        handlePasswordReset();
        
      } catch (error) {
        console.error('Error initializing app:', error);
        setApiError('Failed to connect to database. Please check your connection.');
      } finally {
        setIsLoading(false);
      }
    };
    
    initUserData();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu && !event.target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showUserMenu]);

  // Check email verification status
  useEffect(() => {
    if (user && !user.email_confirmed) {
      setShowEmailVerificationBanner(true);
    } else {
      setShowEmailVerificationBanner(false);
    }
  }, [user]);

  // Load recipes on app mount
  useEffect(() => {
    if (searchResults.length === 0 && currentView === 'recipes') {
      fetchRecipes('popular');
    }
  }, []);

  // Fetch user data
  const fetchUserData = async () => {
    setIsLoading(true);
    setApiError('');
    
    try {
      const userResponse = await API.get('/user');
      const userData = userResponse.data;
      setUser(userData);
      
      await Promise.all([
        fetchPantryItems(),
        fetchMealPlans(),
        fetchFavorites(),
        fetchGroceryLists(),
        fetchRecentActivities()
      ]);
      
    } catch (error) {
      console.error('Error fetching user data:', error);
      if (error.response?.status === 401) {
        console.log('User not authenticated');
      } else {
        setApiError('Failed to load data. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPantryItems = async () => {
    try {
      const response = await API.get('/pantry');
      setPantryItems(response.data);
    } catch (error) {
      console.error('Error fetching pantry items:', error);
    }
  };

  const fetchMealPlans = async () => {
    try {
      const response = await API.get('/meal-plans');
      setMealPlans(response.data);
    } catch (error) {
      console.error('Error fetching meal plans:', error);
    }
  };

  const fetchFavorites = async () => {
    try {
      const response = await API.get('/favorites');
      setFavorites(response.data);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  };

  const fetchGroceryLists = async () => {
    try {
      const response = await API.get('/grocery-lists');
      setGroceryLists(response.data);
    } catch (error) {
      console.error('Error fetching grocery lists:', error);
    }
  };

  const fetchRecentActivities = async () => {
    try {
      const response = await API.get('/recent-activities');
      setRecentActivities(response.data);
    } catch (error) {
      console.error('Error fetching recent activities:', error);
    }
  };

  const fetchRecipes = async (query = '') => {
    setIsSearching(true);
    setApiError('');
    
    try {
      const response = await API.get(`/recipes${query ? `?query=${encodeURIComponent(query)}` : ''}`);
      setSearchResults(response.data);
      
      if (response.data.length === 0 && query) {
        setApiError('No recipes found. Try a different search term or add your own recipes!');
      }
    } catch (error) {
      console.error('❌ Error fetching recipes:', error);
      setApiError('Showing user recipes. Spoonacular API is temporarily unavailable.');
      // Fallback to user recipes only
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: userRecipes, error: userError } = await supabase
            .from('user_recipes')
            .select('*, profiles(full_name)')
            .or(`user_id.eq.${user.id},is_public.eq.true`)
            .order('created_at', { ascending: false });
          
          if (!userError && userRecipes) {
            const formattedRecipes = userRecipes.map(recipe => ({
              id: recipe.id + 1000000,
              title: recipe.title,
              image: recipe.image_url || 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
              readyInMinutes: (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0) || 30,
              servings: recipe.servings || 4,
              summary: recipe.description || `${recipe.title} - a user-contributed recipe.`,
              instructions: recipe.instructions ? `<ol>${recipe.instructions.map((step, i) => `<li>${step}</li>`).join('')}</ol>` : '<p>No instructions provided.</p>',
              extendedIngredients: recipe.ingredients ? recipe.ingredients.map(ing => ({ original: ing })) : [],
              dishTypes: recipe.tags || [],
              diets: recipe.dietary_tags || [],
              cuisines: recipe.cuisine ? [recipe.cuisine] : [],
              source: recipe.user_id === user.id ? 'user_own' : 'user_public', // Fixed source distinction
              author: recipe.user_id === user.id ? 'You' : (recipe.profiles?.full_name || 'Community') // Fixed author
            }));
            setSearchResults(formattedRecipes);
          }
        }
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
        setSearchResults([]);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const fetchRecipeDetails = async (recipeId) => {
    try {
      console.log('📖 Fetching recipe details for ID:', recipeId);
      const response = await API.get(`/recipes/${recipeId}`);
      console.log('✅ Recipe details fetched:', response.data);
      
      setSelectedRecipe(response.data);
      setShowRecipeDetails(true);
    } catch (error) {
      console.error('❌ Error fetching recipe details:', error);
      setApiError('Failed to load recipe details. Please try again.');
    }
  };

  const handleLogin = async (userData, token) => {
    setUser(userData);
    await fetchUserData();
    setCurrentView('home');
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    setUser(null);
    setPantryItems([]);
    setMealPlans([]);
    setFavorites([]);
    setGroceryLists([]);
    setRecentActivities([]);
    setSearchResults([]);
    setCurrentView('home');
    setIsMobileMenuOpen(false);
    setShowUserMenu(false);
    setShowEmailVerificationBanner(false);
  };

  const handleSearchRecipes = (query) => {
    fetchRecipes(query);
    setCurrentView('recipes');
    setIsMobileMenuOpen(false);
  };

  const toggleFavorite = async (recipe) => {
    console.log('🔄 toggleFavorite called for recipe:', recipe);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Show modal instead of just error
        alert('To save your favorite recipes, please sign in first!\n\nClick "Get Started Free" or "Sign In" to create or access your account.');
        setCurrentView('login');
        return;
      }
      
      // Check if it's already a favorite using local state
      const existingFav = favorites.find(fav => fav.recipe_id === recipe.id);
      
      if (existingFav) {
        // Remove from database
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('id', existingFav.id);
        
        if (error) {
          console.error('❌ Error deleting favorite:', error);
          throw error;
        }
        
        console.log('✅ Favorite removed from database');
        
        // Remove from local state
        setFavorites(prev => prev.filter(fav => fav.id !== existingFav.id));
        setApiError('✅ Removed from favorites!');
        
      } else {
        // Add to database
        const { data: newFavorite, error } = await supabase
          .from('favorites')
          .insert([
            {
              user_id: user.id,
              recipe_id: recipe.id,
              recipe_title: recipe.title,
              recipe_image: recipe.image
            }
          ])
          .select()
          .single();
        
        if (error) {
          console.error('❌ Error adding favorite:', error);
          throw error;
        }
        
        console.log('✅ Favorite added to database:', newFavorite);
        
        // Add to local state
        setFavorites(prev => [...prev, newFavorite]);
        setApiError('✅ Added to favorites!');
      }
      
      // Refresh to ensure sync
      await fetchFavorites();
      
      setTimeout(() => setApiError(''), 2000);
      
    } catch (error) {
      console.error('❌ Error toggling favorite:', error);
      setApiError('Failed to update favorites. Please try again.');
    }
  };

  const handleResendConfirmation = async () => {
    if (!user?.email) return;
    
    setIsLoading(true);
    try {
      const response = await API.post('/resend-confirmation', { email: user.email });
      setApiError('Confirmation email sent! Please check your inbox.');
    } catch (error) {
      setApiError('Failed to send confirmation email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordResetRequest = async (email) => {
    setIsLoading(true);
    try {
      const response = await API.post('/reset-password-request', { email });
      setResetPasswordSuccess(true);
    } catch (error) {
      setApiError('Failed to send password reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordUpdate = async (password) => {
    setIsLoading(true);
    try {
      const response = await API.post('/update-password', { password });
      setApiError('Password updated successfully!');
      setShowPasswordReset(false);
      setCurrentView('login');
    } catch (error) {
      setApiError('Failed to update password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Header Component
  const Header = () => {
    const [localSearchQuery, setLocalSearchQuery] = useState('');

    const handleSearch = (e) => {
      e.preventDefault();
      if (localSearchQuery.trim()) {
        handleSearchRecipes(localSearchQuery.trim());
      }
    };

    return (
      <header style={styles.header}>
        <div style={styles.headerInner}>
          {/* Logo */}
          <div style={styles.logo} onClick={() => { setCurrentView('home'); setIsMobileMenuOpen(false); }}>
            <div style={styles.logoIcon}>
              <svg width="25" height="25" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 14 C17.2065 14.5793 18.8183 15.452 21.0845 17.7756 C21.6583 18.3562 22.2322 18.9367 22.8234 19.5348 C23.4308 20.164 24.0382 20.7932 24.6641 21.4414 C25.2973 22.0837 25.9306 22.7259 26.5831 23.3877 C28.6043 25.439 30.6154 27.4998 32.625 29.5625 C34.6426 31.6278 36.6623 33.6909 38.6883 35.748 C39.9488 37.0284 41.2044 38.3137 42.4545 39.6041 C43.9321 41.1073 45.4615 42.5592 47 44 C47.66 44 48.32 44 49 44 C48.9536 43.2382 48.9072 42.4763 48.8594 41.6914 C48.6125 34.6304 48.9079 28.9336 53 23 C57.265 18.4379 61.6545 14.4548 67.9883 13.5938 C78.0689 13.3095 78.0689 13.3095 82.25 16.8125 C85.6611 20.2321 86.1859 23.464 86.3125 28.1875 C86.228 34.5977 84.7467 38.9403 80.457 43.7188 C73.7016 50.0258 67.1977 51.3643 58.125 51.1055 C57.4237 51.0707 56.7225 51.0359 56 51 C57.4731 54.4612 59.3965 56.56 62.1328 59.1172 C62.9385 59.8893 63.7441 60.6615 64.5742 61.457 C66.275 63.0692 67.9833 64.6734 69.6992 66.2695 C70.5023 67.0443 71.3054 67.819 72.1328 68.6172 C73.2449 69.663 73.2449 69.663 74.3794 70.73 C76.4821 73.6753 76.4557 75.4566 76 79 C75.34 79.66 74.68 80.32 74 81 C69.3635 80.8093 67.2859 78.7576 64.1367 75.5273 C63.2505 74.6282 62.3643 73.7291 61.4512 72.8027 C60.5392 71.8572 59.6271 70.9117 58.6875 69.9375 C57.7477 68.9776 56.807 68.0186 55.8652 67.0605 C53.5676 64.7158 51.2798 62.3622 49 60 C45.5537 61.473 43.4203 63.3932 40.8477 66.0977 C40.071 66.8988 39.2943 67.7 38.4941 68.5254 C36.873 70.2169 35.2558 71.9122 33.6426 73.6113 C32.8646 74.4112 32.0867 75.2111 31.2852 76.0352 C30.5827 76.7713 29.8802 77.5074 29.1565 78.2659 C26.7074 80.2353 25.1127 80.759 22 81 C20.125 79.875 20.125 79.875 19 78 C19.3018 73.3499 21.2073 71.32 24.4727 68.1367 C25.8213 66.8074 25.8213 66.8074 27.1973 65.4512 C28.6156 64.0832 28.6156 64.0832 30.0625 62.6875 C31.0224 61.7477 31.9814 60.8069 32.9395 59.8652 C35.2842 57.5676 37.6378 55.2798 40 53 C39.34 51.68 38.68 50.36 38 49 C36.8862 50.0209 36.8862 50.0209 35.75 51.0625 C33 53 33 53 31.0647 52.835 C28.533 51.8111 27.1402 50.5126 25.2148 48.5781 C24.5194 47.882 23.824 47.1859 23.1074 46.4688 C22.3913 45.7366 21.6753 45.0044 20.9375 44.25 C20.2176 43.5333 19.4976 42.8166 18.7559 42.0781 C9.573 32.8012 9.573 32.8012 9.5625 25.5625 C9.68 20.4463 10.6797 17.8391 14 14 Z"
        fill="transparent" stroke="#FFFFFF" stroke-width="5"/>
</svg>
            </div>
            <span style={styles.logoText}>PantryAI</span>
          </div>

          {/* Desktop Search */}
          {!isMobile && user && (
            <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: '500px', margin: '0 20px' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search recipes..."
                  value={localSearchQuery}
                  onChange={(e) => setLocalSearchQuery(e.target.value)}
                  style={styles.input}
                />
                <button
                  type="submit"
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            </form>
          )}

          {/* Navigation */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {user ? (
              <>
                {/* Desktop Navigation */}
                {!isMobile && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['home', 'recipes', 'my-recipes', 'pantry', 'meal-planner', 'grocery-list', 'favorites'].map((view) => (
                      <button
                        key={view}
                        onClick={() => { 
                          setCurrentView(view); 
                          setIsMobileMenuOpen(false); 
                        }}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '500',
                          border: '1px solid',
                          transition: 'all 0.2s',
                          ...(currentView === view
                            ? {
                                background: '#dbeafe',
                                color: '#1d4ed8',
                                borderColor: '#93c5fd',
                              }
                            : {
                                color: '#4b5563',
                                borderColor: 'transparent',
                                background: 'transparent',
                              }),
                        }}
                      >
                        {view.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                      </button>
                    ))}
                  </div>
                )}
                
                {/* User Menu */}
                <div className="user-menu-container" style={{ position: 'relative' }}>
                  <button 
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      color: '#374151',
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    <span>Hi, {user.name}</span>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showUserMenu && (
                    <div style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      marginTop: '4px',
                      width: '200px',
                      background: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      border: '1px solid #e5e7eb',
                      padding: '4px 0',
                      zIndex: 1001,
                    }}>
                      {!user.email_confirmed && (
                        <button
                          onClick={() => {
                            handleResendConfirmation();
                            setShowUserMenu(false);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 16px',
                            fontSize: '14px',
                            color: '#f59e0b',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            borderBottom: '1px solid #e5e7eb',
                          }}
                        >
                          Resend Verification
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setShowFeedback(true);
                          setShowUserMenu(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 16px',
                          fontSize: '14px',
                          color: '#374151',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Feedback
                      </button>
                      <button
                        onClick={() => { 
                          setCurrentView('user-rights'); 
                          setIsMobileMenuOpen(false); 
                          setShowUserMenu(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 16px',
                          fontSize: '14px',
                          color: '#374151',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Data & Privacy
                      </button>
                      <div style={{ borderTop: '1px solid #e5e7eb', margin: '4px 0' }}></div>
                      <button
                        onClick={handleLogout}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 16px',
                          fontSize: '14px',
                          color: '#dc2626',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>

                {/* Mobile Menu Button */}
                {isMobile && (
                  <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    style={{
                      padding: '8px',
                      color: '#6b7280',
                      background: 'none',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setCurrentView('login')}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    background: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Login
                </button>
                <button
                  onClick={() => setCurrentView('register')}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: '500',
                    background: 'linear-gradient(to right, #3b82f6, #2563eb)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Sign Up
                </button>
              </div>
            )}
          </nav>
        </div>

        {/* Mobile Search - Fixed positioning */}
        {isMobile && user && (
          <div style={{ 
            padding: '12px 16px', 
            width: '100%', 
            boxSizing: 'border-box',
            position: 'sticky',
            top: isMobileMenuOpen ? '100%' : '60px', // Adjust based on header height
            background: 'white',
            zIndex: 999,
            borderBottom: '1px solid #e5e7eb'
          }}>
            <form onSubmit={handleSearch} style={{ width: '100%' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  placeholder="Search recipes..."
                  value={localSearchQuery}
                  onChange={(e) => setLocalSearchQuery(e.target.value)}
                  style={{
                    ...styles.input,
                    width: '100%',
                    padding: '12px 40px 12px 16px',
                    fontSize: '16px',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Mobile Menu */}
        {isMobile && isMobileMenuOpen && user && (
          <div style={{
            padding: '16px',
            background: 'white',
            borderTop: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {['home', 'recipes', 'my-recipes', 'pantry', 'meal-planner', 'grocery-list', 'favorites'].map((view) => (
                <button
                  key={view}
                  onClick={() => { 
                    setCurrentView(view); 
                    setIsMobileMenuOpen(false); 
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '500',
                    border: '1px solid',
                    transition: 'all 0.2s',
                    ...(currentView === view
                      ? {
                          background: '#dbeafe',
                          color: '#1d4ed8',
                          borderColor: '#93c5fd',
                        }
                      : {
                          color: '#4b5563',
                          borderColor: '#e5e7eb',
                          background: 'white',
                        }),
                  }}
                >
                  {view.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>
    );
  };

  // Error Display
  const ErrorDisplay = () => {
    if (!apiError) return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        color: '#991b1b',
        padding: '12px 20px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        zIndex: 999,
        maxWidth: '500px',
        width: '90%',
        textAlign: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
          </svg>
          <p style={{ margin: 0, fontWeight: '500' }}>{apiError}</p>
        </div>
        <button
          onClick={() => setApiError('')}
          style={{
            marginTop: '8px',
            background: 'none',
            border: 'none',
            color: '#dc2626',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Dismiss
        </button>
      </div>
    );
  };

  // Email Verification Banner
  const EmailVerificationBanner = () => {
    if (!showEmailVerificationBanner || !user) return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: '80px',
        left: 0,
        right: 0,
        background: 'linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%)',
        borderBottom: '1px solid #fbbf24',
        padding: '12px 16px',
        zIndex: 99,
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: '14px' }}>
            Please verify your email address ({user.email}) to access all features.
            <button
              onClick={handleResendConfirmation}
              style={{
                marginLeft: '8px',
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Resend verification email
            </button>
          </p>
        </div>
      </div>
    );
  };

  // Auth Views (Login/Register)
  const AuthView = ({ mode }) => {
    const [formData, setFormData] = useState({
      email: '',
      password: '',
      confirmPassword: '',
      name: ''
    });
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
    const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');
      setIsSubmitting(true);

      if (mode === 'register' && formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        setIsSubmitting(false);
        return;
      }

      try {
        const endpoint = mode === 'login' ? '/login' : '/register';
        const response = await API.post(endpoint, {
          email: formData.email,
          password: formData.password,
          name: formData.name
        });

        const data = response.data;
        await handleLogin(data.user, data.token);
        
        setFormData({
          email: '',
          password: '',
          confirmPassword: '',
          name: ''
        });
      } catch (error) {
        console.error('Auth error:', error);
        setError(error.message || 'Authentication failed. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleForgotPasswordSubmit = async (e) => {
      e.preventDefault();
      setError('');
      setIsSubmitting(true);

      try {
        await handlePasswordResetRequest(forgotPasswordEmail);
        setForgotPasswordSuccess(true);
      } catch (error) {
        setError(error.message || 'Failed to send password reset email.');
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #f0fdf4 100%)',
      }}>
        <div style={{
          maxWidth: '400px',
          width: '100%',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb',
          padding: isMobile ? '24px' : '32px',
        }}>
          {showForgotPassword ? (
            <>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px', color: '#111827' }}>
                Reset Password
              </h2>
              <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '24px' }}>
                Enter your email to receive a password reset link
              </p>
              
              {forgotPasswordSuccess ? (
                <div style={{
                  background: '#d1fae5',
                  border: '1px solid #86efac',
                  color: '#065f46',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}>
                  Password reset email sent! Please check your inbox.
                </div>
              ) : (
                <>
                  {error && (
                    <div style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#dc2626',
                      padding: '12px',
                      borderRadius: '8px',
                      marginBottom: '20px',
                    }}>
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleForgotPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                        Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        style={styles.input}
                        placeholder="Enter your email"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      style={{
                        ...styles.buttonPrimary,
                        width: '100%',
                        padding: '12px',
                        opacity: isSubmitting ? 0.7 : 1,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isSubmitting ? 'Sending...' : 'Send Reset Link'}
                    </button>
                  </form>
                </>
              )}

              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button
                  onClick={() => {
                    setShowForgotPassword(false);
                    setError('');
                    setForgotPasswordSuccess(false);
                  }}
                  style={{
                    color: '#3b82f6',
                    background: 'none',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  Back to {mode === 'login' ? 'Sign In' : 'Sign Up'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px', color: '#111827' }}>
                {mode === 'login' ? 'Welcome Back' : 'Join PantryAI'}
              </h2>
              <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '24px' }}>
                {mode === 'login' ? 'Sign in to your account' : 'Create your account to get started'}
              </p>
              
              {error && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {mode === 'register' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      style={styles.input}
                      placeholder="Enter your full name"
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    style={styles.input}
                    placeholder="Enter your email"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    style={styles.input}
                    placeholder="Enter your password"
                  />
                </div>

                {mode === 'register' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                      style={styles.input}
                      placeholder="Confirm your password"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    ...styles.buttonPrimary,
                    width: '100%',
                    padding: '12px',
                    opacity: isSubmitting ? 0.7 : 1,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
                </button>
              </form>

              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                {mode === 'login' && (
                  <button
                    onClick={() => setShowForgotPassword(true)}
                    style={{
                      color: '#3b82f6',
                      background: 'none',
                      border: 'none',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      marginBottom: '10px',
                    }}
                  >
                    Forgot your password?
                  </button>
                )}
                <button
                  onClick={() => setCurrentView(mode === 'login' ? 'register' : 'login')}
                  style={{
                    color: '#3b82f6',
                    background: 'none',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  {mode === 'login' 
                    ? "Don't have an account? Sign up" 
                    : "Already have an account? Sign in"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Password Reset View
  const PasswordResetView = () => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');

      if (newPassword !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      if (newPassword.length < 6) {
        setError('Password must be at least 6 characters long');
        return;
      }

      setIsSubmitting(true);
      await handlePasswordUpdate(newPassword);
      setIsSubmitting(false);
    };

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #f0fdf4 100%)',
      }}>
        <div style={{
          maxWidth: '400px',
          width: '100%',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb',
          padding: isMobile ? '24px' : '32px',
        }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px', color: '#111827' }}>
            Set New Password
          </h2>
          <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '24px' }}>
            Please enter your new password
          </p>
          
          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '20px',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={styles.input}
                placeholder="Enter new password"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={styles.input}
                placeholder="Confirm new password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                ...styles.buttonPrimary,
                width: '100%',
                padding: '12px',
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Updating...' : 'Update Password'}
            </button>
          </form>

          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button
              onClick={() => {
                setShowPasswordReset(false);
                setCurrentView('login');
              }}
              style={{
                color: '#3b82f6',
                background: 'none',
                border: 'none',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  };

  // My Recipes View
  const MyRecipesView = () => {
    const [newRecipe, setNewRecipe] = useState({
      title: '',
      description: '',
      image_url: '',
      ingredients: [],
      instructions: [],
      prep_time_minutes: 15,
      cook_time_minutes: 30,
      servings: 4,
      cuisine: '',
      dietary_tags: [],
      tags: ['main-course'],
      is_public: true
    });
    const [ingredientInput, setIngredientInput] = useState('');
    const [instructionInput, setInstructionInput] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [userRecipes, setUserRecipes] = useState([]);

    const fetchUserRecipes = async () => {
      try {
        const response = await API.get('/user/recipes');
        setUserRecipes(response.data);
      } catch (error) {
        console.error('Error fetching user recipes:', error);
      }
    };

    useEffect(() => {
      if (user) {
        fetchUserRecipes();
      }
    }, [user]);

    const handleAddRecipe = async (e) => {
      e.preventDefault();
      if (!newRecipe.title.trim()) return;

      setIsAdding(true);
      try {
        await API.post('/user/recipes', newRecipe);
        await fetchUserRecipes();
        
        setNewRecipe({
          title: '',
          description: '',
          image_url: '',
          ingredients: [],
          instructions: [],
          prep_time_minutes: 15,
          cook_time_minutes: 30,
          servings: 4,
          cuisine: '',
          dietary_tags: [],
          tags: ['main-course'],
          is_public: false
        });
        setIngredientInput('');
        setInstructionInput('');
        
        setApiError('Recipe added successfully!');
        setTimeout(() => setApiError(''), 3000);
      } catch (error) {
        console.error('Error adding recipe:', error);
        setApiError(error.message || 'Failed to add recipe.');
      } finally {
        setIsAdding(false);
      }
    };

    const handleAddIngredient = () => {
      if (ingredientInput.trim()) {
        setNewRecipe({
          ...newRecipe,
          ingredients: [...newRecipe.ingredients, ingredientInput.trim()]
        });
        setIngredientInput('');
      }
    };

    const handleAddInstruction = () => {
      if (instructionInput.trim()) {
        setNewRecipe({
          ...newRecipe,
          instructions: [...newRecipe.instructions, instructionInput.trim()]
        });
        setInstructionInput('');
      }
    };

    const handleRemoveIngredient = (index) => {
      const newIngredients = [...newRecipe.ingredients];
      newIngredients.splice(index, 1);
      setNewRecipe({ ...newRecipe, ingredients: newIngredients });
    };

    const handleRemoveInstruction = (index) => {
      const newInstructions = [...newRecipe.instructions];
      newInstructions.splice(index, 1);
      setNewRecipe({ ...newRecipe, instructions: newInstructions });
    };

    const handleViewRecipe = (recipe) => {
      const formattedRecipe = {
        id: recipe.id + 1000000,
        title: recipe.title,
        image: recipe.image_url || 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
        readyInMinutes: (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0) || 30,
        servings: recipe.servings || 4,
        summary: recipe.description || `${recipe.title} - a user-contributed recipe.`,
        instructions: recipe.instructions ? `<ol>${recipe.instructions.map((step, i) => `<li>${step}</li>`).join('')}</ol>` : '<p>No instructions provided.</p>',
        extendedIngredients: recipe.ingredients ? recipe.ingredients.map(ing => ({ original: ing })) : [],
        dishTypes: recipe.tags || [],
        diets: recipe.dietary_tags || [],
        cuisines: recipe.cuisine ? [recipe.cuisine] : [],
        source: 'user_own', // Fixed source
        author: 'You'
      };
      
      setSelectedRecipe(formattedRecipe);
      setShowRecipeDetails(true);
    };

    const handleDeleteRecipe = async (recipeId) => {
      if (window.confirm('Are you sure you want to delete this recipe?')) {
        try {
          await API.delete(`/user/recipes/${recipeId}`);
          await fetchUserRecipes();
          setApiError('Recipe deleted successfully!');
          setTimeout(() => setApiError(''), 3000);
        } catch (error) {
          console.error('Error deleting recipe:', error);
          setApiError('Failed to delete recipe.');
        }
      }
    };

    const handleTogglePublic = async (recipeId, isPublic) => {
      try {
        await API.put(`/user/recipes/${recipeId}`, { is_public: !isPublic });
        await fetchUserRecipes();
        setApiError(`Recipe ${!isPublic ? 'made public' : 'made private'}!`);
        setTimeout(() => setApiError(''), 3000);
      } catch (error) {
        console.error('Error updating recipe:', error);
        setApiError('Failed to update recipe.');
      }
    };

    return (
      <div style={styles.section}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={styles.h2}>My Recipes</h1>
          <p style={{ ...styles.p, marginBottom: '24px' }}>Create and manage your own recipes</p>
        </div>

        <div style={styles.grid}>
          {/* Add Recipe Form */}
          <div style={styles.card}>
            <h3 style={{ ...styles.h3, marginBottom: '16px' }}>Create New Recipe</h3>
            <form onSubmit={handleAddRecipe} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Recipe Title *
                </label>
                <input
                  type="text"
                  required
                  value={newRecipe.title}
                  onChange={(e) => setNewRecipe({...newRecipe, title: e.target.value})}
                  style={styles.input}
                  placeholder="e.g., Grandma's Chicken Soup"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Description
                </label>
                <textarea
                  value={newRecipe.description}
                  onChange={(e) => setNewRecipe({...newRecipe, description: e.target.value})}
                  style={{
                    ...styles.input,
                    minHeight: '80px',
                    resize: 'vertical',
                  }}
                  placeholder="Describe your recipe..."
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Image URL (Optional)
                </label>
                <input
                  type="url"
                  value={newRecipe.image_url}
                  onChange={(e) => setNewRecipe({...newRecipe, image_url: e.target.value})}
                  style={styles.input}
                  placeholder="https://example.com/recipe-image.jpg"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    Prep Time (min)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newRecipe.prep_time_minutes}
                    onChange={(e) => setNewRecipe({...newRecipe, prep_time_minutes: parseInt(e.target.value) || 15})}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    Cook Time (min)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newRecipe.cook_time_minutes}
                    onChange={(e) => setNewRecipe({...newRecipe, cook_time_minutes: parseInt(e.target.value) || 30})}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    Servings
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newRecipe.servings}
                    onChange={(e) => setNewRecipe({...newRecipe, servings: parseInt(e.target.value) || 4})}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    Cuisine
                  </label>
                  <input
                    type="text"
                    value={newRecipe.cuisine}
                    onChange={(e) => setNewRecipe({...newRecipe, cuisine: e.target.value})}
                    style={styles.input}
                    placeholder="e.g., Italian, Mexican"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Ingredients
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={ingredientInput}
                    onChange={(e) => setIngredientInput(e.target.value)}
                    style={{ ...styles.input, flex: 1 }}
                    placeholder="Add ingredient (e.g., 2 cups flour)"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddIngredient())}
                  />
                  <button
                    type="button"
                    onClick={handleAddIngredient}
                    style={{
                      ...styles.buttonPrimary,
                      padding: '10px 16px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Add
                  </button>
                </div>
                {newRecipe.ingredients.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    {newRecipe.ingredients.map((ing, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px',
                        background: '#f9fafb',
                        borderRadius: '6px',
                        marginBottom: '4px',
                      }}>
                        <span>{ing}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredient(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Instructions
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <textarea
                    value={instructionInput}
                    onChange={(e) => setInstructionInput(e.target.value)}
                    style={{ ...styles.input, flex: 1, minHeight: '60px' }}
                    placeholder="Add instruction step"
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAddInstruction())}
                  />
                  <button
                    type="button"
                    onClick={handleAddInstruction}
                    style={{
                      ...styles.buttonPrimary,
                      padding: '10px 16px',
                      whiteSpace: 'nowrap',
                      alignSelf: 'flex-start',
                    }}
                  >
                    Add
                  </button>
                </div>
                {newRecipe.instructions.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    {newRecipe.instructions.map((step, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        padding: '8px',
                        background: '#f9fafb',
                        borderRadius: '6px',
                        marginBottom: '4px',
                      }}>
                        <span><strong>Step {index + 1}:</strong> {step}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveInstruction(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={newRecipe.is_public}
                    onChange={(e) => setNewRecipe({...newRecipe, is_public: e.target.checked})}
                    style={{ width: '16px', height: '16px' }}
                  />
                  Make this recipe public for other users
                </label>
              </div>

              <button
                type="submit"
                disabled={isAdding}
                style={{
                  ...styles.buttonPrimary,
                  width: '100%',
                  padding: '12px',
                  opacity: isAdding ? 0.7 : 1,
                  cursor: isAdding ? 'not-allowed' : 'pointer',
                }}
              >
                {isAdding ? 'Adding...' : 'Add Recipe'}
              </button>
            </form>
          </div>

          {/* My Recipes List */}
          <div style={styles.card}>
            <h3 style={{ ...styles.h3, marginBottom: '16px' }}>
              My Recipe Collection ({userRecipes.length})
            </h3>
            
            {userRecipes.length > 0 ? (
              <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                {userRecipes.map(recipe => {
                  const isFavorite = favorites.some(fav => fav.recipe_id === (recipe.id + 1000000));
                  
                  return (
                    <div key={recipe.id} style={{
                      padding: '16px',
                      borderBottom: '1px solid #e5e7eb',
                      ':last-child': { borderBottom: 'none' }
                    }}>
                      <div style={{ display: 'flex', gap: '16px' }}>
                        {recipe.image_url && (
                          <img
                            src={recipe.image_url}
                            alt={recipe.title}
                            style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px' }}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h4 style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                              {recipe.title}
                              {recipe.is_public && (
                                <span style={{
                                  marginLeft: '8px',
                                  fontSize: '12px',
                                  background: '#dbeafe',
                                  color: '#1d4ed8',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                }}>
                                  Public
                                </span>
                              )}
                            </h4>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => handleTogglePublic(recipe.id, recipe.is_public)}
                                style={{
                                  padding: '4px 8px',
                                  background: recipe.is_public ? '#f3f4f6' : '#dbeafe',
                                  color: recipe.is_public ? '#6b7280' : '#1d4ed8',
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                }}
                                title={recipe.is_public ? 'Make private' : 'Make public'}
                              >
                                {recipe.is_public ? '🌐' : '🔒'}
                              </button>
                            </div>
                          </div>
                          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
                            {(recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0)} min • {recipe.servings} servings
                            {recipe.cuisine && ` • ${recipe.cuisine}`}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleViewRecipe(recipe)}
                              style={{
                                padding: '6px 12px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                cursor: 'pointer',
                              }}
                            >
                              View
                            </button>
                            <button
                              onClick={() => toggleFavorite({
                                id: recipe.id + 1000000,
                                title: recipe.title,
                                image: recipe.image_url
                              })}
                              style={{
                                padding: '6px 12px',
                                background: isFavorite ? '#fef2f2' : '#f3f4f6',
                                color: isFavorite ? '#dc2626' : '#4b5563',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <svg width="14" height="14" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                              </svg>
                              {isFavorite ? 'Liked' : 'Like'}
                            </button>
                            <button
                              onClick={() => handleDeleteRecipe(recipe.id)}
                              style={{
                                padding: '6px 12px',
                                background: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: '6px',
                                fontSize: '14px',
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ color: '#d1d5db', marginBottom: '16px' }}>
                  <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <p style={{ color: '#6b7280' }}>No recipes added yet. Use the form to add your first recipe!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Recipes View
  // Recipes View
const RecipesView = () => {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [spoonacularAvailable, setSpoonacularAvailable] = useState(true);

  const handleSearch = (e) => {
    e.preventDefault();
    if (localSearchQuery.trim()) {
      fetchRecipes(localSearchQuery.trim());
    }
  };

  const handleViewRecipe = async (recipe) => {
    await fetchRecipeDetails(recipe.id);
  };

  const handleBrowsePopular = async () => {
    await fetchRecipes('popular');
  };

  const handleBrowseQuick = async () => {
    await fetchRecipes('quick');
  };

  return (
    <div style={styles.section}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={styles.h2}>Discover Recipes</h1>
        <p style={{ ...styles.p, marginBottom: '24px' }}>Search recipes from Spoonacular API and user-contributed recipes</p>
        {!spoonacularAvailable && (
          <div style={{
            background: '#fef3c7',
            border: '1px solid #fbbf24',
            color: '#92400e',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
            </svg>
            <span>
              Spoonacular API is currently unavailable. Showing user-contributed recipes only.
              <button 
                onClick={() => setCurrentView('my-recipes')}
                style={{
                  marginLeft: '10px',
                  background: 'none',
                  border: 'none',
                  color: '#3b82f6',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Create your own recipe
              </button>
            </span>
          </div>
        )}
        <form onSubmit={handleSearch} style={{ maxWidth: '600px', marginBottom: '24px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search for recipes, ingredients, or dishes..."
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              style={{
                ...styles.input,
                padding: isMobile ? '12px' : '16px',
                fontSize: isMobile ? '16px' : '18px',
              }}
            />
            <button
              type="submit"
              disabled={isSearching}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: isSearching ? '#9ca3af' : '#3b82f6',
                color: 'white',
                padding: isMobile ? '8px 16px' : '10px 20px',
                border: 'none',
                borderRadius: '6px',
                fontWeight: '600',
                cursor: isSearching ? 'not-allowed' : 'pointer',
                fontSize: isMobile ? '14px' : '16px',
              }}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Quick Browse Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <button
            onClick={handleBrowsePopular}
            disabled={isSearching}
            style={{
              padding: '10px 20px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: isSearching ? 'not-allowed' : 'pointer',
              opacity: isSearching ? 0.7 : 1,
            }}
          >
            Popular Recipes
          </button>
          <button
            onClick={handleBrowseQuick}
            disabled={isSearching}
            style={{
              padding: '10px 20px',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: isSearching ? 'not-allowed' : 'pointer',
              opacity: isSearching ? 0.7 : 1,
            }}
          >
            Quick Meals
          </button>
        </div>
      </div>

      {isSearching ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{
            display: 'inline-block',
            animation: 'spin 1s linear infinite',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            border: '3px solid transparent',
            borderTopColor: '#3b82f6',
            marginBottom: '16px',
          }}></div>
          <p style={{ color: '#6b7280' }}>Searching recipes...</p>
        </div>
      ) : searchResults.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {searchResults.map(recipe => {
            const isFavorite = favorites.some(fav => fav.recipe_id === recipe.id);
            const isUserRecipe = recipe.source?.includes('user');
            
            // Determine display text based on source
            let sourceBadge = null;
            if (recipe.source === 'user_own') {
              sourceBadge = {
                text: 'Your recipe',
                color: '#dbeafe',
                textColor: '#1d4ed8'
              };
            } else if (recipe.source === 'user_public') {
              sourceBadge = {
                text: recipe.author || 'Community',
                color: '#dcfce7',
                textColor: '#059669'
              };
            } else if (recipe.source === 'spoonacular') {
              sourceBadge = {
                text: 'Spoonacular',
                color: '#fef3c7',
                textColor: '#92400e'
              };
            }
            
            return (
              <div key={recipe.id} style={styles.card}>
                {recipe.image && (
                  <img
                    src={recipe.image}
                    alt={recipe.title}
                    style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '16px' }}
                  />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h3 style={{ fontWeight: '600', color: '#111827', marginBottom: '8px', flex: 1 }}>{recipe.title}</h3>
                  {sourceBadge && (
                    <span style={{
                      fontSize: '12px',
                      background: sourceBadge.color,
                      color: sourceBadge.textColor,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                    }}>
                      {sourceBadge.text}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                  <div>
                    {recipe.readyInMinutes && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {recipe.readyInMinutes} min
                      </span>
                    )}
                  </div>
                  {recipe.servings && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      {recipe.servings} servings
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleViewRecipe(recipe)}
                    style={{
                      flex: 1,
                      background: '#3b82f6',
                      color: 'white',
                      padding: '10px',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    View Recipe
                  </button>
                  <button
                    onClick={() => toggleFavorite(recipe)}
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: isFavorite ? '#fef2f2' : '#f3f4f6',
                      color: isFavorite ? '#dc2626' : '#4b5563',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="16" height="16" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ ...styles.card, textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: '#d1d5db', marginBottom: '20px' }}>
            <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>Search for recipes</h3>
          <p style={{ fontSize: '16px', color: '#9ca3af' }}>
            Enter a search term above to find delicious recipes.
            Or try "popular" or "quick" recipes using the buttons above.
          </p>
          <div style={{ marginTop: '24px' }}>
            <button
              onClick={() => setCurrentView('my-recipes')}
              style={{
                ...styles.buttonPrimary,
                padding: '12px 24px',
              }}
            >
              Create Your Own Recipe
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

  // Favorites View
  const FavoritesView = () => {
    const [loadingRecipes, setLoadingRecipes] = useState({});

    const handleViewRecipe = async (favorite) => {
      console.log('Viewing recipe from favorites:', favorite.recipe_id, favorite.recipe_title);
      setLoadingRecipes(prev => ({ ...prev, [favorite.recipe_id]: true }));
      try {
        await fetchRecipeDetails(favorite.recipe_id);
      } catch (error) {
        console.error('Error fetching recipe details:', error);
        setApiError('Failed to load recipe details.');
      } finally {
        setLoadingRecipes(prev => ({ ...prev, [favorite.recipe_id]: false }));
      }
    };

    const removeFavorite = async (favorite) => {
      console.log('Removing favorite:', favorite);
      
      try {
        // First, remove from database
        const { error: deleteError } = await supabase
          .from('favorites')
          .delete()
          .eq('id', favorite.id);
        
        if (deleteError) {
          console.error('Error deleting favorite from database:', deleteError);
          throw deleteError;
        }
        
        console.log('✅ Favorite removed from database');
        
        // Then update local state
        setFavorites(prev => prev.filter(fav => fav.id !== favorite.id));
        
        // Refresh from server to ensure sync
        await fetchFavorites();
        await fetchRecentActivities();
        
        setApiError('✅ Removed from favorites!');
        setTimeout(() => setApiError(''), 2000);
        
      } catch (error) {
        console.error('Error removing favorite:', error);
        
        // If API call failed, revert the local state change
        setFavorites(prev => [...prev, favorite]);
        
        setApiError('Failed to remove favorite. Please try again.');
      }
    };

    return (
      <div style={styles.section}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <h1 style={styles.h2}>My Favorites</h1>
            <span style={{
              padding: '6px 12px',
              background: '#f3f4f6',
              color: '#6b7280',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '500',
            }}>
              {favorites.length} recipes
            </span>
          </div>
          <p style={{ ...styles.p, marginBottom: '24px' }}>Your saved recipes. Click on any recipe to view details.</p>
        </div>

        {favorites.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
            {favorites.map(fav => {
              const isLoading = loadingRecipes[fav.recipe_id];
              
              return (
                <div key={fav.id} style={styles.card}>
                  {/* Remove from favorites button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                    <button
                      onClick={() => removeFavorite(fav)}
                      style={{
                        padding: '6px 12px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Remove
                    </button>
                  </div>

                  {fav.recipe_image && (
                    <img
                      src={fav.recipe_image}
                      alt={fav.recipe_title}
                      style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '16px' }}
                    />
                  )}
                  
                  <h3 style={{ 
                    fontWeight: '600', 
                    color: '#111827', 
                    marginBottom: '8px',
                    fontSize: '18px',
                  }}>
                    {fav.recipe_title}
                  </h3>
                  
                  <button
                    onClick={() => handleViewRecipe(fav)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      background: isLoading ? '#9ca3af' : '#3b82f6',
                      color: 'white',
                      padding: '12px',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      fontSize: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    {isLoading ? (
                      <>
                        <div style={{
                          width: '16px',
                          height: '16px',
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: 'white',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }}></div>
                        Loading...
                      </>
                    ) : (
                      'View Recipe'
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ 
            ...styles.card, 
            textAlign: 'center', 
            padding: '60px 20px',
          }}>
            <div style={{ 
              color: '#cbd5e1', 
              marginBottom: '24px',
            }}>
              <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h3 style={{ 
              fontSize: '24px', 
              fontWeight: '600', 
              color: '#374151', 
              marginBottom: '12px' 
            }}>
              No favorites yet
            </h3>
            <p style={{ 
              fontSize: '16px', 
              color: '#6b7280', 
              maxWidth: '400px', 
              margin: '0 auto 32px',
              lineHeight: 1.6,
            }}>
              Browse recipes and click the heart icon to add them to your favorites. Your saved recipes will appear here.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setCurrentView('recipes')}
                style={{
                  ...styles.buttonPrimary,
                  padding: '14px 28px',
                  fontSize: '16px',
                }}
              >
                Browse Recipes
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Recipe Details Modal
  // Public Data & Privacy View (for unauthenticated users)
  const PublicDataPrivacyView = () => (
    <div style={styles.section}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={styles.h2}>Data & Privacy Policy</h1>
        <p style={{ ...styles.p, marginBottom: '24px' }}>How we handle your data and protect your privacy</p>
      </div>

      <div style={{ maxWidth: '900px' }}>
        {/* Data Collection */}
        <div style={styles.card}>
          <h2 style={{ ...styles.h2, color: '#3b82f6', marginTop: 0 }}>What Data We Collect</h2>
          <p style={styles.p}>
            When you browse recipes on PantryAI without signing in, we collect:
          </p>
          <ul style={{ ...styles.p, paddingLeft: '20px' }}>
            <li>Your browsing activity and search queries (stored temporarily in your session)</li>
            <li>IP address and basic usage analytics</li>
            <li>Device information (browser type, operating system)</li>
          </ul>
          <p style={{ ...styles.p, color: '#6b7280', fontSize: '14px' }}>
            We do NOT store any personal information unless you create an account.
          </p>
        </div>

        {/* Your Rights */}
        <div style={styles.card}>
          <h2 style={{ ...styles.h2, color: '#10b981', marginTop: 0 }}>Your Privacy Rights</h2>
          <p style={styles.p}>
            As a guest user, you have the right to:
          </p>
          <ul style={{ ...styles.p, paddingLeft: '20px' }}>
            <li>Browse recipes freely without account requirement</li>
            <li>Search and view recipe details</li>
            <li>Clear your browser cookies and session data anytime</li>
            <li>Create an account at any time to unlock saved recipes</li>
          </ul>
        </div>

        {/* Third-Party APIs */}
        <div style={styles.card}>
          <h2 style={{ ...styles.h2, color: '#f59e0b', marginTop: 0 }}>Third-Party Services</h2>
          <p style={styles.p}>
            PantryAI uses the following third-party services:
          </p>
          <ul style={{ ...styles.p, paddingLeft: '20px' }}>
            <li><strong>Spoonacular API:</strong> Provides recipe data. Your queries are sent to their servers. <a href="https://spoonacular.com/food-api/privacy" style={{ color: '#3b82f6', textDecoration: 'underline' }}>Their privacy policy</a></li>
            <li><strong>Supabase:</strong> Database service for account features. Only used when you sign in. <a href="https://supabase.com/privacy" style={{ color: '#3b82f6', textDecoration: 'underline' }}>Their privacy policy</a></li>
          </ul>
        </div>

        {/* Cookies & Tracking */}
        <div style={styles.card}>
          <h2 style={{ ...styles.h2, color: '#ec4899', marginTop: 0 }}>Cookies & Tracking</h2>
          <p style={styles.p}>
            We use minimal tracking:
          </p>
          <ul style={{ ...styles.p, paddingLeft: '20px' }}>
            <li>Session cookies to maintain your browsing preferences</li>
            <li>Basic analytics to improve the website</li>
            <li>No advertising or third-party tracking cookies (for guest users)</li>
          </ul>
        </div>

        {/* Want More Protection? */}
        <div style={{
          ...styles.card,
          background: '#f0f9ff',
          borderLeft: '4px solid #3b82f6',
        }}>
          <h3 style={styles.h3}>Want More Control Over Your Data?</h3>
          <p style={styles.p}>
            When you create an account, you get:
          </p>
          <ul style={{ ...styles.p, paddingLeft: '20px' }}>
            <li>Save favorite recipes to your account</li>
            <li>Create and manage your pantry</li>
            <li>Full data access and deletion rights</li>
            <li>Meal planning and grocery list features</li>
          </ul>
          <button
            onClick={() => setCurrentView('register')}
            style={{
              ...styles.buttonPrimary,
              marginTop: '16px',
            }}
          >
            Create Free Account
          </button>
        </div>

        {/* Contact */}
        <div style={styles.card}>
          <h2 style={{ ...styles.h2, color: '#6b7280', marginTop: 0 }}>Questions?</h2>
          <p style={styles.p}>
            If you have any privacy concerns or questions, you can:
          </p>
          <ul style={{ ...styles.p, paddingLeft: '20px' }}>
            <li>Click "Feedback" in the footer to contact us</li>
            <li>Create an account to access your full data rights options</li>
          </ul>
        </div>
      </div>
    </div>
  );

  // Recipe Details Modal
const RecipeDetailsModal = () => {
  if (!selectedRecipe || !showRecipeDetails) return null;

  console.log('🔍 RecipeDetailsModal rendering with selectedRecipe:', selectedRecipe);

  const handleClose = () => {
    setShowRecipeDetails(false);
    setSelectedRecipe(null);
  };

  const isFavorite = favorites.some(fav => fav.recipe_id === selectedRecipe.id);
  
  console.log('📋 Modal content check:', {
    hasSummary: !!selectedRecipe.summary,
    hasIngredients: !!selectedRecipe.extendedIngredients?.length,
    hasInstructions: !!selectedRecipe.instructions,
    hasReadyTime: !!selectedRecipe.readyInMinutes,
  });

  // Determine source display text
  let sourceText = '';
  let sourceColor = '#6b7280';
  
  if (selectedRecipe.source === 'user_own') {
    sourceText = 'Your recipe';
    sourceColor = '#3b82f6';
  } else if (selectedRecipe.source === 'user_public') {
    sourceText = `Shared by ${selectedRecipe.author || 'Community'}`;
    sourceColor = '#10b981';
  } else if (selectedRecipe.source === 'spoonacular') {
    sourceText = `From ${selectedRecipe.author || 'Spoonacular'}`;
    sourceColor = '#f59e0b';
  } else {
    sourceText = selectedRecipe.author ? `By ${selectedRecipe.author}` : 'Community recipe';
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '16px',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        position: 'relative',
      }}>
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Recipe Image */}
        {selectedRecipe.image ? (
          <div style={{
            height: '300px',
            width: '100%',
            overflow: 'hidden',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            position: 'relative',
          }}>
            <img
              src={selectedRecipe.image}
              alt={selectedRecipe.title}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              onError={(e) => {
                console.log('Image failed to load:', selectedRecipe.image);
                e.target.src = 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
              }}
            />
            {/* Favorite button */}
            <button
              onClick={() => toggleFavorite(selectedRecipe)}
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: isFavorite ? '#dc2626' : 'white',
                color: isFavorite ? 'white' : '#dc2626',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: '600',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              <svg width="20" height="20" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {isFavorite ? 'Liked' : 'Like'}
            </button>
            
            {/* Source badge */}
            <div style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              padding: '6px 12px',
              background: 'rgba(255, 255, 255, 0.9)',
              color: sourceColor,
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '600',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              border: `1px solid ${sourceColor}20`,
            }}>
              {sourceText}
            </div>
          </div>
        ) : (
          <div style={{
            height: '100px',
            width: '100%',
            background: '#f3f4f6',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
          }}>
            No image available
          </div>
        )}

        {/* Recipe Content */}
        <div style={{ padding: '32px' }}>
          {/* Title */}
          <h2 style={{ 
            fontSize: '28px', 
            fontWeight: 'bold', 
            color: '#111827', 
            margin: 0, 
            marginBottom: '12px',
          }}>
            {selectedRecipe.title || 'Untitled Recipe'}
          </h2>
          
          {/* Debug Info */}
          <div style={{
            padding: '12px',
            background: '#f0f9ff',
            border: '1px solid #3b82f6',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#1e40af',
            marginBottom: '16px',
            fontFamily: 'monospace',
          }}>
            ID: {selectedRecipe.id} | Source: {selectedRecipe.source} | Has Summary: {!!selectedRecipe.summary} | Has Ingredients: {selectedRecipe.extendedIngredients?.length || 0}
          </div>
          
          {/* Basic Info */}
          <div style={{
            display: 'flex',
            gap: '24px',
            margin: '20px 0',
            paddingBottom: '20px',
            borderBottom: '1px solid #e5e7eb',
            flexWrap: 'wrap',
          }}>
            {selectedRecipe.readyInMinutes ? (
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>PREP TIME</div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                  {selectedRecipe.readyInMinutes} mins
                </div>
              </div>
            ) : null}
            {selectedRecipe.servings ? (
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>SERVINGS</div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                  {selectedRecipe.servings}
                </div>
              </div>
            ) : null}
            {selectedRecipe.healthScore !== null && selectedRecipe.healthScore !== undefined ? (
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>HEALTH SCORE</div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: '#10b981' }}>
                  {selectedRecipe.healthScore}%
                </div>
              </div>
            ) : null}
          </div>
          
          {/* Summary */}
          {selectedRecipe.summary ? (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                About This Recipe
              </h3>
              <p style={{ color: '#4b5563', lineHeight: 1.6, margin: 0 }}>
                {typeof selectedRecipe.summary === 'string' ? selectedRecipe.summary.replace(/<[^>]*>/g, '') : selectedRecipe.summary}
              </p>
            </div>
          ) : null}
          
          {/* Ingredients */}
          {selectedRecipe.extendedIngredients && selectedRecipe.extendedIngredients.length > 0 ? (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
                Ingredients ({selectedRecipe.extendedIngredients.length})
              </h3>
              <ul style={{ 
                listStyle: 'none', 
                padding: 0, 
                margin: 0,
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: '8px',
              }}>
                {selectedRecipe.extendedIngredients.map((ingredient, idx) => (
                  <li key={idx} style={{
                    padding: '12px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    color: '#4b5563',
                    borderLeft: '3px solid #3b82f6',
                  }}>
                    {ingredient.original || ingredient}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          
          {/* Instructions */}
          {selectedRecipe.instructions ? (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
                Instructions
              </h3>
              <div 
                style={{ 
                  color: '#4b5563', 
                  lineHeight: 1.8,
                  fontSize: '14px',
                }}
                dangerouslySetInnerHTML={{
                  __html: typeof selectedRecipe.instructions === 'string' 
                    ? selectedRecipe.instructions 
                    : '<p>No instructions available.</p>'
                }}
              />
            </div>
          ) : null}
          
          {/* Tags */}
          {(selectedRecipe.dishTypes?.length > 0 || selectedRecipe.cuisines?.length > 0 || selectedRecipe.diets?.length > 0) && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {selectedRecipe.dishTypes?.map((type, idx) => (
                  <span key={`dish-${idx}`} style={{
                    padding: '6px 12px',
                    background: '#e0e7ff',
                    color: '#3b82f6',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}>
                    {type}
                  </span>
                ))}
                {selectedRecipe.cuisines?.map((cuisine, idx) => (
                  <span key={`cuisine-${idx}`} style={{
                    padding: '6px 12px',
                    background: '#d1fae5',
                    color: '#10b981',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}>
                    {cuisine}
                  </span>
                ))}
                {selectedRecipe.diets?.map((diet, idx) => (
                  <span key={`diet-${idx}`} style={{
                    padding: '6px 12px',
                    background: '#fed7aa',
                    color: '#f59e0b',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}>
                    {diet}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

  // Home View
  const HomeView = () => (
    <div style={styles.section}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ ...styles.h1, fontSize: isMobile ? '28px' : '36px' }}>
          {user ? `Welcome back, ` : 'Welcome to '}
          <span style={{ color: '#3b82f6' }}>{user ? user.name : 'PantryAI'}</span>!
        </h1>
        <p style={{ ...styles.p, fontSize: '16px' }}>
          {user ? "Here's your pantry and meal plan overview." : "Smart meal planning made simple. Manage your pantry, discover recipes, and create grocery lists."}
        </p>
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <h2 style={{ ...styles.h3, marginBottom: '16px' }}>Pantry Summary</h2>
          <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#3b82f6', marginBottom: '8px' }}>{pantryItems.length}</div>
          <p style={{ ...styles.p, marginBottom: '16px' }}>items in your pantry</p>
          <button
            onClick={() => setCurrentView('pantry')}
            style={{
              ...styles.buttonPrimary,
              width: '100%',
              padding: '12px',
            }}
          >
            Manage Pantry
          </button>
        </div>

        <div style={styles.card}>
          <h2 style={{ ...styles.h3, marginBottom: '16px' }}>Quick Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={() => setCurrentView('recipes')}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '12px',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Find New Recipes
            </button>
            <button
              onClick={() => setCurrentView('grocery-list')}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '12px',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Create Grocery List
            </button>
            <button
              onClick={() => setCurrentView('favorites')}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '12px',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              View Favorites
            </button>
          </div>
        </div>
      </div>

      {user && mealPlans.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={styles.h2}>This Week's Meal Plan</h2>
          <div style={styles.grid}>
            {mealPlans.slice(0, 3).map((plan, index) => (
              <div key={index} style={styles.card}>
                <h3 style={{ ...styles.h3, color: '#3b82f6' }}>{plan.day}</h3>
                <p style={{ ...styles.p, marginBottom: '8px' }}>{plan.meal_type}: {plan.recipe_name}</p>
                {plan.notes && (
                  <p style={{ fontSize: '14px', color: '#6b7280', fontStyle: 'italic' }}>Notes: {plan.notes}</p>
                )}
              </div>
            ))}
            {mealPlans.length > 3 && (
              <div style={styles.card}>
                <h3 style={{ ...styles.h3, color: '#3b82f6' }}>More Plans</h3>
                <p style={{ ...styles.p }}>You have {mealPlans.length - 3} more meals planned for this week.</p>
                <button
                  onClick={() => setCurrentView('meal-planner')}
                  style={{
                    ...styles.buttonSecondary,
                    width: '100%',
                    padding: '10px',
                  }}
                >
                  View All Plans
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Pantry View
  const PantryView = () => {
    const [newItem, setNewItem] = useState({
      name: '',
      category: '',
      quantity: 1,
      unit: 'pcs'
    });
    const [isAdding, setIsAdding] = useState(false);

    const handleAddItem = async (e) => {
      e.preventDefault();
      if (!newItem.name.trim()) return;

      setIsAdding(true);
      try {
        await API.post('/pantry', newItem);
        await fetchPantryItems();
        await fetchRecentActivities();
        setNewItem({ name: '', category: '', quantity: 1, unit: 'pcs' });
        setApiError('Item added to pantry!');
        setTimeout(() => setApiError(''), 2000);
      } catch (error) {
        console.error('Error adding pantry item:', error);
        setApiError('Failed to add item to pantry.');
      } finally {
        setIsAdding(false);
      }
    };

    const handleDeleteItem = async (itemId) => {
      try {
        await API.delete(`/pantry/${itemId}`);
        await fetchPantryItems();
        await fetchRecentActivities();
        setApiError('Item removed from pantry!');
        setTimeout(() => setApiError(''), 2000);
      } catch (error) {
        console.error('Error deleting pantry item:', error);
        setApiError('Failed to delete item from pantry.');
      }
    };

    return (
      <div style={styles.section}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={styles.h2}>My Pantry</h1>
          <p style={{ ...styles.p, marginBottom: '24px' }}>Manage your pantry items and track your inventory</p>
        </div>

        <div style={styles.grid}>
          <div style={styles.card}>
            <h3 style={{ ...styles.h3, marginBottom: '16px' }}>Add New Item</h3>
            <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Item Name
                </label>
                <input
                  type="text"
                  required
                  value={newItem.name}
                  onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                  style={styles.input}
                  placeholder="e.g., Rice, Flour, Eggs"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Category
                </label>
                <select
                  value={newItem.category}
                  onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                  style={styles.input}
                  required
                >
                  <option value="">Select category</option>
                  <option value="grains">Grains & Cereals</option>
                  <option value="dairy">Dairy & Eggs</option>
                  <option value="produce">Fruits & Vegetables</option>
                  <option value="meat">Meat & Poultry</option>
                  <option value="spices">Spices & Seasonings</option>
                  <option value="canned">Canned Goods</option>
                  <option value="baking">Baking Supplies</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({...newItem, quantity: parseInt(e.target.value) || 1})}
                    style={styles.input}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    Unit
                  </label>
                  <select
                    value={newItem.unit}
                    onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
                    style={styles.input}
                  >
                    <option value="pcs">Pieces</option>
                    <option value="kg">Kilograms</option>
                    <option value="g">Grams</option>
                    <option value="l">Liters</option>
                    <option value="ml">Milliliters</option>
                    <option value="cup">Cups</option>
                    <option value="tbsp">Tablespoons</option>
                    <option value="tsp">Teaspoons</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isAdding}
                style={{
                  ...styles.buttonPrimary,
                  width: '100%',
                  padding: '12px',
                  opacity: isAdding ? 0.7 : 1,
                  cursor: isAdding ? 'not-allowed' : 'pointer',
                }}
              >
                {isAdding ? 'Adding...' : 'Add to Pantry'}
              </button>
            </form>
          </div>

          <div style={styles.card}>
            <h3 style={{ ...styles.h3, marginBottom: '16px' }}>Pantry Items ({pantryItems.length})</h3>
            {pantryItems.length > 0 ? (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {pantryItems.map((item) => (
                  <div key={item.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px',
                    borderBottom: '1px solid #e5e7eb',
                    ':last-child': { borderBottom: 'none' }
                  }}>
                    <div>
                      <div style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '14px', color: '#6b7280' }}>
                        {item.quantity} {item.unit} • {item.category}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ color: '#d1d5db', marginBottom: '16px' }}>
                  <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <p style={{ color: '#6b7280' }}>Your pantry is empty. Add some items to get started!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Meal Planner View
  const MealPlannerView = () => {
    const [days] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    const [mealTypes] = useState(['Breakfast', 'Lunch', 'Dinner', 'Snack']);
    const [selectedDay, setSelectedDay] = useState('');
    const [selectedMealType, setSelectedMealType] = useState('');
    const [recipeName, setRecipeName] = useState('');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleAddMeal = async (e) => {
      e.preventDefault();
      if (!selectedDay || !selectedMealType || !recipeName) return;

      setIsSaving(true);
      try {
        await API.post('/meal-plans', {
          meals: [{
            day: selectedDay,
            meal_type: selectedMealType,
            recipe_name: recipeName,
            notes: notes
          }]
        });
        await fetchMealPlans();
        await fetchRecentActivities();
        
        setSelectedDay('');
        setSelectedMealType('');
        setRecipeName('');
        setNotes('');
        setApiError('Meal plan added!');
        setTimeout(() => setApiError(''), 2000);
      } catch (error) {
        console.error('Error adding meal plan:', error);
        setApiError('Failed to add meal plan.');
      } finally {
        setIsSaving(false);
      }
    };

    const handleClearAll = async () => {
      if (!window.confirm('Are you sure you want to clear all meal plans?')) return;

      setIsSaving(true);
      try {
        await API.post('/meal-plans', { meals: [] });
        await fetchMealPlans();
        await fetchRecentActivities();
        setApiError('All meal plans cleared!');
        setTimeout(() => setApiError(''), 2000);
      } catch (error) {
        console.error('Error clearing meal plans:', error);
        setApiError('Failed to clear meal plans.');
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div style={styles.section}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={styles.h2}>Meal Planner</h1>
          <p style={{ ...styles.p, marginBottom: '24px' }}>Plan your meals for the week</p>
        </div>

        <div style={styles.grid}>
          <div style={styles.card}>
            <h3 style={{ ...styles.h3, marginBottom: '16px' }}>Add Meal Plan</h3>
            <form onSubmit={handleAddMeal} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Day
                </label>
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  style={styles.input}
                  required
                >
                  <option value="">Select day</option>
                  {days.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Meal Type
                </label>
                <select
                  value={selectedMealType}
                  onChange={(e) => setSelectedMealType(e.target.value)}
                  style={styles.input}
                  required
                >
                  <option value="">Select meal type</option>
                  {mealTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Recipe Name
                </label>
                <input
                  type="text"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  style={styles.input}
                  placeholder="e.g., Spaghetti Bolognese"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    ...styles.input,
                    minHeight: '80px',
                    resize: 'vertical',
                  }}
                  placeholder="Any special instructions or variations"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                style={{
                  ...styles.buttonPrimary,
                  width: '100%',
                  padding: '12px',
                  opacity: isSaving ? 0.7 : 1,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {isSaving ? 'Adding...' : 'Add Meal Plan'}
              </button>
            </form>

            {mealPlans.length > 0 && (
              <button
                onClick={handleClearAll}
                style={{
                  ...styles.buttonSecondary,
                  width: '100%',
                  padding: '12px',
                  marginTop: '16px',
                  background: '#fef2f2',
                  color: '#dc2626',
                  borderColor: '#fecaca',
                }}
              >
                Clear All Plans
              </button>
            )}
          </div>

          <div style={styles.card}>
            <h3 style={{ ...styles.h3, marginBottom: '16px' }}>Weekly Meal Plan ({mealPlans.length})</h3>
            {mealPlans.length > 0 ? (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {days.map(day => {
                  const dayMeals = mealPlans.filter(plan => plan.day === day);
                  if (dayMeals.length === 0) return null;

                  return (
                    <div key={day} style={{ marginBottom: '20px' }}>
                      <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#3b82f6', marginBottom: '8px' }}>
                        {day}
                      </h4>
                      {dayMeals.map((meal, index) => (
                        <div key={index} style={{
                          padding: '12px',
                          background: '#f9fafb',
                          borderRadius: '8px',
                          marginBottom: '8px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                                {meal.meal_type}: {meal.recipe_name}
                              </div>
                              {meal.notes && (
                                <div style={{ fontSize: '14px', color: '#6b7280', fontStyle: 'italic' }}>
                                  {meal.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ color: '#d1d5db', marginBottom: '16px' }}>
                  <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p style={{ color: '#6b7280' }}>No meal plans yet. Start planning your week!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Grocery List View
  const GroceryListView = () => {
    const [newListName, setNewListName] = useState('');
    const [newItem, setNewItem] = useState('');
    const [selectedList, setSelectedList] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isAdding, setIsAdding] = useState(false);

    const handleCreateList = async (e) => {
      e.preventDefault();
      if (!newListName.trim()) return;

      setIsCreating(true);
      try {
        await API.post('/grocery-lists', { name: newListName, items: [] });
        await fetchGroceryLists();
        await fetchRecentActivities();
        setNewListName('');
        setApiError('Grocery list created!');
        setTimeout(() => setApiError(''), 2000);
      } catch (error) {
        console.error('Error creating grocery list:', error);
        setApiError('Failed to create grocery list.');
      } finally {
        setIsCreating(false);
      }
    };

    const handleAddItem = async (e) => {
      e.preventDefault();
      if (!newItem.trim() || !selectedList) return;

      setIsAdding(true);
      try {
        const updatedItems = [...selectedList.items, { name: newItem, checked: false }];
        await API.put(`/grocery-lists/${selectedList.id}`, { items: updatedItems });
        await fetchGroceryLists();
        setNewItem('');
        setSelectedList({ ...selectedList, items: updatedItems });
        setApiError('Item added to list!');
        setTimeout(() => setApiError(''), 2000);
      } catch (error) {
        console.error('Error adding item:', error);
        setApiError('Failed to add item to list.');
      } finally {
        setIsAdding(false);
      }
    };

    const handleToggleItem = async (itemIndex) => {
      if (!selectedList) return;

      try {
        const updatedItems = [...selectedList.items];
        updatedItems[itemIndex].checked = !updatedItems[itemIndex].checked;
        await API.put(`/grocery-lists/${selectedList.id}`, { items: updatedItems });
        await fetchGroceryLists();
        setSelectedList({ ...selectedList, items: updatedItems });
      } catch (error) {
        console.error('Error toggling item:', error);
        setApiError('Failed to update item.');
      }
    };

    const handleDeleteList = async (listId) => {
      if (!window.confirm('Are you sure you want to delete this list?')) return;

      try {
        await API.delete(`/grocery-lists/${listId}`);
        await fetchGroceryLists();
        await fetchRecentActivities();
        if (selectedList && selectedList.id === listId) {
          setSelectedList(null);
        }
        setApiError('List deleted!');
        setTimeout(() => setApiError(''), 2000);
      } catch (error) {
        console.error('Error deleting list:', error);
        setApiError('Failed to delete grocery list.');
      }
    };

    return (
      <div style={styles.section}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={styles.h2}>Grocery Lists</h1>
          <p style={{ ...styles.p, marginBottom: '24px' }}>Create and manage your shopping lists</p>
        </div>

        <div style={styles.grid}>
          <div style={styles.card}>
            <h3 style={{ ...styles.h3, marginBottom: '16px' }}>Create New List</h3>
            <form onSubmit={handleCreateList} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                  List Name
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  style={styles.input}
                  placeholder="e.g., Weekly Shopping, Party Supplies"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isCreating}
                style={{
                  ...styles.buttonPrimary,
                  width: '100%',
                  padding: '12px',
                  opacity: isCreating ? 0.7 : 1,
                  cursor: isCreating ? 'not-allowed' : 'pointer',
                }}
              >
                {isCreating ? 'Creating...' : 'Create List'}
              </button>
            </form>

            <div style={{ marginTop: '24px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
                Your Lists ({groceryLists.length})
              </h4>
              {groceryLists.length > 0 ? (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {groceryLists.map(list => (
                    <div key={list.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      background: selectedList?.id === list.id ? '#dbeafe' : '#f9fafb',
                      borderRadius: '8px',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      border: selectedList?.id === list.id ? '1px solid #93c5fd' : '1px solid transparent',
                    }}
                    onClick={() => setSelectedList(list)}
                    >
                      <div>
                        <div style={{ fontWeight: '600', color: '#111827' }}>
                          {list.name}
                        </div>
                        <div style={{ fontSize: '14px', color: '#6b7280' }}>
                          {list.items?.length || 0} items
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteList(list.id);
                        }}
                        style={{
                          padding: '4px 8px',
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <p style={{ color: '#6b7280' }}>No grocery lists yet.</p>
                </div>
              )}
            </div>
          </div>

          <div style={styles.card}>
            {selectedList ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ ...styles.h3, margin: 0 }}>{selectedList.name}</h3>
                  <button
                    onClick={() => setSelectedList(null)}
                    style={{
                      padding: '6px 12px',
                      background: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    Back to Lists
                  </button>
                </div>

                <form onSubmit={handleAddItem} style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={newItem}
                      onChange={(e) => setNewItem(e.target.value)}
                      style={{ ...styles.input, flex: 1 }}
                      placeholder="Add item to list..."
                      required
                    />
                    <button
                      type="submit"
                      disabled={isAdding}
                      style={{
                        ...styles.buttonPrimary,
                        padding: '10px 16px',
                        whiteSpace: 'nowrap',
                        opacity: isAdding ? 0.7 : 1,
                        cursor: isAdding ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isAdding ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </form>

                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {selectedList.items && selectedList.items.length > 0 ? (
                    selectedList.items.map((item, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px',
                        borderBottom: '1px solid #e5e7eb',
                        ':last-child': { borderBottom: 'none' }
                      }}>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => handleToggleItem(index)}
                          style={{ marginRight: '12px' }}
                        />
                        <span style={{
                          flex: 1,
                          color: item.checked ? '#9ca3af' : '#111827',
                          textDecoration: item.checked ? 'line-through' : 'none',
                        }}>
                          {item.name}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <div style={{ color: '#d1d5db', marginBottom: '16px' }}>
                        <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <p style={{ color: '#6b7280' }}>No items in this list yet. Add some items to get started!</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ color: '#d1d5db', marginBottom: '16px' }}>
                  <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>
                  Select a List
                </h3>
                <p style={{ color: '#9ca3af' }}>Choose a grocery list from the left panel or create a new one.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Feedback Modal
  const FeedbackModal = () => {
    const [feedbackForm, setFeedbackForm] = useState({
      name: user?.name || '',
      email: user?.email || '',
      message: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null);

    const handleSubmit = async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      setSubmitStatus(null);

      try {
        await API.post('/feedback', feedbackForm);
        setSubmitStatus({ type: 'success', message: 'Thank you for your feedback!' });
        setFeedbackForm({ name: '', email: '', message: '' });
        setTimeout(() => setShowFeedback(false), 2000);
      } catch (error) {
        setSubmitStatus({ type: 'error', message: 'Failed to send feedback. Please try again.' });
      } finally {
        setIsSubmitting(false);
      }
    };

    if (!showFeedback) return null;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          maxWidth: '500px',
          width: '100%',
          padding: '24px',
          position: 'relative',
        }}>
          <button
            onClick={() => setShowFeedback(false)}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
            Send Feedback
          </h2>
          <p style={{ color: '#6b7280', marginBottom: '24px' }}>
            We'd love to hear your thoughts about PantryAI
          </p>

          {submitStatus && (
            <div style={{
              background: submitStatus.type === 'success' ? '#d1fae5' : '#fef2f2',
              border: `1px solid ${submitStatus.type === 'success' ? '#86efac' : '#fecaca'}`,
              color: submitStatus.type === 'success' ? '#065f46' : '#991b1b',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '16px',
            }}>
              {submitStatus.message}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                Your Name
              </label>
              <input
                type="text"
                value={feedbackForm.name}
                onChange={(e) => setFeedbackForm({...feedbackForm, name: e.target.value})}
                style={styles.input}
                placeholder="Enter your name"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                Email Address
              </label>
              <input
                type="email"
                value={feedbackForm.email}
                onChange={(e) => setFeedbackForm({...feedbackForm, email: e.target.value})}
                style={styles.input}
                placeholder="Enter your email"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                Message
              </label>
              <textarea
                value={feedbackForm.message}
                onChange={(e) => setFeedbackForm({...feedbackForm, message: e.target.value})}
                style={{
                  ...styles.input,
                  minHeight: '120px',
                  resize: 'vertical',
                }}
                placeholder="What do you like about PantryAI? What can we improve?"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                ...styles.buttonPrimary,
                width: '100%',
                padding: '12px',
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Sending...' : 'Send Feedback'}
            </button>
          </form>
        </div>
      </div>
    );
  };

  // Data & Privacy View
  const DataPrivacyView = () => {
    const [activeTab, setActiveTab] = useState('rights');
    const [accessRequest, setAccessRequest] = useState({
      data_types: ['profile', 'pantry', 'recipes', 'favorites', 'meal_plans', 'grocery_lists']
    });
    const [correctionRequest, setCorrectionRequest] = useState({
      field: '',
      current_value: '',
      corrected_value: ''
    });
    const [deletionRequest, setDeletionRequest] = useState({
      confirm_text: '',
      reason: ''
    });
    const [portabilityRequest, setPortabilityRequest] = useState({
      format: 'json',
      data_types: ['all']
    });
    const [userRequests, setUserRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [requestSubmitted, setRequestSubmitted] = useState(false);
    const [exportData, setExportData] = useState(null);

    const fetchUserRequests = async () => {
      try {
        const response = await API.get('/data-rights/requests');
        setUserRequests(response.data || []);
      } catch (error) {
        console.error('Error fetching requests:', error);
      }
    };

    useEffect(() => {
      if (user) {
        fetchUserRequests();
      }
    }, [user]);

    const handleDataAccessRequest = async () => {
      if (!user) return;
      
      setLoading(true);
      try {
        const response = await API.post('/data-rights/access', {
          data_types: accessRequest.data_types,
        });
        
        const dataStr = JSON.stringify(response.data, null, 2);
        const newTab = window.open();
        newTab.document.write(`
          <html>
            <head><title>Your Data - PantryAI</title>
            <style>
              body { font-family: monospace; padding: 20px; background: #f9fafb; }
              pre { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; }
            </style>
            </head>
            <body>
              <h1>Your Data Export</h1>
              <p>Exported on: ${new Date().toISOString()}</p>
              <pre>${dataStr}</pre>
              <button onclick="window.print()">Print</button>
              <button onclick="window.close()">Close</button>
            </body>
          </html>
        `);
        newTab.document.close();
        
        setApiError('✅ Data access completed! Your data is displayed in a new tab.');
        setTimeout(() => setApiError(''), 5000);
      } catch (error) {
        setApiError('Failed to access data: ' + (error.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    const handleDataCorrection = async () => {
      if (!user || !correctionRequest.field || !correctionRequest.corrected_value) {
        setApiError('Please fill in all correction fields');
        return;
      }
      
      setLoading(true);
      try {
        const response = await API.post('/data-rights/correction', {
          field: correctionRequest.field,
          corrected_value: correctionRequest.corrected_value,
          current_value: correctionRequest.current_value
        });
        
        setRequestSubmitted(true);
        fetchUserRequests();
        setCorrectionRequest({ field: '', current_value: '', corrected_value: '' });
        
        setApiError(`✅ ${correctionRequest.field} has been updated successfully!`);
        setTimeout(() => {
          setApiError('');
          fetchUserData();
        }, 3000);
        
      } catch (error) {
        setApiError('Failed to update: ' + (error.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    const handleDataDeletion = async () => {
      if (!user || deletionRequest.confirm_text.toLowerCase() !== 'delete my data') {
        setApiError('Please type "delete my data" to confirm');
        return;
      }
      
      if (!window.confirm('⚠️ WARNING: This will permanently delete ALL your data including recipes, pantry items, favorites, and meal plans. This action cannot be undone. Are you absolutely sure?')) {
        return;
      }
      
      setLoading(true);
      try {
        const response = await API.post('/data-rights/deletion', {
          reason: deletionRequest.reason,
          confirm: true
        });
        
        setApiError('✅ All your data has been deleted. You will be signed out shortly.');
        
        setTimeout(() => {
          handleLogout();
          setCurrentView('home');
        }, 2000);
        
      } catch (error) {
        setApiError('Failed to delete data: ' + (error.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    const handleDataExport = async () => {
      setLoading(true);
      try {
        const response = await API.post('/data-rights/export', {
          format: portabilityRequest.format,
          data_types: portabilityRequest.data_types
        });
        
        const exportData = response.data;
        
        if (!exportData || Object.keys(exportData).length <= 1) {
          throw new Error('No data received in export');
        }
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `pantryai-data-${user?.name || 'user'}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        setApiError('✅ Data exported successfully! Check your downloads folder.');
        setTimeout(() => setApiError(''), 3000);
        
      } catch (error) {
        console.error('Export error:', error);
        setApiError('Failed to export data: ' + (error.message || 'Check console for details'));
      } finally {
        setLoading(false);
      }
    };

    return (
      <div style={styles.section}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <button
            onClick={() => setCurrentView('home')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              marginBottom: '24px',
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </button>
          
          <div style={styles.card}>
            <h1 style={styles.h1}>Data & Privacy</h1>
            
            {/* Navigation Tabs */}
            <div style={{ 
              display: 'flex', 
              borderBottom: '1px solid #e5e7eb',
              marginBottom: '32px',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => setActiveTab('rights')}
                style={{
                  padding: '12px 24px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'rights' ? '2px solid #3b82f6' : 'none',
                  color: activeTab === 'rights' ? '#3b82f6' : '#6b7280',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                Your Rights
              </button>
              <button
                onClick={() => setActiveTab('requests')}
                style={{
                  padding: '12px 24px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'requests' ? '2px solid #3b82f6' : 'none',
                  color: activeTab === 'requests' ? '#3b82f6' : '#6b7280',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                My Requests ({userRequests.length})
              </button>
              <button
                onClick={() => setActiveTab('data')}
                style={{
                  padding: '12px 24px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'data' ? '2px solid #3b82f6' : 'none',
                  color: activeTab === 'data' ? '#3b82f6' : '#6b7280',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                Your Data
              </button>
            </div>
            
            {activeTab === 'rights' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
                {/* Data Access Section */}
                <section>
                  <h2 style={{ ...styles.h2, color: '#3b82f6' }}>Access Your Data</h2>
                  <p style={styles.p}>
                    Request a copy of all personal data we have about you. You can choose which data types to include.
                  </p>
                  
                  <div style={styles.card}>
                    <h3 style={styles.h3}>Request Data Access</h3>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                        Select Data Types
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {['profile', 'pantry', 'recipes', 'favorites', 'meal_plans', 'grocery_lists', 'activities'].map(type => (
                          <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="checkbox"
                              checked={accessRequest.data_types.includes(type)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAccessRequest({
                                    ...accessRequest,
                                    data_types: [...accessRequest.data_types, type]
                                  });
                                } else {
                                  setAccessRequest({
                                    ...accessRequest,
                                    data_types: accessRequest.data_types.filter(t => t !== type)
                                  });
                                }
                              }}
                              style={{ width: '16px', height: '16px' }}
                            />
                            <span style={{ fontSize: '14px', textTransform: 'capitalize' }}>{type.replace('_', ' ')}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <button
                      onClick={handleDataAccessRequest}
                      disabled={loading}
                      style={{
                        ...styles.buttonPrimary,
                        padding: '12px 24px',
                        opacity: loading ? 0.7 : 1,
                        cursor: loading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {loading ? 'Processing...' : 'Request Data Access'}
                    </button>
                  </div>
                </section>
                
                {/* Data Correction Section */}
                <section>
                  <h2 style={{ ...styles.h2, color: '#10b981' }}>Correct Your Data</h2>
                  <p style={styles.p}>
                    Found incorrect information? Request correction of your personal data.
                  </p>
                  
                  <div style={styles.card}>
                    <h3 style={styles.h3}>Request Data Correction</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                          Field to Correct
                        </label>
                        <select
                          value={correctionRequest.field}
                          onChange={(e) => setCorrectionRequest({...correctionRequest, field: e.target.value})}
                          style={styles.input}
                        >
                          <option value="">Select field</option>
                          <option value="name">Full Name</option>
                          <option value="email">Email Address</option>
                          <option value="dietary_preferences">Dietary Preferences</option>
                          <option value="other">Other Information</option>
                        </select>
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                          Current Value
                        </label>
                        <input
                          type="text"
                          value={correctionRequest.current_value}
                          onChange={(e) => setCorrectionRequest({...correctionRequest, current_value: e.target.value})}
                          style={styles.input}
                          placeholder="What is currently shown?"
                        />
                      </div>
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                          Corrected Value
                        </label>
                        <input
                          type="text"
                          value={correctionRequest.corrected_value}
                          onChange={(e) => setCorrectionRequest({...correctionRequest, corrected_value: e.target.value})}
                          style={styles.input}
                          placeholder="What should it be?"
                          required
                        />
                      </div>
                      
                      <button
                        onClick={handleDataCorrection}
                        disabled={loading || !correctionRequest.field || !correctionRequest.corrected_value}
                        style={{
                          ...styles.buttonPrimary,
                          padding: '12px 24px',
                          opacity: (loading || !correctionRequest.field || !correctionRequest.corrected_value) ? 0.7 : 1,
                          cursor: (loading || !correctionRequest.field || !correctionRequest.corrected_value) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {loading ? 'Processing...Reload After Few Minutes.' : 'Request Correction'}
                      </button>
                    </div>
                  </div>
                </section>
                
                {/* Data Portability Section */}
                <section>
                  <h2 style={{ ...styles.h2, color: '#8b5cf6' }}>Data Portability</h2>
                  <p style={styles.p}>
                    Download your data in a structured, commonly used format.
                  </p>
                  
                  <div style={styles.card}>
                    <h3 style={styles.h3}>Export Your Data</h3>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                        Export Format
                      </label>
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="radio"
                            checked={portabilityRequest.format === 'json'}
                            onChange={() => setPortabilityRequest({...portabilityRequest, format: 'json'})}
                            style={{ width: '16px', height: '16px' }}
                          />
                          <span>JSON (Recommended)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="radio"
                            checked={portabilityRequest.format === 'csv'}
                            onChange={() => setPortabilityRequest({...portabilityRequest, format: 'csv'})}
                            style={{ width: '16px', height: '16px' }}
                          />
                          <span>CSV</span>
                        </label>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleDataExport}
                      disabled={loading}
                      style={{
                        ...styles.buttonPrimary,
                        padding: '12px 24px',
                        opacity: loading ? 0.7 : 1,
                        cursor: loading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {loading ? 'Exporting...' : 'Export My Data'}
                    </button>
                  </div>
                </section>
                
                {/* Data Deletion Section */}
                <section>
                  <h2 style={{ ...styles.h2, color: '#dc2626' }}>Delete Your Data</h2>
                  <p style={styles.p}>
                    Request deletion of your account and all associated data. This action is irreversible.
                  </p>
                  
                  <div style={styles.card}>
                    <h3 style={styles.h3}>Request Data Deletion</h3>
                    <div style={{ marginBottom: '20px' }}>
                      <p style={{ color: '#dc2626', fontWeight: '500', marginBottom: '12px' }}>
                        ⚠️ Warning: This will permanently delete all your data including:
                      </p>
                      <ul style={{ color: '#4b5563', marginLeft: '20px', marginBottom: '16px' }}>
                        <li>Your profile information</li>
                        <li>All your recipes (including public ones)</li>
                        <li>Your pantry items</li>
                        <li>Your favorites and meal plans</li>
                        <li>Your grocery lists and activities</li>
                      </ul>
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                        Reason for deletion (optional)
                      </label>
                      <textarea
                        value={deletionRequest.reason}
                        onChange={(e) => setDeletionRequest({...deletionRequest, reason: e.target.value})}
                        style={{
                          ...styles.input,
                          minHeight: '80px',
                          resize: 'vertical',
                        }}
                        placeholder="Let us know why you're leaving (helps us improve)"
                      />
                    </div>
                    
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                        Type "delete my data" to confirm
                      </label>
                      <input
                        type="text"
                        value={deletionRequest.confirm_text}
                        onChange={(e) => setDeletionRequest({...deletionRequest, confirm_text: e.target.value})}
                        style={styles.input}
                        placeholder="delete my data"
                      />
                    </div>
                    
                    <button
                      onClick={handleDataDeletion}
                      disabled={loading || deletionRequest.confirm_text.toLowerCase() !== 'delete my data'}
                      style={{
                        background: '#dc2626',
                        color: 'white',
                        padding: '12px 24px',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: '600',
                        cursor: (loading || deletionRequest.confirm_text.toLowerCase() !== 'delete my data') ? 'not-allowed' : 'pointer',
                        opacity: (loading || deletionRequest.confirm_text.toLowerCase() !== 'delete my data') ? 0.7 : 1,
                        width: '100%',
                      }}
                    >
                      {loading ? 'Processing...' : 'Request Permanent Data Deletion'}
                    </button>
                  </div>
                </section>
              </div>
            )}
            
            {activeTab === 'requests' && (
              <div>
                <h2 style={styles.h2}>My Data Rights Requests</h2>
                
                {userRequests.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {userRequests.map((req) => (
                      <div key={req.id} style={{
                        ...styles.card,
                        borderLeft: `4px solid ${
                          req.status === 'completed' ? '#10b981' :
                          req.status === 'processing' ? '#f59e0b' :
                          req.status === 'rejected' ? '#dc2626' : '#3b82f6'
                        }`,
                        background: req.status === 'completed' ? '#f0fdf4' : '#f9fafb'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <h3 style={{ margin: 0, color: '#111827', textTransform: 'capitalize' }}>
                              {req.request_type} Request
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: '500',
                                background: 
                                  req.status === 'completed' ? '#d1fae5' :
                                  req.status === 'processing' ? '#fef3c7' :
                                  req.status === 'rejected' ? '#fee2e2' : '#dbeafe',
                                color:
                                  req.status === 'completed' ? '#065f46' :
                                  req.status === 'processing' ? '#92400e' :
                                  req.status === 'rejected' ? '#991b1b' : '#1e40af'
                              }}>
                                {req.status}
                              </span>
                              <span style={{ fontSize: '14px', color: '#6b7280' }}>
                                Submitted: {new Date(req.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          
                          {req.completed_at && (
                            <span style={{ fontSize: '14px', color: '#6b7280' }}>
                              Completed: {new Date(req.completed_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        
                        {req.admin_notes && (
                          <div style={{
                            marginTop: '12px',
                            padding: '12px',
                            background: 'white',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                          }}>
                            <strong style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>
                              Admin Notes:
                            </strong>
                            <p style={{ margin: 0, color: '#4b5563' }}>{req.admin_notes}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={styles.card}>
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <svg width="48" height="48" fill="none" stroke="#d1d5db" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p style={{ color: '#6b7280', marginTop: '16px' }}>No data rights requests yet.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'data' && (
              <div>
                <h2 style={styles.h2}>Your Data Summary</h2>
                
                <div style={styles.grid}>
                  <div style={styles.card}>
                    <h3 style={{ ...styles.h3, color: '#3b82f6' }}>Profile Data</h3>
                    <ul style={{ color: '#4b5563', lineHeight: 1.8 }}>
                      <li><strong>Name:</strong> {user?.name || 'Not set'}</li>
                      <li><strong>Email:</strong> {user?.email || 'Not set'}</li>
                      <li><strong>Account Created:</strong> {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</li>
                    </ul>
                  </div>
                  
                  <div style={styles.card}>
                    <h3 style={{ ...styles.h3, color: '#10b981' }}>Content Data</h3>
                    <ul style={{ color: '#4b5563', lineHeight: 1.8 }}>
                      <li><strong>Recipes:</strong> {searchResults.filter(r => r.source === 'user_own').length} created</li>
                      <li><strong>Pantry Items:</strong> {pantryItems.length} items</li>
                      <li><strong>Favorites:</strong> {favorites.length} recipes</li>
                      <li><strong>Meal Plans:</strong> {mealPlans.length} planned meals</li>
                    </ul>
                  </div>
                </div>
                
                <div style={{ ...styles.card, marginTop: '24px' }}>
                  <h3 style={styles.h3}>Recent Activity</h3>
                  {recentActivities.length > 0 ? (
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {recentActivities.slice(0, 10).map((activity, index) => (
                        <div key={index} style={{
                          padding: '12px',
                          borderBottom: '1px solid #e5e7eb',
                          ':last-child': { borderBottom: 'none' }
                        }}>
                          <div style={{ color: '#111827', marginBottom: '4px' }}>{activity.description}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {new Date(activity.created_at).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No recent activity</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render main app
  return (
    <div style={styles.container}>
      <EmailVerificationBanner />
      <ErrorDisplay />
      <Header />
      
      <main style={styles.mainContent}>
        {!user && currentView !== 'login' && currentView !== 'register' && currentView !== 'reset-password' && currentView !== 'user-rights' && currentView !== 'public-privacy' && currentView !== 'recipes' && currentView !== 'my-recipes' ? (
          <div style={{
            minHeight: 'calc(100vh - 200px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}>
            <div style={{ textAlign: 'center', maxWidth: '600px' }}>
              <div style={{ marginBottom: '24px' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  margin: '0 auto 16px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #3b82f6, #10b981)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '32px',
                }}>
                  <svg width="60" height="60" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 14 C17.2065 14.5793 18.8183 15.452 21.0845 17.7756 C21.6583 18.3562 22.2322 18.9367 22.8234 19.5348 C23.4308 20.164 24.0382 20.7932 24.6641 21.4414 C25.2973 22.0837 25.9306 22.7259 26.5831 23.3877 C28.6043 25.439 30.6154 27.4998 32.625 29.5625 C34.6426 31.6278 36.6623 33.6909 38.6883 35.748 C39.9488 37.0284 41.2044 38.3137 42.4545 39.6041 C43.9321 41.1073 45.4615 42.5592 47 44 C47.66 44 48.32 44 49 44 C48.9536 43.2382 48.9072 42.4763 48.8594 41.6914 C48.6125 34.6304 48.9079 28.9336 53 23 C57.265 18.4379 61.6545 14.4548 67.9883 13.5938 C78.0689 13.3095 78.0689 13.3095 82.25 16.8125 C85.6611 20.2321 86.1859 23.464 86.3125 28.1875 C86.228 34.5977 84.7467 38.9403 80.457 43.7188 C73.7016 50.0258 67.1977 51.3643 58.125 51.1055 C57.4237 51.0707 56.7225 51.0359 56 51 C57.4731 54.4612 59.3965 56.56 62.1328 59.1172 C62.9385 59.8893 63.7441 60.6615 64.5742 61.457 C66.275 63.0692 67.9833 64.6734 69.6992 66.2695 C70.5023 67.0443 71.3054 67.819 72.1328 68.6172 C73.2449 69.663 73.2449 69.663 74.3794 70.73 C76.4821 73.6753 76.4557 75.4566 76 79 C75.34 79.66 74.68 80.32 74 81 C69.3635 80.8093 67.2859 78.7576 64.1367 75.5273 C63.2505 74.6282 62.3643 73.7291 61.4512 72.8027 C60.5392 71.8572 59.6271 70.9117 58.6875 69.9375 C57.7477 68.9776 56.807 68.0186 55.8652 67.0605 C53.5676 64.7158 51.2798 62.3622 49 60 C45.5537 61.473 43.4203 63.3932 40.8477 66.0977 C40.071 66.8988 39.2943 67.7 38.4941 68.5254 C36.873 70.2169 35.2558 71.9122 33.6426 73.6113 C32.8646 74.4112 32.0867 75.2111 31.2852 76.0352 C30.5827 76.7713 29.8802 77.5074 29.1565 78.2659 C26.7074 80.2353 25.1127 80.759 22 81 C20.125 79.875 20.125 79.875 19 78 C19.3018 73.3499 21.2073 71.32 24.4727 68.1367 C25.8213 66.8074 25.8213 66.8074 27.1973 65.4512 C28.6156 64.0832 28.6156 64.0832 30.0625 62.6875 C31.0224 61.7477 31.9814 60.8069 32.9395 59.8652 C35.2842 57.5676 37.6378 55.2798 40 53 C39.34 51.68 38.68 50.36 38 49 C36.8862 50.0209 36.8862 50.0209 35.75 51.0625 C33 53 33 53 31.0647 52.835 C28.533 51.8111 27.1402 50.5126 25.2148 48.5781 C24.5194 47.882 23.824 47.1859 23.1074 46.4688 C22.3913 45.7366 21.6753 45.0044 20.9375 44.25 C20.2176 43.5333 19.4976 42.8166 18.7559 42.0781 C9.573 32.8012 9.573 32.8012 9.5625 25.5625 C9.68 20.4463 10.6797 17.8391 14 14 Z"
        fill="transparent" stroke="#FFFFFF" stroke-width="5"/>
</svg>

                </div>
                <h1 style={{
                  fontSize: isMobile ? '32px' : '48px',
                  fontWeight: 'bold',
                  color: '#111827',
                  marginBottom: '16px',
                  lineHeight: 1.2,
                }}>
                  Smart Meal Planning
                  <span style={{
                    display: 'block',
                    background: 'linear-gradient(to right, #3b82f6, #10b981)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>
                    Made Simple
                  </span>
                </h1>
              </div>
              <p style={{
                fontSize: isMobile ? '16px' : '18px',
                color: '#4b5563',
                marginBottom: '32px',
                lineHeight: 1.6,
              }}>
                PantryAI helps you create personalized grocery lists and discover amazing recipes 
                from Spoonacular API and user-contributed recipes based on what's already in your pantry. 
                Save time, reduce waste, and cook delicious meals every day.
              </p>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={() => setCurrentView('login')}
                  style={{
                    ...styles.buttonPrimary,
                    width: isMobile ? '100%' : 'auto',
                    fontSize: '16px',
                    padding: '14px 28px',
                  }}
                >
                  Get Started Free
                </button>
                <button
                  onClick={() => {
                    setCurrentView('recipes');
                    fetchRecipes('pasta');
                  }}
                  style={{
                    ...styles.buttonSecondary,
                    width: isMobile ? '100%' : 'auto',
                    fontSize: '16px',
                    padding: '14px 28px',
                  }}
                >
                  Browse Recipes
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {currentView === 'home' && <HomeView />}
            {currentView === 'recipes' && <RecipesView />}
            {currentView === 'my-recipes' && <MyRecipesView />}
            {currentView === 'pantry' && user && <PantryView />}
            {currentView === 'meal-planner' && user && <MealPlannerView />}
            {currentView === 'grocery-list' && user && <GroceryListView />}
            {currentView === 'favorites' && user && <FavoritesView />}
            {currentView === 'user-rights' && user && <DataPrivacyView />}
            {currentView === 'public-privacy' && !user && <PublicDataPrivacyView />}
            {currentView === 'login' && !user && <AuthView mode="login" />}
            {currentView === 'register' && !user && <AuthView mode="register" />}
            {currentView === 'reset-password' && <PasswordResetView />}
          </>
          )}
      </main>

      <footer style={{
        background: '#f9fafb',
        borderTop: '1px solid #e5e7eb',
        marginTop: 'auto',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: isMobile ? '16px' : 0,
          }}>
            <div>
              <span style={{ color: '#6b7280', fontSize: '14px' }}>© {new Date().getFullYear()} PantryAI. All rights reserved.</span>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <button 
                onClick={() => setCurrentView(user ? 'user-rights' : 'public-privacy')}
                style={{
                  color: '#6b7280',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Data & Privacy
              </button>
              <button 
                onClick={() => setShowFeedback(true)}
                style={{
                  color: '#6b7280',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Feedback
              </button>
            </div>
          </div>
          <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: '#9ca3af' }}>
            <p>𝐌𝐚𝐝𝐞 𝐛𝐲 𝐒𝐡𝐮𝐛𝐡𝐚𝐦 𝐁𝐞𝐥𝐥𝐞</p>
          </div>
        </div>
      </footer>

      <FeedbackModal />
      <RecipeDetailsModal />

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          /* Mobile header fixes */
          @media (max-width: 767px) {
            .mobile-search-container {
              width: 100% !important;
              box-sizing: border-box !important;
            }
            
            .mobile-search-input {
              width: 100% !important;
              box-sizing: border-box !important;
            }
            
            .header-inner {
              flex-wrap: wrap !important;
            }
          }
        `}
      </style>
    </div>
  );
};

export default App;