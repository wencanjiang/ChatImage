from math import cos, radians, sin
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


PT = 72.0
HERE = Path(__file__).resolve().parent
ASSET_DIR = HERE / "assets"


C = {
    "ink": colors.HexColor("#17202A"),
    "text": colors.HexColor("#2E3440"),
    "muted": colors.HexColor("#6B7280"),
    "faint": colors.HexColor("#9CA3AF"),
    "rule": colors.HexColor("#CBD5E1"),
    "grid": colors.HexColor("#E5E7EB"),
    "paper": colors.HexColor("#FFFFFF"),
    "wash": colors.HexColor("#F8FAFC"),
    "blue": colors.HexColor("#2563A9"),
    "blue2": colors.HexColor("#5D8CC5"),
    "teal": colors.HexColor("#2B9A92"),
    "teal2": colors.HexColor("#62B6AD"),
    "green": colors.HexColor("#3F8E5A"),
    "amber": colors.HexColor("#C9912E"),
    "violet": colors.HexColor("#6F65A8"),
    "red": colors.HexColor("#B85C5C"),
    "white": colors.white,
}


def col(name):
    return C[name] if isinstance(name, str) else name


def alpha(c, fill=1, stroke=1):
    if hasattr(c, "setFillAlpha"):
        c.setFillAlpha(fill)
    if hasattr(c, "setStrokeAlpha"):
        c.setStrokeAlpha(stroke)


def reset_alpha(c):
    alpha(c, 1, 1)


def font(c, size, bold=False):
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)


def text(c, x, y, s, size=7, color="ink", bold=False, align="left"):
    c.setFillColor(col(color))
    font(c, size, bold)
    if align == "center":
        c.drawCentredString(x, y, s)
    elif align == "right":
        c.drawRightString(x, y, s)
    else:
        c.drawString(x, y, s)


def line(c, x1, y1, x2, y2, color="rule", width=0.5, dash=None):
    c.setStrokeColor(col(color))
    c.setLineWidth(width)
    if dash:
        c.setDash(dash)
    c.line(x1, y1, x2, y2)
    if dash:
        c.setDash()


def rect(c, x, y, w, h, fill, stroke=None, width=0.45, opacity=1):
    alpha(c, opacity, 1)
    c.setFillColor(col(fill))
    c.setStrokeColor(col(stroke or fill))
    c.setLineWidth(width)
    c.rect(x, y, w, h, fill=1, stroke=1 if stroke else 0)
    reset_alpha(c)


def round_rect(c, x, y, w, h, r=4, fill="white", stroke="rule", width=0.5, opacity=1):
    alpha(c, opacity, 1)
    c.setFillColor(col(fill))
    c.setStrokeColor(col(stroke))
    c.setLineWidth(width)
    c.roundRect(x, y, w, h, r, fill=1, stroke=1)
    reset_alpha(c)


def pill(c, x, y, w, h, label, fill, fg="white", size=5.8):
    c.setFillColor(col(fill))
    c.roundRect(x, y, w, h, h / 2, fill=1, stroke=0)
    text(c, x + w / 2, y + h / 2 - size * 0.35, label, size, fg, True, "center")


def arrow(c, x1, y1, x2, y2, color="ink", width=0.65, head=4.8):
    line(c, x1, y1, x2, y2, color, width)
    dx, dy = x2 - x1, y2 - y1
    ang = radians(0)
    if dx or dy:
        import math

        ang = math.atan2(dy, dx)
    pts = [
        (x2, y2),
        (x2 - head * cos(ang) + head * 0.58 * sin(ang), y2 - head * sin(ang) - head * 0.58 * cos(ang)),
        (x2 - head * cos(ang) - head * 0.58 * sin(ang), y2 - head * sin(ang) + head * 0.58 * cos(ang)),
    ]
    p = c.beginPath()
    p.moveTo(*pts[0])
    p.lineTo(*pts[1])
    p.lineTo(*pts[2])
    p.close()
    c.setFillColor(col(color))
    c.drawPath(p, fill=1, stroke=0)


def micro_lines(c, x, y, widths, color="rule", h=2.0, gap=5.8, opacity=1):
    for i, w in enumerate(widths):
        rect(c, x, y - i * gap, w, h, color, opacity=opacity)


def header(c, x, y, label, color="ink"):
    text(c, x, y, label, 7.6, color, True)
    line(c, x, y - 4.8, x + 38, y - 4.8, color, 0.9)


def draw_image_page(c, image_path, w, h):
    c.drawImage(ImageReader(str(image_path)), 0, 0, width=w, height=h, preserveAspectRatio=False, mask="auto")


def draw_image_background(c, image_path, w, h, whitewash=0.78):
    draw_image_page(c, image_path, w, h)
    rect(c, 0, 0, w, h, "paper", opacity=whitewash)


def draw_teaser():
    W, H = 7.20 * PT, 2.58 * PT
    c = canvas.Canvas("demo1.pdf", pagesize=(W, H))
    c.setTitle("ChatImage teaser")
    c.setAuthor("")
    draw_image_page(c, ASSET_DIR / "fig1-template-v2.png", W, H)
    c.save()


def draw_pipeline():
    W, H = 3.48 * PT, 2.68 * PT
    c = canvas.Canvas("model.pdf", pagesize=(W, H))
    c.setTitle("ChatImage pipeline")
    c.setAuthor("")
    draw_image_page(c, ASSET_DIR / "fig2-template-v2.png", W, H)
    c.save()


def panel_label(c, x, y, label):
    text(c, x, y, label, 7.3, "ink", True)


