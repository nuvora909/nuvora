"""PDF rendering for Nuvora reports: Ganesha cover, a title page, contents, numbered chapters and drawn visuals.

Sections are dicts. A section may carry legacy keys (paragraphs, bullets, table) and/or an ordered ``blocks`` list:
  {"t": "lead"|"p"|"note"|"h", "text": str}       paragraphs (``**bold**`` is supported)
  {"t": "bullets", "items": [...]}                bullet list
  {"t": "table", "headers", "rows", "widths", "font_size"}
  {"t": "callout", "title", "text", "tone", "badge"}
  {"t": "facts", "items": [(label, value), ...]}  label/value grid
  {"t": "flow", "obj": Flowable}                  any drawn visual from report_visuals
  {"t": "space", "h": mm} / {"t": "pagebreak"}
Section flags: ``chapter`` (numbered chapter heading), ``break`` (start chapter on a new page, default True),
``kicker`` (one-line chapter introduction) and ``cover`` (title-page data; only valid on the first section).
"""
from __future__ import annotations

import re
from html import escape
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.fonts import addMapping
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Flowable, Frame, KeepTogether, LongTable,
                                NextPageTemplate, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

from . import report_visuals as V

ROOT = Path(__file__).resolve().parent
COVER = ROOT / "static" / "ganesha-cover.pdf"
FONT_DIR = Path("C:/Windows/Fonts")


def _register(name, regular, bold, italic=None, bold_italic=None):
    files = [FONT_DIR / regular, FONT_DIR / bold]
    if not all(f.exists() for f in files):
        return False
    pdfmetrics.registerFont(TTFont(name, str(files[0])))
    pdfmetrics.registerFont(TTFont(name + "-Bold", str(files[1])))
    it = FONT_DIR / (italic or "")
    pdfmetrics.registerFont(TTFont(name + "-Italic", str(it if italic and it.exists() else files[0])))
    bi = FONT_DIR / (bold_italic or "")
    pdfmetrics.registerFont(TTFont(name + "-BoldItalic", str(bi if bold_italic and bi.exists() else files[1])))
    addMapping(name, 0, 0, name)
    addMapping(name, 1, 0, name + "-Bold")
    addMapping(name, 0, 1, name + "-Italic")
    addMapping(name, 1, 1, name + "-BoldItalic")
    return True


if _register("Nuvora", "segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuiz.ttf"):
    BASE_FONT, BOLD_FONT = "Nuvora", "Nuvora-Bold"
else:
    BASE_FONT, BOLD_FONT = "Helvetica", "Helvetica-Bold"
if _register("NuvoraSerif", "georgia.ttf", "georgiab.ttf", "georgiai.ttf", "georgiaz.ttf"):
    SERIF, SERIF_BOLD, SERIF_ITALIC = "NuvoraSerif", "NuvoraSerif-Bold", "NuvoraSerif-Italic"
else:
    SERIF, SERIF_BOLD, SERIF_ITALIC = "Times-Roman", "Times-Bold", "Times-Italic"
V.set_fonts(BASE_FONT, BOLD_FONT, SERIF_BOLD)

NAVY, GOLD, INK, MUTED, LINE = V.NAVY, V.GOLD, V.INK, V.MUTED, V.LINE
STRIPE = colors.HexColor("#f6f4fa")
MARGIN = 18 * mm
PAGE_W, PAGE_H = A4


