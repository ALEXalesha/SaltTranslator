"""Draws the app icon: electron/icon.png (1024 px) and electron/icon.ico (16-256 px)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 1024
OUT = Path(__file__).resolve().parent.parent / "electron"
FONT = r"C:\Windows\Fonts\segoeuib.ttf"
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def gradient(top, bottom):
    mask = Image.linear_gradient("L").resize((S, S))
    return Image.composite(Image.new("RGB", (S, S), bottom), Image.new("RGB", (S, S), top), mask)


def bubble(draw, box, fill, tail):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    draw.rounded_rectangle(box, radius=int(h * 0.28), fill=fill)
    if tail == "left":
        points = [(x0 + w * 0.16, y1 - 4), (x0 + w * 0.10, y1 + h * 0.26), (x0 + w * 0.40, y1 - 4)]
    else:
        points = [(x1 - w * 0.16, y1 - 4), (x1 - w * 0.10, y1 + h * 0.26), (x1 - w * 0.40, y1 - 4)]
    draw.polygon(points, fill=fill)


def glyph(draw, box, text, fill, size):
    font = ImageFont.truetype(FONT, size)
    draw.text(((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), text, font=font, fill=fill, anchor="mm")


def main():
    square = Image.new("L", (S, S), 0)
    ImageDraw.Draw(square).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=255)

    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(gradient((79, 140, 255), (122, 92, 255)).convert("RGBA"), (0, 0), square)

    back = (140, 160, 640, 560)
    front = (384, 424, 884, 824)

    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    bubble(draw, back, (255, 255, 255, 240), "left")
    glyph(draw, back, "A", (43, 76, 190, 255), 300)

    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bubble(ImageDraw.Draw(shadow), (front[0] + 10, front[1] + 22, front[2] + 10, front[3] + 22), (20, 20, 60, 110), "right")
    layer = Image.alpha_composite(layer, shadow.filter(ImageFilter.GaussianBlur(18)))

    draw = ImageDraw.Draw(layer)
    bubble(draw, front, (17, 24, 52, 255), "right")
    glyph(draw, front, "Я", (160, 200, 255, 255), 300)

    icon = Image.alpha_composite(icon, layer)
    clipped = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    clipped.paste(icon, (0, 0), square)
    clipped.save(OUT / "icon.png")
    clipped.save(OUT / "icon.ico", sizes=ICO_SIZES)
    print("written:", OUT / "icon.png", OUT / "icon.ico")


if __name__ == "__main__":
    main()
