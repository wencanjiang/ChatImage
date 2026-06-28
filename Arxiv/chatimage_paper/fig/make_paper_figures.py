from reportlab.lib import colors
from reportlab.pdfgen import canvas


PT = 72.0


C = {
    "ink": colors.HexColor("#222222"),
    "muted": colors.HexColor("#666666"),
    "light": colors.HexColor("#F6F7F9"),
    "line": colors.HexColor("#B8C0CC"),
    "grid": colors.HexColor("#E3E7ED"),
    "blue": colors.HexColor("#2F6DB5"),
    "cyan": colors.HexColor("#2B9B96"),
    "green": colors.HexColor("#4F9D69"),
    "amber": colors.HexColor("#D79A2B"),
    "violet": colors.HexColor("#7064A8"),
    "red": colors.HexColor("#BD5B5B"),
    "white": colors.white,
}


def col(name):
    return C[name] if isinstance(name, str) else name


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


def box(c, x, y, w, h, fill="white", stroke="line", width=0.55, radius=4):
    c.setFillColor(col(fill))
    c.setStrokeColor(col(stroke))
    c.setLineWidth(width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def rect(c, x, y, w, h, fill, stroke=None, width=0.45):
    c.setFillColor(col(fill))
    c.setStrokeColor(col(stroke or fill))
    c.setLineWidth(width)
    c.rect(x, y, w, h, fill=1, stroke=1 if stroke else 0)


def arrow(c, x1, y1, x2, y2, color="ink", width=0.65):
    line(c, x1, y1, x2, y2, color, width)
    dx = x2 - x1
    dy = y2 - y1
    if abs(dx) >= abs(dy):
        sign = 1 if dx >= 0 else -1
        c.setFillColor(col(color))
        p = c.beginPath()
        p.moveTo(x2, y2)
        p.lineTo(x2 - sign * 5.0, y2 + 3.0)
        p.lineTo(x2 - sign * 5.0, y2 - 3.0)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
    else:
        sign = 1 if dy >= 0 else -1
        c.setFillColor(col(color))
        p = c.beginPath()
        p.moveTo(x2, y2)
        p.lineTo(x2 - 3.0, y2 - sign * 5.0)
        p.lineTo(x2 + 3.0, y2 - sign * 5.0)
        p.close()
        c.drawPath(p, fill=1, stroke=0)


def pill(c, x, y, w, h, label, fill, fg="white"):
    c.setFillColor(col(fill))
    c.setStrokeColor(col(fill))
    c.roundRect(x, y, w, h, h / 2, fill=1, stroke=0)
    text(c, x + w / 2, y + h / 2 - 2.2, label, 5.8, fg, True, "center")


def draw_teaser():
    W, H = 7.20 * PT, 2.70 * PT
    c = canvas.Canvas("demo1.pdf", pagesize=(W, H))
    c.setTitle("ChatImage teaser")
    c.setAuthor("")
    margin = 16
    y0 = 18
    h = H - 38

    left_w = 118
    mid_w = 246
    right_w = W - 2 * margin - left_w - mid_w - 28
    x1 = margin
    x2 = x1 + left_w + 14
    x3 = x2 + mid_w + 14

    text(c, x1, H - 17, "From long answer to grounded visual interaction", 9.2, "ink", True)
    line(c, margin, H - 24, W - margin, H - 24, "grid", 0.55)

    box(c, x1, y0 + h - 61, left_w, 54, "white")
    text(c, x1 + 8, y0 + h - 22, "User question", 6.5, "muted", True)
    text(c, x1 + 8, y0 + h - 36, "Compare REST and", 7.2, "ink")
    text(c, x1 + 8, y0 + h - 48, "GraphQL for an API", 7.2, "ink")
    text(c, x1 + 8, y0 + h - 60, "design decision.", 7.2, "ink")

    box(c, x1, y0 + 10, left_w, 76, "light", "grid")
    text(c, x1 + 8, y0 + 70, "Text-only answer", 6.5, "muted", True)
    for i, ww in enumerate([82, 94, 68, 88, 72, 98]):
        rect(c, x1 + 8, y0 + 54 - i * 9, ww, 2.3, "line")
    text(c, x1 + 8, y0 + 15, "Linear scan, no region context", 5.6, "muted")

    arrow(c, x1 + left_w + 3, y0 + h - 36, x2 - 4, y0 + h - 36, "ink")
    arrow(c, x1 + left_w + 3, y0 + 48, x2 - 4, y0 + 48, "ink")

    box(c, x2, y0, mid_w, h, "white")
    text(c, x2 + 10, y0 + h - 16, "Generated visual answer with transparent hotspots", 7.3, "ink", True)
    img_x, img_y = x2 + 12, y0 + 18
    img_w, img_h = mid_w - 24, h - 44
    rect(c, img_x, img_y, img_w, img_h, colors.HexColor("#F2F5F8"), "line")
    # Stylized generated-image regions.
    regions = [
        (img_x + 14, img_y + img_h - 44, 68, 30, "REST", "blue"),
        (img_x + img_w - 82, img_y + img_h - 44, 68, 30, "GraphQL", "cyan"),
        (img_x + 36, img_y + 40, 60, 30, "Cache", "amber"),
        (img_x + img_w - 96, img_y + 40, 70, 30, "Schema", "violet"),
        (img_x + img_w / 2 - 34, img_y + img_h / 2 - 16, 68, 32, "Gateway", "green"),
    ]
    for rx, ry, rw, rh, label, color in regions:
        box(c, rx, ry, rw, rh, "white", color, 0.8, 5)
        text(c, rx + rw / 2, ry + rh / 2 - 2, label, 6.5, color, True, "center")
    for sx, sy, ex, ey in [
        (img_x + 82, img_y + img_h - 29, img_x + img_w / 2 - 34, img_y + img_h / 2),
        (img_x + img_w - 82, img_y + img_h - 29, img_x + img_w / 2 + 34, img_y + img_h / 2),
        (img_x + 96, img_y + 55, img_x + img_w / 2 - 34, img_y + img_h / 2 - 2),
        (img_x + img_w - 96, img_y + 55, img_x + img_w / 2 + 34, img_y + img_h / 2 - 2),
    ]:
        line(c, sx, sy, ex, ey, "grid", 1.1)
    for rx, ry, rw, rh, label, color in regions:
        c.setStrokeColor(col("blue"))
        c.setLineWidth(0.75)
        c.setDash(3, 2)
        c.roundRect(rx - 3, ry - 3, rw + 6, rh + 6, 6, fill=0, stroke=1)
        c.setDash()
    pill(c, img_x + 8, img_y + 8, 68, 12, "grounded layer", "blue")

    arrow(c, x2 + mid_w + 4, y0 + h / 2 + 8, x3 - 4, y0 + h / 2 + 8, "ink")

    box(c, x3, y0, right_w, h, "white")
    text(c, x3 + 10, y0 + h - 16, "Selected region", 7.3, "ink", True)
    pill(c, x3 + 10, y0 + h - 35, 62, 13, "GraphQL", "cyan")
    text(c, x3 + 10, y0 + h - 53, "Typed schema and a single", 6.5, "ink")
    text(c, x3 + 10, y0 + h - 65, "endpoint make nested reads", 6.5, "ink")
    text(c, x3 + 10, y0 + h - 77, "compact, but add query cost.", 6.5, "ink")
    line(c, x3 + 10, y0 + h - 88, x3 + right_w - 10, y0 + h - 88, "grid")
    text(c, x3 + 10, y0 + h - 104, "Follow-up thread", 6.3, "muted", True)
    box(c, x3 + 10, y0 + h - 129, right_w - 20, 18, "light", "grid", 0.45, 3)
    text(c, x3 + 16, y0 + h - 122, "When should I avoid it?", 5.8, "ink")
    box(c, x3 + 10, y0 + 15, right_w - 20, 28, "white", "grid", 0.45, 3)
    text(c, x3 + 16, y0 + 32, "If clients need simple", 5.7, "ink")
    text(c, x3 + 16, y0 + 22, "cacheable resource URLs.", 5.7, "ink")
    c.save()


def draw_pipeline():
    W, H = 3.48 * PT, 2.72 * PT
    c = canvas.Canvas("model.pdf", pagesize=(W, H))
    c.setTitle("ChatImage pipeline")
    c.setAuthor("")
    margin = 10
    text(c, margin, H - 14, "Two-pass ChatImage pipeline", 8.8, "ink", True)
    line(c, margin, H - 20, W - margin, H - 20, "grid", 0.5)

    lane_x = margin
    lane_w = W - 2 * margin
    pass1_y = H - 84
    pass2_y = 44
    box_w = 49
    box_h = 28
    gap = 10
    xs = [lane_x + 2 + i * (box_w + gap) for i in range(4)]

    text(c, lane_x + 2, H - 33, "Pass 1: plan content before pixels", 6.3, "blue", True)
    labels1 = [("Answer", "LLM text"), ("Spec", "modules"), ("Layout", "regions"), ("Image", "prompt")]
    for i, (a, b) in enumerate(labels1):
        box(c, xs[i], pass1_y, box_w, box_h, "white", "blue" if i in [1, 2] else "line")
        text(c, xs[i] + box_w / 2, pass1_y + 16, a, 6.2, "ink", True, "center")
        text(c, xs[i] + box_w / 2, pass1_y + 6, b, 5.0, "muted", False, "center")
        if i < 3:
            arrow(c, xs[i] + box_w + 2, pass1_y + box_h / 2, xs[i + 1] - 3, pass1_y + box_h / 2, "ink", 0.5)

    arrow(c, xs[3] + box_w / 2, pass1_y - 4, xs[3] + box_w / 2, pass2_y + box_h + 10, "ink", 0.5)

    text(c, lane_x + 2, pass2_y + box_h + 24, "Pass 2: ground real rendered content", 6.3, "cyan", True)
    labels2 = [("Ground", "vision boxes"), ("SAM", "organic mask"), ("Hotspots", "click layer"), ("Threads", "follow-up")]
    for i, (a, b) in enumerate(labels2):
        box(c, xs[i], pass2_y, box_w, box_h, "white", "cyan" if i in [0, 1, 2] else "line")
        text(c, xs[i] + box_w / 2, pass2_y + 16, a, 6.2, "ink", True, "center")
        text(c, xs[i] + box_w / 2, pass2_y + 6, b, 5.0, "muted", False, "center")
        if i < 3:
            arrow(c, xs[i] + box_w + 2, pass2_y + box_h / 2, xs[i + 1] - 3, pass2_y + box_h / 2, "ink", 0.5)

    box(c, lane_x + 4, 12, lane_w - 8, 18, "light", "grid", 0.45, 4)
    text(c, W / 2, 19, "Invariant: saved hotspot bounds must correspond to visible image regions.", 5.4, "ink", False, "center")
    c.save()


def draw_experiment_summary():
    W, H = 7.20 * PT, 2.35 * PT
    c = canvas.Canvas("Experiment_Summary.pdf", pagesize=(W, H))
    c.setTitle("Experiment summary")
    c.setAuthor("")
    margin = 17
    gap = 18
    panel_w = (W - 2 * margin - 2 * gap) / 3
    panel_h = H - 2 * margin
    y = margin
    xs = [margin, margin + panel_w + gap, margin + 2 * (panel_w + gap)]

    for sx in xs[1:]:
        line(c, sx - gap / 2, y + 3, sx - gap / 2, y + panel_h - 3, "grid", 0.5)

    # Panel A: lollipop rates.
    x = xs[0]
    text(c, x, y + panel_h - 11, "(a) Outcome rates", 8.4, "ink", True)
    axis_x = x + 64
    axis_y = y + 26
    axis_w = panel_w - 86
    rows = [("Generated", "30/30", 100.0, "blue"), ("Strict gate", "17/24", 70.8, "cyan"), ("SAM-complete", "13/24", 54.2, "amber")]
    for tick in [0, 50, 100]:
        tx = axis_x + axis_w * tick / 100
        line(c, tx, axis_y - 4, tx, axis_y + 70, "grid", 0.35)
        text(c, tx, axis_y - 15, str(tick), 5.6, "muted", align="center")
    for i, (name, frac, pct, color) in enumerate(rows):
        yy = axis_y + 58 - i * 25
        text(c, x, yy - 2, name, 6.3, "ink")
        line(c, axis_x, yy, axis_x + axis_w, yy, "grid", 1.1)
        line(c, axis_x, yy, axis_x + axis_w * pct / 100, yy, color, 2.2)
        c.setFillColor(col(color))
        c.circle(axis_x + axis_w * pct / 100, yy, 3.1, fill=1, stroke=0)
        text(c, axis_x + axis_w + 4, yy - 2, f"{frac}", 5.7, "ink")
        text(c, axis_x + axis_w + 4, yy - 10, f"{pct:.1f}%", 5.2, "muted")

    # Panel B: source distribution.
    x = xs[1]
    text(c, x, y + panel_h - 11, "(b) Hotspot grounding sources", 8.4, "ink", True)
    plot_x = x + 6
    plot_y = y + 83
    plot_w = panel_w - 12
    bar_h = 12
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
            text(c, cur + ww / 2, plot_y + 3.4, f"{name} {n}", 5.1, "white", True, "center")
        cur += ww
    line(c, plot_x, plot_y - 7, plot_x + plot_w, plot_y - 7, "line", 0.45)
    for tick in [0, 50, 100]:
        tx = plot_x + plot_w * tick / 100
        line(c, tx, plot_y - 9, tx, plot_y - 4, "line", 0.45)
        text(c, tx, plot_y - 18, str(tick), 5.4, "muted", align="center")
    text(c, plot_x + plot_w + 3, plot_y - 18, "%", 5.4, "muted")
    lx, ly = x + 6, y + 55
    for i, (name, n, pct, color) in enumerate(segments):
        cx = lx + (i % 2) * 80
        cy = ly - (i // 2) * 14
        rect(c, cx, cy, 6, 6, color)
        text(c, cx + 9, cy + 0.7, f"{name}: {n} ({pct:.1f}%)", 5.35, "ink")

    # Panel C: SAM completeness.
    x = xs[2]
    text(c, x, y + panel_h - 11, "(c) SAM mask completeness", 8.4, "ink", True)
    cx = x + panel_w / 2
    cy = y + 67
    r = 33
    total = 24
    complete = 13
    start = 90
    extent = -360 * complete / total
    c.setFillColor(col("red"))
    c.wedge(cx - r, cy - r, cx + r, cy + r, start + extent, 360 + extent, fill=1, stroke=0)
    c.setFillColor(col("cyan"))
    c.wedge(cx - r, cy - r, cx + r, cy + r, start, extent, fill=1, stroke=0)
    c.setFillColor(col("white"))
    c.circle(cx, cy, 21, fill=1, stroke=0)
    text(c, cx, cy + 3, "13/24", 9.5, "ink", True, "center")
    text(c, cx, cy - 9, "54.2%", 6.0, "muted", False, "center")
    rect(c, x + 8, y + 22, 7, 7, "cyan")
    text(c, x + 19, y + 23, "Complete masks", 5.8, "ink")
    rect(c, x + 96, y + 22, 7, 7, "red")
    text(c, x + 107, y + 23, "Holes / cavities", 5.8, "ink")
    text(c, x + panel_w / 2, y + 8, "Checked hotspots only (n=24)", 5.5, "muted", align="center")
    c.save()


if __name__ == "__main__":
    draw_teaser()
    draw_pipeline()
    draw_experiment_summary()