def _styles():
    def s(name, **kw):
        base = dict(fontName=BASE_FONT, fontSize=9.6, leading=15, textColor=INK, splitLongWords=1,
                    allowWidows=0, allowOrphans=0)
        base.update(kw)
        return ParagraphStyle(name, **base)
    return {
        "chapter_no": s("ChapterNo", fontName=BOLD_FONT, fontSize=8, leading=10, textColor=GOLD, spaceAfter=1.5 * mm),
        "chapter_no_flow": s("ChapterNoFlow", fontName=BOLD_FONT, fontSize=8, leading=10, textColor=GOLD,
                             spaceBefore=10 * mm, spaceAfter=1.5 * mm),
        "chapter": s("ChapterTitle", fontName=SERIF_BOLD, fontSize=22, leading=27, textColor=NAVY, spaceAfter=2 * mm),
        "kicker": s("Kicker", fontName=SERIF_ITALIC, fontSize=11, leading=16.5, textColor=MUTED, spaceAfter=5 * mm),
        "section": s("SectionTitle", fontName=SERIF_BOLD, fontSize=13.5, leading=18, textColor=NAVY,
                     spaceBefore=5.5 * mm, spaceAfter=2 * mm, keepWithNext=True),
        "h": s("SubHead", fontName=BOLD_FONT, fontSize=10.2, leading=14, textColor=NAVY, spaceBefore=3.5 * mm,
               spaceAfter=2 * mm, keepWithNext=True),
        "lead": s("Lead", fontName=SERIF, fontSize=11, leading=17, textColor=INK, spaceAfter=3 * mm),
        "body": s("Body", spaceAfter=2.4 * mm),
        "note": s("Note", fontSize=8, leading=11.5, textColor=MUTED, spaceAfter=2 * mm),
        "bullet": s("Bullet", fontSize=9.4, leading=14.2, leftIndent=5 * mm, bulletIndent=1 * mm,
                    bulletFontName=BOLD_FONT, bulletColor=GOLD, spaceAfter=1.6 * mm),
        "cell": s("Cell", fontSize=8, leading=10.8),
        "cell_head": s("CellHead", fontName=BOLD_FONT, fontSize=7.6, leading=10, textColor=colors.white),
        "callout_title": s("CalloutTitle", fontName=BOLD_FONT, fontSize=7.4, leading=10, spaceAfter=1.2 * mm),
        "callout": s("CalloutText", fontSize=9.6, leading=14.6),
        "fact_label": s("FactLabel", fontSize=7, leading=9, textColor=MUTED),
        "fact_value": s("FactValue", fontName=BOLD_FONT, fontSize=9.2, leading=12, textColor=NAVY),
        "title_name": s("TitleName", fontName=SERIF_BOLD, fontSize=20, leading=25, textColor=NAVY),
        "title_meta": s("TitleMeta", fontSize=9.4, leading=14, textColor=MUTED),
        "toc_head": s("TocHead", fontName=SERIF_BOLD, fontSize=18, leading=22, textColor=NAVY, spaceAfter=4 * mm),
        "toc": s("Toc", fontName=BASE_FONT, fontSize=10.5, leading=19, textColor=INK),
        "disclaimer": s("Disclaimer", fontSize=7.6, leading=11, textColor=MUTED, alignment=TA_LEFT),
        "centre_note": s("CentreNote", fontSize=8, leading=11, textColor=MUTED, alignment=TA_CENTER),
    }


def _markup(value) -> str:
    text = escape(str(value if value is not None else "—"))
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return text.replace("\n", "<br/>")


def _p(value, style):
    return Paragraph(_markup(value), style)


class ChapterMark(Flowable):
    """Zero-size marker that records a chapter for the contents page."""

    def __init__(self, number, title):
        super().__init__()
        self.number, self.title = number, title
        self.width = self.height = 0

    def draw(self):
        pass


class NuvoraDoc(BaseDocTemplate):
    def __init__(self, *args, person="", subtitle="", **kw):
        super().__init__(*args, **kw)
        self.person, self.subtitle = person, subtitle

    def afterFlowable(self, flowable):
        if isinstance(flowable, ChapterMark):
            self.notify("TOCEntry", (0, f"{flowable.number:02d}   {flowable.title}", self.page + 1))


def _header_footer(canvas, doc):
    canvas.saveState()
    top = PAGE_H - 12 * mm
    canvas.setFont(BOLD_FONT, 6.8)
    canvas.setFillColor(GOLD)
    canvas.drawString(MARGIN, top, "N U V O R A   J Y O T I S H")
    canvas.setFont(BASE_FONT, 7.2)
    canvas.setFillColor(MUTED)
    right = doc.title + (f"  ·  {doc.person}" if doc.person else "")
    canvas.drawRightString(PAGE_W - MARGIN, top, right[:80])
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(.6)
    canvas.line(MARGIN, top - 2.5 * mm, PAGE_W - MARGIN, top - 2.5 * mm)
    canvas.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
    canvas.setFont(BASE_FONT, 6.8)
    canvas.drawString(MARGIN, 9.5 * mm, "Reflective guidance from a calculated chart — not certainty, and not medical, legal or financial advice.")
    canvas.setFont(BOLD_FONT, 7.4)
    canvas.setFillColor(NAVY)
    canvas.drawRightString(PAGE_W - MARGIN, 9.5 * mm, f"{doc.page + 1}")
    canvas.restoreState()


