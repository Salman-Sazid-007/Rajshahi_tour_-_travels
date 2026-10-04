"""Minimal TrueType parser / subsetter used to embed fonts inside PDF files.

The PDF writer needs only a small part of the OpenType world:

* glyph outlines  (``glyf`` + ``loca``)
* horizontal metrics (``head``, ``hhea``, ``hmtx``, ``maxp``)
* enough understanding of composite glyphs to renumber their references

Everything else (layout tables such as GSUB/GPOS, the cmap, hinting
programs) is dropped: the text has already been shaped by HarfBuzz before it
reaches the PDF, so those tables would only bloat the file.

The subsetter keeps the glyph order stable and returns the mapping the PDF
writer needs to translate HarfBuzz glyph ids into subset glyph ids.
"""

from __future__ import annotations

import struct
from typing import Dict, Iterable, List, Sequence, Set, Tuple

# Tables that survive subsetting. Everything else is dropped on purpose.
KEEP_TABLES = ("OS/2", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name")

_UINT32 = struct.Struct(">I")
_UINT16 = struct.Struct(">H")
_INT16 = struct.Struct(">h")

# Composite glyph flags (glyf table).
_ARG_1_AND_2_ARE_WORDS = 0x0001
_ARGS_ARE_XY_VALUES = 0x0002
_WE_HAVE_A_SCALE = 0x0008
_MORE_COMPONENTS = 0x0020
_WE_HAVE_AN_X_AND_Y_SCALE = 0x0040
_WE_HAVE_A_TWO_BY_TWO = 0x0080
_WE_HAVE_INSTRUCTIONS = 0x0100


class TtfError(Exception):
    """Raised when a font file cannot be read or subsetted."""


def _checksum(data: bytes) -> int:
    data = data + b"\0" * (-len(data) % 4)
    total = 0
    for i in range(0, len(data), 4):
        total += _UINT32.unpack_from(data, i)[0]
    return total & 0xFFFFFFFF


class TrueTypeFont:
    """A read-only TrueType (glyf outlines) font with a subsetting helper."""

    def __init__(self, data: bytes, label: str = "") -> None:
        if len(data) < 12:
            raise TtfError("file is too small to be a TrueType font")
        tag = data[:4]
        if tag == b"ttcf":
            raise TtfError("TrueType collections are not supported")
        if tag not in (b"\x00\x01\x00\x00", b"true", b"typ1"):
            raise TtfError("not a TrueType outline font (missing glyf table?)")
        self.data = data
        self.label = label
        self.tables: Dict[str, Tuple[int, int]] = {}
        count = _UINT16.unpack_from(data, 4)[0]
        for i in range(count):
            off = 12 + 16 * i
            if off + 16 > len(data):
                raise TtfError("truncated table directory")
            name = data[off : off + 4].decode("latin-1")
            toff, tlen = struct.unpack_from(">II", data, off + 8)
            self.tables[name] = (toff, tlen)

        for required in ("head", "hhea", "maxp", "hmtx", "loca", "glyf"):
            if required not in self.tables:
                raise TtfError(f"font is missing the required '{required}' table")

        head = self.table("head")
        self.units_per_em = _UINT16.unpack_from(head, 18)[0] or 1000
        self.index_to_loc_format = _INT16.unpack_from(head, 50)[0]
        self.x_min, self.y_min, self.x_max, self.y_max = struct.unpack_from(">hhhh", head, 36)

        hhea = self.table("hhea")
        self.number_of_h_metrics = _UINT16.unpack_from(hhea, 34)[0]
        self.ascender = _INT16.unpack_from(hhea, 4)[0]
        self.descender = _INT16.unpack_from(hhea, 6)[0]
        self.line_gap = _INT16.unpack_from(hhea, 8)[0]

        os2 = self.table("OS/2") if "OS/2" in self.tables else b""
        self.cap_height = _INT16.unpack_from(os2, 88)[0] if len(os2) >= 90 else 0
        self.italic_angle = 0

        self.num_glyphs = _UINT16.unpack_from(self.table("maxp"), 4)[0]
        self.advance_widths, self.left_side_bearings = self._read_hmtx()
        self._loca = self._read_loca()
        self._cmap: Dict[int, int] | None = None

    # ------------------------------------------------------------------ raw

    def table(self, name: str) -> bytes:
        if name not in self.tables:
            return b""
        offset, length = self.tables[name]
        end = offset + length
        if end > len(self.data):
            end = len(self.data)
        return self.data[offset:end]

    def _read_hmtx(self) -> Tuple[List[int], List[int]]:
        raw = self.table("hmtx")
        n = self.number_of_h_metrics
        widths: List[int] = []
        lsbs: List[int] = []
        for i in range(self.num_glyphs):
            pos = i * 4
            if i < n:
                if pos + 4 > len(raw):
                    widths.append(0)
                    lsbs.append(0)
                    continue
                advance, lsb = struct.unpack_from(">Hh", raw, pos)
                widths.append(advance)
                lsbs.append(lsb)
            else:
                pos = n * 4 + (i - n) * 2
                if pos + 2 > len(raw):
                    lsbs.append(0)
                else:
                    lsbs.append(_INT16.unpack_from(raw, pos)[0])
                widths.append(widths[-1] if widths else 0)
        return widths, lsbs

    def _read_loca(self) -> List[int]:
        raw = self.table("loca")
        count = self.num_glyphs + 1
        if self.index_to_loc_format == 0:
            values = [v * 2 for v in struct.unpack_from(f">{count}H", raw, 0)] if len(raw) >= count * 2 else []
        else:
            values = list(struct.unpack_from(f">{count}I", raw, 0)) if len(raw) >= count * 4 else []
        if not values:
            values = [0] * count
        return values

    # -------------------------------------------------------------- glyphs

    def glyph_data(self, gid: int) -> bytes:
        if gid < 0 or gid >= self.num_glyphs:
            return b""
        start = self._loca[gid]
        end = self._loca[gid + 1] if gid + 1 < len(self._loca) else start
        if end < start:
            end = start
        return self.table("glyf")[start:end]

    def char_to_gid(self, codepoint: int) -> int:
        """Look a character up in the font cmap (fallback path, no HarfBuzz)."""
        if self._cmap is None:
            self._cmap = _parse_cmap(self.table("cmap"))
        return self._cmap.get(codepoint, 0)

    def composite_components(self, gid: int) -> List[int]:
        """Glyph ids referenced by a composite glyph (``[]`` for simple ones)."""
        data = self.glyph_data(gid)
        if len(data) < 10:
            return []
        number_of_contours = _INT16.unpack_from(data, 0)[0]
        if number_of_contours >= 0:
            return []
        pos = 10
        components: List[int] = []
        while pos + 4 <= len(data):
            flags, child = struct.unpack_from(">HH", data, pos)
            pos += 4
            if flags & _ARG_1_AND_2_ARE_WORDS:
                pos += 4
            else:
                pos += 2
            if flags & _WE_HAVE_A_SCALE:
                pos += 2
            elif flags & _WE_HAVE_AN_X_AND_Y_SCALE:
                pos += 4
            elif flags & _WE_HAVE_A_TWO_BY_TWO:
                pos += 8
            components.append(child)
            if not flags & _MORE_COMPONENTS:
                break
        return components

    def _renumber_composite(self, data: bytes, mapping: Dict[int, int]) -> bytes:
        if len(data) < 10 or _INT16.unpack_from(data, 0)[0] >= 0:
            return data
        out = bytearray(data)
        pos = 10
        while pos + 4 <= len(out):
            flags, child = struct.unpack_from(">HH", out, pos)
            out[pos + 2 : pos + 4] = _UINT16.pack(mapping.get(child, 0))
            pos += 4
            if flags & _ARG_1_AND_2_ARE_WORDS:
                pos += 4
            else:
                pos += 2
            if flags & _WE_HAVE_A_SCALE:
                pos += 2
            elif flags & _WE_HAVE_AN_X_AND_Y_SCALE:
                pos += 4
            elif flags & _WE_HAVE_A_TWO_BY_TWO:
                pos += 8
            if not flags & _MORE_COMPONENTS:
                break
        return bytes(out)

    # ----------------------------------------------------------- subsetting

    def closure(self, gids: Iterable[int]) -> List[int]:
        """Used glyphs plus every glyph their composites depend on, in order."""
        ordered: List[int] = []
        seen: Set[int] = set()
        stack = [g for g in gids if 0 <= g < self.num_glyphs]
        while stack:
            gid = stack.pop(0)
            if gid in seen:
                continue
            seen.add(gid)
            ordered.append(gid)
            for child in self.composite_components(gid):
                if child not in seen:
                    stack.append(child)
        return [g for g in ordered if g != 0] or [0]

    def subset(self, gids: Sequence[int]) -> Tuple[bytes, Dict[int, int], List[int]]:
        """Return ``(font_bytes, old_gid -> new_gid, advances_in_font_units)``."""
        wanted = self.closure([g for g in gids if 0 <= g < self.num_glyphs])
        if 0 not in wanted:
            wanted = [0] + list(wanted)
        else:
            wanted = [0] + [g for g in wanted if g != 0]
        mapping = {old: new for new, old in enumerate(wanted)}

        glyph_bytes: List[bytes] = []
        for old in wanted:
            raw = self.glyph_data(old)
            if raw and _INT16.unpack_from(raw, 0)[0] < 0:
                raw = self._renumber_composite(raw, mapping)
            # Glyphs must start on an even byte so the short loca format works.
            if len(raw) % 2:
                raw += b"\0"
            glyph_bytes.append(raw)

        # Build loca (long format when the outline data is large).
        total = sum(len(g) for g in glyph_bytes)
        use_long = total > 130000
        loca = [0]
        for raw in glyph_bytes:
            loca.append(loca[-1] + len(raw))
        glyphs_blob = b"".join(glyph_bytes)

        if use_long:
            loca_blob = b"".join(_UINT32.pack(v) for v in loca)
        else:
            loca_blob = b"".join(_UINT16.pack(v // 2) for v in loca)

        # head: indexToLocFormat follows the loca flavour we just wrote.
        head = bytearray(self.table("head"))
        struct.pack_into(">h", head, 50, 1 if use_long else 0)
        struct.pack_into(">I", head, 8, 0)  # checkSumAdjustment patched later

        maxp = bytearray(self.table("maxp"))
        struct.pack_into(">H", maxp, 4, len(wanted))

        hhea = bytearray(self.table("hhea"))
        struct.pack_into(">H", hhea, 34, len(wanted))

        hmtx = bytearray()
        for old in wanted:
            hmtx += struct.pack(">Hh", self.advance_widths[old], self.left_side_bearings[old])

        tables: Dict[str, bytes] = {
            "head": bytes(head),
            "hhea": bytes(hhea),
            "maxp": bytes(maxp),
            "hmtx": bytes(hmtx),
            "loca": loca_blob,
            "glyf": glyphs_blob,
        }
        for keep in KEEP_TABLES:
            if keep not in tables and keep in self.tables:
                tables[keep] = self.table(keep)

        blob = _build_sfnt(tables)
        advances = [self.advance_widths[old] for old in wanted]
        return blob, mapping, advances


def _build_sfnt(tables: Dict[str, bytes]) -> bytes:
    tags = sorted(tables)
    count = len(tags)
    search_range = (2 ** (count.bit_length() - 1)) * 16
    header = struct.pack(
        ">IHHHH", 0x00010000, count, search_range, count.bit_length() - 1,
        count * 16 - search_range,
    )
    offset = 12 + 16 * count
    directory = bytearray()
    body = bytearray()
    table_offsets: Dict[str, int] = {}
    for tag in tags:
        data = tables[tag]
        table_offsets[tag] = offset + len(body)
        directory += tag.encode("latin-1")
        directory += struct.pack(">III", _checksum(data), offset + len(body), len(data))
        body += data
        body += b"\0" * (-len(data) % 4)
    font = bytearray(header + bytes(directory) + bytes(body))

    # checkSumAdjustment = 0xB1B0AFBA - checksum(whole file with the field zeroed)
    total = _checksum(bytes(font))
    adjustment = (0xB1B0AFBA - total) & 0xFFFFFFFF
    head_offset = table_offsets.get("head")
    if head_offset is not None:
        struct.pack_into(">I", font, head_offset + 8, adjustment)
    return bytes(font)


def _parse_cmap(raw: bytes) -> Dict[int, int]:
    """Read the Unicode cmap subtable (formats 4, 6 and 12 are enough here)."""
    mapping: Dict[int, int] = {}
    if len(raw) < 4:
        return mapping
    count = _UINT16.unpack_from(raw, 2)[0]
    best_offset = 0
    best_score = -1
    for i in range(count):
        off = 4 + 8 * i
        if off + 8 > len(raw):
            break
        platform, encoding, offset = struct.unpack_from(">HHI", raw, off)
        score = {(3, 10): 4, (3, 1): 3, (0, 4): 2, (0, 3): 2, (0, 6): 2, (3, 0): 1, (1, 0): 0}.get(
            (platform, encoding), -1
        )
        if score > best_score:
            best_score, best_offset = score, offset
    if best_score < 0:
        return mapping
    fmt = _UINT16.unpack_from(raw, best_offset)[0]
    if fmt == 4:
        seg_x2 = _UINT16.unpack_from(raw, best_offset + 6)[0]
        seg = seg_x2 // 2
        end_base = best_offset + 14
        start_base = end_base + seg_x2 + 2
        delta_base = start_base + seg_x2
        range_base = delta_base + seg_x2
        for i in range(seg):
            end = _UINT16.unpack_from(raw, end_base + 2 * i)[0]
            start = _UINT16.unpack_from(raw, start_base + 2 * i)[0]
            delta = _INT16.unpack_from(raw, delta_base + 2 * i)[0]
            range_off = _UINT16.unpack_from(raw, range_base + 2 * i)[0]
            if start == 0xFFFF:
                continue
            for cp in range(start, min(end, 0xFFFE) + 1):
                if range_off == 0:
                    gid = (cp + delta) & 0xFFFF
                else:
                    addr = range_base + 2 * i + range_off + (cp - start) * 2
                    if addr + 2 > len(raw):
                        continue
                    gid = _UINT16.unpack_from(raw, addr)[0]
                    if gid:
                        gid = (gid + delta) & 0xFFFF
                if gid:
                    mapping[cp] = gid
    elif fmt == 6:
        first = _UINT16.unpack_from(raw, best_offset + 6)[0]
        n = _UINT16.unpack_from(raw, best_offset + 8)[0]
        for i in range(n):
            gid = _UINT16.unpack_from(raw, best_offset + 10 + 2 * i)[0]
            if gid:
                mapping[first + i] = gid
    elif fmt == 12:
        ngroups = _UINT32.unpack_from(raw, best_offset + 12)[0]
        for i in range(ngroups):
            off = best_offset + 16 + 12 * i
            if off + 12 > len(raw):
                break
            start, end, gid = struct.unpack_from(">III", raw, off)
            if end - start > 0x20000:
                end = start + 0x20000
            for cp in range(start, end + 1):
                mapping[cp] = gid + (cp - start)
    return mapping


def load_font(path: str, label: str = "") -> TrueTypeFont:
    with open(path, "rb") as handle:
        return TrueTypeFont(handle.read(), label or path)
