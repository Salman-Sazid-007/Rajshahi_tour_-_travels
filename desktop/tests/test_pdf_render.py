"""Rendering checks: does the PDF really put glyphs where HarfBuzz asks?

These tests need PyMuPDF and Pillow (development only - the application itself
ships without them) and are skipped when they are missing. Two things are
checked on a page of Bangla/Latin text:

1. the glyph positions written into the content stream match HarfBuzz exactly;
2. the ink actually rasterised by MuPDF matches the outline bounding boxes of
   the embedded font.

Run with:  python tests/test_pdf_render.py
"""

from __future__ import annotations

import io
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import fitz  # PyMuPDF
    import uharfbuzz as hb
    from PIL import Image
    from fontTools.ttLib import TTFont
except Exception:  # pragma: no cover - optional dev dependencies
    fitz = None

from rtt import config, documents, pdf  # noqa: E402
from rtt.text import FontStyle, split_runs  # noqa: E402

TEXT = "Tours - ট্যুর বুকিংয়ের মেমো: শর্তাবলি ১২,৫০০"
X, Y, SIZE, DPI = 90.0, 220.0, 22.0, 300


@unittest.skipIf(fitz is None, "PyMuPDF/Pillow/fontTools/uharfbuzz are needed for render checks")
class RenderTests(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["RTT_DATA_DIR"] = tempfile.mkdtemp(prefix="rtt-render-")
        self.settings = config.load_settings()

    def _render(self, text: str) -> bytes:
        doc = pdf.make_document(config.font_paths(), documents.STYLES)
        return doc.render(lambda d: d.new_page().text(X, Y, text, size=SIZE))

    def test_glyph_positions_match_harfbuzz(self) -> None:
        data = self._render(TEXT)
        document = pdf.make_document(config.font_paths(), documents.STYLES)
        document.render(lambda d: d.new_page().text(X, Y, TEXT, size=SIZE))

        expected: list = []
        cursor = X
        for variant, chunk in split_runs(TEXT):
            face_key = documents.STYLES["regular"].face_for(variant)
            face = document.faces[face_key]
            upem = face.units_per_em
            hb_font = hb.Font(hb.Face(face.data))
            hb_font.scale = (upem, upem)
            buffer = hb.Buffer()
            buffer.add_str(chunk)
            buffer.guess_segment_properties()
            hb.shape(hb_font, buffer)
            logical = 0.0
            for info, position in zip(buffer.glyph_infos, buffer.glyph_positions):
                expected.append((
                    face_key, info.codepoint,
                    cursor + (logical + position.x_offset) * SIZE / upem,
                    Y + position.y_offset * SIZE / upem,
                ))
                logical += position.x_advance
            cursor += logical * SIZE / upem

        page = fitz.open(stream=data)[0]
        raw = page.read_contents().decode("latin-1")
        height = page.rect.height
        widths = {
            f"F{index + 1}": [int(v) for v in array.split()]
            for index, array in enumerate(
                re.findall(rb"/DW 1000 /W \[0 \[([0-9 ]+)\]\]", data)
            )
        }
        faces = sorted(config.font_paths())
        placed: list = []
        for block in re.finditer(
            r"BT /(\w+) ([\d.]+) Tf [\d. ]+rg ([\d.]+) 0 0 1 ([-\d.]+) ([-\d.]+) Tm(.*?)ET",
            raw, re.S,
        ):
            name, size, squeeze, tx, ty, body = block.groups()
            size, squeeze, pen_x, pen_y = float(size), float(squeeze), float(tx), float(ty)
            rise = 0.0
            for match in re.finditer(
                r"<([0-9A-F]+)>|(-?\d+(?:\.\d+)?) Ts|\[([^\]]*)\] TJ", body
            ):
                hexs, rise_value, array = match.groups()
                if rise_value:
                    rise = float(rise_value)
                tokens = [f"<{hexs}>"] if hexs else re.findall(
                    r"<[0-9A-F]+>|-?\d+(?:\.\d+)?", array or ""
                )
                for token in tokens:
                    if token.startswith("<"):
                        encoded = token[1:-1]
                        for index in range(0, len(encoded), 4):
                            gid = int(encoded[index:index + 4], 16)
                            placed.append((name, gid, pen_x, pen_y + rise))
                            pen_x += widths[name][gid] / 1000.0 * size * squeeze
                    else:
                        # TJ numbers shift the next glyph by the negative of
                        # their value; parse signed numbers even when they look
                        # like hex digits (for example, `80`).
                        pen_x -= float(token) / 1000.0 * size * squeeze

        self.assertEqual(len(placed), len(expected))
        for (name, gid, px, py), (face_key, source_gid, ex, ey) in zip(placed, expected):
            resource = document.resources[face_key]
            self.assertEqual(resource.mapping.get(source_gid, -1), gid)
            self.assertAlmostEqual(px, ex, delta=0.02)
            self.assertAlmostEqual(py, height - ey, delta=0.02)

    def test_complete_bangla_tour_memo_renders_with_unicode_font(self) -> None:
        booking = {
            "booking_no": "CBT-RTT-2026-0001",
            "name": "মুহাম্মদ সুমন",
            "phone": "01782250709",
            "tour_name": "কক্সবাজার ট্যুর",
            "tour_date": "2026-12-12",
            "booking_date": "2026-10-06",
            "seat": "A-1",
            "status": "Confirmed",
            "total": 12500,
            "advance": 5000,
            "due": 7500,
        }
        settings = config.load_settings()
        self.assertEqual(settings["address"], "Vodra Mor, Rajshahi")
        self.assertEqual(len(settings["terms"]), 6)
        data = documents.booking_receipt(booking, settings)
        self.assertIn(b"LiAbuJMAkkasUnicode", data)
        page = fitz.open(stream=data)[0]
        image = Image.open(io.BytesIO(page.get_pixmap(dpi=DPI).tobytes("png"))).convert("L")
        self.assertIsNotNone(image.point(lambda value: 255 if value < 250 else 0).getbbox())

    def test_ink_matches_outline_boxes(self) -> None:
        data = self._render(TEXT)
        page = fitz.open(stream=data)[0]
        image = Image.open(io.BytesIO(page.get_pixmap(dpi=DPI).tobytes("png"))).convert("L")
        ink = image.point(lambda value: 255 if value < 250 else 0).getbbox()
        self.assertIsNotNone(ink)
        rendered = [value * 72.0 / DPI for value in ink]

        # Expected ink box from the font outlines plus HarfBuzz placement.
        document = pdf.make_document(config.font_paths(), documents.STYLES)
        cursor = X
        box = [1e9, 1e9, -1e9, -1e9]
        for variant, chunk in split_runs(TEXT):
            face_key = documents.STYLES["regular"].face_for(variant)
            face = document.faces[face_key]
            upem = face.units_per_em
            hb_font = hb.Font(hb.Face(face.data))
            hb_font.scale = (upem, upem)
            buffer = hb.Buffer()
            buffer.add_str(chunk)
            buffer.guess_segment_properties()
            hb.shape(hb_font, buffer)
            font = TTFont(config.font_paths()[face_key])
            order = font.getGlyphOrder()
            logical = 0.0
            for info, position in zip(buffer.glyph_infos, buffer.glyph_positions):
                glyph = font["glyf"][order[info.codepoint]]
                if glyph.numberOfContours == 0:
                    logical += position.x_advance
                    continue
                gx = cursor + (logical + position.x_offset) * SIZE / upem
                gy = Y + position.y_offset * SIZE / upem
                box[0] = min(box[0], gx + glyph.xMin * SIZE / upem)
                box[1] = min(box[1], gy - glyph.yMax * SIZE / upem)
                box[2] = max(box[2], gx + glyph.xMax * SIZE / upem)
                box[3] = max(box[3], gy - glyph.yMin * SIZE / upem)
                logical += position.x_advance
            cursor += logical * SIZE / upem
        for index in range(4):
            self.assertAlmostEqual(rendered[index], box[index], delta=1.0)

    def test_orientation_of_glyph_offsets(self) -> None:
        """A forced offset must move the ink by exactly that many points."""
        from rtt.text import Glyph
        import rtt.text as textmod

        original = textmod.Shaper._shape_uncached

        def render(offset_x: int, offset_y: int) -> list:
            def patched(self, text, variant):
                return [
                    Glyph(g.gid, g.x_advance, g.y_advance, offset_x, offset_y, g.cluster)
                    for g in original(self, text, variant)
                ]

            textmod.Shaper._shape_uncached = patched
            try:
                data = self._render("Cox's Bazar")
            finally:
                textmod.Shaper._shape_uncached = original
            page = fitz.open(stream=data)[0]
            image = Image.open(io.BytesIO(page.get_pixmap(dpi=200).tobytes("png"))).convert("L")
            ink = image.point(lambda value: 255 if value < 250 else 0).getbbox()
            return [value * 72.0 / 200 for value in ink]

        base = render(0, 0)
        shifted = render(-300, 0)
        self.assertAlmostEqual(shifted[0] - base[0], -300 * SIZE / 1000, delta=0.6)
        lifted = render(0, -300)
        self.assertAlmostEqual(lifted[1] - base[1], -300 * SIZE / 1000, delta=0.6)


if __name__ == "__main__":
    unittest.main(verbosity=2)
