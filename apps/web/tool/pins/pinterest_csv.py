"""Pinterest bulk-create CSV for the checklist pins (Settings > Bulk create Pins).

Run from apps/web after make_pins.py:
  python3 tool/pins/pinterest_csv.py /tmp/pins.json 2026-11-30 > pins.csv
Two pins a day, at 09:00 and 19:00 UTC, starting on the given date.
"""
import csv
import datetime as dt
import json
import sys

SITE = "https://zavqera.com"

BOARDS = {
    "en": {"people": "Small Business Checklists", "money": "Small Business Checklists", "property": "Rental & Cleaning Checklists",
           "operations": "Restaurant & Cleaning Checklists", "clients": "Small Business Checklists"},
    "ar": "قوائم مهام مجانية بالعربية",
    "es": "Checklists gratis para negocios",
    "fr": "Checklists gratuites pour les pros",
    "de": "Kostenlose Checklisten für Betriebe",
    "nb": "Gratis sjekklister for bedrifter",
}
SUFFIX = {
    "en": "Free printable PDF, or use it with your team online.",
    "ar": "ملف PDF مجاني للطباعة، أو استخدمها مع فريقك على الإنترنت.",
    "es": "PDF gratis para imprimir, o úsala con tu equipo en línea.",
    "fr": "PDF gratuit à imprimer, ou à utiliser en ligne avec votre équipe.",
    "de": "Kostenloses PDF zum Ausdrucken, oder online mit dem Team nutzen.",
    "nb": "Gratis PDF til utskrift, eller bruk den med teamet på nett.",
}
KEYWORDS = {
    "en": "checklist, printable checklist, free printable, small business, template",
    "ar": "قائمة مهام, قائمة للطباعة, مجاني, مشاريع صغيرة",
    "es": "checklist, imprimible, gratis, plantilla, negocio",
    "fr": "checklist, à imprimer, gratuit, modèle, entreprise",
    "de": "Checkliste, zum Ausdrucken, kostenlos, Vorlage, Betrieb",
    "nb": "sjekkliste, utskrift, gratis, mal, bedrift",
}


def main():
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    groups = json.load(open(sys.argv[3], encoding="utf-8")) if len(sys.argv) > 3 else {}
    start = dt.datetime.fromisoformat(sys.argv[2])
    # English first, then the other languages, interleaved so no day is one language.
    en = [d for d in data if d["lang"] == "en"]
    rest = [d for d in data if d["lang"] != "en"]
    order = []
    while en or rest:
        if en:
            order.append(en.pop(0))
        if rest:
            order.append(rest.pop(0))
    w = csv.writer(sys.stdout)
    w.writerow(["Title", "Media URL", "Pinterest board", "Thumbnail", "Description", "Link", "Publish date", "Keywords"])
    for i, d in enumerate(order):
        lang = d["lang"]
        board = BOARDS[lang]
        if isinstance(board, dict):
            board = board.get(groups.get(d["slug"], ""), "Small Business Checklists")
        when = start + dt.timedelta(days=i // 2, hours=9 if i % 2 == 0 else 19)
        desc = (d["metaDescription"] + " " + SUFFIX[lang])[:500]
        w.writerow([
            d["metaTitle"][:100],
            f"{SITE}/pins/{lang}/{d['slug']}.png",
            board,
            "",
            desc,
            f"{SITE}{d['path']}?utm_source=pinterest&utm_medium=social",
            when.strftime("%Y-%m-%dT%H:%M:%S"),
            KEYWORDS[lang],
        ])


if __name__ == "__main__":
    main()
