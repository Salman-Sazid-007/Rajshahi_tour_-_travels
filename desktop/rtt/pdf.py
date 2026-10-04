"""A small self-contained PDF writer with embedded subset fonts.

Why not ReportLab? Because ReportLab cannot address glyphs by id, which is
exactly what shaped Bangla needs: HarfBuzz turns ``ট্র`` into a consonant plus a
reph glyph that has no direct Unicode code point. This writer therefore embeds
CIDFontType2 subsets (Identity-H) and prints the glyph ids HarfBuzz produced,
with ``TJ`` adjustments for the positions HarfBuzz calculated.

Only the standard library is required; ``uharfbuzz`` is used for shaping when
it is installed (see :mod:`rtt.text`).
"""

from __future__ import annotations

import datetime as _dt
import zlib
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from .text import FontStyle, Shaper, split_runs
from .ttf import TrueTypeFont

A4 = (595.28, 841.89)
A4_LANDSCAPE = (841.89, 595.28)

BLACK = (0.10, 0.10, 0.10)
WHITE = (1, 1, 1)


def _fmt(value: float) -> str:
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return text or "0"


def _pdf_color(color: Optional[Sequence[float]]) -> str:
    if not color:
        return ""
    r, g, b = (max(0.0, min(1.0, float(c))) for c in color[:3])
    return f"{_fmt(r)} {_fmt(g)} {_fmt(b)}"


class FontResource:
    """One embedded face (a script subset of a style such as *regular*)."""

    def __init__(self, key: str, face: TrueTypeFont, postscript_name: str) -> None:
        self.key = key
        self.face = face
        self.postscript_name = postscript_name
        self.resource_name = ""
        self.used_gids: List[int] = []
        self._seen: set = set()
        self.gid_text: Dict[int, str] = {}
        self.mapping: Dict[int, int] = {}
        self.advances: List[int] = []
        self.data: bytes = b""
        self.pdf_font_name = postscript_name
        self.object_numbers: Tuple[int, int, int, int, int] = (0, 0, 0, 0, 0)

    def note(self, gid: int) -> None:
        if gid not in self._seen:
            self._seen.add(gid)
            self.used_gids.append(gid)

    def note_text(self, gid: int, text: str) -> None:
        if text and gid not in self.gid_text:
            self.gid_text[gid] = text

    def finalise(self, subset_tag: str) -> None:
        self.data, self.mapping, self.advances = self.face.subset(self.used_gids)
        base = "".join(ch for ch in self.postscript_name if ch.isalnum()) or "Font"
        self.pdf_font_name = f"{subset_tag}+{base}"

    def width(self, gid: int) -> int:
        """Glyph width in 1/1000 em for the subset (PDF glyph space)."""
        face = self.face
        if gid in self.mapping:
            advance = self.advances[self.mapping[gid]]
        else:
            advance = face.advance_widths[gid] if gid < face.num_glyphs else 0
        return int(round(advance * 1000.0 / (face.units_per_em or 1000)))

    def font_bbox(self) -> Tuple[float, float, float, float]:
        face = self.face
        scale = 1000.0 / (face.units_per_em or 1000)
        return (
            face.x_min * scale,
            face.y_min * scale,
            face.x_max * scale,
            face.y_max * scale,
        )

    def ascent_descent(self) -> Tuple[float, float]:
        face = self.face
        scale = 1000.0 / (face.units_per_em or 1000)
        return face.ascender * scale, face.descender * scale


