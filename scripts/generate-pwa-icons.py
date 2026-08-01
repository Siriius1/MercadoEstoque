from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]


def create_icon(size: int) -> None:
    image = Image.new("RGB", (size, size), "#0b4d3f")
    draw = ImageDraw.Draw(image)
    margin = round(size * 0.2)
    radius = round(size * 0.13)
    draw.rounded_rectangle(
        (margin, margin, size - margin, size - margin),
        radius=radius,
        fill="#f8d64e",
    )
    line_width = max(8, round(size * 0.055))
    center = size // 2
    arm = round(size * 0.14)
    draw.line((center - arm, center, center + arm, center), fill="#0b4d3f", width=line_width)
    draw.line((center, center - arm, center, center + arm), fill="#0b4d3f", width=line_width)
    image.save(ROOT / "public" / f"pwa-{size}.png", optimize=True)


for icon_size in (192, 512):
    create_icon(icon_size)
