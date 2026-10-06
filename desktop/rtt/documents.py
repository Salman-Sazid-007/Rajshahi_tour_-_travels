"""PDF layouts: a booking receipt for the customer and a booking list report.

Both are built with the in-house writer in :mod:`rtt.pdf`, so the only things
needed at run time are the standard library and the bundled fonts.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
from typing import Any, Dict, List, Optional, Sequence

from . import pdf
from .config import asset_path, format_date, money, parse_date
from .text import FontStyle

# ------------------------------------------------------------------ palette

TEAL = (34 / 255, 180 / 255, 179 / 255)  # supplied #22B4B3
TEAL_DARK = (0, 0, 0)  # supplied #000000
TEAL_LIGHT = (0.90, 0.96, 0.96)
TEAL_BAND = (0.94, 0.98, 0.98)
INK = (0, 0, 0)
MUTED = (0.44, 0.49, 0.52)
LINE = (0.84, 0.88, 0.89)
SOFT = (0.96, 0.97, 0.98)
AMBER = (249 / 255, 112 / 255, 0)  # supplied #F97000
AMBER_LIGHT = (238 / 255, 134 / 255, 37 / 255)  # supplied #EE8625
RED = (0.70, 0.18, 0.16)
GREEN = (0.08, 0.44, 0.30)
WHITE = (1, 1, 1)

STYLES = {
    "regular": FontStyle("regular", {"latin": "latin", "bangla": "bangla"}),
    "bold": FontStyle("bold", {"latin": "latin-bold", "bangla": "bangla-bold"}),
}

PAGE = pdf.A4
PAGE_LANDSCAPE = pdf.A4_LANDSCAPE
MARGIN = 40.0


def _styles() -> Dict[str, FontStyle]:
    return STYLES


def _settings_value(settings: Dict[str, Any], key: str, default: str = "") -> str:
    value = settings.get(key, default)
    return str(value) if value is not None else ""


_BANGLA_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
_BANGLA_MONTHS = (
    "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
    "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
)
_BANGLA_NUMBERS = (
    "শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়",
    "দশ", "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "উনিশ",
    "বিশ", "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আটাশ", "ঊনত্রিশ",
    "ত্রিশ", "একত্রিশ", "বত্রিশ", "তেত্রিশ", "চৌত্রিশ", "পঁয়ত্রিশ", "ছত্রিশ", "সাঁইত্রিশ", "আটত্রিশ", "ঊনচল্লিশ",
    "চল্লিশ", "একচল্লিশ", "বিয়াল্লিশ", "তেতাল্লিশ", "চুয়াল্লিশ", "পঁয়তাল্লিশ", "ছেচল্লিশ", "সাতচল্লিশ", "আটচল্লিশ", "ঊনপঞ্চাশ",
    "পঞ্চাশ", "একান্ন", "বাহান্ন", "তিপ্পান্ন", "চুয়ান্ন", "পঞ্চান্ন", "ছাপ্পান্ন", "সাতান্ন", "আটান্ন", "ঊনষাট",
    "ষাট", "একষট্টি", "বাষট্টি", "তেষট্টি", "চৌষট্টি", "পঁয়ষট্টি", "ছেষট্টি", "সাতষট্টি", "আটষট্টি", "ঊনসত্তর",
    "সত্তর", "একাত্তর", "বাহাত্তর", "তিয়াত্তর", "চুয়াত্তর", "পঁচাত্তর", "ছিয়াত্তর", "সাতাত্তর", "আটাত্তর", "ঊনআশি",
    "আশি", "একাশি", "বিরাশি", "তিরাশি", "চুরাশি", "পঁচাশি", "ছিয়াশি", "সাতাশি", "আটাশি", "ঊননব্বই",
    "নব্বই", "একানব্বই", "বিরানব্বই", "তিরানব্বই", "চুরানব্বই", "পঁচানব্বই", "ছিয়ানব্বই", "সাতানব্বই", "আটানব্বই", "নিরানব্বই",
)


def _bangla_digits(value: Any) -> str:
    return str(value).translate(_BANGLA_DIGITS)


def _bangla_date(value: Any) -> str:
    date = parse_date(str(value or ""))
    if not date:
        return _bangla_digits(value or "")
    return f"{_bangla_digits(date.day)} {_BANGLA_MONTHS[date.month - 1]} {_bangla_digits(date.year)}"


def _bangla_two_digit_words(number: int) -> str:
    return _BANGLA_NUMBERS[max(0, min(99, int(number)))]


def _bangla_under_thousand(number: int) -> str:
    number = max(0, int(number))
    if number < 100:
        return _bangla_two_digit_words(number)
    hundreds, remainder = divmod(number, 100)
    parts = [f"{_bangla_two_digit_words(hundreds)}শ"]
    if remainder:
        parts.append(_bangla_two_digit_words(remainder))
    return " ".join(parts)


def _bangla_number_words(number: int) -> str:
    number = abs(int(number))
    if number < 1000:
        return _bangla_under_thousand(number)
    crore, remainder = divmod(number, 10_000_000)
    lakh, remainder = divmod(remainder, 100_000)
    thousand, remainder = divmod(remainder, 1000)
    parts = []
    for value, unit in ((crore, "কোটি"), (lakh, "লাখ"), (thousand, "হাজার")):
        if value:
            parts.append(f"{_bangla_under_thousand(value)} {unit}")
    if remainder:
        parts.append(_bangla_under_thousand(remainder))
    return " ".join(parts) or "শূন্য"


def _bangla_amount_words(value: Any) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    negative = amount < 0
    amount = abs(amount)
    taka = int(amount)
    paisa = int(round((amount - taka) * 100))
    if paisa == 100:
        taka, paisa = taka + 1, 0
    text = f"{_bangla_number_words(taka)} টাকা"
    if paisa:
        text += f" {_bangla_number_words(paisa)} পয়সা"
    return ("ঋণাত্মক " if negative else "") + text + " মাত্র"


def _bangla_printed_at(value: _dt.datetime) -> str:
    hour = value.hour % 12 or 12
    if value.hour < 5:
        period = "রাত"
    elif value.hour < 12:
        period = "সকাল"
    elif value.hour < 15:
        period = "দুপুর"
    elif value.hour < 18:
        period = "বিকেল"
    else:
        period = "রাত"
    return f"{_bangla_date(value.date().isoformat())}, {period} {_bangla_digits(f'{hour:02d}:{value.minute:02d}')}"


# ------------------------------------------------------------------ helpers


def _section_title(canvas: pdf.Canvas, x: float, y: float, title: str, width: float) -> float:
    canvas.rect(x, y, 3.2, 12, fill=TEAL)
    canvas.text(x + 9, y + 10.6, title.upper(), style="bold", size=9.4, color=TEAL_DARK)
    canvas.line(x + 9 + canvas.text_width(title.upper(), style="bold", size=9.4) + 8,
                y + 6.6, x + width, y + 6.6, color=LINE, width=0.5)
    return y + 20


def _field(
    canvas: pdf.Canvas,
    x: float,
    y: float,
    width: float,
    label: str,
    value: str,
    value_size: float = 11.2,
    value_style: str = "bold",
    value_color=INK,
) -> float:
    canvas.text(x, y + 10, label.upper(), size=8.8, color=MUTED)
    shown = value if value else "-"
    canvas.text(x, y + 25, shown, style=value_style, size=value_size, color=value_color,
                max_width=width)
    return y + 38


def _signature_block(canvas: pdf.Canvas, x: float, y: float, width: float,
                     left_label: str, right_label: str) -> None:
    half = (width - 30) / 2
    canvas.line(x, y, x + half, y, color=(0.55, 0.60, 0.62), width=0.7)
    canvas.text(x, y + 13, left_label, size=9, color=MUTED)
    right = x + width - half
    canvas.line(right, y, right + half, y, color=(0.55, 0.60, 0.62), width=0.7)
    canvas.text(right, y + 13, right_label, size=9, color=MUTED)


def _new_document(page_size=PAGE, title: str = "", author: str = "") -> pdf.PdfDocument:
    """Create a document and register the bundled company-logo image."""
    doc = pdf.make_document(_font_paths(), STYLES, page_size=page_size, title=title, author=author)
    for filename in ("agency-logo-print.jpg", "agency-logo.jpg"):
        logo_path = asset_path(filename)
        if os.path.isfile(logo_path):
            doc.add_jpeg_image("agency-logo", logo_path)
            break
    return doc


def _letterhead(canvas: pdf.Canvas, settings: Dict[str, Any], width: float,
                bangla: bool = False) -> float:
    """Logo-led company header with owner and phone at upper right."""
    canvas.rect(0, 0, width, 105, fill=TEAL_BAND)
    canvas.rect(0, 105, width, 2.5, fill=TEAL)
    if "agency-logo" in canvas.doc.images:
        logo = canvas.doc.images["agency-logo"]
        logo_width = 94.0
        logo_height = logo_width * logo.height / logo.width
        canvas.image("agency-logo", MARGIN, (105.0 - logo_height) / 2, logo_width, logo_height)
        left = MARGIN + logo_width + 10
    else:
        # Never substitute an approximate vector mark for the supplied logo.
        left = MARGIN

    right_panel_width = 154
    text_width = width - left - MARGIN - right_panel_width - 16
    company_name = _settings_value(settings, "company_name", "Rajshahi Tours & Travels")
    if bangla and company_name == "Rajshahi Tours & Travels":
        company_name = "রাজশাহী ট্যুরস অ্যান্ড ট্রাভেলস"
    canvas.text(left, 36, company_name, style="bold", size=16, color=TEAL_DARK,
                max_width=text_width)
    canvas.text(left, 53, _settings_value(settings, "company_tagline", ""), size=9,
                color=MUTED, max_width=text_width)
    canvas.text(left, 72, _settings_value(settings, "address", ""), size=8.8, color=INK,
                max_width=text_width)
    contacts = "  |  ".join(part for part in (
        _settings_value(settings, "phone"), _settings_value(settings, "whatsapp"),
        _settings_value(settings, "email"),
    ) if part)
    canvas.text(left, 89, contacts, size=8.8, color=MUTED, max_width=text_width)

    panel_x = width - MARGIN - right_panel_width
    canvas.rect(panel_x, 18, right_panel_width, 69, fill=WHITE, stroke=LINE, width=0.6, radius=5)
    canvas.rect(panel_x, 18, 3, 69, fill=AMBER)
    owner = _settings_value(settings, "owner_name", "Safayet Hossain")
    owner_phone = _settings_value(settings, "owner_phone", _settings_value(settings, "phone"))
    canvas.text(width - MARGIN - 11, 39, owner, style="bold", size=9.5, color=TEAL_DARK,
                align="right", max_width=right_panel_width - 20)
    owner_label = "মালিক / স্বত্বাধিকারী" if bangla else "OWNER / PROPRIETOR"
    phone_label = "ফোন" if bangla else "Phone"
    canvas.text(width - MARGIN - 11, 55, owner_label, size=8.5, color=MUTED,
                align="right", max_width=right_panel_width - 20)
    canvas.text(width - MARGIN - 11, 74, f"{phone_label}  {owner_phone}", style="bold", size=8.8,
                color=TEAL, align="right", max_width=right_panel_width - 20)
    return 124


def _footer(canvas: pdf.Canvas, settings: Dict[str, Any], width: float, height: float,
            page_label: str = "") -> None:
    canvas.line(MARGIN, height - 52, width - MARGIN, height - 52, color=LINE, width=0.6)
    note = _settings_value(settings, "footer_note", "")
    if note:
        canvas.text(width / 2, height - 42, note, size=9, color=MUTED, align="center",
                    max_width=width - 2 * MARGIN)
    footer = "  |  ".join(
        part for part in (_settings_value(settings, "phone"), _settings_value(settings, "email"),
                          _settings_value(settings, "address")) if part
    )
    canvas.text(width / 2, height - 30, footer, size=8.8, color=MUTED, align="center",
                max_width=width - 2 * MARGIN)
    if page_label:
        canvas.text(width - MARGIN, height - 30, page_label, size=8.8, color=MUTED, align="right")


# ------------------------------------------------------------------ receipt


def booking_receipt(booking: Dict[str, Any], settings: Dict[str, Any]) -> bytes:
    """A single A4 receipt to hand to the customer."""
    currency = _settings_value(settings, "currency", "Tk.")
    doc = _new_document(
        page_size=PAGE,
        title=f"Tour booking memo {booking.get('booking_no', '')}",
        author=_settings_value(settings, "company_name", "Rajshahi Tours & Travels"),
    )

    def draw(doc: pdf.PdfDocument) -> None:
        canvas = doc.new_page()
        width, height = canvas.width, canvas.height
        content_width = width - 2 * MARGIN
        y = _letterhead(canvas, settings, width, bangla=True)

        # Title band -------------------------------------------------------
        band_height = 26.0
        canvas.rect(MARGIN, y, content_width, band_height, fill=TEAL_LIGHT, stroke=LINE, width=0.6)
        canvas.text(MARGIN + 10, y + 18, "ট্যুর বুকিংয়ের মেমো", style="bold", size=13,
                    color=TEAL_DARK)
        number = str(booking.get("booking_no") or "")
        canvas.text(MARGIN + content_width - 10, y + 18, f"মেমো নং: {number}",
                    style="bold", size=11, color=TEAL_DARK, align="right")
        y += band_height + 18

        # Passenger + tour details -----------------------------------------
        y = _section_title(canvas, MARGIN, y, "যাত্রী ও ট্যুরের বিবরণ", content_width)
        col = (content_width - 16) / 2
        row_y = y
        left_y = _field(canvas, MARGIN, row_y, col, "যাত্রীর নাম", str(booking.get("name", "")))
        right_y = _field(canvas, MARGIN + col + 16, row_y, col, "মোবাইল নম্বর",
                         str(booking.get("phone", "")))
        y = max(left_y, right_y)

        row_y = y
        left_y = _field(canvas, MARGIN, row_y, col, "ট্যুরের নাম", str(booking.get("tour_name", "")))
        right_y = _field(canvas, MARGIN + col + 16, row_y, col, "সিট নম্বর", str(booking.get("seat", "")))
        y = max(left_y, right_y)

        row_y = y
        left_y = _field(canvas, MARGIN, row_y, col, "যাত্রার তারিখ",
                        _bangla_date(booking.get("tour_date", "")))
        right_y = _field(canvas, MARGIN + col + 16, row_y, col, "বুকিংয়ের তারিখ",
                         _bangla_date(booking.get("booking_date", "")))
        y = max(left_y, right_y) + 4

        # Payment ----------------------------------------------------------
        y = _section_title(canvas, MARGIN, y, "পেমেন্টের বিবরণ", content_width)
        box_width = (content_width - 2 * 10) / 3
        boxes = [
            ("মোট টাকা", f"{_bangla_digits(money(booking.get('total'), currency))} টাকা", INK),
            ("অগ্রিম জমা", f"{_bangla_digits(money(booking.get('advance'), currency))} টাকা", GREEN),
            ("বাকি টাকা", f"{_bangla_digits(money(booking.get('due'), currency))} টাকা",
             RED if float(booking.get("due") or 0) > 0 else GREEN),
        ]
        for index, (label, value, color) in enumerate(boxes):
            x = MARGIN + index * (box_width + 10)
            highlight = index == 2
            card_fill = SOFT if highlight else WHITE
            canvas.rect(x, y, box_width, 58, fill=card_fill, stroke=LINE, width=0.6, radius=4)
            canvas.text(x + box_width / 2, y + 18, label.upper(), size=8.8, color=MUTED,
                        align="center", max_width=box_width - 8)
            canvas.text(x + box_width / 2, y + 42, value, style="bold", size=15, color=color,
                        align="center", max_width=box_width - 10)
        y += 70

        # Amount in words ---------------------------------------------------
        canvas.rect(MARGIN, y, content_width, 30, fill=TEAL_BAND, stroke=LINE, width=0.5)
        canvas.text(MARGIN + 10, y + 19.5, "টাকার পরিমাণ কথায়", size=8.8, color=MUTED)
        canvas.text(MARGIN + 116, y + 19.5, _bangla_amount_words(booking.get("total")),
                    style="bold", size=11, max_width=content_width - 128)
        y += 42

        # Notes -------------------------------------------------------------
        notes = str(booking.get("notes") or "").strip()
        if notes:
            y = _section_title(canvas, MARGIN, y, "অতিরিক্ত তথ্য", content_width)
            y = canvas.paragraph(MARGIN, y + 10, notes, content_width, leading=14, size=10,
                                 color=MUTED) + 6

        # Terms -------------------------------------------------------------
        raw_terms = settings.get("terms") or []
        if isinstance(raw_terms, str):
            raw_terms = raw_terms.splitlines()
        terms = [str(term).strip() for term in raw_terms if str(term).strip()]
        if terms:
            y = _section_title(canvas, MARGIN, y, "শর্তাবলি", content_width)
            for term in terms:
                canvas.text(MARGIN + 2, y + 10, "•", size=10, color=AMBER)
                y = canvas.paragraph(MARGIN + 12, y + 10, term, content_width - 12,
                                     leading=14, size=9.5, color=MUTED)
            y += 4

        # Signatures --------------------------------------------------------
        signature_y = min(height - 92, y + 26)
        _signature_block(canvas, MARGIN, signature_y, content_width,
                         "অফিস প্রতিনিধির স্বাক্ষর", "গ্রাহকের স্বাক্ষর")

        status_codes = {
            "confirmed": "নিশ্চিত", "pending": "অপেক্ষমাণ", "cancelled": "বাতিল",
            "booked": "বুকিং সম্পন্ন", "paid": "পরিশোধিত",
        }
        status_value = str(booking.get("status") or "Confirmed").strip()
        status = status_codes.get(status_value.casefold(), status_value)
        printed_at = _bangla_printed_at(_dt.datetime.now())
        canvas.text(MARGIN + content_width / 2, signature_y - 14,
                    f"বুকিংয়ের অবস্থা: {status}   |   প্রিন্ট: {printed_at}",
                    size=8.8, color=MUTED, align="center")

        _footer(canvas, settings, width, height)

    return doc.render(draw)


def bus_ticket_receipt(ticket: Dict[str, Any], settings: Dict[str, Any]) -> bytes:
    """A clean, branded, offline-issued ticket for a manually assigned bus seat."""
    currency = _settings_value(settings, "currency", "Tk.")
    ticket_no = str(ticket.get("ticket_no") or "")
    doc = _new_document(
        page_size=PAGE,
        title=f"Bus ticket {ticket_no}",
        author=_settings_value(settings, "company_name", "Rajshahi Tours & Travels"),
    )

    def draw(doc: pdf.PdfDocument) -> None:
        canvas = doc.new_page()
        width, height = canvas.width, canvas.height
        content_width = width - 2 * MARGIN
        y = _letterhead(canvas, settings, width)
        canvas.rect(MARGIN, y, content_width, 42, fill=TEAL_LIGHT, stroke=LINE, width=0.6, radius=3)
        canvas.text(MARGIN + 14, y + 18, "BUS TRAVEL TICKET", style="bold", size=12, color=TEAL_DARK)
        canvas.text(MARGIN + content_width - 14, y + 18, ticket_no, style="bold", size=11,
                    color=TEAL, align="right")
        canvas.text(MARGIN + 14, y + 33, "OFFLINE COUNTER ISSUE", size=8.8, color=MUTED)
        y += 62

        route = str(ticket.get("route") or "")
        canvas.rect(MARGIN, y, content_width, 67, fill=WHITE, stroke=LINE, width=0.8, radius=5)
        canvas.rect(MARGIN, y, 4, 67, fill=TEAL)
        canvas.text(MARGIN + 18, y + 18, "JOURNEY ROUTE", size=8.8, color=MUTED)
        canvas.text(MARGIN + 18, y + 42, route, style="bold", size=18, color=TEAL_DARK,
                    max_width=content_width - 36)
        y += 85

        y = _section_title(canvas, MARGIN, y, "Passenger & departure", content_width)
        col = (content_width - 20) / 2
        seats = [part.strip() for part in str(ticket.get("seat") or "").split(",") if part.strip()]
        genders = ticket.get("seat_genders") or {}
        if isinstance(genders, str):
            try:
                genders = json.loads(genders)
            except (TypeError, ValueError):
                genders = {}
        if not isinstance(genders, dict):
            genders = {}
        seat_summary = ", ".join(
            f"{seat} ({str(genders.get(seat) or '').title()})" if genders.get(seat) else seat
            for seat in seats
        )
        passenger_count = len(seats) or 1
        values = [
            ("Booking contact", str(ticket.get("name", ""))),
            ("Phone number", str(ticket.get("phone", ""))),
            ("Travel date", format_date(ticket.get("travel_date", ""))),
            ("Departure time", str(ticket.get("departure_time", ""))),
            ("Passenger count", str(passenger_count)),
            ("Ticket status", str(ticket.get("status", "Booked"))),
        ]
        for index in range(0, len(values), 2):
            left_label, left_value = values[index]
            right_label, right_value = values[index + 1]
            _field(canvas, MARGIN, y, col, left_label, left_value)
            _field(canvas, MARGIN + col + 20, y, col, right_label, right_value)
            y += 42

        if seat_summary:
            y += 2
            y = _section_title(canvas, MARGIN, y, "Seat and gender assignments", content_width)
            y = canvas.paragraph(MARGIN, y + 5, seat_summary, content_width,
                                 leading=14, size=10.5, color=INK)
        y += 2
        y = _section_title(canvas, MARGIN, y, "Fare & payment", content_width)
        box_width = (content_width - 20) / 3
        amounts = [
            ("Fare", money(ticket.get("fare"), currency), INK),
            ("Paid", money(ticket.get("advance"), currency), GREEN),
            ("Balance due", money(ticket.get("due"), currency),
             RED if float(ticket.get("due") or 0) > 0 else GREEN),
        ]
        for index, (label, amount, color) in enumerate(amounts):
            x = MARGIN + index * (box_width + 10)
            canvas.rect(x, y, box_width, 58, fill=TEAL_BAND if index == 2 else WHITE,
                        stroke=LINE, width=0.6, radius=4)
            canvas.text(x + box_width / 2, y + 18, label.upper(), size=8.8, color=MUTED, align="center")
            canvas.text(x + box_width / 2, y + 41, amount, style="bold", size=14,
                        color=color, align="center", max_width=box_width - 10)
        y += 76

        notes = str(ticket.get("notes") or "").strip()
        if notes:
            y = _section_title(canvas, MARGIN, y, "Notes", content_width)
            canvas.paragraph(MARGIN, y + 6, notes, content_width, leading=14, size=9.5)
        signature_y = min(height - 100, max(y + 42, 600))
        _signature_block(canvas, MARGIN, signature_y, content_width,
                         "Ticket checked by", "Passenger signature")
        canvas.text(width - MARGIN, signature_y - 14,
                    f"Issued {_dt.datetime.now().strftime('%d %b %Y, %I:%M %p')}",
                    size=8.8, color=MUTED, align="right")
        _footer(canvas, settings, width, height)

    return doc.render(draw)


# -------------------------------------------------------------------- report

REPORT_COLUMNS = (
    ("No.", 26, "left"),
    ("Booking No", 74, "left"),
    ("Name", 116, "left"),
    ("Phone", 76, "left"),
    ("Tour Name", 104, "left"),
    ("Seat", 54, "left"),
    ("Tour Date", 58, "center"),
    ("Status", 50, "center"),
    ("Booked On", 58, "center"),
    ("Total", 58, "right"),
    ("Advance", 56, "right"),
    ("Due", 56, "right"),
)


def booking_list_report(
    rows: Sequence[Dict[str, Any]],
    settings: Dict[str, Any],
    subtitle: str = "",
    title: str = "Booking List Report",
) -> bytes:
    """A paginated landscape report of every booking currently listed."""
    currency = _settings_value(settings, "currency", "Tk.")
    doc = _new_document(
        page_size=PAGE_LANDSCAPE,
        title=title, author=_settings_value(settings, "company_name", "Rajshahi Tours & Travels"),
    )
    rows = list(rows)

    def draw(doc: pdf.PdfDocument) -> None:
        total_width = sum(col[1] for col in REPORT_COLUMNS)
        page = doc.new_page()
        width, height = page.width, page.height
        content_width = width - 2 * MARGIN
        scale = content_width / total_width
        columns = [(label, col_width * scale, align) for label, col_width, align in REPORT_COLUMNS]

        y = _letterhead(page, settings, width)
        page.text(MARGIN, y + 14, title.upper(), style="bold", size=13, color=TEAL_DARK)
        meta_bits = [
            subtitle or "All bookings",
            f"Generated {_dt.datetime.now().strftime('%d %b %Y, %I:%M %p')}",
        ]
        page.text(width - MARGIN, y + 14, "   |   ".join(meta_bits), size=9, color=MUTED,
                  align="right", max_width=content_width / 2)
        y += 26

        # Summary cards -----------------------------------------------------
        totals = {
            "count": len(rows),
            "total": sum(float(r.get("total") or 0) for r in rows),
            "advance": sum(float(r.get("advance") or 0) for r in rows),
            "due": sum(float(r.get("due") or 0) for r in rows),
        }
        card_width = (content_width - 3 * 10) / 4
        cards = [
            ("Bookings", str(totals["count"]), INK),
            ("Total amount", money(totals["total"], currency), INK),
            ("Advance collected", money(totals["advance"], currency), GREEN),
            ("Due outstanding", money(totals["due"], currency), RED if totals["due"] else GREEN),
        ]
        for index, (label, value, color) in enumerate(cards):
            x = MARGIN + index * (card_width + 10)
            page.rect(x, y, card_width, 44, fill=WHITE, stroke=LINE, width=0.6, radius=3)
            page.rect(x, y, 3, 44, fill=TEAL)
            page.text(x + 10, y + 16, label.upper(), size=8.5, color=MUTED, max_width=card_width - 16)
            page.text(x + 10, y + 34, value, style="bold", size=13, color=color,
                      max_width=card_width - 16)
        y += 58

        # Table -------------------------------------------------------------
        header_height = 20.0
        row_height = 18.0

        def draw_header(canvas: pdf.Canvas, top: float) -> None:
            canvas.rect(MARGIN, top, content_width, header_height, fill=TEAL)
            x = MARGIN
            for label, col_width, align in columns:
                text_x = x + 6 if align == "left" else (
                    x + col_width - 6 if align == "right" else x + col_width / 2
                )
                canvas.text(text_x, top + 13.5, label, style="bold", size=8.8, color=WHITE,
                            align=align, max_width=col_width - 8)
                x += col_width

        draw_header(page, y)
        y += header_height

        index = 0
        page_number = 1
        while True:
            if index >= len(rows):
                break
            if y + row_height > height - 74:  # need a new page
                _footer(page, settings, width, height, f"Page {page_number}")
                page = doc.new_page()
                page_number += 1
                y = MARGIN
                page.text(MARGIN, y + 10, title.upper(), style="bold", size=10, color=TEAL_DARK)
                y += 22
                draw_header(page, y)
                y += header_height

            row = rows[index]
            if index % 2 == 1:
                page.rect(MARGIN, y, content_width, row_height, fill=SOFT)
            x = MARGIN
            due_value = float(row.get("due") or 0)
            values = [
                str(index + 1),
                str(row.get("booking_no") or ""),
                str(row.get("name") or ""),
                str(row.get("phone") or ""),
                str(row.get("tour_name") or ""),
                str(row.get("seat") or ""),
                format_date(row.get("tour_date", ""), "%d %b %y"),
                str(row.get("status") or "Confirmed"),
                format_date(row.get("booking_date", ""), "%d %b %y"),
                money(row.get("total"), currency),
                money(row.get("advance"), currency),
                money(row.get("due"), currency),
            ]
            for (label, col_width, align), value in zip(columns, values):
                text_x = x + 6 if align == "left" else (
                    x + col_width - 6 if align == "right" else x + col_width / 2
                )
                color = INK
                style_name = "regular"
                if label == "Due" and due_value > 0:
                    color = RED
                    style_name = "bold"
                elif label == "Name":
                    style_name = "bold"
                page.text(text_x, y + 12.5, value, style=style_name, size=8.8, color=color,
                          align=align, max_width=col_width - 8)
                x += col_width
            page.line(MARGIN, y + row_height, MARGIN + content_width, y + row_height,
                      color=LINE, width=0.4)
            y += row_height
            index += 1

        # Totals row --------------------------------------------------------
        if rows:
            page.rect(MARGIN, y, content_width, 22, fill=TEAL_BAND, stroke=LINE, width=0.6)
            x = MARGIN
            for label, col_width, align in columns:
                text_x = x + 6 if align == "left" else (
                    x + col_width - 6 if align == "right" else x + col_width / 2
                )
                value = ""
                if label == "No.":
                    value = ""
                elif label == "Name":
                    value = f"TOTAL ({totals['count']} bookings)"
                elif label == "Total":
                    value = money(totals["total"], currency)
                elif label == "Advance":
                    value = money(totals["advance"], currency)
                elif label == "Due":
                    value = money(totals["due"], currency)
                if value:
                    page.text(text_x, y + 15, value, style="bold", size=9.2, color=TEAL_DARK,
                              align=align, max_width=col_width - 8)
                x += col_width
            y += 30

        if not rows:
            page.text(width / 2, y + 40, "No bookings found for this selection.", size=11,
                      color=MUTED, align="center")

        _footer(page, settings, width, height, f"Page {page_number}" if rows else "")

    return doc.render(draw)


def monthly_tour_report(rows: Sequence[Dict[str, Any]], settings: Dict[str, Any], year_month: str) -> bytes:
    """A print-ready, month-filtered sheet of every tour passenger and payment."""
    try:
        month = _dt.datetime.strptime(str(year_month), "%Y-%m").strftime("%B %Y")
    except ValueError:
        month = str(year_month)
    return booking_list_report(
        rows, settings, subtitle=f"Tour bookings · {month}", title=f"Monthly Tour Report · {month}"
    )


def _font_paths() -> Dict[str, str]:
    from .config import font_paths

    return font_paths()


def default_filename(prefix: str, extension: str = "pdf") -> str:
    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{prefix}-{stamp}.{extension}"
