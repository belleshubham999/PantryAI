#!/usr/bin/env python3
"""Generate OG image for social media sharing"""

try:
    from PIL import Image, ImageDraw, ImageFont
    import os
    
    # Image dimensions
    width, height = 1200, 630
    
    # Create image with white background
    img = Image.new('RGB', (width, height), color=(240, 249, 250))
    draw = ImageDraw.Draw(img)
    
    # Create gradient effect manually (blue to green)
    for y in range(height):
        # Calculate color values for gradient
        ratio = y / height
        r = int(240 + (240 - 240) * ratio)
        g = int(249 + (253 - 249) * ratio)
        b = int(250 + (240 - 250) * ratio)
        
        # Draw line for gradient
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    
    # Load font or use default
    try:
        title_font = ImageFont.truetype("arial.ttf", 80)
        subtitle_font = ImageFont.truetype("arial.ttf", 40)
        text_font = ImageFont.truetype("arial.ttf", 24)
    except:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()
        text_font = ImageFont.load_default()
    
    # Draw top accent bar (gradient blue to green)
    bar_colors = []
    for x in range(width):
        ratio = x / width
        r = int(59 + (16 - 59) * ratio)
        g = int(130 + (185 - 130) * ratio)
        b = int(246 + (55 - 246) * ratio)
        draw.line([(x, 0), (x, 8)], fill=(r, g, b))
    
    # Draw main title
    title = "PantryAI"
    bbox = draw.textbbox((0, 0), title, font=title_font)
    title_width = bbox[2] - bbox[0]
    draw.text(((width - title_width) // 2, 120), title, fill=(31, 41, 55), font=title_font)
    
    # Draw subtitle
    subtitle = "Smart Meal Planning Made Simple"
    bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    subtitle_width = bbox[2] - bbox[0]
    draw.text(((width - subtitle_width) // 2, 240), subtitle, fill=(59, 130, 246), font=subtitle_font)
    
    # Draw feature boxes
    features = [
        ("🍝 Discover Recipes", 150, (224, 231, 255), (59, 130, 246)),
        ("📋 Plan Meals", 470, (209, 250, 229), (16, 185, 129)),
        ("🥘 Save Recipes", 790, (254, 215, 170), (217, 119, 6))
    ]
    
    for text, x_pos, bg_color, text_color in features:
        # Draw rounded rectangle background
        box_width = 280
        box_height = 50
        box_y = 350
        
        # Simple rectangle (rounded corners not easily done with PIL draw)
        draw.rectangle([x_pos, box_y, x_pos + box_width, box_y + box_height], fill=bg_color, outline=text_color, width=2)
        
        # Draw text centered in box
        bbox = draw.textbbox((0, 0), text, font=text_font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        draw.text((x_pos + (box_width - text_width) // 2, box_y + (box_height - text_height) // 2), text, fill=text_color, font=text_font)
    
    # Draw bottom accent bar (gradient blue to green)
    for x in range(width):
        ratio = x / width
        r = int(59 + (16 - 59) * ratio)
        g = int(130 + (185 - 130) * ratio)
        b = int(246 + (55 - 246) * ratio)
        draw.line([(x, 570), (x, 630)], fill=(r, g, b))
    
    # Draw footer text
    footer = "Browse recipes, plan meals, and manage your pantry"
    bbox = draw.textbbox((0, 0), footer, font=text_font)
    footer_width = bbox[2] - bbox[0]
    draw.text(((width - footer_width) // 2, 590), footer, fill=(255, 255, 255), font=text_font)
    
    # Save image
    output_path = 'public/og-image.png'
    img.save(output_path, 'PNG', optimize=True)
    
    print(f"✅ OG image created successfully!")
    print(f"   Location: {output_path}")
    print(f"   Dimensions: {width}x{height}")
    print(f"   File size: {os.path.getsize(output_path) / 1024:.1f} KB")

except ImportError:
    print("❌ PIL/Pillow not installed. Installing...")
    import subprocess
    import sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    print("✅ Pillow installed. Please run this script again.")

except Exception as e:
    print(f"❌ Error: {e}")
    print("\nFallback: Creating a simple SVG image instead...")
    
    # Create SVG fallback
    svg_content = '''<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f0f9ff"/>
      <stop offset="100%" style="stop-color:#f0fdf4"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#3b82f6"/>
      <stop offset="100%" style="stop-color:#10b981"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  <rect width="1200" height="8" fill="url(#accentGrad)"/>
  <text x="600" y="200" font-size="80" font-weight="bold" text-anchor="middle" fill="#1f2937" font-family="Arial">PantryAI</text>
  <text x="600" y="300" font-size="40" text-anchor="middle" fill="#3b82f6" font-family="Arial" font-weight="600">Smart Meal Planning Made Simple</text>
  <rect y="570" width="1200" height="60" fill="url(#accentGrad)"/>
  <text x="600" y="605" font-size="20" text-anchor="middle" fill="white" font-family="Arial" font-weight="600">Browse recipes, plan meals, and manage your pantry</text>
</svg>'''
    
    with open('public/og-image.svg', 'w') as f:
        f.write(svg_content)
    print("✅ SVG image created at public/og-image.svg")
    print("   Note: You may need to convert this to PNG manually or use an online tool")