class Canvas:
    """Drawing surface for one page. Coordinates are top-left based, in points."""

    def __init__(self, doc: "PdfDocument", width: float, height: float) -> None:
        self.doc = doc
        self.width = width
        self.height = height
        self.ops: List[str] = []
        self.style_name = doc.default_style
        self.font_size = 10.0
        self.fill_color: Tuple[float, float, float] = BLACK
        self.stroke_color: Tuple[float, float, float] = BLACK
        self.line_width = 0.7
        self._emitting = True

    # ------------------------------------------------------------- state

    def set_font(self, style: str, size: float) -> "Canvas":
        self.style_name = style
        self.font_size = size
        return self

    def set_fill(self, color: Sequence[float]) -> "Canvas":
        self.fill_color = tuple(color[:3])
        return self

    def set_stroke(self, color: Sequence[float], width: float = 0.7) -> "Canvas":
        self.stroke_color = tuple(color[:3])
        self.line_width = width
        return self

    # ------------------------------------------------------------ graphics

    def _y(self, y: float) -> float:
        return self.height - y

    def line(
        self,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        color: Optional[Sequence[float]] = None,
        width: float = 0.7,
        dash: Optional[Sequence[float]] = None,
    ) -> None:
        if not self._emitting:
            return
        parts = []
        color = color or self.stroke_color
        parts.append(f"{_pdf_color(color)} RG {_fmt(width)} w")
        if dash:
            parts.append(f"[{' '.join(_fmt(d) for d in dash)}] 0 d")
        parts.append(f"{_fmt(x1)} {_fmt(self._y(y1))} m {_fmt(x2)} {_fmt(self._y(y2))} l S")
        if dash:
            parts.append("[] 0 d")
        self.ops.append(" ".join(parts))

    def rect(
        self,
        x: float,
        y: float,
        w: float,
        h: float,
        fill: Optional[Sequence[float]] = None,
        stroke: Optional[Sequence[float]] = None,
        width: float = 0.7,
        radius: float = 0,
        dash: Optional[Sequence[float]] = None,
    ) -> None:
        if not self._emitting:
            return
        if w <= 0 or h <= 0:
            return
        y1 = self._y(y)
        y2 = self._y(y + h)
        path = self._path(x, y1, w, h, radius)
        ops: List[str] = []
        if dash:
            ops.append(f"[{' '.join(_fmt(d) for d in dash)}] 0 d")
        if fill and stroke:
            ops.append(f"{_pdf_color(fill)} rg {_pdf_color(stroke)} RG {_fmt(width)} w {path} B")
        elif fill:
            ops.append(f"{_pdf_color(fill)} rg {path} f")
        elif stroke:
            ops.append(f"{_pdf_color(stroke)} RG {_fmt(width)} w {path} S")
        if dash:
            ops.append("[] 0 d")
        self.ops.append(" ".join(ops))

    def _path(self, x: float, y_bottom: float, w: float, h: float, radius: float) -> str:
        """Rounded-rectangle path built from lines and cubic beziers."""
        if radius <= 0:
            return f"{_fmt(x)} {_fmt(y_bottom)} {_fmt(w)} {_fmt(h)} re"
        r = min(radius, w / 2, h / 2)
        k = r * 0.5523
        x2, y2 = x + w, y_bottom + h
        return (
            f"{_fmt(x + r)} {_fmt(y_bottom)} m "
            f"{_fmt(x2 - r)} {_fmt(y_bottom)} l "
            f"{_fmt(x2 - r + k)} {_fmt(y_bottom)} {_fmt(x2)} {_fmt(y_bottom + r - k)} {_fmt(x2)} {_fmt(y_bottom + r)} c "
            f"{_fmt(x2)} {_fmt(y2 - r)} l "
            f"{_fmt(x2)} {_fmt(y2 - r + k)} {_fmt(x2 - r + k)} {_fmt(y2)} {_fmt(x2 - r)} {_fmt(y2)} c "
            f"{_fmt(x + r)} {_fmt(y2)} l "
            f"{_fmt(x + r - k)} {_fmt(y2)} {_fmt(x)} {_fmt(y2 - r + k)} {_fmt(x)} {_fmt(y2 - r)} c "
            f"{_fmt(x)} {_fmt(y_bottom + r)} l "
            f"{_fmt(x)} {_fmt(y_bottom + r - k)} {_fmt(x + r - k)} {_fmt(y_bottom)} {_fmt(x + r)} {_fmt(y_bottom)} c "
            f"h"
        )

    # ---------------------------------------------------------------- text

    def text_width(self, text: str, style: Optional[str] = None, size: Optional[float] = None) -> float:
        style_name = style or self.style_name
        size = size or self.font_size
        style_obj = self.doc.styles[style_name]
        units = self.doc.shaper.measure(text, style_obj)
        return units * size / 1000.0

    def text(
        self,
        x: float,
        y: float,
        text: str,
        style: Optional[str] = None,
        size: Optional[float] = None,
        color: Optional[Sequence[float]] = None,
        align: str = "left",
        max_width: Optional[float] = None,
    ) -> float:
        """Draw one line of text with its baseline at ``y`` (top-left coords).

        Returns the width of the drawn text in points.
        """
        style_name = style or self.style_name
        size = size or self.font_size
        style_obj = self.doc.styles[style_name]
        text = self.doc.sanitise(text)
        if not text:
            return 0.0

        runs = self.doc.shape_text(text, style_obj)
        total_units = 0.0
        for face_key, glyphs, _source in runs:
            resource = self.doc.resources[face_key]
            scale = 1000.0 / (resource.face.units_per_em or 1000)
            total_units += sum(g.x_advance for g in glyphs) * scale
        width = total_units * size / 1000.0

        if max_width is not None and width > max_width:
            # Horizontal squeeze: rare, but it keeps tables from overflowing.
            scale_factor = max_width / width
        else:
            scale_factor = 1.0

        if align == "center":
            x -= width / 2
        elif align == "right":
            x -= width

        self._draw_runs(x, y, runs, style_name, size, color or self.fill_color, scale_factor)
        return width

    def _draw_runs(
        self,
        x: float,
        y: float,
        runs: Sequence[Tuple[str, List]],
        style_name: str,
        size: float,
        color: Sequence[float],
        scale_factor: float,
    ) -> None:
        if not self._emitting:
            # Collect-only pass: still register glyphs so the subset is complete.
            for face_key, glyphs, _source in runs:
                resource = self.doc.resources[face_key]
                for glyph in glyphs:
                    resource.note(glyph.gid)
            return

        cursor = x
        for face_key, glyphs, source in runs:
            resource = self.doc.resources[face_key]
            face = resource.face
            scale = 1000.0 / (face.units_per_em or 1000)
            # Remember which source text each glyph came from (ToUnicode map).
            # HarfBuzz groups a base consonant and its vowel sign into one
            # cluster, so the whole cluster is credited to its first glyph.
            clusters = [g.cluster for g in glyphs]
            for index, glyph in enumerate(glyphs):
                start = clusters[index]
                if index and start == clusters[index - 1]:
                    pass  # later glyph of a cluster: no separate mapping
                else:
                    end = len(source)
                    for later in clusters[index + 1 :]:
                        if later > start:
                            end = later
                            break
                    if 0 <= start < end <= len(source):
                        resource.note_text(glyph.gid, source[start:end])
                resource.note(glyph.gid)
            if not glyphs:
                continue
            used = self._emit_glyphs(
                resource, glyphs, cursor, y, size, color, scale, scale_factor
            )
            cursor += used * size / 1000.0

    def _emit_glyphs(
        self,
        resource: FontResource,
        glyphs: Sequence,
        x: float,
        y: float,
        size: float,
        color: Sequence[float],
        scale: float,
        squeeze: float,
    ) -> float:
        """Emit a shaped run as TJ arrays; returns the advance in 1/1000 em."""
        pen = 0.0  # PDF pen position, 1/1000 em from the start of the run
        logical = 0.0  # HarfBuzz pen position, font units
        items: List[str] = []
        segments: List[Tuple[float, List[str]]] = []
        current_rise = 0.0
        hexbuf: List[str] = []

        def flush_hex() -> None:
            if hexbuf:
                items.append("<" + "".join(hexbuf) + ">")
                hexbuf.clear()

        def flush_segment(rise: float) -> None:
            flush_hex()
            if items:
                segments.append((rise, list(items)))
                items.clear()

        for glyph in glyphs:
            gid = resource.mapping.get(glyph.gid, 0)
            width_units = resource.width(glyph.gid)
            # HarfBuzz asks for the glyph to be drawn here (1/1000 em, text space).
            desired = (logical + glyph.x_offset) * scale
            delta = pen - desired
            if abs(delta) > 1e-6:
                flush_hex()
                items.append(_fmt(delta))
                pen = desired
            # Text rise is expressed in points (unscaled text space units), so the
            # font-unit offset is converted through the current font size.
            rise = -glyph.y_offset * scale * size / 1000.0
            if abs(rise - current_rise) > 0.0005:
                flush_segment(current_rise)
                current_rise = rise
            hexbuf.append(f"{gid:04X}")
            pen += width_units
            logical += glyph.x_advance
        flush_segment(current_rise)

        if not segments:
            return logical * scale

        ops = [
            "BT",
            f"/{resource.resource_name} {_fmt(size)} Tf",
            f"{_pdf_color(color)} rg",
            f"{_fmt(squeeze)} 0 0 1 {_fmt(x)} {_fmt(self._y(y))} Tm",
        ]
        previous_rise = 0.0
        for rise, chunk in segments:
            if abs(rise - previous_rise) > 0.01:
                ops.append(f"{_fmt(rise)} Ts")
                previous_rise = rise
            ops.append("[" + " ".join(chunk) + "] TJ")
        if previous_rise:
            ops.append("0 Ts")
        ops.append("ET")
        self.ops.append(" ".join(ops))
        return logical * scale

    # ------------------------------------------------------------- helpers

    def paragraph(
        self,
        x: float,
        y: float,
        text: str,
        max_width: float,
        leading: Optional[float] = None,
        style: Optional[str] = None,
        size: Optional[float] = None,
        color: Optional[Sequence[float]] = None,
        align: str = "left",
    ) -> float:
        """Draw wrapped text; returns the y coordinate below the last line."""
        size = size or self.font_size
        leading = leading or size * 1.35
        style_obj = self.doc.styles[style or self.style_name]
        line_y = y
        for line in self.doc.shaper.wrap(text, style_obj, size, max_width):
            self.text(x, line_y, line, style=style, size=size, color=color, align=align, max_width=max_width)
            line_y += leading
        return line_y