def draw_experiment_summary():
    W, H = 7.20 * PT, 2.34 * PT
    c = canvas.Canvas("Experiment_Summary.pdf", pagesize=(W, H))
    c.setTitle("Experiment summary")
    c.setAuthor("")
    draw_image_background(c, ASSET_DIR / "fig3-template-v2-bg.png", W, H, 0.82)

    margin, gap = 20, 21
    panel_w = (W - 2 * margin - 2 * gap) / 3
    y0, panel_h = 17, H - 34
    xs = [margin, margin + panel_w + gap, margin + 2 * (panel_w + gap)]

    # Shared vertical separators, no heavy cards.
    for x in [xs[1] - gap / 2, xs[2] - gap / 2]:
        line(c, x, y0 + 2, x, y0 + panel_h - 2, "grid", 0.65)

    # Panel A.
    x = xs[0]
    panel_label(c, x, y0 + panel_h - 11, "(a) Hotspot quality (n=24)")
    axis_x, axis_y, axis_w = x + 67, y0 + 35, panel_w - 93
    line(c, axis_x, axis_y, axis_x + axis_w, axis_y, "rule", 0.55)
    for tick in [0, 50, 100]:
        tx = axis_x + axis_w * tick / 100
        line(c, tx, axis_y - 3, tx, axis_y + 66, "grid", 0.35)
        text(c, tx, axis_y - 12, str(tick), 5.2, "muted", align="center")
    rows = [
        ("Strict pass", "17/24", 70.8, "teal"),
        ("Strict reject", "7/24", 29.2, "red"),
        ("SAM-complete", "13/24", 54.2, "amber"),
        ("SAM-incomplete", "11/24", 45.8, "violet"),
    ]
    for i, (name, frac, pct, color) in enumerate(rows):
        yy = axis_y + 60 - i * 18
        text(c, x, yy - 2, name, 5.95, "text")
        line(c, axis_x, yy, axis_x + axis_w * pct / 100, yy, color, 2.0)
        c.setFillColor(col(color))
        c.circle(axis_x + axis_w * pct / 100, yy, 2.8, fill=1, stroke=0)
        text(c, axis_x + axis_w + 5, yy + 1.2, frac, 5.45, "ink")
        text(c, axis_x + axis_w + 5, yy - 7.8, f"{pct:.1f}%", 4.9, "muted")

    # Panel B.
    x = xs[1]
    panel_label(c, x, y0 + panel_h - 11, "(b) Alignment sources (n=90)")
    plot_x, plot_y, plot_w, bar_h = x + 4, y0 + 87, panel_w - 9, 14
    segments = [
        ("MiMo-Vision", 50, 55.6, "blue"),
        ("LA layout", 9, 10.0, "teal"),
        ("LA crop", 2, 2.2, "green"),
        ("SAM3-refined", 16, 17.8, "amber"),
        ("Fallback", 11, 12.2, "violet"),
        ("OCR", 2, 2.2, "red"),
    ]
    cur = plot_x
    for name, n, pct, color in segments:
        ww = plot_w * pct / 100
        rect(c, cur, plot_y, ww, bar_h, color)
        if pct >= 17:
            text(c, cur + ww / 2, plot_y + 4.4, f"{n}", 5.1, "white", True, "center")
        cur += ww
    line(c, plot_x, plot_y - 9, plot_x + plot_w, plot_y - 9, "rule", 0.5)
    for tick in [0, 50, 100]:
        tx = plot_x + plot_w * tick / 100
        line(c, tx, plot_y - 12, tx, plot_y - 6, "rule", 0.45)
        text(c, tx, plot_y - 20, f"{tick}", 5.0, "muted", align="center")
    text(c, plot_x + plot_w + 2, plot_y - 20, "%", 5.0, "muted")
    lx, ly = x + 4, y0 + 59
    for i, (name, n, pct, color) in enumerate(segments):
        cx = lx + (i % 2) * 75
        cy = ly - (i // 2) * 13
        rect(c, cx, cy, 5.6, 5.6, color)
        text(c, cx + 8.5, cy + 0.6, f"{name}: {n} ({pct:.1f}%)", 4.85, "text")

    # Panel C.
    x = xs[2]
    panel_label(c, x, y0 + panel_h - 11, "(c) SAM mask completeness")
    bar_x, bar_y, bar_w, bar_h = x + 4, y0 + 47, panel_w - 18, 30
    complete, total = 13, 24
    complete_w = bar_w * complete / total
    rect(c, bar_x, bar_y, complete_w, bar_h, "teal")
    rect(c, bar_x + complete_w, bar_y, bar_w - complete_w, bar_h, "red")
    line(c, bar_x, bar_y - 8, bar_x + bar_w, bar_y - 8, "rule", 0.5)
    text(c, bar_x, bar_y - 18, "0", 5.0, "muted", align="center")
    text(c, bar_x + bar_w / 2, bar_y - 18, "12", 5.0, "muted", align="center")
    text(c, bar_x + bar_w, bar_y - 18, "24", 5.0, "muted", align="center")
    text(c, bar_x + complete_w / 2, bar_y + 10.6, "complete 13", 5.6, "white", True, "center")
    text(c, bar_x + complete_w + (bar_w - complete_w) / 2, bar_y + 10.6, "holes 11", 5.6, "white", True, "center")
    text(c, x + panel_w / 2, y0 + 96, "13/24", 10.0, "ink", True, "center")
    text(c, x + panel_w / 2, y0 + 84, "54.2% masks without holes/cavities", 5.6, "muted", align="center")
    rect(c, x + 5, y0 + 18, 6, 6, "teal")
    text(c, x + 15, y0 + 19, "Complete masks", 5.2, "text")
    rect(c, x + 86, y0 + 18, 6, 6, "red")
    text(c, x + 96, y0 + 19, "Incomplete masks", 5.2, "text")

    c.save()


if __name__ == "__main__":
    draw_teaser()
    draw_pipeline()
    draw_experiment_summary()