def _title_band(canvas, doc):
    canvas.saveState()
    band = 92 * mm
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - band, PAGE_W, band, fill=1, stroke=0)
    # faint star field and gold rule for a night-sky feel
    canvas.setFillColor(colors.Color(1, 1, 1, alpha=.55))
    for i in range(46):
        x = (i * 73.3) % PAGE_W
        y = PAGE_H - band + 8 * mm + (i * 41.7) % (band - 16 * mm)
        canvas.circle(x, y, .35 + (i % 3) * .25, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_H - band, PAGE_W, 1.4 * mm, fill=1, stroke=0)
    canvas.setFont(BOLD_FONT, 8)
    canvas.drawString(MARGIN, PAGE_H - 20 * mm, "N U V O R A   J Y O T I S H")
    canvas.setFillColor(colors.white)
    size = 30 if len(doc.title) < 30 else 25
    canvas.setFont(SERIF_BOLD, size)
    lines = V._wrap(canvas, doc.title, SERIF_BOLD, size, PAGE_W - 2 * MARGIN)[:2]
    y = PAGE_H - 42 * mm
    for line in lines:
        canvas.drawString(MARGIN, y, line)
        y -= size * 1.15
    canvas.setFont(SERIF_ITALIC, 11.5)
    canvas.setFillColor(colors.HexColor("#d9dcf2"))
    for line in V._wrap(canvas, doc.subtitle, SERIF_ITALIC, 11.5, PAGE_W - 2 * MARGIN)[:2]:
        y -= 3 * mm
        canvas.drawString(MARGIN, y, line)
        y -= 11.5
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(.6)
    canvas.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
    canvas.setFont(BASE_FONT, 6.8)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 9.5 * mm, "Sidereal zodiac · Lahiri ayanamsa · whole-sign houses · Vimshottari dasha")
    canvas.restoreState()


def _table(block, styles, width):
    headers, rows = block.get("headers") or [], block.get("rows") or []
    if not rows:
        return []
    size = max(7, float(block.get("font_size", 8)))
    cell = ParagraphStyle("SizedCell", parent=styles["cell"], fontSize=size, leading=size + 2.8)
    head = ParagraphStyle("SizedHead", parent=styles["cell_head"], fontSize=min(size, 7.8), leading=min(size, 7.8) + 2.4)
    weights = block.get("widths") or [1] * len(headers or rows[0])
    widths = [width * w / sum(weights) for w in weights]
    data = ([[_p(h, head) for h in headers]] if headers else []) + [[_p(x, cell) for x in row] for row in rows]
    grid = LongTable(data, colWidths=widths, repeatRows=1 if headers else 0, hAlign="LEFT", splitByRow=1)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), .35, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 4.2),
    ]
    first = 0
    if headers:
        style += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("LINEBELOW", (0, 0), (-1, 0), 1.2, GOLD)]
        first = 1
    style.append(("ROWBACKGROUNDS", (0, first), (-1, -1), [colors.white, STRIPE]))
    for r, c, tone in block.get("highlight", []):
        edge, soft = V.TONES[tone]
        style += [("BACKGROUND", (c, r + first), (c, r + first), soft), ("TEXTCOLOR", (c, r + first), (c, r + first), edge)]
    grid.setStyle(TableStyle(style))
    return [grid, Spacer(1, 3 * mm)]


def _callout(block, styles, width):
    edge, soft = V.TONES.get(block.get("tone", "info"), V.TONES["info"])
    title_style = ParagraphStyle("CT", parent=styles["callout_title"], textColor=edge)
    title = _markup(block.get("title", "")).upper()
    if block.get("badge"):
        title += f"  <font color='#{edge.hexval()[2:]}'>·</font>  <font color='#{V.INK.hexval()[2:]}'>{_markup(block['badge'])}</font>"
    texts = block["text"] if isinstance(block.get("text"), list) else [block.get("text", "")]
    content = [Paragraph(title, title_style)] + [_p(t, styles["callout"]) for t in texts if t]
    box = Table([[content]], colWidths=[width])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), soft), ("LINEBEFORE", (0, 0), (0, -1), 3.2, edge),
        ("LEFTPADDING", (0, 0), (-1, -1), 11), ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return [box, Spacer(1, 3.5 * mm)]


def _facts(block, styles, width):
    items = block["items"]
    cols = block.get("cols", 3)
    cells, row = [], []
    for label, value in items:
        row.append([_p(label.upper(), styles["fact_label"]), _p(value, styles["fact_value"])])
        if len(row) == cols:
            cells.append(row)
            row = []
    if row:
        cells.append(row + [""] * (cols - len(row)))
    grid = Table(cells, colWidths=[width / cols] * cols)
    grid.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .4, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fcfbf8")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [grid, Spacer(1, 3.5 * mm)]


def _block(block, styles, width):
    t = block.get("t")
    if t in ("p", "lead", "note", "h"):
        return [_p(block["text"], styles["body" if t == "p" else t])] if block.get("text") else []
    if t == "bullets":
        return [Paragraph(_markup(x), styles["bullet"], bulletText="•") for x in block["items"] if x]
    if t == "table":
        return _table(block, styles, width)
    if t == "callout":
        return _callout(block, styles, width)
    if t == "facts":
        return _facts(block, styles, width)
    if t == "flow":
        return [block["obj"], Spacer(1, block.get("after", 4) * mm)]
    if t == "space":
        return [Spacer(1, block.get("h", 4) * mm)]
    if t == "pagebreak":
        return [PageBreak()]
    if t == "keep":
        inner = []
        for b in block["blocks"]:
            inner += _block(b, styles, width)
        return [KeepTogether(inner)]
    raise ValueError(f"Unknown report block {t!r}")


