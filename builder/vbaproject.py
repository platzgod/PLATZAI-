"""VBA プロジェクト（xl/vbaProject.bin）をソースコードから生成する。

- MS-OVBA 圧縮と Compound File Binary (CFB v3) の書き出しを自前で実装。
- p-code は含めない（_VBA_PROJECT の Version を 0xFFFF にして、Excel にソースから再コンパイルさせる）。
- 参照設定（stdole / Office）やプロジェクト ID・保護情報は、元ファイルの vbaProject.bin を雛形として流用する。
"""
import struct

import olefile
from oletools.olevba import decompress_stream

CODEPAGE = "cp932"

DOC_ATTRS = (
    'Attribute VB_Name = "{name}"\r\n'
    'Attribute VB_Base = "0{{{base}}}"\r\n'
    "Attribute VB_GlobalNameSpace = False\r\n"
    "Attribute VB_Creatable = False\r\n"
    "Attribute VB_PredeclaredId = True\r\n"
    "Attribute VB_Exposed = True\r\n"
    "Attribute VB_TemplateDerived = False\r\n"
    "Attribute VB_Customizable = True\r\n"
)
WORKBOOK_BASE = "00020819-0000-0000-C000-000000000046"
SHEET_BASE = "00020820-0000-0000-C000-000000000046"


# ---------------------------------------------------------------- MS-OVBA 圧縮
def _copytoken_params(difference):
    bit_count = 4
    while (1 << bit_count) < difference:
        bit_count += 1
    length_mask = 0xFFFF >> bit_count
    max_length = length_mask + 3
    return bit_count, max_length


def _compress_chunk(data):
    out = bytearray()
    pos = 0
    n = len(data)
    while pos < n:
        flag_pos = len(out)
        out.append(0)
        flag = 0
        for bit in range(8):
            if pos >= n:
                break
            difference = pos  # 位置はチャンク先頭からの距離
            best_len, best_off = 0, 0
            if difference > 0:
                bit_count, max_length = _copytoken_params(difference)
                max_off = min(difference, 1 << bit_count)
                limit = min(max_length, n - pos)
                for off in range(1, max_off + 1):
                    cand = pos - off
                    length = 0
                    while length < limit and data[cand + length] == data[pos + length]:
                        length += 1
                    if length > best_len:
                        best_len, best_off = length, off
                        if length == limit:
                            break
            if best_len >= 3:
                bit_count, _ = _copytoken_params(difference)
                token = ((best_off - 1) << (16 - bit_count)) | (best_len - 3)
                out += struct.pack("<H", token)
                flag |= 1 << bit
                pos += best_len
            else:
                out.append(data[pos])
                pos += 1
        out[flag_pos] = flag
    return bytes(out)


def compress(data: bytes) -> bytes:
    out = bytearray(b"\x01")
    for start in range(0, max(len(data), 1), 4096):
        chunk = data[start:start + 4096]
        if not chunk:
            break
        comp = _compress_chunk(chunk)
        if len(comp) > 4096 and len(chunk) == 4096:
            out += struct.pack("<H", 0x3FFF)  # 非圧縮チャンク
            out += chunk
            continue
        assert len(comp) + 2 <= 4098, "chunk too large"
        header = 0x8000 | 0x3000 | ((len(comp) + 2 - 3) & 0x0FFF)
        out += struct.pack("<H", header) + comp
    return bytes(out)


# ---------------------------------------------------------------- CFB 書き出し
ENDOFCHAIN, FREESECT, FATSECT, NOSTREAM = 0xFFFFFFFE, 0xFFFFFFFF, 0xFFFFFFFD, 0xFFFFFFFF


class _Entry:
    def __init__(self, name, kind, data=b""):
        self.name, self.kind, self.data = name, kind, data  # kind: 1 storage / 2 stream / 5 root
        self.children = []
        self.left = self.right = self.child = NOSTREAM
        self.color = 1
        self.start = ENDOFCHAIN
        self.size = 0
        self.sid = None


def _cfb_key(name):
    return (len(name), name.upper())


