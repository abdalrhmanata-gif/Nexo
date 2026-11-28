"""Make one tall Pinterest image (1000x1500) per free checklist page.

Input: a JSON list written by tool/pins/export.mjs.
Output: public/pins/<lang>/<slug>.png

Run from apps/web:
  node tool/pins/export.mjs > /tmp/pins.json
  python3 tool/pins/make_pins.py /tmp/pins.json
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1000, 1500
TEAL = (8, 127, 120)
NAVY = (22, 50, 79)
INK = (23, 33, 43)
MUTED = (101, 113, 124)
PAPER = (246, 248, 250)
LINE = (219, 226, 232)
WHITE = (255, 255, 255)

FONTS = os.path.join(os.path.dirname(__file__), "..", "..", "public", "fonts")
LATIN = os.path.join(FONTS, "NotoSans-Regular.ttf")
ARABIC = os.path.join(FONTS, "NotoSansArabic-Regular.ttf")
ARABIC_BOLD = os.path.join(FONTS, "NotoSansArabic-Bold.ttf")
ICON = os.path.join(os.path.dirname(__file__), "..", "..", "public", "brand", "zavqera-icon-512.png")

TEXT = {
    "en": {"badge": "FREE PRINTABLE CHECKLIST", "pdf": "Free PDF", "more": "+ {n} more steps", "foot": "An owner and proof on every step"},
    "ar": {"badge": "قائمة مجانية للطباعة", "pdf": "PDF مجاني", "more": "+ {n} خطوات أخرى", "foot": "لكل خطوة مسؤول ودليل"},
    "es": {"badge": "CHECKLIST GRATIS PARA IMPRIMIR", "pdf": "PDF gratis", "more": "+ {n} pasos más", "foot": "Un responsable y una prueba en cada paso"},
    "fr": {"badge": "CHECKLIST GRATUITE À IMPRIMER", "pdf": "PDF gratuit", "more": "+ {n} étapes de plus", "foot": "Un responsable et une preuve à chaque étape"},
    "de": {"badge": "KOSTENLOSE CHECKLISTE ZUM DRUCKEN", "pdf": "Gratis-PDF", "more": "+ {n} weitere Schritte", "foot": "Verantwortung und Nachweis bei jedem Schritt"},
    "nb": {"badge": "GRATIS SJEKKLISTE TIL UTSKRIFT", "pdf": "Gratis PDF", "more": "+ {n} steg til", "foot": "En ansvarlig og bevis på hvert steg"},
}

MAX_STEPS = 7


def font(lang, size, bold=False):
    if lang == "ar":
        return ImageFont.truetype(ARABIC_BOLD if bold else ARABIC, size)
    return ImageFont.truetype(LATIN, size)


def opts(lang):
    return {"direction": "rtl", "language": "ar"} if lang == "ar" else {}


def wrap(draw, text, f, width, lang):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=f, **opts(lang)) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def text(draw, xy_left, y, right, s, f, fill, lang, bold=False):
    """Draw s on one line; left-aligned, or right-aligned for Arabic."""
    o = opts(lang)
    if lang == "ar":
        x = right - draw.textlength(s, font=f, **o)
    else:
        x = xy_left
    stroke = 1 if (bold and lang != "ar") else 0
    draw.text((x, y), s, font=f, fill=fill, stroke_width=stroke, stroke_fill=fill, **o)


def make(item, out_root):
    lang = item["lang"]
    t = TEXT[lang]
    rtl = lang == "ar"
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    M = 70

    # Header band
    d.rectangle([0, 0, W, 300], fill=TEAL)
    icon = Image.open(ICON).convert("RGBA").resize((88, 88))
    ix = W - M - 88 if rtl else M
    im.paste(icon, (ix, 56), icon)
    wordmark = font("en", 40)
    wx = M if rtl else M + 108
    d.text((wx if not rtl else W - M - 108 - d.textlength("ZAVQERA", font=wordmark), 76), "ZAVQERA",
           font=wordmark, fill=WHITE, stroke_width=1, stroke_fill=WHITE)
    badge_f = font(lang, 30, bold=True)
    text(d, M, 196, W - M, t["badge"], badge_f, (214, 240, 236), lang, bold=True)

    # Title
    y = 350
    for size in (66, 58, 52, 46):
        tf = font(lang, size, bold=True)
        lines = wrap(d, item["title"], tf, W - 2 * M, lang)
        if len(lines) <= 4:
            break
    for line in lines:
        text(d, M, y, W - M, line, tf, NAVY, lang, bold=True)
        y += int(size * (1.6 if rtl else 1.32))
    y += 40 if rtl else 24

    # Card with steps
    card_top = y
    card_bottom = H - 230
    d.rounded_rectangle([M - 10, card_top, W - M + 10, card_bottom], radius=22, fill=WHITE, outline=LINE, width=2)
    sf = font(lang, 34)
    sy = card_top + 40
    steps = item["steps"]
    shown = 0
    for s in steps:
        lines = wrap(d, s, sf, W - 2 * M - 110, lang)[:2]
        need = len(lines) * 46 + 26
        if shown >= MAX_STEPS or sy + need > card_bottom - 64:
            break
        bx = W - M - 46 if rtl else M + 24
        d.rounded_rectangle([bx, sy + 4, bx + 36, sy + 40], radius=7, outline=TEAL, width=4)
        tx_left = M + 84
        tx_right = W - M - 70
        for i, line in enumerate(lines):
            text(d, tx_left, sy + i * 46, tx_right, line, sf, INK, lang)
        sy += need
        shown += 1
    rest = len(steps) - shown
    if rest > 0:
        mf = font(lang, 30)
        text(d, M + 24, card_bottom - 66, W - M - 24, t["more"].format(n=rest), mf, MUTED, lang)

    # Footer
    pill_f = font(lang, 34, bold=True)
    pill = t["pdf"]
    pw = d.textlength(pill, font=pill_f, **opts(lang)) + 60
    px = W - M - pw if rtl else M
    d.rounded_rectangle([px, H - 190, px + pw, H - 120], radius=35, fill=NAVY)
    d.text((px + 30, H - 180), pill, font=pill_f, fill=WHITE,
           stroke_width=0 if rtl else 1, stroke_fill=WHITE, **opts(lang))
    ff = font(lang, 28)
    text(d, M, H - 98, W - M, t["foot"] + "  ·  zavqera.com" if not rtl else "zavqera.com  ·  " + t["foot"], ff, MUTED, lang)

    folder = os.path.join(out_root, lang)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, item["slug"] + ".png")
    im.save(path, optimize=True)
    return path


def main():
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    out_root = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "..", "public", "pins")
    for item in data:
        print(make(item, out_root))


if __name__ == "__main__":
    main()