class PdfDocument:
    """Builds a PDF file from a drawing callback (rendered twice, see below)."""

    def __init__(
        self,
        faces: Dict[str, TrueTypeFont],
        styles: Dict[str, FontStyle],
        page_size: Tuple[float, float] = A4,
        title: str = "",
        author: str = "",
        producer: str = "Rajshahi Tours & Travels Desktop",
    ) -> None:
        self.faces = faces
        self.styles = styles
        self.shaper = Shaper(faces)
        self.page_size = page_size
        self.title = title
        self.author = author
        self.producer = producer
        self.default_style = next(iter(styles))
        self.pages: List[Canvas] = []
        self.resources: Dict[str, FontResource] = {
            key: FontResource(key, face, self._postscript_name(key, face))
            for key, face in faces.items()
        }
        self._collecting = False

    @staticmethod
    def _postscript_name(key: str, face: TrueTypeFont) -> str:
        name = face.label or key
        stem = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
        stem = stem[:-4] if stem.lower().endswith(".ttf") else stem
        return "".join(ch if ch.isalnum() else "-" for ch in stem) or "Font"

    # ------------------------------------------------------------- shaping

    def sanitise(self, text: object) -> str:
        """Replace characters that are missing from the embedded subsets."""
        if text is None:
            return ""
        text = str(text)
        if not text:
            return ""
        replacements = {
            "‘": "'", "’": "'", "“": '"', "”": '"',
            "–": "-", "—": "-", "…": "...", " ": " ",
            "|": "-", "%": " percent", "#": " no ",
        }
        out = []
        for ch in text:
            out.append(replacements.get(ch, ch))
        return "".join(out)

    def shape_text(self, text: str, style: FontStyle) -> List[Tuple[str, List, str]]:
        """Shape *text* into ``(face_key, glyphs, source_text)`` runs."""
        runs: List[Tuple[str, List, str]] = []
        for variant, chunk in split_runs(self.sanitise(text)):
            face_key = style.face_for(variant)
            runs.append((face_key, self.shaper.shape(chunk, face_key), chunk))
        return runs

    def new_page(self, size: Optional[Tuple[float, float]] = None) -> Canvas:
        width, height = size or self.page_size
        canvas = Canvas(self, width, height)
        if self._collecting:
            canvas._emitting = False
        self.pages.append(canvas)
        return canvas

    # -------------------------------------------------------------- output

    def render(self, draw: Callable[["PdfDocument"], None]) -> bytes:
        """Run *draw* twice: once to collect glyphs, once to emit the streams."""
        # Pass 1 - collect.
        self.pages = []
        for resource in self.resources.values():
            resource.used_gids = []
            resource.gid_text = {}
            resource._seen = set()
        self._collecting = True
        draw(self)
        self._collecting = False
        # Pass 2 - emit.
        for index, resource in enumerate(sorted(self.resources, key=lambda k: k)):
            res = self.resources[resource]
            res.resource_name = f"F{index + 1}"
            res.finalise(_subset_tag(index))
        self.pages = []
        draw(self)
        return self._write()

    def _write(self) -> bytes:
        objects: List[bytes] = []

        def add(body: bytes) -> int:
            objects.append(body)
            return len(objects)

        def add_stream(payload: bytes, extra: bytes) -> int:
            compressed = zlib.compress(payload, 9)
            body = b"<< " + extra + b" /Length " + str(len(compressed)).encode() + b" /Filter /FlateDecode >>\nstream\n" + compressed + b"\nendstream"
            return add(body)

        font_object_numbers: List[int] = []
        for key in sorted(self.resources):
            resource = self.resources[key]
            font_object_numbers.append(self._write_font(objects, add, add_stream, resource))

        page_ids: List[int] = []
        pages_id = add(b"")  # placeholder, filled below
        for canvas in self.pages:
            content = "\n".join(canvas.ops).encode("utf-8", "replace")
            content_id = add_stream(content, b"")
            font_ref = b" ".join(
                f"/{self.resources[key].resource_name} {num} 0 R".encode()
                for key, num in zip(sorted(self.resources), font_object_numbers)
            )
            resources = b"<< /Font << " + font_ref + b" >> /ProcSet [/PDF /Text] >>"
            page_id = add(
                b"<< /Type /Page /Parent "
                + str(pages_id).encode()
                + b" 0 R /MediaBox [0 0 "
                + f"{_fmt(canvas.width)} {_fmt(canvas.height)}".encode()
                + b"] /Resources "
                + resources
                + b" /Contents "
                + str(content_id).encode()
                + b" 0 R >>"
            )
            page_ids.append(page_id)

        kids = b" ".join(str(i).encode() + b" 0 R" for i in page_ids)
        objects[pages_id - 1] = (
            b"<< /Type /Pages /Count " + str(len(page_ids)).encode() + b" /Kids [" + kids + b"] >>"
        )

        info_id = self._write_info(objects, add)
        catalog_id = add(
            b"<< /Type /Catalog /Pages " + str(pages_id).encode() + b" 0 R >>"
        )

        out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for index, body in enumerate(objects, start=1):
            offsets.append(len(out))
            out += str(index).encode() + b" 0 obj\n" + body + b"\nendobj\n"
        xref_offset = len(out)
        out += b"xref\n0 " + str(len(objects) + 1).encode() + b"\n"
        out += b"0000000000 65535 f \n"
        for offset in offsets[1:]:
            out += f"{offset:010d} 00000 n \n".encode()
        out += (
            b"trailer\n<< /Size "
            + str(len(objects) + 1).encode()
            + b" /Root "
            + str(catalog_id).encode()
            + b" 0 R /Info "
            + str(info_id).encode()
            + b" 0 R >>\nstartxref\n"
            + str(xref_offset).encode()
            + b"\n%%EOF\n"
        )
        return bytes(out)

    def _write_info(self, objects: List[bytes], add) -> int:
        now = _dt.datetime.now().strftime("D:%Y%m%d%H%M%S")
        def pdf_str(value: str) -> bytes:
            escaped = value.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
            return b"(" + escaped.encode("utf-8", "replace") + b")"
        body = (
            b"<< /Title " + pdf_str(self.title)
            + b" /Author " + pdf_str(self.author)
            + b" /Creator " + pdf_str(self.producer)
            + b" /Producer " + pdf_str(self.producer)
            + b" /CreationDate (" + now.encode() + b") >>"
        )
        return add(body)

    def _write_font(self, objects: List[bytes], add, add_stream, resource: FontResource) -> int:
        face = resource.face
        scale = 1000.0 / (face.units_per_em or 1000)
        widths = [int(round(a * scale)) for a in resource.advances]
        w_array = b"[0 [" + b" ".join(str(w).encode() for w in widths) + b"]]"
        descriptor_id = add(b"")  # placeholder
        cidfont_id = add(
            b"<< /Type /Font /Subtype /CIDFontType2 /BaseFont /" + resource.pdf_font_name.encode()
            + b" /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>"
            + b" /FontDescriptor " + str(descriptor_id).encode() + b" 0 R"
            + b" /DW 1000 /W " + w_array
            + b" /CIDToGIDMap /Identity >>"
        )
        bbox = resource.font_bbox()
        ascent, descent = resource.ascent_descent()
        cap_height = face.cap_height or int(face.ascender * 0.7)
        flags = 4  # symbolic: we address glyphs by id, not by Unicode
        objects[descriptor_id - 1] = (
            b"<< /Type /FontDescriptor /FontName /" + resource.pdf_font_name.encode()
            + b" /Flags " + str(flags).encode()
            + b" /FontBBox [" + " ".join(_fmt(v) for v in bbox).encode() + b"]"
            + b" /ItalicAngle 0 /Ascent " + _fmt(ascent).encode()
            + b" /Descent " + _fmt(descent).encode()
            + b" /CapHeight " + _fmt(cap_height * scale).encode()
            + b" /StemV 80 /FontFile2 PLACEHOLDER 0 R >>"
        )
        file_id = add_stream(resource.data, b"")
        objects[descriptor_id - 1] = objects[descriptor_id - 1].replace(
            b"PLACEHOLDER", str(file_id).encode()
        )
        tounicode_id = self._write_tounicode(objects, add, add_stream, resource)
        type0_id = add(
            b"<< /Type /Font /Subtype /Type0 /BaseFont /" + resource.pdf_font_name.encode()
            + b" /Encoding /Identity-H /DescendantFonts [" + str(cidfont_id).encode() + b" 0 R]"
            + b" /ToUnicode " + str(tounicode_id).encode() + b" 0 R >>"
        )
        resource.object_numbers = (type0_id, cidfont_id, descriptor_id, file_id, tounicode_id)
        return type0_id

    def _write_tounicode(self, objects: List[bytes], add, add_stream, resource: FontResource) -> int:
        lines = [
            "/CIDInit /ProcSet findresource begin",
            "12 dict begin",
            "begincmap",
            "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
            "/CMapName /Adobe-Identity-UCS def",
            "/CMapType 2 def",
            "1 begincodespacerange",
            "<0000> <FFFF>",
            "endcodespacerange",
        ]
        entries = []
        for gid, text in sorted(resource.gid_text.items()):
            final = resource.mapping.get(gid)
            if final is None:
                continue
            hexed = "".join(f"{ord(ch):04X}" for ch in text if ch)
            if not hexed:
                continue
            entries.append(f"<{final:04X}> <{hexed}>")
        if entries:
            lines.append(f"{len(entries)} beginbfchar")
            lines.extend(entries)
            lines.append("endbfchar")
        lines += ["endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end"]
        return add_stream(("\n".join(lines) + "\n").encode("utf-8"), b"")


def _subset_tag(index: int) -> str:
    import random
    import string

    rng = random.Random(1000 + index)
    return "".join(rng.choice(string.ascii_uppercase) for _ in range(6))


_FONT_CACHE: Dict[str, TrueTypeFont] = {}


def get_face(path: str) -> TrueTypeFont:
    """Load a TTF once per process (parsing the tables is not free)."""
    import os

    key = os.path.abspath(path)
    stamp = os.path.getmtime(key) if os.path.exists(key) else 0
    cached = _FONT_CACHE.get(key)
    if cached is None or cached[0] != stamp:
        from .ttf import load_font

        _FONT_CACHE[key] = (stamp, load_font(key, os.path.basename(key)))
    return _FONT_CACHE[key][1]


def make_document(
    font_paths: Dict[str, str],
    styles: Dict[str, FontStyle],
    page_size: Tuple[float, float] = A4,
    title: str = "",
    author: str = "",
) -> PdfDocument:
    faces = {key: get_face(path) for key, path in font_paths.items()}
    return PdfDocument(faces, styles, page_size=page_size, title=title, author=author)
