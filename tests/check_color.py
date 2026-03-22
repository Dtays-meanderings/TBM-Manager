import sys
from PIL import Image

def scan_column():
    try:
        img = Image.open('transform-before-drag.png')
        img = img.convert('RGB')
        w, h = img.size
        print(f"Image Resolution: {w}x{h}")
        
        bg_colors = [(2, 6, 23), (30, 41, 59)]
        colors = {}
        for x in range(0, w, 10):
            for y in range(0, h, 10):
                color = img.getpixel((x, y))
                # Ignore background and box
                if any(sum(abs(color[i] - bg[i]) for i in range(3)) < 15 for bg in bg_colors):
                    continue
                # Record color frequency
                if color not in colors:
                    colors[color] = 1
                else:
                    colors[color] += 1
        
        sorted_colors = sorted(colors.items(), key=lambda item: item[1], reverse=True)
        print("TOP NON-BACKGROUND COLORS:")
        for color, count in sorted_colors[:15]:
            print(f"RGB{color}: {count} pixels")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    scan_column()