def _build_tree(entries, depth=0, info=None):
    """ソート済みの兄弟を中央分割で平衡 BST にし、最深段だけ赤にする。"""
    if not entries:
        return NOSTREAM, -1
    mid = len(entries) // 2
    node = entries[mid]
    node.left, dl = _build_tree(entries[:mid], depth + 1, info)
    node.right, dr = _build_tree(entries[mid + 1:], depth + 1, info)
    node._depth = depth
    return node.sid, max(depth, dl, dr)


def write_cfb(tree):
    """tree: {"name": bytes|dict} の入れ子 dict。ルート直下から。"""
    root = _Entry("Root Entry", 5)
    order = [root]

    def add(parent, d):
        for name, val in d.items():
            if isinstance(val, dict):
                e = _Entry(name, 1)
                add(e, val)
            else:
                e = _Entry(name, 2, val)
            parent.children.append(e)

    add(root, tree)

    def number(e):
        for c in e.children:
            c.sid = len(order)
            order.append(c)
        for c in e.children:
            number(c)

    root.sid = 0
    number(root)
    for e in order:
        if e.children:
            sib = sorted(e.children, key=lambda x: _cfb_key(x.name))
            e.child, maxd = _build_tree(sib)
            full = (1 << (maxd + 1)) - 1 == len(sib)
            for s in sib:
                s.color = 0 if (not full and s._depth == maxd and maxd > 0) else 1

    # ミニストリーム（4096 バイト未満のストリーム）
    mini = bytearray()
    minifat = []
    big = []
    for e in order:
        if e.kind != 2:
            continue
        e.size = len(e.data)
        if e.size == 0:
            e.start = ENDOFCHAIN
        elif e.size < 4096:
            n = (e.size + 63) // 64
            first = len(mini) // 64
            e.start = first
            for i in range(n):
                minifat.append(first + i + 1 if i < n - 1 else ENDOFCHAIN)
            mini += e.data + b"\x00" * (n * 64 - e.size)
        else:
            big.append(e)

    sectors = []  # 各要素 512 バイト
    fat = []

    def alloc(data):
        if not data:
            return ENDOFCHAIN
        n = (len(data) + 511) // 512
        first = len(sectors)
        padded = data + b"\x00" * (n * 512 - len(data))
        for i in range(n):
            sectors.append(padded[i * 512:(i + 1) * 512])
            fat.append(first + i + 1 if i < n - 1 else ENDOFCHAIN)
        return first

    for e in big:
        e.start = alloc(e.data)
    root.start = alloc(bytes(mini)) if mini else ENDOFCHAIN
    root.size = len(mini)
    minifat_bytes = b"".join(struct.pack("<I", x) for x in minifat)
    minifat_start = alloc(minifat_bytes) if minifat else ENDOFCHAIN
    n_minifat = (len(minifat_bytes) + 511) // 512

    # ディレクトリ
    dir_bytes = bytearray()
    for e in order:
        name16 = e.name.encode("utf-16-le")
        assert len(name16) <= 62
        d = name16 + b"\x00" * (64 - len(name16))
        d += struct.pack("<HBB", len(name16) + 2, e.kind, e.color)
        d += struct.pack("<III", e.left, e.right, e.child)
        d += b"\x00" * 16 + struct.pack("<I", 0) + b"\x00" * 16
        d += struct.pack("<II", e.start if e.kind != 1 else 0, e.size if e.kind != 1 else 0) + b"\x00" * 4
        assert len(d) == 128
        dir_bytes += d
    while len(dir_bytes) % 512:
        empty = b"\x00" * 64 + struct.pack("<HBB", 0, 0, 0) + struct.pack("<III", NOSTREAM, NOSTREAM, NOSTREAM)
        empty += b"\x00" * (128 - len(empty))
        dir_bytes += empty
    dir_start = alloc(bytes(dir_bytes))

    # FAT
    n_fat = 1
    while True:
        total = len(sectors) + n_fat
        if n_fat * 128 >= total:
            break
        n_fat += 1
    assert n_fat <= 109
    fat_start = len(sectors)
    fat += [FATSECT] * n_fat
    fat += [FREESECT] * (n_fat * 128 - len(fat))
    fat_bytes = b"".join(struct.pack("<I", x) for x in fat)
    for i in range(n_fat):
        sectors.append(fat_bytes[i * 512:(i + 1) * 512])

    hdr = bytearray()
    hdr += bytes.fromhex("D0CF11E0A1B11AE1") + b"\x00" * 16
    hdr += struct.pack("<HHHHH", 0x003E, 0x0003, 0xFFFE, 9, 6)
    hdr += b"\x00" * 6
    hdr += struct.pack("<IIIIIIIII", 0, n_fat, dir_start, 0, 4096, minifat_start, n_minifat, ENDOFCHAIN, 0)
    difat = [fat_start + i for i in range(n_fat)] + [FREESECT] * (109 - n_fat)
    hdr += b"".join(struct.pack("<I", x) for x in difat)
    assert len(hdr) == 512
    return bytes(hdr) + b"".join(sectors)


