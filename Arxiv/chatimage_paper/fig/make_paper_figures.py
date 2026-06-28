from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


PT = 72.0
HERE = Path(__file__).resolve().parent
ASSET_DIR = HERE / "assets"


C = {
    "ink": colors.HexColor("#1F2933"),
    "muted": colors.HexColor("#5E6978"),
    "soft": colors.HexColor("#F7F9FC"),
    "line": colors.HexColor("#B8C2D0"),
    "grid": colors.HexColor("#E3E8F0"),
    "blue": colors.HexColor("#2F6DB5"),
    "cyan": colors.HexColor("#2C9C97"),
    "green": colors.HexColor("#4F9D69"),
    "amber": colors.HexColor("#D99A2B"),
    "violet": colors.HexColor("#7064A8"),
    "red": colors.HexColor("#BD5B5B"),
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


def text(c, x, y, s, size=7, color="ink", bold=False, align="left"):
    c.setFillColor(col(color))
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    if align == "center":
        c.drawCentredString(x, y, s)
    elif align == "right":
        c.drawRightString(x, y, s)
    else:
        c.drawString(x, y, s)


def line(c, x1, y1, x2, y2, color="line", width=0.5, dash=None):
    c.setStrokeColor(col(color))
    c.setLineWidth(width)
    if dash:
        c.setDash(dash)
    c.line(x1, y1, x2, y2)
    if dash:
        c.setDash()


def box(c, x, y, w, h, fill="white", stroke="line", width=0.55, radius=5, opacity=1):
    alpha(c, opacity, 1)
    c.setFillColor(col(fill))
    c.setStrokeColor(col(stroke))
    c.setLineWidth(width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    reset_alpha(c)


def rect(c, x, y, w, h, fill, stroke=None, width=0.45, opacity=1):
    alpha(c, opacity, 1)
    c.setFillColor(col(fill))
    c.setStrokeColor(col(stroke or fill))
    c.setLineWidth(width)
    c.rect(x, y, w, h, fill=1, stroke=1 if stroke else 0)
    reset_alpha(c)


def arrow(c, x1, y1, x2, y2, color="ink", width=0.7):
    line(c, x1, y1, x2, y2, color, width)
    dx = x2 - x1
    dy = y2 - y1
    c.setFillColor(col(color))
    p = c.beginPath()
    if abs(dx) >= abs(dy):
        sign = 1 if dx >= 0 else -1
        p.moveTo(x2, y2)
        p.lineTo(x2 - sign * 5.5, y2 + 3.2)
        p.lineTo(x2 - sign * 5.5, y2 - 3.2)
    else:
        sign = 1 if dy >= 0 else -1
        p.moveTo(x2, y2)
        p.lineTo(x2 - 3.2, y2 - sign * 5.5)
        p.lineTo(x2 + 3.2, y2 - sign * 5.5)
    p.close()
    c.drawPath(p, fill=1, stroke=0)


def pill(c, x, y, w, h, label, fill, fg="white"):
    c.setFillColor(col(fill))
    c.setStrokeColor(col(fill))
    c.roundRect(x, y, w, h, h / 2, fill=1, stroke=0)
    text(c, x + w / 2, y + h / 2 - 2.2, label, 5.8, fg, True, "center")


def draw_background(c, path, w, h, whitewash=0.18):
    c.drawImage(ImageReader(str(path)), 0, 0, width=w, height=h, preserveAspectRatio=False, mask="auto")
    if whitewash:
        rect(c, 0, 0, w, h, colors.white, opacity=whitewash)


def draw_teaser():
    W, H = 7.20 * PT, 2.70 * PT
    c = canvas.Canvas("demo1.pdf", pagesize=(W, H))
    c.setTitle("ChatImage teaser")
    c.setAuthor("")
    draw_background(c, ASSET_DIR / "fig1-teaser-bg.png", W, H, 0.25)

    margin = 15
    text(c, margin, H - 15, "ChatImage: long-form answers become grounded visual interaction", 9.2, "ink", True)
    line(c, margin, H - 22, W - margin, H - 22, "grid", 0.6)

    left_x, mid_x, right_x = 18, 147, 395
    y0, panel_h = 20, H - 50
    left_w, mid_w, right_w = 112, 226, 105

    box(c, left_x, y0 + 66, left_w, 72, "white", "grid", 0.55, 6, 0.92)
    text(c, left_x + 9, y0 + 122, "Long-form answer", 6.6, "muted", True)
    for i, ww in enumerate([83, 95, 76, 88, 70, 96, 64]):
        rect(c, left_x + 9, y0 + 106 - i * 10, ww, 2.5, "line", opacity=0.85)
    text(c, left_x + 9, y0 + 32, "Hard to scan", 6.1, "red", True)
    text(c, left_x + 9, y0 + 21, "No region-level follow-up", 5.5, "muted")

    arrow(c, left_x + left_w + 7, y0 + 90, mid_x - 7, y0 + 90, "ink", 0.7)

    box(c, mid_x, y0, mid_w, panel_h, "white", "grid", 0.55, 8, 0.78)
    text(c, mid_x + 10, y0 + panel_h - 17, "Generated visual answer", 7.3, "ink", True)
    img_x, img_y = mid_x + 12, y0 + 18
    img_w, img_h = mid_w - 24, panel_h - 44
    box(c, img_x, img_y, img_w, img_h, "soft", "line", 0.55, 6, 0.80)

    regions = [
        (img_x + 15, img_y + img_h - 45, 62, 27, "REST", "blue"),
        (img_x + img_w - 77, img_y + img_h - 45, 62, 27, "GraphQL", "cyan"),
        (img_x + img_w / 2 - 33, img_y + img_h / 2 - 15, 66, 30, "Gateway", "green"),
        (img_x + 30, img_y + 30, 58, 26, "Cache", "amber"),
        (img_x + img_w - 90, img_y + 31, 68, 26, "Schema", "violet"),
    ]
    for rx, ry, rw, rh, label, color in regions:
        box(c, rx, ry, rw, rh, "white", color, 0.85, 5, 0.94)
        text(c, rx + rw / 2, ry + rh / 2 - 2.2, label, 6.1, color, True, "center")
    for rx, ry, rw, rh, _, _ in regions:
        c.setStrokeColor(col("blue"))
        c.setLineWidth(0.8)
        c.setDash(3, 2)
        c.roundRect(rx - 3, ry - 3, rw + 6, rh + 6, 6, fill=0, stroke=1)
        c.setDash()
    pill(c, img_x + 8, img_y + 8, 66, 12, "hotspot layer", "blue")

    arrow(c, mid_x + mid_w + 7, y0 + 90, right_x - 7, y0 + 90, "ink", 0.7)

    box(c, right_x, y0 + 18, right_w, panel_h - 28, "white", "grid", 0.55, 8, 0.92)
    text(c, right_x + 9, y0 + panel_h - 27, "Clicked region", 6.6, "muted", True)
    pill(c, right_x + 9, y0 + panel_h - 47, 56, 13, "GraphQL", "cyan")
    text(c, right_x + 9, y0 + panel_h - 66, "Region detail opens", 6.2, "ink")
    text(c, right_x + 9, y0 + panel_h - 78, "in visual context.", 6.2, "ink")
    line(c, right_x + 9, y0 + panel_h - 88, right_x + right_w - 9, y0 + panel_h - 88, "grid")
    text(c, right_x + 9, y0 + panel_h - 103, "Follow-up thread", 6.1, "muted", True)
    box(c, right_x + 9, y0 + panel_h - 130, right_w - 18, 20, "soft", "grid", 0.45, 4, 0.98)
    text(c, right_x + 15, y0 + panel_h - 122, "When avoid it?", 5.7, "ink")
    c.save()


def draw_pipeline():
    W, H = 3.48 * PT, 2.72 * PT
    c = canvas.Canvas("model.pdf", pagesize=(W, H))
    c.setTitle("ChatImage pipeline")
    c.setAuthor("")
    draw_background(c, ASSET_DIR / "fig2-pipeline-bg.png", W, H, 0.42)

    margin = 10
    text(c, margin, H - 14, "Two-pass generation and grounding", 8.4, "ink", True)
    line(c, margin, H - 20, W - margin, H - 20, "grid", 0.55)

    box_w, box_h, gap = 48, 27, 10
    xs = [margin + 2 + i * (box_w + gap) for i in range(4)]
    pass1_y, pass2_y = H - 83, 46

    box(c, margin, pass1_y - 10, W - 2 * margin, box_h + 33, "white", "grid", 0.55, 7, 0.90)
    text(c, margin + 8, pass1_y + box_h + 9, "Pass 1: content before pixels", 6.4, "blue", True)
    for i, (a, b, stroke) in enumerate([
        ("Answer", "LLM text", "line"),
        ("Spec", "modules", "blue"),
        ("Layout", "regions", "blue"),
        ("Image", "prompt", "line"),
    ]):
        box(c, xs[i], pass1_y, box_w, box_h, "white", stroke, 0.75, 4, 0.98)
        text(c, xs[i] + box_w / 2, pass1_y + 16, a, 6.2, "ink", True, "center")
        text(c, xs[i] + box_w / 2, pass1_y + 6, b, 5.0, "muted", align="center")
        if i < 3:
            arrow(c, xs[i] + box_w + 2, pass1_y + box_h / 2, xs[i + 1] - 3, pass1_y + box_h / 2, "ink", 0.52)

    arrow(c, xs[3] + box_w / 2, pass1_y - 5, xs[3] + box_w / 2, pass2_y + box_h + 11, "ink", 0.55)

    box(c, margin, pass2_y - 10, W - 2 * margin, box_h + 33, "white", "grid", 0.55, 7, 0.90)
    text(c, margin + 8, pass2_y + box_h + 9, "Pass 2: ground the rendered image", 6.4, "cyan", True)
    for i, (a, b, stroke) in enumerate([
        ("Ground", "boxes", "cyan"),
        ("SAM", "mask", "cyan"),
        ("Hotspots", "click layer", "cyan"),
        ("Threads", "follow-up", "line"),
    ]):
        box(c, xs[i], pass2_y, box_w, box_h, "white", stroke, 0.75, 4, 0.98)
        text(c, xs[i] + box_w / 2, pass2_y + 16, a, 6.2, "ink", True, "center")
        text(c, xs[i] + box_w / 2, pass2_y + 6, b, 5.0, "muted", align="center")
        if i < 3:
            arrow(c, xs[i] + box_w + 2, pass2_y + box_h / 2, xs[i + 1] - 3, pass2_y + box_h / 2, "ink", 0.52)

    box(c, margin + 4, 12, W - 2 * margin - 8, 18, "white", "grid", 0.45, 4, 0.92)
    text(c, W / 2, 19, "Invariant: hotspot bounds match visible image regions.", 5.35, "ink", align="center")
    c.save()


def draw_experiment_summary():
    W, H = 7.20 * PT, 2.42 * PT
    c = canvas.Canvas("Experiment_Summary.pdf", pagesize=(W, H))
    c.setTitle("Experiment summary")
    c.setAuthor("")
    draw_background(c, ASSET_DIR / "fig4-experiment-bg.png", W, H, 0.45)

    margin, gap = 17, 18
    panel_w = (W - 2 * margin - 2 * gap) / 3
    panel_h = H - 2 * margin
    y = margin
    xs = [margin, margin + panel_w + gap, margin + 2 * (panel_w + gap)]

    for x in xs:
        box(c, x, y, panel_w, panel_h, "white", "grid", 0.55, 7, 0.90)

    # Panel A: outcome rates.
    x = xs[0] + 9
    text(c, x, y + panel_h - 15, "(a) Outcome rates", 8.1, "ink", True)
    axis_x, axis_y = x + 62, y + 31
    axis_w = panel_w - 89
    rows = [
        ("Generated", "30/30", 100.0, "blue"),
        ("Strict gate", "17/24", 70.8, "cyan"),
        ("SAM-complete", "13/24", 54.2, "amber"),
    ]
    for tick in [0, 50, 100]:
        tx = axis_x + axis_w * tick / 100
        line(c, tx, axis_y - 5, tx, axis_y + 72, "grid", 0.35)
        text(c, tx, axis_y - 16, str(tick), 5.5, "muted", align="center")
    for i, (name, frac, pct, color) in enumerate(rows):
        yy = axis_y + 60 - i * 25
        text(c, x, yy - 2, name, 6.2, "ink")
        line(c, axis_x, yy, axis_x + axis_w, yy, "grid", 1.1)
        line(c, axis_x, yy, axis_x + axis_w * pct / 100, yy, color, 2.4)
        c.setFillColor(col(color))
        c.circle(axis_x + axis_w * pct / 100, yy, 3.2, fill=1, stroke=0)
        text(c, axis_x + axis_w + 4, yy - 1, frac, 5.7, "ink")
        text(c, axis_x + axis_w + 4, yy - 10, f"{pct:.1f}%", 5.25, "muted")

    # Panel B: source distribution.
    x = xs[1] + 9
    text(c, x, y + panel_h - 15, "(b) Hotspot grounding sources", 8.1, "ink", True)
    plot_x, plot_y = x + 1, y + 88
    plot_w, bar_h = panel_w - 20, 13
    segments = [
        ("MiMo", 50, 55.6, "blue"),
        ("LA layout", 9, 10.0, "cyan"),
        ("LA crop", 2, 2.2, "green"),
        ("SAM3", 16, 17.8, "amber"),
        ("Fallback", 11, 12.2, "violet"),
        ("OCR", 2, 2.2, "red"),
    ]
    cur = plot_x
    for name, n, pct, color in segments:
        ww = plot_w * pct / 100
        rect(c, cur, plot_y, ww, bar_h, color)
        if pct > 15:
            text(c, cur + ww / 2, plot_y + 3.6, f"{name} {n}", 5.0, "white", True, "center")
        cur += ww
    line(c, plot_x, plot_y - 7, plot_x + plot_w, plot_y - 7, "line", 0.45)
    for tick in [0, 50, 100]:
        tx = plot_x + plot_w * tick / 100
        line(c, tx, plot_y - 9, tx, plot_y - 4, "line", 0.45)
        text(c, tx, plot_y - 18, str(tick), 5.3, "muted", align="center")
    text(c, plot_x + plot_w + 3, plot_y - 18, "%", 5.3, "muted")
    lx, ly = x + 1, y + 58
    for i, (name, n, pct, color) in enumerate(segments):
        cx = lx + (i % 2) * 80
        cy = ly - (i // 2) * 14
        rect(c, cx, cy, 6, 6, color)
        text(c, cx + 9, cy + 0.7, f"{name}: {n} ({pct:.1f}%)", 5.25, "ink")

    # Panel C: SAM completeness.
    x = xs[2] + 9
    text(c, x, y + panel_h - 15, "(c) SAM mask completeness", 8.1, "ink", True)
    cx, cy, r = x + (panel_w - 18) / 2, y + 72, 33
    complete, total = 13, 24
    start = 90
    extent = -360 * complete / total
    c.setFillColor(col("red"))
    c.wedge(cx - r, cy - r, cx + r, cy + r, start + extent, 360 + extent, fill=1, stroke=0)
    c.setFillColor(col("cyan"))
    c.wedge(cx - r, cy - r, cx + r, cy + r, start, extent, fill=1, stroke=0)
    c.setFillColor(col("white"))
    c.circle(cx, cy, 21, fill=1, stroke=0)
    text(c, cx, cy + 3, "13/24", 9.4, "ink", True, "center")
    text(c, cx, cy - 9, "54.2%", 6.0, "muted", align="center")
    rect(c, x + 6, y + 25, 7, 7, "cyan")
    text(c, x + 17, y + 26, "Complete masks", 5.8, "ink")
    rect(c, x + 94, y + 25, 7, 7, "red")
    text(c, x + 105, y + 26, "Holes / cavities", 5.8, "ink")
    text(c, x + (panel_w - 18) / 2, y + 10, "Checked hotspots only (n=24)", 5.45, "muted", align="center")
    c.save()


if __name__ == "__main__":
    draw_teaser()
    draw_pipeline()
    draw_experiment_summary()
