"""Post-process the household art.

Sprites come off the comic-book workflow on a white card; this keys the card
away from the edges inward, the way the app's cutout tool does in its "edge"
mode, so white inside the figure (an eye, a collar) is kept. Rooms come off the
edit workflow at a latent-friendly 944 rows and are trimmed to the plan's 941.
Originals are kept beside the results, as the app keeps them.
"""
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path("data/projects/breedhaven/media")
TOLERANCE = 12  # the app's DEFAULT_TOLERANCE
FEATHER = 1


def key_edges(src: Path, dst: Path) -> None:
    image = Image.open(src).convert("RGBA")
    width, height = image.size
    pixels = image.load()

    def white(x: int, y: int) -> bool:
        r, g, b, _ = pixels[x, y]
        return r >= 255 - TOLERANCE and g >= 255 - TOLERANCE and b >= 255 - TOLERANCE

    seen = bytearray(width * height)
    queue = deque()
    for x in range(width):
        for y in (0, height - 1):
            if white(x, y) and not seen[y * width + x]:
                seen[y * width + x] = 1
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if white(x, y) and not seen[y * width + x]:
                seen[y * width + x] = 1
                queue.append((x, y))
    cleared = 0
    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (255, 255, 255, 0)
        cleared += 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < width and 0 <= ny < height and not seen[ny * width + nx] and white(nx, ny):
                seen[ny * width + nx] = 1
                queue.append((nx, ny))
    # A soft edge: any opaque pixel touching a cleared one goes half-way.
    if FEATHER:
        alpha = image.getchannel("A")
        a = alpha.load()
        soft = []
        for y in range(height):
            for x in range(width):
                if a[x, y] == 0:
                    continue
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < width and 0 <= ny < height and a[nx, ny] == 0:
                        soft.append((x, y))
                        break
        for x, y in soft:
            r, g, b, _ = pixels[x, y]
            pixels[x, y] = (r, g, b, 128)
    image.save(dst)
    print(f"{dst.relative_to(ROOT)}: cleared {cleared} of {width * height} pixels, feathered {len(soft) if FEATHER else 0}")


def trim_room(path: Path, height: int = 941) -> None:
    image = Image.open(path)
    if image.size[1] == height:
        return
    trimmed = image.crop((0, 0, image.size[0], height))
    trimmed.save(path)
    print(f"{path.relative_to(ROOT)}: trimmed {image.size} -> {trimmed.size}")


for who in ("tamsin", "isolde"):
    for look in ("neutral", "happy"):
        src = ROOT / "characters" / who / f"{look}.png"
        dst = ROOT / "characters" / who / f"{look}-cutout.png"
        if src.exists() and not dst.exists():
            key_edges(src, dst)
    room = ROOT / "backgrounds" / "consort_villa" / f"{who}-v1.png"
    if room.exists():
        trim_room(room)
print("Post-processing done.")
