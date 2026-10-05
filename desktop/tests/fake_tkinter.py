"""A tiny stand-in for Tkinter so the UI logic can be exercised headlessly.

The sandbox used for development has no Tkinter, but the application logic
(form handling, table refresh, PDF export) is worth testing. Install this
module as ``sys.modules['tkinter']`` and the widgets behave just enough for
:class:`rtt.ui.BookingApp` to run.
"""

from __future__ import annotations

import os
import sys
import tempfile
import types
from typing import Any, Dict, List, Tuple


class TclError(Exception):
    pass


class Variable:
    def __init__(self, master=None, value: Any = None, name: str = "") -> None:
        self._value = value
        self._traces: List[Any] = []

    def get(self) -> Any:
        return self._value

    def set(self, value: Any) -> None:
        self._value = value
        for callback in list(self._traces):
            callback("write", "", "write")

    def trace_add(self, mode: str, callback) -> str:
        self._traces.append(callback)
        return f"trace{len(self._traces)}"

    def trace_remove(self, name: str) -> None:
        self._traces = []


class StringVar(Variable):
    def __init__(self, master=None, value: str = "") -> None:
        super().__init__(master, "" if value is None else value)


class IntVar(Variable):
    def __init__(self, master=None, value: int = 0) -> None:
        super().__init__(master, int(value or 0))


class BooleanVar(Variable):
    def __init__(self, master=None, value: bool = False) -> None:
        super().__init__(master, bool(value))


class DoubleVar(Variable):
    def __init__(self, master=None, value: float = 0.0) -> None:
        super().__init__(master, float(value or 0))


class Widget:
    def __init__(self, master=None, **options: Any) -> None:
        self.master = master
        self.children: List[Widget] = []
        self._options: Dict[str, Any] = dict(options)
        for key, value in options.items():
            setattr(self, key, value)
        if master is not None and hasattr(master, "children"):
            master.children.append(self)

    # geometry ------------------------------------------------------------
    def grid(self, **kwargs: Any) -> None:
        self._options.update(kwargs)

    def grid_propagate(self, flag: bool) -> None:
        pass

    def pack(self, **kwargs: Any) -> None:
        self._options.update(kwargs)

    def place(self, **kwargs: Any) -> None:
        self._options.update(kwargs)

    # configuration -------------------------------------------------------
    def configure(self, **kwargs: Any) -> None:
        self._options.update(kwargs)
        for key, value in kwargs.items():
            setattr(self, key, value)

    config = configure

    def cget(self, key: str) -> Any:
        return self._options.get(key)

    def __setitem__(self, key: str, value: Any) -> None:
        self.configure(**{key: value})

    def __getitem__(self, key: str) -> Any:
        return self._options[key]

    # misc ----------------------------------------------------------------
    def winfo_children(self) -> List["Widget"]:
        return list(self.children)

    def bind(self, *args: Any, **kwargs: Any) -> None:
        return None

    def bind_all(self, *args: Any, **kwargs: Any) -> None:
        return None

    def focus_set(self) -> None:
        return None

    def grab_set(self) -> None:
        return None

    def grab_release(self) -> None:
        return None

    def transient(self, master: Any) -> None:
        return None

    def resizable(self, width: bool, height: bool) -> None:
        return None

    def title(self, text: str) -> None:
        self._options["title"] = text

    def geometry(self, spec: str = "") -> str:
        if spec:
            self._options["geometry"] = spec
        return self._options.get("geometry", "1000x700")

    def protocol(self, name: str, callback) -> None:
        self._options[f"protocol:{name}"] = callback

    def call(self, *args: Any) -> Any:
        return None

    def mainloop(self, *args: Any) -> None:
        return None

    def destroy(self) -> None:
        self._options["destroyed"] = True

    def update_idletasks(self) -> None:
        return None

    def selection_get(self) -> str:
        return ""

    # window manager / geometry helpers -------------------------------------
    def minsize(self, width: int = 0, height: int = 0) -> None:
        self._options["minsize"] = (width, height)

    def maxsize(self, width: int = 0, height: int = 0) -> None:
        self._options["maxsize"] = (width, height)

    def attributes(self, *args: Any, **kwargs: Any) -> None:
        return None

    def iconbitmap(self, *args: Any, **kwargs: Any) -> None:
        return None

    def iconphoto(self, *args: Any, **kwargs: Any) -> None:
        return None

    def withdraw(self) -> None:
        return None

    def deiconify(self) -> None:
        return None

    def lift(self, *args: Any) -> None:
        return None

    def lower(self, *args: Any) -> None:
        return None

    def tkraise(self, *args: Any) -> None:
        return None

    def columnconfigure(self, index: Any, **kwargs: Any) -> None:
        return None

    def rowconfigure(self, index: Any, **kwargs: Any) -> None:
        return None

    def after(self, delay: int, callback=None, *args: Any) -> str:
        return "after#1"

    def after_cancel(self, token: str) -> None:
        return None

    def update(self) -> None:
        return None

    def bell(self) -> None:
        return None

    def quit(self) -> None:
        return None

    def winfo_toplevel(self) -> "Widget":
        return self


