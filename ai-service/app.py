from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import json
import re

app = Flask(__name__)
CORS(app)

class RecipeRecommender:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(stop_words='english', max_features=1000)
        self.recipes = self.load_sample_recipes()
        self.fit_vectorizer()
    
    def load_sample_recipes(self):
        # Sample recipe data - in production, this would come from a database
        return [
            {
                'id': 1,
                'title': 'Vegetable Stir Fry',
                'ingredients': ['bell pepper', 'broccoli', 'carrot', 'soy sauce', 'garlic', 'ginger', 'rice'],
                'dietary_tags': ['vegetarian', 'vegan'],
                'cooking_time': 20,
                'servings': 2
            },
            {
                'id': 2,
                'title': 'Chicken Salad',
                'ingredients': ['chicken breast', 'lettuce', 'tomato', 'cucumber', 'olive oil', 'lemon'],
                'dietary_tags': ['gluten-free'],
                'cooking_time': 15,
                'servings': 2
            },
            {
                'id': 3,
                'title': 'Pasta Carbonara',
                'ingredients': ['pasta', 'eggs', 'bacon', 'parmesan', 'black pepper'],
                'dietary_tags': [],
                'cooking_time': 25,
                'servings': 4
            }
        ]
    
    def fit_vectorizer(self):
        ingredient_texts = [' '.join(recipe['ingredients']) for recipe in self.recipes]
        self.vectorizer.fit(ingredient_texts)
    
    def recommend_recipes(self, user_ingredients, dietary_restrictions=None, max_recipes=10):
        # Vectorize user ingredients
        user_text = ' '.join(user_ingredients)
        user_vector = self.vectorizer.transform([user_text])
        
        # Calculate similarity for each recipe
        recommendations = []
        for recipe in self.recipes:
            # Check dietary restrictions
            if dietary_restrictions:
                recipe_tags = set(recipe.get('dietary_tags', []))
                restrictions = set(dietary_restrictions)
                if restrictions and not recipe_tags.intersection(restrictions):
                    continue
            
            # Calculate ingredient similarity
            recipe_text = ' '.join(recipe['ingredients'])
            recipe_vector = self.vectorizer.transform([recipe_text])
            similarity = cosine_similarity(user_vector, recipe_vector)[0][0]
            
            # Calculate match percentage based on available ingredients
            available_ingredients = set(ing.lower() for ing in user_ingredients)
            recipe_ingredients = set(ing.lower() for ing in recipe['ingredients'])
            matching_ingredients = available_ingredients.intersection(recipe_ingredients)
            match_percentage = len(matching_ingredients) / len(recipe_ingredients) * 100
            
            recommendations.append({
                **recipe,
                'similarity_score': similarity,
                'match_percentage': round(match_percentage),
                'missing_ingredients': list(recipe_ingredients - available_ingredients)
            })
        
        # Sort by match percentage and similarity
        recommendations.sort(key=lambda x: (x['match_percentage'], x['similarity_score']), reverse=True)
        return recommendations[:max_recipes]

recommender = RecipeRecommender()

@app.route('/api/ai/recommend', methods=['POST'])
def recommend_recipes():
    try:
        data = request.json
        user_ingredients = data.get('ingredients', [])
        dietary_restrictions = data.get('dietary_restrictions', [])
        
        recommendations = recommender.recommend_recipes(
            user_ingredients, 
            dietary_restrictions
        )
        
        return jsonify({
            'success': True,
            'recommendations': recommendations
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/ai/parse-ingredients', methods=['POST'])
def parse_ingredients():
    try:
        data = request.json
        text = data.get('text', '')
        
        # Simple ingredient parsing - in production, use more advanced NLP
        ingredients = []
        lines = text.split('\n')
        
        for line in lines:
            line = line.strip()
            if line:
                # Remove measurements and extract ingredient name
                ingredient = re.sub(r'^\d+\s*\w*\s*', '', line)  # Remove leading numbers/measurements
                ingredient = re.sub(r'[,\.]', '', ingredient)  # Remove punctuation
                ingredient = ingredient.strip()
                
                if ingredient and len(ingredient) > 2:
                    ingredients.append(ingredient.lower())
        
        return jsonify({
            'success': True,
            'ingredients': ingredients
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)