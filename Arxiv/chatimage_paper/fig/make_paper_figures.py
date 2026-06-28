from math import cos, radians, sin
from pathlib import Path

from reportlab.lib import colors
from reportlab.pdfgen import canvas


PT = 72.0
HERE = Path(__file__).resolve().parent


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


def draw_teaser():
    W, H = 7.20 * PT, 2.58 * PT
    c = canvas.Canvas("demo1.pdf", pagesize=(W, H))
    c.setTitle("ChatImage teaser")
    c.setAuthor("")
    rect(c, 0, 0, W, H, "paper")

    margin = 18
    text(c, margin, H - 17, "ChatImage: long-form answers become grounded visual interaction", 9.1, "ink", True)
    line(c, margin, H - 24, W - margin, H - 24, "grid", 0.55)

    base_y = 18
    panel_h = H - 55
    x0, w0 = margin + 2, 118
    x1, w1 = x0 + w0 + 30, 220
    x2, w2 = x1 + w1 + 30, 104

    header(c, x0, base_y + panel_h - 12, "1  Dense answer", "muted")
    round_rect(c, x0, base_y + 18, w0, panel_h - 40, 5, "white", "grid", 0.55)
    text(c, x0 + 9, base_y + panel_h - 44, "A long textual response", 6.0, "muted", True)
    micro_lines(c, x0 + 9, base_y + panel_h - 58, [88, 96, 72, 84, 92, 65, 77], "rule", 2.0, 7)
    line(c, x0 + 9, base_y + 50, x0 + w0 - 9, base_y + 50, "grid", 0.45)
    text(c, x0 + 9, base_y + 36, "hard to navigate", 5.7, "red", True)
    text(c, x0 + 9, base_y + 25, "no local context", 5.45, "muted")

    arrow(c, x0 + w0 + 9, base_y + panel_h / 2, x1 - 11, base_y + panel_h / 2, "ink", 0.7)

    header(c, x1, base_y + panel_h - 12, "2  Generated visual answer", "blue")
    round_rect(c, x1, base_y + 8, w1, panel_h - 25, 6, "white", "rule", 0.55)
    canvas_x, canvas_y = x1 + 16, base_y + 24
    canvas_w, canvas_h = w1 - 32, panel_h - 64
    rect(c, canvas_x, canvas_y, canvas_w, canvas_h, "wash", "grid", 0.5)

    # A compact service-architecture visual, drawn as paper-style modules.
    lane_y = canvas_y + canvas_h * 0.58
    node_specs = [
        ("REST", canvas_x + 17, lane_y + 16, 52, 24, "blue"),
        ("GraphQL", canvas_x + canvas_w - 69, lane_y + 16, 52, 24, "teal"),
        ("Gateway", canvas_x + canvas_w / 2 - 29, lane_y - 3, 58, 24, "green"),
        ("Cache", canvas_x + 33, canvas_y + 25, 48, 22, "amber"),
        ("Schema", canvas_x + canvas_w - 82, canvas_y + 25, 58, 22, "violet"),
    ]
    line(c, canvas_x + 69, lane_y + 28, canvas_x + canvas_w - 69, lane_y + 28, "rule", 0.7)
    line(c, canvas_x + canvas_w / 2, lane_y + 21, canvas_x + canvas_w / 2, canvas_y + 48, "rule", 0.7)
    for label, x, y, w, h, color in node_specs:
        round_rect(c, x, y, w, h, 4, "white", color, 0.85)
        text(c, x + w / 2, y + h / 2 - 2, label, 5.8, color, True, "center")
        c.setStrokeColor(col(color))
        c.setLineWidth(0.75)
        c.setDash(2.5, 2)
        c.roundRect(x - 3.2, y - 3.2, w + 6.4, h + 6.4, 5, fill=0, stroke=1)
        c.setDash()
    pill(c, canvas_x + 9, canvas_y + 8, 66, 11, "grounded hotspots", "blue", size=5.2)
    text(c, canvas_x + canvas_w - 7, canvas_y + 10, "clickable regions", 5.1, "muted", align="right")

    arrow(c, x1 + w1 + 9, base_y + panel_h / 2, x2 - 11, base_y + panel_h / 2, "ink", 0.7)

    header(c, x2, base_y + panel_h - 12, "3  Region thread", "teal")
    round_rect(c, x2, base_y + 18, w2, panel_h - 40, 5, "white", "grid", 0.55)
    text(c, x2 + 10, base_y + panel_h - 43, "Clicked region", 6.0, "muted", True)
    pill(c, x2 + 10, base_y + panel_h - 63, 58, 12, "GraphQL", "teal", size=5.3)
    micro_lines(c, x2 + 10, base_y + panel_h - 86, [73, 64, 77], "rule", 1.7, 6.4, 0.8)
    line(c, x2 + 10, base_y + 48, x2 + w2 - 10, base_y + 48, "grid", 0.45)
    text(c, x2 + 10, base_y + 36, "Follow-up", 5.7, "muted", True)
    round_rect(c, x2 + 10, base_y + 20, w2 - 20, 14, 3, "wash", "grid", 0.45)
    text(c, x2 + 16, base_y + 24.5, "When avoid it?", 5.2, "ink")
    c.save()


