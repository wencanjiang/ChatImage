from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape
from reportlab.pdfgen import canvas


OUT = "Experiment_Summary.pdf"
W, H = 7.20 * 72, 2.08 * 72


PALETTE = {
    "ink": colors.HexColor("#222222"),
    "muted": colors.HexColor("#666666"),
    "grid": colors.HexColor("#D9DEE7"),
    "rule": colors.HexColor("#AEB6C4"),
    "bg": colors.HexColor("#F3F6FA"),
    "blue": colors.HexColor("#3E76B8"),
    "teal": colors.HexColor("#43A595"),
    "amber": colors.HexColor("#E3A63B"),
    "violet": colors.HexColor("#7667B1"),
    "red": colors.HexColor("#C76363"),
    "green": colors.HexColor("#58A66A"),
}


def txt(c, x, y, s, size=6.2, color="ink", bold=False, align="left"):
    c.setFillColor(PALETTE[color] if isinstance(color, str) else color)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    if align == "right":
        c.drawRightString(x, y, s)
    elif align == "center":
        c.drawCentredString(x, y, s)
    else:
        c.drawString(x, y, s)


def line(c, x1, y1, x2, y2, color="rule", width=0.45):
    c.setStrokeColor(PALETTE[color] if isinstance(color, str) else color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)


def rect(c, x, y, w, h, fill, stroke=None, width=0.3):
    fill_color = PALETTE[fill] if isinstance(fill, str) else fill
    stroke_color = PALETTE[stroke] if isinstance(stroke, str) else (stroke or fill_color)
    c.setFillColor(fill_color)
    c.setStrokeColor(stroke_color)
    c.setLineWidth(width)
    c.rect(x, y, w, h, fill=1, stroke=1 if stroke else 0)


def metric_panel(c, x, y, w, h):
    txt(c, x, y + h - 11, "(a) Pipeline outcomes", 8.2, bold=True)
    plot_x = x + 70
    plot_y = y + 22
    plot_w = w - 88
    bar_h = 9
    rows = [
        ("Generated", "30/30", 100.0, "blue"),
        ("Strict gate", "17/24", 70.8, "teal"),
        ("SAM-complete", "13/24", 54.2, "amber"),
    ]
    for tick in [0, 50, 100]:
        tx = plot_x + plot_w * tick / 100
        line(c, tx, plot_y - 4, tx, plot_y + 52, "grid", 0.35)
        txt(c, tx, plot_y - 14, str(tick), 5.8, "muted", align="center")

    for i, (name, frac, pct, col) in enumerate(rows):
        yy = plot_y + 39 - i * 18
        txt(c, x, yy + 1.5, name, 6.7)
        rect(c, plot_x, yy, plot_w, bar_h, "bg")
        rect(c, plot_x, yy, plot_w * pct / 100, bar_h, col)
        txt(c, plot_x + plot_w + 3, yy + 1.5, f"{frac}  {pct:.1f}%", 6.2, "ink")
    line(c, plot_x, plot_y - 4, plot_x + plot_w, plot_y - 4, "rule", 0.45)


def source_panel(c, x, y, w, h):
    txt(c, x, y + h - 11, "(b) Alignment sources (n=90)", 8.2, bold=True)
    plot_x = x + 8
    plot_y = y + 71
    plot_w = w - 16
    bar_h = 13
    segments = [
        ("MiMo-Vision", 55.6, "blue"),
        ("LA-layout", 10.0, "teal"),
        ("LA-crop", 2.2, "green"),
        ("SAM3-refined", 17.8, "amber"),
        ("Fallback", 12.2, "violet"),
        ("OCR", 2.2, "red"),
    ]
    for tick in [0, 25, 50, 75, 100]:
        tx = plot_x + plot_w * tick / 100
        line(c, tx, plot_y - 7, tx, plot_y + bar_h + 5, "grid", 0.3)
        if tick in [0, 50, 100]:
            txt(c, tx, plot_y - 17, str(tick), 5.6, "muted", align="center")
    cur = plot_x
    for name, pct, col in segments:
        ww = plot_w * pct / 100
        rect(c, cur, plot_y, ww, bar_h, col)
        if pct >= 15:
            label = "MiMo" if name == "MiMo-Vision" else "SAM3"
            txt(c, cur + ww / 2, plot_y + 3.8, f"{label} {pct:.1f}", 5.3, colors.white, bold=True, align="center")
        cur += ww
    line(c, plot_x, plot_y - 7, plot_x + plot_w, plot_y - 7, "rule", 0.45)

    legend_y = y + 16
    legend_xs = [x + 6, x + 102]
    for idx, (name, pct, col) in enumerate(segments):
        lx = legend_xs[idx % 2]
        ly = legend_y + 28 - (idx // 2) * 13
        rect(c, lx, ly, 6, 6, col)
        txt(c, lx + 9, ly + 0.8, f"{name} {pct:.1f}%", 5.25, "ink")


def sam_panel(c, x, y, w, h):
    txt(c, x, y + h - 11, "(c) SAM mask diagnostic (n=24)", 8.2, bold=True)
    plot_x = x + 28
    plot_y = y + 25
    plot_w = w - 52
    plot_h = 72
    for tick in [0, 8, 16, 24]:
        ty = plot_y + plot_h * tick / 24
        line(c, plot_x - 4, ty, plot_x + plot_w, ty, "grid", 0.3)
        txt(c, plot_x - 8, ty - 2, str(tick), 5.8, "muted", align="right")
    bars = [
        ("Complete", 13, "teal", "54.2%"),
        ("Incomplete", 11, "red", "45.8%"),
    ]
    bw = 28
    gap = 34
    for i, (name, val, col, pct) in enumerate(bars):
        bx = plot_x + 33 + i * (bw + gap)
        bh = plot_h * val / 24
        rect(c, bx, plot_y, bw, bh, col)
        txt(c, bx + bw / 2, plot_y + bh + 5, f"{val}/24", 6.7, "ink", bold=True, align="center")
        txt(c, bx + bw / 2, plot_y - 12, name, 6.0, "ink", align="center")
        txt(c, bx + bw / 2, plot_y - 22, pct, 5.6, "muted", align="center")
    line(c, plot_x - 4, plot_y, plot_x + plot_w, plot_y, "rule", 0.45)


def main():
    c = canvas.Canvas(OUT, pagesize=landscape((W, H)))
    c.setTitle("Experiment summary")
    c.setAuthor("")
    margin = 16
    gap = 15
    panel_h = H - 2 * margin
    panel_w = (W - 2 * margin - 2 * gap) / 3
    xs = [margin, margin + panel_w + gap, margin + 2 * (panel_w + gap)]
    y = margin

    for sx in xs[1:]:
        line(c, sx - gap / 2, y + 4, sx - gap / 2, y + panel_h - 4, "grid", 0.45)

    metric_panel(c, xs[0], y, panel_w, panel_h)
    source_panel(c, xs[1], y, panel_w, panel_h)
    sam_panel(c, xs[2], y, panel_w, panel_h)
    c.save()


if __name__ == "__main__":
    main()
