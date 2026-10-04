"""Text shaping for the PDF writer.

Bangla needs real complex-script shaping: vowel signs move around their
consonant, ``র`` becomes a reph, and consonant clusters join into conjunct
glyphs. HarfBuzz (through the ``uharfbuzz`` wheel) does that job; this module
wraps it and splits every string into same-script runs so a Latin font can
supply the digits and punctuation that the Bangla subset does not carry.

If HarfBuzz is not installed the module degrades to a plain character -> glyph
lookup. Latin text still comes out perfectly; Bangla simply loses its
reordering, so the app warns the user in that case.
"""

from __future__ import annotations

from typing import Dict, List, NamedTuple, Optional, Sequence, Tuple

from .ttf import TrueTypeFont

try:  # pragma: no cover - depends on the optional dependency
    import uharfbuzz as _hb
except Exception:  # pragma: no cover
    _hb = None

HARFBUZZ_AVAILABLE = _hb is not None

# Code points that belong to the Bangla font rather than the Latin one.
_BANGLA_EXTRA = frozenset(
    list(range(0x0951, 0x0955))
    + [0x0962, 0x0963, 0x0964, 0x0965, 0x20B9, 0x20F0, 0x200B, 0x200C, 0x200D]
)


def is_bangla(ch: str) -> bool:
    cp = ord(ch)
    return 0x0980 <= cp <= 0x09FF or cp in _BANGLA_EXTRA


def split_runs(text: str) -> List[Tuple[str, str]]:
    """Split *text* into ``(variant, chunk)`` runs of a single script."""
    runs: List[Tuple[str, str]] = []
    if not text:
        return runs
    current = "bangla" if is_bangla(text[0]) else "latin"
    bucket: List[str] = []
    for ch in text:
        variant = "bangla" if is_bangla(ch) else "latin"
        if variant != current:
            if bucket:
                runs.append((current, "".join(bucket)))
            bucket = []
            current = variant
        bucket.append(ch)
    if bucket:
        runs.append((current, "".join(bucket)))
    return runs


class Glyph(NamedTuple):
    gid: int
    x_advance: int
    y_advance: int
    x_offset: int
    y_offset: int
    cluster: int  # index into the shaped run


class Shaper:
    """Shapes text with a font family made of a Latin and a Bangla face."""

    def __init__(self, faces: Dict[str, TrueTypeFont]) -> None:
        self.faces = faces
        self._hb_faces: Dict[str, object] = {}
        self._hb_fonts: Dict[str, object] = {}
        self._cache: Dict[Tuple[str, str], List[Glyph]] = {}

    def face(self, variant: str) -> TrueTypeFont:
        try:
            return self.faces[variant]
        except KeyError:
            # Fall back to the other face rather than crashing mid-render.
            return next(iter(self.faces.values()))

    def _hb_font(self, variant: str):
        if variant in self._hb_fonts:
            return self._hb_fonts[variant]
        face = self.face(variant)
        if variant not in self._hb_faces:
            self._hb_faces[variant] = _hb.Face(face.data)
        hb_font = _hb.Font(self._hb_faces[variant])
        hb_font.scale = (face.units_per_em, face.units_per_em)
        self._hb_fonts[variant] = hb_font
        return hb_font

    def shape(self, text: str, variant: str) -> List[Glyph]:
        key = (variant, text)
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        glyphs = self._shape_uncached(text, variant)
        if len(self._cache) < 4000:
            self._cache[key] = glyphs
        return glyphs

    def _shape_uncached(self, text: str, variant: str) -> List[Glyph]:
        if not text:
            return []
        if _hb is None:
            return self._shape_simple(text, variant)
        face = self.face(variant)
        buffer = _hb.Buffer()
        buffer.add_str(text)
        buffer.guess_segment_properties()
        try:
            _hb.shape(self._hb_font(variant), buffer)
        except Exception:
            return self._shape_simple(text, variant)
        glyphs: List[Glyph] = []
        infos = list(buffer.glyph_infos)
        positions = list(buffer.glyph_positions)
        if len(infos) != len(positions):  # be defensive, the layout must not break
            return self._shape_simple(text, variant)
        for info, pos in zip(infos, positions):
            gid = info.codepoint
            if gid >= face.num_glyphs:
                gid = 0
            glyphs.append(
                Glyph(
                    gid=gid,
                    x_advance=pos.x_advance or face.advance_widths[gid],
                    y_advance=getattr(pos, "y_advance", 0) or 0,
                    x_offset=getattr(pos, "x_offset", 0) or 0,
                    y_offset=getattr(pos, "y_offset", 0) or 0,
                    cluster=info.cluster,
                )
            )
        return glyphs

    def _shape_simple(self, text: str, variant: str) -> List[Glyph]:
        """No-HarfBuzz fallback: one glyph per code point, no reordering."""
        face = self.face(variant)
        glyphs: List[Glyph] = []
        for index, ch in enumerate(text):
            gid = face.char_to_gid(ord(ch))
            glyphs.append(
                Glyph(
                    gid=gid,
                    x_advance=face.advance_widths[gid] if gid < face.num_glyphs else 0,
                    y_advance=0,
                    x_offset=0,
                    y_offset=0,
                    cluster=index,
                )
            )
        return glyphs

    # ------------------------------------------------------------- measuring

    def measure(self, text: str, style: "FontStyle") -> float:
        """Width of *text* in 1/1000 em units, summed over all script runs."""
        total = 0.0
        for variant, chunk in split_runs(text):
            face = style.face_for(variant)
            face_obj = self.face(face)
            scale = 1000.0 / (face_obj.units_per_em or 1000)
            for glyph in self.shape(chunk, face):
                total += glyph.x_advance * scale
        return total

    def wrap(self, text: str, style: "FontStyle", size: float, max_width: float) -> List[str]:
        return wrap_text(self, text, style, size, max_width)

    def truncate(self, text: str, style: "FontStyle", size: float, max_width: float) -> str:
        return truncate_text(self, text, style, size, max_width)

    def shaped_runs(self, text: str, style: "FontStyle") -> List[Tuple[str, List[Glyph]]]:
        runs: List[Tuple[str, List[Glyph]]] = []
        for variant, chunk in split_runs(text):
            runs.append((style.face_for(variant), self.shape(chunk, variant)))
        return runs


class FontStyle:
    """A logical style (regular / bold) backed by one face per script."""

    def __init__(self, name: str, faces: Dict[str, str]) -> None:
        self.name = name
        self.faces = faces  # variant -> face key

    def face_for(self, variant: str) -> str:
        return self.faces.get(variant) or next(iter(self.faces.values()))


def wrap_text(
    shaper: Shaper,
    text: str,
    style: FontStyle,
    size: float,
    max_width: float,
) -> List[str]:
    """Greedy word wrap. ``max_width`` and the result are in points."""
    limit_units = max_width * 1000.0 / size
    words = text.split(" ")
    if not words:
        return [""]
    lines: List[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if shaper.measure(candidate, style) <= limit_units or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def truncate_text(
    shaper: Shaper, text: str, style: FontStyle, size: float, max_width: float
) -> str:
    """Clip *text* with an ellipsis so that it fits ``max_width`` points."""
    if shaper.measure(text, style) * size / 1000.0 <= max_width:
        return text
    limit_units = max_width * 1000.0 / size
    while text and shaper.measure(text + "...", style) > limit_units:
        text = text[:-1]
    return text.rstrip() + "..."


def has_bangla(text: Optional[str]) -> bool:
    return bool(text) and any(is_bangla(ch) for ch in text)
