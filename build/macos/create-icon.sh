#!/bin/bash
# Create macOS .icns icon
# Uses Python for reliable PNG generation

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ICONSET_DIR="$SCRIPT_DIR/AppIcon.iconset"
ICNS_FILE="$SCRIPT_DIR/AppIcon.icns"

echo "Creating macOS icon..."

# Create iconset directory
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

# Create icon using Python (no external dependencies)
cd "$SCRIPT_DIR"
python3 << 'PYTHONSCRIPT'
import os
import struct
import zlib

ICONSET_DIR = 'AppIcon.iconset'

def create_png(width, height, filename):
    """Create a BEAM-themed icon PNG with rounded corners and concentric rings."""

    # Colors (RGBA)
    bg_dark = (10, 14, 23, 255)       # #0a0e17
    beam_cyan = (37, 194, 160, 255)   # #25c2a0
    beam_light = (0, 212, 255, 255)   # #00d4ff
    white = (255, 255, 255, 255)

    pixels = []
    cx, cy = width // 2, height // 2
    radius = min(width, height) // 2 - 2
    inner_radius = radius * 0.6
    corner_r = width // 5

    for y in range(height):
        row = []
        for x in range(width):
            dx, dy = x - cx, y - cy
            dist = (dx * dx + dy * dy) ** 0.5

            # Rounded rectangle check
            in_rect = True
            corners = [
                (corner_r, corner_r),
                (corner_r, height - corner_r),
                (width - corner_r, corner_r),
                (width - corner_r, height - corner_r)
            ]
            for cx_c, cy_c in corners:
                in_corner = (x < corner_r or x > width - corner_r) and (y < corner_r or y > height - corner_r)
                if in_corner:
                    if ((x - cx_c) ** 2 + (y - cy_c) ** 2) > corner_r ** 2:
                        in_rect = False
                        break

            if not in_rect:
                row.extend([0, 0, 0, 0])
            elif dist < inner_radius * 0.3:
                row.extend(white)
            elif dist < inner_radius * 0.7:
                row.extend(beam_light)
            elif dist < inner_radius:
                row.extend(beam_cyan)
            else:
                row.extend(bg_dark)

        pixels.append(bytes(row))

    # Create PNG manually
    def png_chunk(chunk_type, data):
        chunk = chunk_type + data
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)

    png_data = b'\x89PNG\r\n\x1a\n'
    png_data += png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))

    raw_data = b''.join(b'\x00' + row for row in pixels)
    png_data += png_chunk(b'IDAT', zlib.compress(raw_data, 9))
    png_data += png_chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(png_data)

# Generate all required sizes
sizes = [
    (16, 'icon_16x16.png'),
    (32, 'icon_16x16@2x.png'),
    (32, 'icon_32x32.png'),
    (64, 'icon_32x32@2x.png'),
    (128, 'icon_128x128.png'),
    (256, 'icon_128x128@2x.png'),
    (256, 'icon_256x256.png'),
    (512, 'icon_256x256@2x.png'),
    (512, 'icon_512x512.png'),
    (1024, 'icon_512x512@2x.png'),
]

print("Generating icon sizes...")
for size, name in sizes:
    create_png(size, size, os.path.join(ICONSET_DIR, name))
    print(f"  {name} ({size}x{size})")

print("Done!")
PYTHONSCRIPT

# Create .icns file
echo "Creating .icns file..."
iconutil -c icns "$ICONSET_DIR" -o "$ICNS_FILE"

# Cleanup
rm -rf "$ICONSET_DIR"

echo "Icon created: $ICNS_FILE"
ls -la "$ICNS_FILE"
