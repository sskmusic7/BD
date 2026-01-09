#!/usr/bin/env python3
"""Remove white/light backgrounds from PNG images and make them transparent."""

from PIL import Image
import sys
import os

def remove_background(input_path, output_path, threshold=240):
    """Remove white/light backgrounds and make them transparent.
    
    Args:
        input_path: Path to input image
        output_path: Path to output image
        threshold: RGB threshold for background removal (0-255)
    """
    try:
        # Open image and convert to RGBA if needed
        img = Image.open(input_path).convert('RGBA')
        data = img.getdata()
        
        # Create new image data with transparency
        new_data = []
        for item in data:
            # If pixel is white/light (RGB all above threshold), make transparent
            if item[0] > threshold and item[1] > threshold and item[2] > threshold:
                new_data.append((255, 255, 255, 0))  # Transparent
            else:
                new_data.append(item)  # Keep original pixel
        
        # Update image with new data
        img.putdata(new_data)
        img.save(output_path, 'PNG')
        print(f"✓ Processed: {os.path.basename(input_path)} -> {os.path.basename(output_path)}")
        return True
    except Exception as e:
        print(f"✗ Error processing {input_path}: {e}")
        return False

if __name__ == "__main__":
    # Process all alt logos
    logos = [
        ("Body Double Backgrounds/Alt Logo's/alt logo 1.png", "public/watermarks/alt-logo-1-transparent.png"),
        ("Body Double Backgrounds/Alt Logo's/alt logo 2.png", "public/watermarks/alt-logo-2-transparent.png"),
        ("Body Double Backgrounds/Alt Logo's/alt logo 3.png", "public/watermarks/alt-logo-3-transparent.png"),
        ("Body Double Backgrounds/Alt Logo's/altlogo 4.png", "public/watermarks/alt-logo-4-transparent.png"),
    ]
    
    # Ensure output directory exists
    os.makedirs("public/watermarks", exist_ok=True)
    
    # Process each logo
    for input_path, output_path in logos:
        if os.path.exists(input_path):
            remove_background(input_path, output_path, threshold=240)
        else:
            print(f"✗ File not found: {input_path}")

