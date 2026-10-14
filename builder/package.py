"""openpyxl が書き出した .xlsx を後処理して .xlsm にする。

- xl/vbaProject.bin を追加し、ContentTypes / workbook のリレーションを差し替える
- マクロ登録ボタン（図形 + macro 属性）を DrawingML で各シートに追加する
"""
import re
import zipfile
from xml.sax.saxutils import escape

EMU_PER_PX = 9525

XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
DRAWING_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"
DRAWING_CT = "application/vnd.openxmlformats-officedocument.drawing+xml"


def _shape(idx, btn):
    """btn: dict(col, row, col2, row2, text, macro, fill, color)  col/row は 0 始まり"""
    fill = btn.get("fill", "17358F")
    color = btn.get("color", "FFFFFF")
    size = btn.get("size", 1100)
    return f"""<xdr:twoCellAnchor editAs="absolute">
<xdr:from><xdr:col>{btn['col']}</xdr:col><xdr:colOff>{btn.get('dx', 38100)}</xdr:colOff><xdr:row>{btn['row']}</xdr:row><xdr:rowOff>{btn.get('dy', 19050)}</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>{btn['col2']}</xdr:col><xdr:colOff>{btn.get('dx2', 0)}</xdr:colOff><xdr:row>{btn['row2']}</xdr:row><xdr:rowOff>{btn.get('dy2', 0)}</xdr:rowOff></xdr:to>
<xdr:sp macro="{escape(btn['macro'])}" textlink="">
<xdr:nvSpPr><xdr:cNvPr id="{idx + 2}" name="Btn{idx + 1}"/><xdr:cNvSpPr/></xdr:nvSpPr>
<xdr:spPr><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="{fill}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="0F2560"/></a:solidFill></a:ln></xdr:spPr>
<xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip" wrap="square" lIns="36000" tIns="0" rIns="36000" bIns="0" rtlCol="0" anchor="ctr"/><a:lstStyle/>
<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" altLang="en-US" sz="{size}" b="1"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:latin typeface="游ゴシック"/><a:ea typeface="游ゴシック"/></a:rPr><a:t>{escape(btn['text'])}</a:t></a:r></a:p>
</xdr:txBody></xdr:sp><xdr:clientData fPrintsWithSheet="0"/></xdr:twoCellAnchor>"""


def _drawing_xml(buttons):
    body = "".join(_shape(i, b) for i, b in enumerate(buttons))
    return (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            f'<xdr:wsDr xmlns:xdr="{XDR}" xmlns:a="{A}">{body}</xdr:wsDr>')


def make_xlsm(xlsx_path, out_path, vba_bin, buttons_by_sheet):
    """buttons_by_sheet: {シート名: [btn, ...]}"""
    zin = zipfile.ZipFile(xlsx_path)
    files = {n: zin.read(n) for n in zin.namelist()}
    zin.close()

    # シート名 → sheetN.xml
    wb_xml = files["xl/workbook.xml"].decode("utf-8")
    rels = files["xl/_rels/workbook.xml.rels"].decode("utf-8")
    rid_target = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels))
    rid_target.update({k: v for v, k in re.findall(r'Target="([^"]+)"[^>]*Id="(rId\d+)"', rels)})
    sheet_file = {}
    for name, rid in re.findall(r'<sheet [^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"', wb_xml):
        t = rid_target[rid]
        t = t[1:] if t.startswith("/") else "xl/" + t
        sheet_file[name.replace("&amp;", "&")] = t

    ct = files["[Content_Types].xml"].decode("utf-8")
    ct = ct.replace("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
                    "application/vnd.ms-excel.sheet.macroEnabled.main+xml")
    if 'Extension="bin"' not in ct:
        ct = ct.replace("<Default ", '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/><Default ', 1)

    files["xl/vbaProject.bin"] = vba_bin
    if "vbaProject.bin" not in rels:
        rels = rels.replace("</Relationships>",
                            '<Relationship Id="rIdVBA" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>')

    n_drawing = len([n for n in files if n.startswith("xl/drawings/drawing")]) + 1
    for sheet_name, buttons in buttons_by_sheet.items():
        if not buttons:
            continue
        sf = sheet_file[sheet_name]
        sx = files[sf].decode("utf-8")
        assert "<drawing " not in sx, f"{sheet_name} は既に drawing を持っています"
        dname = f"drawing{n_drawing}.xml"
        n_drawing += 1
        files[f"xl/drawings/{dname}"] = _drawing_xml(buttons).encode("utf-8")
        ct = ct.replace("</Types>", f'<Override PartName="/xl/drawings/{dname}" ContentType="{DRAWING_CT}"/></Types>')
        relpath = sf.replace("worksheets/", "worksheets/_rels/") + ".rels"
        if relpath in files:
            srels = files[relpath].decode("utf-8")
        else:
            srels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                     '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>')
        srels = srels.replace("</Relationships>",
                              f'<Relationship Id="rIdBtn" Type="{DRAWING_REL}" Target="../drawings/{dname}"/></Relationships>')
        files[relpath] = srels.encode("utf-8")
        if "xmlns:r=" not in sx[:2000]:
            sx = sx.replace("<worksheet ", f'<worksheet xmlns:r="{R_NS}" ', 1)
        # <drawing> は pageSetup/headerFooter/rowBreaks/colBreaks の後、legacyDrawing/tableParts/extLst の前
        m = re.search(r"<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b", sx)
        tag = '<drawing r:id="rIdBtn"/>'
        if m:
            sx = sx[:m.start()] + tag + sx[m.start():]
        else:
            sx = sx.replace("</worksheet>", tag + "</worksheet>")
        files[sf] = sx.encode("utf-8")

    files["[Content_Types].xml"] = ct.encode("utf-8")
    files["xl/_rels/workbook.xml.rels"] = rels.encode("utf-8")
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        order = ["[Content_Types].xml"] + [n for n in files if n != "[Content_Types].xml"]
        for n in order:
            z.writestr(n, files[n])
