#!/bin/bash
# Build AppIcon.icns from three source tiers.
#
# One artwork scaled to every size is why the old icon was illegible: detail
# that reads at 1024 becomes noise at 32. Each tier is drawn for its size range.
#   large  -> 1024, 512   gradient ground, glow, inner light
#   medium -> 256, 128    flat, no glow
#   small  -> 32, 16      silhouette, two colours
set -e
cd "$(dirname "$0")"

command -v rsvg-convert >/dev/null || { echo "need rsvg-convert (brew install librsvg)"; exit 1; }
command -v iconutil     >/dev/null || { echo "iconutil is macOS-only"; exit 1; }

OUT=AppIcon.iconset
rm -rf "$OUT"; mkdir -p "$OUT"

render() { rsvg-convert -w "$2" -h "$2" "icon/AppIcon-$1.svg" -o "$OUT/$3"; }

render large  1024 icon_512x512@2x.png
render large   512 icon_512x512.png
render large   512 icon_256x256@2x.png
render medium  256 icon_256x256.png
render medium  256 icon_128x128@2x.png
render medium  128 icon_128x128.png
render medium   64 icon_32x32@2x.png
render small    32 icon_32x32.png
render small    32 icon_16x16@2x.png
render small    16 icon_16x16.png

iconutil -c icns "$OUT" -o AppIcon.icns
rm -rf "$OUT"
echo "AppIcon.icns built ($(wc -c < AppIcon.icns) bytes)"
