"""Uniform-grid portrait pixelation adapted from pixulate_portrait.ipynb.

Requires Pillow. Background replacement is a separate preparatory edit.
Example:
  python scripts/pixelate_portrait.py input.png output.png --grid 128 --scale 10
"""

import argparse
from pathlib import Path

from PIL import Image, ImageOps, ImageFilter


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--grid", type=int, default=128)
    parser.add_argument("--scale", type=int, default=10)
    parser.add_argument("--sharpen", action="store_true",
                        help="Apply mild edge sharpening at the logical pixel scale")
    parser.add_argument("--colors", type=int, default=0,
                        help="Optional adaptive palette size (2–256); 0 preserves colors")
    args = parser.parse_args()
    if args.grid < 1 or args.scale < 1:
        parser.error("grid and scale must be positive integers")
    if args.colors != 0 and not 2 <= args.colors <= 256:
        parser.error("colors must be 0 or between 2 and 256")
    with Image.open(args.source) as source:
        portrait = ImageOps.exif_transpose(source).convert("RGB")
    if portrait.width != portrait.height:
        parser.error("Prepare a square crop first; this script never stretches faces")
    # BOX averages source areas, following the notebook's INTER_AREA approach.
    small = portrait.resize((args.grid, args.grid), Image.Resampling.BOX)
    if args.sharpen:
        small = small.filter(ImageFilter.UnsharpMask(radius=0.8, percent=120, threshold=3))
    if args.colors:
        small = small.quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT,
                               dither=Image.Dither.NONE).convert("RGB")
    result = small.resize((args.grid * args.scale,) * 2, Image.Resampling.NEAREST)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output, format="PNG")
    # Verify the saved PNG contains exactly constant, equally sized cells.
    with Image.open(args.output) as saved:
        assert saved.size == result.size
        assert saved.convert("RGB").tobytes() == result.tobytes()
    assert result.resize(small.size, Image.Resampling.NEAREST).tobytes() == small.tobytes()
    print(f"Saved {args.output}: {result.width}x{result.height}; "
          f"{args.grid}x{args.grid} grid, {args.scale}x{args.scale} cells")


if __name__ == "__main__":
    main()
