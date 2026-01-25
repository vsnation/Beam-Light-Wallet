#!/bin/bash
# Create macOS .icns icon from SVG

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SVG_FILE="$SCRIPT_DIR/beam-logo.svg"
ICONSET_DIR="$SCRIPT_DIR/AppIcon.iconset"
ICNS_FILE="$SCRIPT_DIR/AppIcon.icns"

echo "Creating macOS icon from BEAM logo..."

# Check for qlmanage or rsvg-convert
if command -v rsvg-convert &> /dev/null; then
    CONVERTER="rsvg"
elif command -v qlmanage &> /dev/null; then
    CONVERTER="qlmanage"
else
    echo "Warning: No SVG converter found. Creating placeholder icon..."
    CONVERTER="sips"
fi

# Create iconset directory
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

# Function to create PNG from SVG at specific size
create_png() {
    local size=$1
    local output=$2
    
    if [ "$CONVERTER" = "rsvg" ]; then
        rsvg-convert -w $size -h $size "$SVG_FILE" -o "$output"
    else
        # Use qlmanage as fallback (macOS built-in)
        # First create a temp large PNG, then resize
        if [ ! -f "$SCRIPT_DIR/temp_icon.png" ]; then
            qlmanage -t -s 1024 -o "$SCRIPT_DIR" "$SVG_FILE" 2>/dev/null || true
            mv "$SCRIPT_DIR/beam-logo.svg.png" "$SCRIPT_DIR/temp_icon.png" 2>/dev/null || true
        fi
        if [ -f "$SCRIPT_DIR/temp_icon.png" ]; then
            sips -z $size $size "$SCRIPT_DIR/temp_icon.png" --out "$output" 2>/dev/null
        else
            # Create colored placeholder
            # Use ImageMagick if available, otherwise create minimal PNG
            if command -v convert &> /dev/null; then
                convert -size ${size}x${size} xc:"#25c2a0" -fill white -gravity center \
                    -pointsize $((size/3)) -annotate 0 "B" "$output"
            else
                # Create minimal valid PNG (1x1 green pixel, will be stretched)
                printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xa8\xf0\xc0\x00\x00\x00\x05\x00\x01\xa5\x90\xbeN\x00\x00\x00\x00IEND\xaeB`\x82' > "$output"
            fi
        fi
    fi
}

# Create all required sizes for macOS icon
echo "Generating icon sizes..."
create_png 16 "$ICONSET_DIR/icon_16x16.png"
create_png 32 "$ICONSET_DIR/icon_16x16@2x.png"
create_png 32 "$ICONSET_DIR/icon_32x32.png"
create_png 64 "$ICONSET_DIR/icon_32x32@2x.png"
create_png 128 "$ICONSET_DIR/icon_128x128.png"
create_png 256 "$ICONSET_DIR/icon_128x128@2x.png"
create_png 256 "$ICONSET_DIR/icon_256x256.png"
create_png 512 "$ICONSET_DIR/icon_256x256@2x.png"
create_png 512 "$ICONSET_DIR/icon_512x512.png"
create_png 1024 "$ICONSET_DIR/icon_512x512@2x.png"

# Create .icns file
echo "Creating .icns file..."
iconutil -c icns "$ICONSET_DIR" -o "$ICNS_FILE"

# Cleanup
rm -rf "$ICONSET_DIR"
rm -f "$SCRIPT_DIR/temp_icon.png"

echo "Icon created: $ICNS_FILE"
ls -la "$ICNS_FILE"