def _title_page(cover, styles, width):
    story = [_p(cover.get("name") or "Your chart", styles["title_name"]), _p(cover.get("meta", ""), styles["title_meta"]),
             Spacer(1, 5 * mm)]
    if cover.get("tiles"):
        story += [V.Tiles(cover["tiles"]), Spacer(1, 6 * mm)]
    right = []
    if cover.get("summary_title"):
        right.append(_p(cover["summary_title"], ParagraphStyle("ST", parent=styles["h"], spaceBefore=0)))
    for text in cover.get("summary", []):
        right.append(_p(text, ParagraphStyle("SS", parent=styles["body"], fontSize=9.2, leading=14)))
    chart = cover.get("chart")
    if chart is not None:
        grid = Table([[chart, right]], colWidths=[chart.width + 8 * mm, width - chart.width - 8 * mm])
        grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        story.append(grid)
    else:
        story += right
    return story


def _story(title, subtitle, sections, width, styles):
    story = []
    cover = sections[0].get("cover") if sections else None
    if cover:
        story += _title_page(cover, styles, width)
        story += [NextPageTemplate("body"), PageBreak()]
        toc = TableOfContents(dotsMinLevel=0)
        toc.levelStyles = [styles["toc"]]
        story += [_p("Contents", styles["toc_head"]), toc, Spacer(1, 8 * mm)]
        sections = sections[1:]
        if cover.get("after_contents"):
            for b in cover["after_contents"]:
                story += _block(b, styles, width)
    number = 0
    for item in sections:
        if item.get("chapter"):
            number += 1
            if story and item.get("break", True):
                story.append(PageBreak())
            elif story:
                story.append(CondPageBreak(80 * mm))
            # spaceBefore is dropped at the top of a page, so a flowing chapter only gets the gap mid-page
            no_style = styles["chapter_no_flow"] if story and not item.get("break", True) else styles["chapter_no"]
            story += [_p(f"CHAPTER {number:02d}", no_style), ChapterMark(number, item["title"]),
                      _p(item["title"], styles["chapter"])]
            story.append(V.Rule(28 * mm))
            if item.get("kicker"):
                story.append(_p(item["kicker"], styles["kicker"]))
            else:
                story.append(Spacer(1, 4 * mm))
        else:
            story.append(_p(item["title"], styles["section"]))
            if item.get("kicker"):
                story.append(_p(item["kicker"], styles["body"]))
        for b in item.get("blocks") or []:
            story += _block(b, styles, width)
        for paragraph in item.get("paragraphs") or []:
            story += _block({"t": "p", "text": paragraph}, styles, width)
        if item.get("bullets"):
            story += _block({"t": "bullets", "items": item["bullets"]}, styles, width)
        if item.get("table"):
            story += _block({"t": "table", **item["table"]}, styles, width)
    story += [Spacer(1, 8 * mm), _p("Astrology is a symbolic tradition. This report does not guarantee events and is not "
                                    "medical, psychological, legal, financial or fertility advice. Calculations follow the "
                                    "birth details supplied; an inaccurate birth time mainly affects divisional charts and dates.",
                                    styles["disclaimer"])]
    return story


def _body_pdf(title, subtitle, sections):
    buffer = BytesIO()
    cover = sections[0].get("cover") if sections else None
    person = (cover or {}).get("name", "")
    doc = NuvoraDoc(buffer, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=22 * mm,
                    bottomMargin=20 * mm, title=title, author="Nuvora Jyotish", person=person, subtitle=subtitle)
    body = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")
    title_frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, PAGE_H - 92 * mm - 10 * mm - doc.bottomMargin, id="title")
    templates = [PageTemplate(id="body", frames=[body], onPage=_header_footer)]
    if cover:
        templates.insert(0, PageTemplate(id="title", frames=[title_frame], onPage=_title_band))
    doc.addPageTemplates(templates)
    styles = _styles()
    story = _story(title, subtitle, sections, doc.width, styles)
    if cover:
        doc.multiBuild(story)
    else:
        doc.build(story)
    return PdfReader(BytesIO(buffer.getvalue()))


def render_pdf(title, subtitle, sections) -> bytes:
    if not COVER.exists():
        raise RuntimeError("The Ganesha cover asset is missing")
    body = _body_pdf(title, subtitle, sections)
    writer = PdfWriter()
    writer.append(COVER)
    writer.append(body)
    writer.add_metadata({"/Title": title, "/Author": "Nuvora Jyotish", "/Subject": "Vedic Kundli report"})
    output = BytesIO()
    writer.write(output)
    return output.getvalue()
