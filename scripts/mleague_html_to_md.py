#!/usr/bin/env python3
"""Convert docs/MLeague_rule.html to frontend/src/rules/ja/m-league.md (Japanese preserved)."""
from __future__ import annotations

import re
import sys
from html import unescape
from pathlib import Path


def br_to_newline(s: str) -> str:
    return re.sub(r"<br\s*/?>", "  \n", s, flags=re.I)


def strip_tags_keep_text(html_fragment: str) -> str:
    s = br_to_newline(html_fragment)
    s = re.sub(r"<[^>]+>", "", s)
    s = unescape(s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"\n\t+\s*", "\n", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()


def split_li_with_tables(li_html: str) -> list[tuple[str, str]]:
    """Split <li>…</li> inner HTML into ('text', fragment) and ('table', table_inner) sequences."""
    out: list[tuple[str, str]] = []
    pos = 0
    while pos < len(li_html):
        tm = re.search(
            r'<table class="p-rule__table[^"]*">(.*?)</table>',
            li_html[pos:],
            re.S,
        )
        if not tm:
            tail = li_html[pos:]
            if tail.strip():
                out.append(("text", tail))
            break
        before = li_html[pos : pos + tm.start()]
        if before.strip():
            out.append(("text", before))
        out.append(("table", tm.group(1)))
        pos += tm.end()
    return out


def table_to_md(table_html: str) -> list[str]:
    rows = re.findall(r"<tr>(.*?)</tr>", table_html, re.S)
    if not rows:
        return []
    md_rows: list[list[str]] = []
    for row in rows:
        cells = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.S)
        md_rows.append([strip_tags_keep_text(c).replace("\n", " ") for c in cells])
    if not md_rows:
        return []
    out: list[str] = []
    header = md_rows[0]
    # skip empty header row if first row all empty
    while header and all(not c for c in header):
        md_rows.pop(0)
        if not md_rows:
            return []
        header = md_rows[0]
    out.append("| " + " | ".join(header) + " |")
    out.append("| " + " | ".join(["---"] * len(header)) + " |")
    for r in md_rows[1:]:
        r = list(r)
        while len(r) < len(header):
            r.append("")
        out.append("| " + " | ".join(r[: len(header)]) + " |")
    return out


def emit_block(block: str, lines: list[str]) -> None:
    pos = 0
    while pos < len(block):
        pm = re.search(r'<p class="p-rule__text">(.*?)</p>', block[pos:], re.S)
        om = re.search(r'<ol class="p-rule__text">(.*?)</ol>', block[pos:], re.S)
        tm = re.search(r'<table class="p-rule__table[^"]*">(.*?)</table>', block[pos:], re.S)
        candidates: list[tuple[str, int, re.Match[str]]] = []
        if pm:
            candidates.append(("p", pm.start(), pm))
        if om:
            candidates.append(("ol", om.start(), om))
        if tm:
            candidates.append(("table", tm.start(), tm))
        if not candidates:
            break
        typ, _, match = min(candidates, key=lambda x: x[1])
        abs_end = pos + match.end()
        if typ == "p":
            text = strip_tags_keep_text(match.group(1))
            if text:
                lines.append(text)
                lines.append("")
            pos = abs_end
        elif typ == "ol":
            lis = re.findall(r"<li>(.*?)</li>", match.group(1), re.S)
            for n, li in enumerate(lis, 1):
                if re.search(r'<table class="p-rule__table', li):
                    parts = split_li_with_tables(li)
                    first = True
                    for kind, payload in parts:
                        if kind == "text":
                            t = strip_tags_keep_text(payload)
                            t = re.sub(r"\s+", " ", t)
                            if t:
                                prefix = f"{n}. " if first else ""
                                lines.append(f"{prefix}{t}")
                                first = False
                        else:
                            if first and n > 1:
                                lines.append("")
                            lines.extend(table_to_md(payload))
                            first = False
                else:
                    t = strip_tags_keep_text(li)
                    t = re.sub(r"\s+", " ", t)
                    lines.append(f"{n}. {t}")
            lines.append("")
            pos = abs_end
        else:
            lines.extend(table_to_md(match.group(1)))
            lines.append("")
            pos = abs_end


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    html_path = root / "docs" / "MLeague_rule.html"
    out_path = root / "frontend" / "src" / "rules" / "ja" / "m-league.md"
    html = html_path.read_text(encoding="utf-8")

    lines: list[str] = []
    lines.append("# Mリーグの公式戦ルール")
    lines.append("")
    lines.append(
        "以下の本文は `docs/MLeague_rule.html` を **文言を改めず** Markdown 化したものです。"
    )
    lines.append(
        "最新の公式掲出・点数表・改正は **[M.League 公式サイト](https://m-league.jp/about/)** を優先してください。"
    )
    lines.append("")

    parts = html.split('<section class="p-rule__group">')
    for part in parts[1:]:
        group_html, _, _rest = part.partition("</section>")
        if not group_html.strip():
            continue
        ch_m = re.search(
            r'<h3 class="c-title">\s*<span>([^<]+)</span>\s*</h3>',
            group_html,
        )
        if not ch_m:
            continue
        chapter = strip_tags_keep_text(ch_m.group(1))
        lines.append(f"## {chapter}")
        lines.append("")

        div_m = re.search(r'<div class="p-rule__contents">(.*)', group_html, re.S)
        body = div_m.group(1) if div_m else group_html
        body = re.sub(r"</div>\s*</section>.*", "", body, flags=re.S)

        parts = re.split(r'(<h4 class="c-title -dot">.*?</h4>)', body, flags=re.S)
        i = 0
        while i < len(parts):
            part = parts[i]
            if part.startswith('<h4 class="c-title -dot">'):
                art_title = strip_tags_keep_text(part)
                lines.append(f"### {art_title}")
                lines.append("")
                i += 1
                if i >= len(parts):
                    break
                block = parts[i]
                i += 1
                emit_block(block, lines)
            else:
                i += 1
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("〒105-0022 東京都港区海岸2丁目1番16号  ")
    lines.append("")
    lines.append("**一般社団法人Mリーグ機構**")

    out_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
