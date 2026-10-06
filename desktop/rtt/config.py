"""Application paths, company settings and small helpers shared by the app.

Settings live in ``settings.json`` inside the data folder so that reinstalling
the program never touches the bookings. A file named ``portable.txt`` next to
the program turns on portable mode: data is then kept in a ``data`` folder
beside the executable, which is handy for running from a USB stick.
"""

from __future__ import annotations

import json
import os
import sys
import threading
from typing import Any, Dict, List

APP_TITLE = "Rajshahi Tours & Travels"
APP_SUBTITLE = "Offline Tour & Bus Manager"
APP_VERSION = "1.1.7"

BOOKING_FIELDS = (
    "booking_no",
    "name",
    "phone",
    "seat",
    "total",
    "advance",
    "due",
    "booking_date",
    "tour_date",
    "tour_name",
)

DEFAULT_TERMS_BN = (
    "বুকিং ও পেমেন্ট: সিট নিশ্চিত করতে ৫০% অফেরতযোগ্য অগ্রিম দিতে হবে। বাকি টাকা যাত্রা শুরুর দিন পরিশোধ করতে হবে।",
    "বাতিল ও রিফান্ড: বুকিং বাতিল করলে অগ্রিম ফেরত দেওয়া হবে না। তবে বুকিং করা সিটে অন্য কাউকে পাঠানো যাবে।",
    "প্রাকৃতিক বা রাজনৈতিক কারণ: খারাপ আবহাওয়া, রাজনৈতিক অস্থিরতা বা অন্য কোনো অনাকাঙ্ক্ষিত পরিস্থিতিতে ট্যুর স্থগিত বা তারিখ পরিবর্তন হতে পারে।",
    "রুম ও সিট প্ল্যান: কাপল রুমের জন্য আলাদা চার্জ প্রযোজ্য। বাসের সিট সাধারণত বুকিংয়ের ক্রমানুসারে বণ্টন করা হয়।",
    "আচরণবিধি ও নিরাপত্তা: গ্রুপের শৃঙ্খলা ও স্থানীয় আইন মেনে চলতে হবে। মাদক সম্পূর্ণ নিষিদ্ধ।",
    "দায়বদ্ধতা: ব্যক্তিগত মালামাল ও নিজের নিরাপত্তার দায়িত্ব নিজেকেই নিতে হবে।",
)

DEFAULT_SETTINGS: Dict[str, Any] = {
    "company_name": "Rajshahi Tours & Travels",
    "company_tagline": "ট্যুর, বাস সার্ভিস ও টিকিটিং",
    "address": "Vodra Mor, Rajshahi",
    "phone": "01782250709",
    "whatsapp": "8801782250709",
    "email": "info@rajshahitours.com",
    "owner_name": "Safayet Hossain",
    "owner_phone": "01782250709",
    "receipt_prefix": "RTT",
    "next_receipt_no": 1,
    "currency": "Tk.",
    "footer_note": "রাজশাহী ট্যুরস অ্যান্ড ট্রাভেলসের সঙ্গে ভ্রমণের জন্য ধন্যবাদ।",
    "terms": DEFAULT_TERMS_BN,
    "tour_suggestions": (
        "Cox's Bazar Tour",
        "Sajek Valley Tour",
        "Sylhet Tour",
        "Sundarbans Tour",
        "Bandarban Tour",
        "Saint Martin Tour",
        "Kuakata Tour",
        "Rangamati Tour",
        "Rajshahi City Tour",
        "Dhaka City Tour",
    ),
    "window_geometry": "1180x720",
    "last_export_dir": "",
}

_LEGACY_DEFAULT_TERMS_EN = (
    "Advance payment is non-refundable within 7 days of the tour date.",
    "Please carry this receipt on the day of departure.",
    "Seat numbers are confirmed only after full payment unless stated otherwise.",
)

_LEGACY_DEFAULT_SETTINGS = {
    "company_tagline": "Tour operator, bus service & ticketing",
    "address": "Sopura Mor, near Shaheb Bazar Zero Point, Boalia, Rajshahi 6100",
    "footer_note": "Thank you for travelling with Rajshahi Tours & Travels.",
}

_lock = threading.Lock()


def app_dir() -> str:
    """Folder that holds the program (source folder or PyInstaller bundle)."""
    if getattr(sys, "frozen", False):  # pragma: no cover - packaged builds
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def asset_path(*parts: str) -> str:
    return os.path.join(app_dir(), "assets", *parts)


def font_paths() -> Dict[str, str]:
    return {
        "latin": asset_path("fonts", "HindSiliguri-Latin-Regular.ttf"),
        "latin-bold": asset_path("fonts", "HindSiliguri-Latin-Bold.ttf"),
        "bangla": asset_path("fonts", "HindSiliguri-Bengali-Regular.ttf"),
        "bangla-bold": asset_path("fonts", "HindSiliguri-Bengali-Bold.ttf"),
    }