class Tk(Widget):
    pass


class Toplevel(Widget):
    pass


class Canvas(Widget):
    def __init__(self, master=None, **options: Any) -> None:
        super().__init__(master, **options)
        self._items: Dict[int, Any] = {}
        self._next_item = 1

    def _add_item(self, item: Any) -> int:
        ident = self._next_item
        self._next_item += 1
        self._items[ident] = item
        return ident

    def create_window(self, coords, **options: Any) -> int:
        return self._add_item((coords, options))

    def create_polygon(self, *coords: Any, **options: Any) -> int:
        return self._add_item((coords, options))

    def itemconfigure(self, item: int, **options: Any) -> None:
        self._items[item] = (self._items.get(item), options)

    itemconfig = itemconfigure

    def bbox(self, item: Any = "all") -> Tuple[int, int, int, int]:
        return (0, 0, 1, 1)

    def yview(self, *args: Any) -> None:
        return None

    def yview_scroll(self, number: int, what: str) -> None:
        return None


class Notebook(Widget):
    def __init__(self, master=None, **options: Any) -> None:
        super().__init__(master, **options)
        self._tabs: List[Tuple[Widget, Dict[str, Any]]] = []
        self._selected = ""

    def add(self, child: Widget, **options: Any) -> None:
        self._tabs.append((child, dict(options)))
        if not self._selected:
            self._selected = str(len(self._tabs) - 1)

    def select(self, item: Any = None) -> str:
        if item is not None:
            for index, (child, _options) in enumerate(self._tabs):
                if item is child:
                    self._selected = str(index)
                    break
            return self._selected
        return self._selected

    def tab(self, item: Any, option: str = "") -> Any:
        try:
            index = int(item)
            options = self._tabs[index][1]
        except (ValueError, TypeError, IndexError):
            return ""
        return options.get(option) if option else options


class Frame(Widget):
    pass


class Label(Widget):
    pass


class Button(Widget):
    pass


class Entry(Widget):
    pass


class Combobox(Widget):
    pass


class Checkbutton(Widget):
    pass


_UNUSED_SCROLLBAR_MARKER = 1


class Menu(Widget):
    def add_command(self, **kwargs: Any) -> None:
        return None

    def add_separator(self) -> None:
        return None

    def add_cascade(self, **kwargs: Any) -> None:
        return None


class Text(Widget):
    def __init__(self, master=None, **options: Any) -> None:
        super().__init__(master, **options)
        self._buffer = ""

    def insert(self, index: str, text: str) -> None:
        self._buffer += text

    def delete(self, start: str, end: str = "") -> None:
        self._buffer = ""

    def get(self, start: str, end: str = "") -> str:
        return self._buffer


_UNUSED_SCROLLBAR_MARKER = 1


class Scrollbar(Widget):
    def set(self, *args: Any) -> None:
        return None

    def get(self) -> Tuple[float, float]:
        return (0.0, 1.0)


class Treeview(Widget):
    def __init__(self, master=None, **options: Any) -> None:
        super().__init__(master, **options)
        self._items: Dict[str, Tuple[Tuple[Any, ...], Tuple[str, ...]]] = {}
        self._order: List[str] = []
        self._selection: Tuple[str, ...] = ()
        self._focus = ""

    def insert(self, parent: str, index: str, iid: str = "", values: Tuple = (),
               tags: Tuple = ()) -> str:
        key = iid or f"item{len(self._order) + 1}"
        self._items[key] = (tuple(values), tuple(tags))
        if key not in self._order:
            self._order.append(key)
        return key

    def delete(self, item: Any) -> None:
        for key in (item if isinstance(item, (list, tuple)) else [item]):
            self._items.pop(str(key), None)
            if str(key) in self._order:
                self._order.remove(str(key))

    def get_children(self) -> Tuple[str, ...]:
        return tuple(self._order)

    def item(self, key: str) -> Dict[str, Any]:
        values, tags = self._items.get(str(key), ((), ()))
        return {"values": values, "tags": tags}

    def selection(self) -> Tuple[str, ...]:
        return self._selection

    def selection_set(self, *keys: str) -> None:
        self._selection = tuple(str(k) for k in keys)

    def selection_remove(self, *keys: str) -> None:
        removed = {str(key) for key in keys}
        self._selection = tuple(key for key in self._selection if key not in removed)

    def focus(self, key: str = "") -> str:
        if key:
            self._focus = str(key)
        return self._focus

    def heading(self, column: str, **kwargs: Any) -> None:
        return None

    def column(self, column: str, **kwargs: Any) -> None:
        return None

    def tag_configure(self, name: str, **kwargs: Any) -> None:
        return None

    def yview(self, *args: Any) -> None:
        return None

    def xview(self, *args: Any) -> None:
        return None


