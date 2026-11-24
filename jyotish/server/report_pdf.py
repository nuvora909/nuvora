"""Instant PDF rendering with a fixed, correctly shaped Ganesha mantra cover."""
from __future__ import annotations

from html import escape
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.fonts import addMapping
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, LongTable, PageBreak, PageTemplate, Paragraph, Spacer, TableStyle

ROOT = Path(__file__).resolve().parent
COVER = ROOT / "static" / "ganesha-cover.pdf"
FONT_REGULAR = Path("C:/Windows/Fonts/segoeui.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/segoeuib.ttf")
if FONT_REGULAR.exists():
    pdfmetrics.registerFont(TTFont("Nuvora", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("Nuvora-Bold", str(FONT_BOLD)))
    addMapping("Nuvora", 0, 0, "Nuvora")
    addMapping("Nuvora", 1, 0, "Nuvora-Bold")
    BASE_FONT, BOLD_FONT = "Nuvora", "Nuvora-Bold"
else:
    BASE_FONT, BOLD_FONT = "Helvetica", "Helvetica-Bold"

MAROON = colors.HexColor("#382346")
GOLD = colors.HexColor("#c58b47")
INK = colors.HexColor("#302234")
MUTED = colors.HexColor("#6e5e68")
PAPER = colors.HexColor("#fffaf0")
LAVENDER = colors.HexColor("#f2edf7")


def _styles():
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("NuvoraTitle", parent=styles["Title"], fontName=BOLD_FONT, fontSize=23, leading=28,
                                textColor=MAROON, alignment=TA_LEFT, spaceAfter=2 * mm),
        "subtitle": ParagraphStyle("NuvoraSubtitle", parent=styles["Normal"], fontName=BASE_FONT, fontSize=9.5, leading=14,
                                   textColor=MUTED, alignment=TA_LEFT, spaceAfter=0),
        "heading": ParagraphStyle("NuvoraHeading", parent=styles["Heading2"], fontName=BOLD_FONT, fontSize=13.5, leading=18,
                                  textColor=MAROON, spaceBefore=6 * mm, spaceAfter=2.5 * mm, keepWithNext=True),
        "body": ParagraphStyle("NuvoraBody", parent=styles["BodyText"], fontName=BASE_FONT, fontSize=9.4, leading=14.2,
                               textColor=INK, spaceAfter=2 * mm, splitLongWords=1, allowWidows=0, allowOrphans=0),
        "bullet": ParagraphStyle("NuvoraBullet", parent=styles["BodyText"], fontName=BASE_FONT, fontSize=9, leading=13.4,
                                 leftIndent=5 * mm, firstLineIndent=-3 * mm, textColor=INK, spaceAfter=1.4 * mm,
                                 splitLongWords=1, allowWidows=0, allowOrphans=0),
        "cell": ParagraphStyle("NuvoraCell", parent=styles["BodyText"], fontName=BASE_FONT, fontSize=8, leading=10.6,
                               textColor=INK, splitLongWords=1, allowWidows=0, allowOrphans=0),
        "small": ParagraphStyle("NuvoraSmall", parent=styles["BodyText"], fontName=BASE_FONT, fontSize=7.8, leading=11,
                                textColor=MUTED, alignment=TA_LEFT),
    }


def _p(value, style):
    return Paragraph(escape(str(value if value is not None else "—")).replace("\n", "<br/>"), style)


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(.45)
    canvas.line(17 * mm, A4[1] - 14 * mm, A4[0] - 17 * mm, A4[1] - 14 * mm)
    canvas.setFont(BOLD_FONT, 7)
    canvas.setFillColor(MAROON)
    canvas.drawString(17 * mm, A4[1] - 10.5 * mm, "NUVORA  /  CHART REPORT")
    canvas.setFont(BASE_FONT, 7)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(A4[0] - 17 * mm, A4[1] - 10.5 * mm, str(doc.title)[:58])
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(.4)
    canvas.line(18 * mm, 14 * mm, A4[0] - 18 * mm, 14 * mm)
    canvas.setFont(BASE_FONT, 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9.5 * mm, "Nuvora Jyotish · Reflective guidance, not certainty or professional advice")
    canvas.drawRightString(A4[0] - 18 * mm, 9.5 * mm, f"Report page {doc.page}")
    canvas.restoreState()


def _body_pdf(title, subtitle, sections):
    buffer = BytesIO()
    doc = BaseDocTemplate(buffer, pagesize=A4, leftMargin=17 * mm, rightMargin=17 * mm,
                          topMargin=21 * mm, bottomMargin=20 * mm, title=title, author="Nuvora Jyotish")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="report")
    doc.addPageTemplates([PageTemplate(id="report", frames=[frame], onPage=_footer)])
    styles = _styles()
    title_block = Table([[_p(title, styles["title"])], [_p(subtitle, styles["subtitle"])]], colWidths=[doc.width])
    title_block.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LAVENDER), ("BOX", (0, 0), (-1, -1), .6, colors.HexColor("#d8cbe3")),
        ("LINEBEFORE", (0, 0), (0, -1), 3, GOLD), ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, 0), 11),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 1), ("TOPPADDING", (0, 1), (-1, 1), 1),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 11),
    ]))
    story = [title_block, Spacer(1, 4 * mm)]
    for item in sections:
        story.append(_p(item["title"], styles["heading"]))
        for paragraph in item.get("paragraphs", []):
            if paragraph:
                story.append(_p(paragraph, styles["body"]))
        for bullet in item.get("bullets", []):
            if bullet:
                story.append(_p("• " + str(bullet), styles["bullet"]))
        table = item.get("table")
        if table and table.get("rows"):
            size = max(7.2, float(table.get("font_size", 8)))
            cell_style = ParagraphStyle("SizedCell", parent=styles["cell"], fontSize=size, leading=size + 2.5)
            data = [[_p(x, cell_style) for x in table["headers"]]] + [[_p(x, cell_style) for x in row] for row in table["rows"]]
            total_width = doc.width
            widths = [total_width * w / sum(table["widths"]) for w in table.get("widths", [1] * len(table["headers"]))]
            grid = LongTable(data, colWidths=widths, repeatRows=1, hAlign="LEFT", splitByRow=1)
            grid.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), MAROON), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), BOLD_FONT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [PAPER, LAVENDER]),
                ("GRID", (0, 0), (-1, -1), .3, colors.HexColor("#ddd3e4")),
                ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            story.extend([Spacer(1, 1.5 * mm), grid])
    story.extend([Spacer(1, 6 * mm), _p("Astrology is a symbolic tradition. This report does not guarantee events and is not medical, psychological, legal, financial or fertility advice.", styles["small"])])
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