# ---------------------------------------------------------------- VBA プロジェクト
def _rec(rid, payload):
    return struct.pack("<HI", rid, len(payload)) + payload


def _template_info(template_path):
    o = olefile.OleFileIO(template_path)
    d = bytes(decompress_stream(bytearray(o.openstream("VBA/dir").read())))
    i = 0
    while True:
        rid, sz = struct.unpack_from("<HI", d, i)
        if rid == 0x0F:
            head = d[:i]
            break
        if rid == 0x09:
            sz = 6
        i += 6 + sz
    project = o.openstream("PROJECT").read().decode(CODEPAGE)
    o.close()
    return head, project


def build_vba_project(template_path, modules):
    """modules: [(name, kind, code)]  kind = "workbook" | "sheet" | "std"
    code は Attribute 行を除いた本文（改行は \\n で可）。"""
    head, project_tpl = _template_info(template_path)
    streams = {}
    dir_body = bytearray(head)
    dir_body += _rec(0x0F, struct.pack("<H", len(modules)))
    dir_body += _rec(0x13, struct.pack("<H", 0xFFFF))
    for name, kind, code in modules:
        if kind == "workbook":
            src = DOC_ATTRS.format(name=name, base=WORKBOOK_BASE)
        elif kind == "sheet":
            src = DOC_ATTRS.format(name=name, base=SHEET_BASE)
        else:
            src = 'Attribute VB_Name = "%s"\r\n' % name
        body = code.replace("\r\n", "\n").replace("\n", "\r\n")
        if body and not body.endswith("\r\n"):
            body += "\r\n"
        src += body
        streams[name] = compress(src.encode(CODEPAGE))
        mb, u16 = name.encode(CODEPAGE), name.encode("utf-16-le")
        dir_body += _rec(0x19, mb) + _rec(0x47, u16)
        dir_body += _rec(0x1A, mb) + _rec(0x32, u16)
        dir_body += _rec(0x1C, b"") + _rec(0x48, b"")
        dir_body += _rec(0x31, struct.pack("<I", 0))
        dir_body += _rec(0x1E, struct.pack("<I", 0))
        dir_body += _rec(0x2C, struct.pack("<H", 0xFFFF))
        dir_body += _rec(0x22 if kind in ("workbook", "sheet") else 0x21, b"")
        dir_body += _rec(0x2B, b"")
    dir_body += _rec(0x10, b"")

    # PROJECT ストリーム
    lines = project_tpl.replace("\r\n", "\n").split("\n")
    id_line = next(l for l in lines if l.startswith("ID="))
    keep = [l for l in lines if l.split("=")[0] in ("Name", "HelpContextID", "VersionCompatible32", "CMG", "DPB", "GC")]
    hi = lines.index("[Host Extender Info]")
    host = []
    for l in lines[hi:]:
        if not l:
            break
        host.append(l)
    out = [id_line]
    for name, kind, _ in modules:
        out.append(("Document=%s/&H00000000" % name) if kind in ("workbook", "sheet") else "Module=%s" % name)
    out += keep + [""] + host + ["", "[Workspace]"]
    out += ["%s=0, 0, 0, 0, C" % name for name, _, _ in modules]
    project = ("\r\n".join(out) + "\r\n").encode(CODEPAGE)

    wm = b"".join(n.encode(CODEPAGE) + b"\x00" + n.encode("utf-16-le") + b"\x00\x00" for n, _, _ in modules) + b"\x00\x00"

    vba = {"_VBA_PROJECT": b"\xcc\x61\xff\xff\x00\x00\x00", "dir": compress(bytes(dir_body))}
    vba.update(streams)
    return write_cfb({"PROJECT": project, "PROJECTwm": wm, "VBA": vba})