class Style(Widget):
    def theme_use(self, name: str) -> None:
        if name == "__raise__":
            raise TclError(name)
        self._options["theme"] = name

    def configure(self, *args: Any, **kwargs: Any) -> None:
        return None

    def map(self, *args: Any, **kwargs: Any) -> None:
        return None


# ------------------------------------------------------------------ modules


def _dialog_module() -> types.ModuleType:
    module = types.ModuleType("tkinter.filedialog")
    module.asksaveasfilename = lambda **kwargs: kwargs.get("initialfile") and os.path.join(
        tempfile.gettempdir(), kwargs["initialfile"]
    )
    module.askopenfilename = lambda **kwargs: os.path.join(tempfile.gettempdir(), "backup.db")
    module.askdirectory = lambda **kwargs: tempfile.gettempdir()
    return module


def _messagebox_module(answers: Dict[str, Any]) -> types.ModuleType:
    module = types.ModuleType("tkinter.messagebox")

    def _answer(name: str):
        def call(*args, **kwargs):
            answers.setdefault(name, 0)
            answers[name] += 1
            return True
        return call

    module.showinfo = _answer("showinfo")
    module.showerror = _answer("showerror")
    module.showwarning = _answer("showwarning")
    module.askyesno = _answer("askyesno")
    module.askokcancel = _answer("askokcancel")
    return module


def _font_module() -> types.ModuleType:
    module = types.ModuleType("tkinter.font")
    module.families = lambda: ("Segoe UI", "DejaVu Sans", "TkDefaultFont")
    module.Font = lambda *args, **kwargs: types.SimpleNamespace(**kwargs)
    return module


def install(answers: Dict[str, Any] | None = None) -> types.ModuleType:
    """Register the fake tkinter package and return the root ``Tk`` factory."""
    answers = answers if answers is not None else {}
    tk = types.ModuleType("tkinter")
    tk.TclError = TclError
    tk.Tk = Tk
    tk.Toplevel = Toplevel
    tk.Frame = Frame
    tk.Canvas = Canvas
    tk.Label = Label
    tk.Button = Button
    tk.Entry = Entry
    tk.Text = Text
    tk.Menu = Menu
    tk.StringVar = StringVar
    tk.IntVar = IntVar
    tk.BooleanVar = BooleanVar
    tk.DoubleVar = DoubleVar
    tk.Variable = Variable
    tk.LEFT = "left"
    tk.RIGHT = "right"

    ttk = types.ModuleType("tkinter.ttk")
    for name in ("Frame", "Label", "Button", "Entry", "Combobox", "Checkbutton", "Scrollbar",
                 "Treeview", "Style", "Labelframe", "Notebook", "Progressbar", "Separator"):
        setattr(ttk, name, globals()[name if name in globals() else "Widget"])
    ttk.Style = Style
    ttk.Frame = Frame
    ttk.Label = Label
    ttk.Button = Button
    ttk.Entry = Entry
    ttk.Combobox = Combobox
    ttk.Checkbutton = Checkbutton
    ttk.Scrollbar = Scrollbar
    ttk.Treeview = Treeview
    ttk.Labelframe = Frame

    sys.modules["tkinter"] = tk
    sys.modules["tkinter.ttk"] = ttk
    sys.modules["tkinter.font"] = _font_module()
    sys.modules["tkinter.filedialog"] = _dialog_module()
    sys.modules["tkinter.messagebox"] = _messagebox_module(answers)
    tk.ttk = ttk
    tk.font = sys.modules["tkinter.font"]
    tk.filedialog = sys.modules["tkinter.filedialog"]
    tk.messagebox = sys.modules["tkinter.messagebox"]
    return tk