def is_portable() -> bool:
    return os.path.exists(os.path.join(app_dir(), "portable.txt"))


def data_dir() -> str:
    override = os.environ.get("RTT_DATA_DIR")
    if override:
        path = os.path.abspath(override)
    elif is_portable():
        path = os.path.join(app_dir(), "data")
    else:
        home = os.path.expanduser("~")
        documents = os.path.join(home, "Documents")
        if not os.path.isdir(documents):  # Linux / macOS without Documents
            documents = home
        path = os.path.join(documents, "Rajshahi Tours & Travels")
    os.makedirs(path, exist_ok=True)
    return path


def database_path() -> str:
    return os.path.join(data_dir(), "bookings.db")


def settings_path() -> str:
    return os.path.join(data_dir(), "settings.json")


def backup_dir() -> str:
    path = os.path.join(data_dir(), "Backups")
    os.makedirs(path, exist_ok=True)
    return path


def export_dir() -> str:
    path = os.path.join(data_dir(), "Exports")
    os.makedirs(path, exist_ok=True)
    return path


def load_settings() -> Dict[str, Any]:
    settings = dict(DEFAULT_SETTINGS)
    path = settings_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                stored = json.load(handle)
            if isinstance(stored, dict):
                for key, value in stored.items():
                    if key == "terms" and isinstance(value, str):
                        value = [line for line in value.splitlines() if line.strip()]
                    if key == "tour_suggestions" and isinstance(value, str):
                        value = [line for line in value.splitlines() if line.strip()]
                    settings[key] = value
        except (OSError, ValueError):
            pass

    # Upgrade untouched 1.1.6 defaults without overwriting any settings the
    # office owner deliberately customized.
    for key, old_value in _LEGACY_DEFAULT_SETTINGS.items():
        if settings.get(key) == old_value:
            settings[key] = DEFAULT_SETTINGS[key]
    old_terms = settings.get("terms") or ()
    if isinstance(old_terms, (list, tuple)) and tuple(old_terms) == _LEGACY_DEFAULT_TERMS_EN:
        settings["terms"] = DEFAULT_TERMS_BN
    return settings


def save_settings(settings: Dict[str, Any]) -> None:
    with _lock:
        path = settings_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(settings, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        os.replace(tmp, path)


# --------------------------------------------------------------- formatting


def money(value: Any, currency: str = "Tk.") -> str:
    """Format an amount as ``12,500.00`` (no currency symbol)."""
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    return f"{amount:,.2f}"


def money_with_symbol(value: Any, currency: str = "Tk.") -> str:
    return f"{currency} {money(value, currency)}"


_ONES = (
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
)
_TENS = ("", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety")


def _under_thousand(number: int) -> str:
    if number < 20:
        return _ONES[number]
    if number < 100:
        tens, ones = divmod(number, 10)
        return _TENS[tens] + (f" {_ONES[ones]}" if ones else "")
    hundreds, rest = divmod(number, 100)
    text = f"{_ONES[hundreds]} Hundred"
    if rest:
        text += " and " + _under_thousand(rest)
    return text


def number_to_words(number: int) -> str:
    """Indian/Western grouped wording up to crores, e.g. 12,34,567."""
    number = int(abs(number))
    if number == 0:
        return "Zero"
    if number < 1000:
        return _under_thousand(number)
    # Indian numbering: thousand, lakh (100,000), crore (10,000,000)
    crore, rest = divmod(number, 10_000_000)
    lakh, rest = divmod(rest, 100_000)
    thousand, rest = divmod(rest, 1000)
    parts: List[str] = []
    for value, label in ((crore, "Crore"), (lakh, "Lakh"), (thousand, "Thousand")):
        if value:
            parts.append(f"{_under_thousand(value)} {label}")
    if rest:
        parts.append(_under_thousand(rest))
    return " ".join(parts)


def amount_to_words(value: Any, currency: str = "Tk.") -> str:
    """``12500`` -> ``Taka Twelve Thousand Five Hundred Only``."""
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    negative = amount < 0
    amount = abs(amount)
    taka = int(amount)
    paisa = int(round((amount - taka) * 100))
    if paisa == 100:  # rounding guard
        taka, paisa = taka + 1, 0
    words = number_to_words(taka)
    label = "Taka" if currency.strip().rstrip(".").lower() in ("tk", "taka", "bdt") else currency
    text = f"{label} {words}"
    if paisa:
        text += f" and {number_to_words(paisa)} Paisa"
    text += " Only"
    return ("Minus " if negative else "") + text


def normalise_phone(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit() or ch == "+")


def today_iso() -> str:
    import datetime as _dt

    return _dt.date.today().isoformat()


def parse_date(value: str):
    """Parse ``YYYY-MM-DD`` (also ``DD/MM/YYYY``) into a date, or ``None``."""
    import datetime as _dt

    text = (value or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return _dt.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def format_date(value: str, style: str = "%d %b %Y") -> str:
    date = parse_date(value)
    return date.strftime(style) if date else str(value or "")
