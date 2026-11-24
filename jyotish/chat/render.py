"""Model text -> safe HTML with verified/contradicted highlights.

Raw HTML from the model is never trusted: fact tags are swapped for inert tokens, the rest is rendered by
markdown-it with HTML disabled (so any other tags are escaped), then tokens become our own <span>s.
"""
from __future__ import annotations

import html
import re

from markdown_it import MarkdownIt

from .facts import Report

_md = MarkdownIt("commonmark", {"html": False, "linkify": False, "typographer": False}).enable("table")
_md.validateLink = lambda url: url.startswith(("https://", "http://"))   # no javascript:/data: links

CLASS = {"verified": "ok", "contradicted": "bad", "unverifiable": "unk"}


def render(text: str, report: Report) -> str:
    spans = sorted((c for c in report.checks if c.span), key=lambda c: c.span[0])
    pieces, last, inner = [], 0, {}
    for c in spans:
        s, e = c.span
        if s < last:            # overlapping scan hit; skip highlighting (still counted)
            continue
        pieces.append(text[last:s])
        token = f"QFACT{c.id}Q"
        inner[token] = c
        pieces.append(token)
        last = e
    pieces.append(text[last:])
    body = _md.render("".join(pieces))
    for token, c in inner.items():
        label = c.text if c.source == "tag" else c.text
        inner_html = _md.renderInline(label)
        cls = CLASS[c.verdict]
        tip = {"verified": "Verified against the chart", "contradicted": "Does not match the chart",
               "unverifiable": "Not checkable by the engine"}[c.verdict]
        if c.engine:
            tip += f" — engine: {c.engine}"
        span = (f'<span class="fact {cls}" data-fact="{c.id}" title="{html.escape(tip, quote=True)}">{inner_html}</span>')
        if c.verdict == "contradicted":
            span += f'<span class="fact-fix">engine: {html.escape(c.engine)}</span>'
        body = body.replace(token, span)
    # strip any stray, unmatched fact tags that markdown-it escaped (e.g. unclosed <fact ...>)
    body = re.sub(r"&lt;/?fact\b.*?&gt;", "", body)
    return body


def strip_facts(text: str) -> str:
    """Plain text (for history sent back to the model, exports)."""
    return re.sub(r"</?fact\b[^>]*>", "", text)
