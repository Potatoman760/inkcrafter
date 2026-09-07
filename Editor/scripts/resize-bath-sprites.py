"""Build native-size bathhouse sprite variants without altering source art."""

from pathlib import Path

from PIL import Image, ImageFilter


PROJECT = Path(__file__).resolve().parents[1] / "data" / "projects" / "breedhaven" / "media"
TARGET_SIZE = (360, 640)
SPRITES = {
    "characters/maren/nude-cutout.png": "characters/maren/nude-bath.png",
    "characters/anwen/nude-cutout.png": "characters/anwen/nude-bath.png",
    "characters/elowen/nude-cutout.png": "characters/elowen/nude-bath.png",
    "characters/lira/neutral-2-cutout.png": "characters/lira/neutral-bath.png",
    "characters/piri/neutral-cutout.png": "characters/piri/neutral-bath.png",
    "characters/tink/nude-cutout.png": "characters/tink/nude-bath.png",
    "characters/faye/nude-cutout-2.png": "characters/faye/nude-bath.png",
    "characters/dinah/nude-cutout.png": "characters/dinah/nude-bath.png",
    "characters/yelena/nude-cutout.png": "characters/yelena/nude-bath.png",
    "characters/daphne/nude-cutout.png": "characters/daphne/nude-bath.png",
    "characters/tamsin/nude-cutout.png": "characters/tamsin/nude-bath.png",
    "characters/isolde/nude-cutout.png": "characters/isolde/nude-bath.png",
}


def main() -> None:
    for source_name, output_name in SPRITES.items():
        source = PROJECT / source_name
        output = PROJECT / output_name
        with Image.open(source) as original:
            rgba = original.convert("RGBA")
            if rgba.size != (1080, 1920):
                raise ValueError(f"Expected 1080x1920 source, got {rgba.size}: {source}")
            resized = rgba.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
            alpha = resized.getchannel("A")
            rgb = resized.convert("RGB").filter(
                ImageFilter.UnsharpMask(radius=0.7, percent=55, threshold=3)
            )
            finished = Image.merge("RGBA", (*rgb.split(), alpha))
            finished.save(output, format="PNG", optimize=True)
        print(f"{source_name} -> {output_name} ({TARGET_SIZE[0]}x{TARGET_SIZE[1]})")


if __name__ == "__main__":
    main()
