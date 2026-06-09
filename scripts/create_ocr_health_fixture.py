#!/usr/bin/env python
"""Create the deterministic OCR health-check fixture PNG on stdout."""

import io
import sys

from PIL import Image, ImageDraw, ImageFont


def main():
    width, height = 900, 500
    image = Image.new("RGB", (width, height), "#f8fafc")
    draw = ImageDraw.Draw(image)

    title_font = load_font(44)
    card_font = load_font(34)
    body_font = load_font(22)

    draw.text((48, 34), "ChatImage OCR Health", fill="#0f172a", font=title_font)
    draw.text((50, 92), "Fixture with stable module numbers and readable titles.", fill="#475569", font=body_font)

    cards = [
        (55, 160, 250, 230, "01 Input", "User question"),
        (325, 160, 250, 230, "02 Layout", "Visual cards"),
        (595, 160, 250, 230, "03 Thread", "Follow-up branch"),
    ]
    colors = ["#0f766e", "#2563eb", "#7c3aed"]
    fills = ["#ecfdf5", "#eff6ff", "#f5f3ff"]

    for index, (x, y, w, h, heading, body) in enumerate(cards):
        draw.rounded_rectangle((x, y, x + w, y + h), radius=24, fill=fills[index], outline=colors[index], width=4)
        draw.text((x + 28, y + 48), heading, fill="#0f172a", font=card_font)
        draw.text((x + 30, y + 112), body, fill="#334155", font=body_font)

    output = io.BytesIO()
    image.save(output, format="PNG")
    sys.stdout.buffer.write(output.getvalue())


def load_font(size):
    candidates = [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except Exception:
            pass
    return ImageFont.load_default()


if __name__ == "__main__":
    main()