def draw_pipeline():
    W, H = 3.48 * PT, 2.68 * PT
    c = canvas.Canvas("model.pdf", pagesize=(W, H))
    c.setTitle("ChatImage pipeline")
    c.setAuthor("")
    rect(c, 0, 0, W, H, "paper")

    margin = 11
    text(c, margin, H - 14, "Two-pass generation and grounding", 8.0, "ink", True)
    line(c, margin, H - 20, W - margin, H - 20, "grid", 0.55)

    lane_x, lane_w = margin, W - 2 * margin
    p1_y, p2_y = H - 82, 47
    lane_h = 51
    round_rect(c, lane_x, p1_y - 8, lane_w, lane_h, 5, "white", "grid", 0.55)
    round_rect(c, lane_x, p2_y - 8, lane_w, lane_h, 5, "white", "grid", 0.55)
    text(c, lane_x + 7, p1_y + lane_h - 20, "Pass 1  content before pixels", 6.1, "blue", True)
    text(c, lane_x + 7, p2_y + lane_h - 20, "Pass 2  ground the rendered image", 6.1, "teal", True)

    box_w, box_h, gap = 43, 22, 9
    xs = [lane_x + 7 + i * (box_w + gap) for i in range(4)]
    p1 = [("Answer", "LLM text", "rule"), ("Spec", "modules", "blue"), ("Layout", "bounds", "blue"), ("Image", "pixels", "rule")]
    p2 = [("Ground", "boxes", "teal"), ("SAM", "mask", "teal"), ("Hotspots", "clicks", "teal"), ("Threads", "follow-up", "rule")]

    for y, items in [(p1_y, p1), (p2_y, p2)]:
        for i, (a, b, stroke) in enumerate(items):
            round_rect(c, xs[i], y, box_w, box_h, 3.5, "white", stroke, 0.75)
            text(c, xs[i] + box_w / 2, y + 12.7, a, 5.6, "ink", True, "center")
            text(c, xs[i] + box_w / 2, y + 4.3, b, 4.55, "muted", align="center")
            if i < 3:
                arrow(c, xs[i] + box_w + 2.2, y + box_h / 2, xs[i + 1] - 2.8, y + box_h / 2, "ink", 0.45, 3.8)

    arrow(c, xs[3] + box_w / 2, p1_y - 5, xs[3] + box_w / 2, p2_y + box_h + 10, "ink", 0.5, 4.2)
    text(c, xs[3] + box_w / 2 + 4, (p1_y + p2_y + box_h) / 2 - 2, "rendered image", 4.75, "muted")

    # Bottom invariant strip.
    line(c, margin + 3, 23, W - margin - 3, 23, "grid", 0.55)
    c.setStrokeColor(col("teal"))
    c.setLineWidth(0.7)
    c.setDash(2.2, 1.8)
    c.roundRect(margin + 22, 9, W - 2 * margin - 44, 17, 4, fill=0, stroke=1)
    c.setDash()
    text(c, W / 2, 14.4, "Invariant: clickable bounds match visible regions", 5.1, "ink", True, "center")
    c.save()


def panel_label(c, x, y, label):
    text(c, x, y, label, 7.3, "ink", True)


def draw_experiment_summary():
    W, H = 7.20 * PT, 2.34 * PT
    c = canvas.Canvas("Experiment_Summary.pdf", pagesize=(W, H))
    c.setTitle("Experiment summary")
    c.setAuthor("")
    rect(c, 0, 0, W, H, "paper")

    margin, gap = 20, 21
    panel_w = (W - 2 * margin - 2 * gap) / 3
    y0, panel_h = 17, H - 34
    xs = [margin, margin + panel_w + gap, margin + 2 * (panel_w + gap)]

    # Shared vertical separators, no heavy cards.
    for x in [xs[1] - gap / 2, xs[2] - gap / 2]:
        line(c, x, y0 + 2, x, y0 + panel_h - 2, "grid", 0.65)

    # Panel A.
    x = xs[0]
    panel_label(c, x, y0 + panel_h - 11, "(a) Outcome rates")
    axis_x, axis_y, axis_w = x + 67, y0 + 35, panel_w - 93
    line(c, axis_x, axis_y, axis_x + axis_w, axis_y, "rule", 0.55)
    for tick in [0, 50, 100]:
        tx = axis_x + axis_w * tick / 100
        line(c, tx, axis_y - 3, tx, axis_y + 66, "grid", 0.35)
        text(c, tx, axis_y - 12, str(tick), 5.2, "muted", align="center")
    rows = [
        ("Generated", "30/30", 100.0, "blue"),
        ("Strict gate", "17/24", 70.8, "teal"),
        ("SAM-complete", "13/24", 54.2, "amber"),
    ]
    for i, (name, frac, pct, color) in enumerate(rows):
        yy = axis_y + 56 - i * 23
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
