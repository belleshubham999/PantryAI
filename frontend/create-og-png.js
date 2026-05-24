/**
 * Script to generate OG image PNG
 * Usage: node create-og-png.js
 * Requires canvas package: npm install canvas
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateOGImage() {
  try {
    // Try to use canvas if available
    try {
      const { createCanvas } = await import('canvas');
      
      const width = 1200;
      const height = 630;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#f0f9ff');
    gradient.addColorStop(1, '#f0fdf4');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Top accent bar with gradient
    const topGradient = ctx.createLinearGradient(0, 0, width, 0);
    topGradient.addColorStop(0, '#3b82f6');
    topGradient.addColorStop(1, '#10b981');
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, width, 8);

    // Logo circle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(600, 120, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Logo emoji
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍳', 600, 120);

    // Main title
    ctx.font = 'bold 72px Arial';
    ctx.fillStyle = '#1f2937';
    ctx.fillText('PantryAI', 600, 250);

    // Subtitle
    ctx.font = '600 36px Arial';
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('Smart Meal Planning', 600, 310);

    // Tagline
    ctx.font = '24px Arial';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Made Simple', 600, 350);

    // Feature boxes
    const features = [
      { x: 200, emoji: '🍝', text: 'Discover', color: '#e0e7ff', textColor: '#3b82f6' },
      { x: 520, emoji: '📋', text: 'Plan Meals', color: '#d1fae5', textColor: '#10b981' },
      { x: 840, emoji: '🥘', text: 'Save Recipes', color: '#fed7aa', textColor: '#d97706' }
    ];

    features.forEach(f => {
      ctx.fillStyle = f.color;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(f.x, 390, 280, 70);
      ctx.globalAlpha = 1;
      
      ctx.strokeStyle = f.textColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(f.x, 390, 280, 70);

      ctx.font = '600 18px Arial';
      ctx.fillStyle = f.textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.emoji + ' ' + f.text, f.x + 140, 435);
    });

    // Bottom accent bar
    const bottomGradient = ctx.createLinearGradient(0, 550, width, 550);
    bottomGradient.addColorStop(0, '#3b82f6');
    bottomGradient.addColorStop(1, '#10b981');
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, 550, width, 80);

    // Footer text
    ctx.font = '600 20px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Browse recipes • Plan meals • Manage pantry', 600, 605);

    // Save PNG
    const buffer = canvas.toBuffer('image/png');
    const outputPath = path.join(__dirname, 'public', 'og-image.png');
    fs.writeFileSync(outputPath, buffer);
    
    console.log('✅ OG image created successfully!');
    console.log(`   Location: ${outputPath}`);
    console.log(`   Dimensions: ${width}x${height}`);
    console.log(`   File size: ${buffer.length / 1024} KB`);

    } catch (canvasError) {
      console.log('⚠️  Canvas not available, using SVG instead.');
      console.log('   The SVG image should work for social media sharing.');
      console.log('   To create a PNG, run: npm install canvas');
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the function
generateOGImage();
