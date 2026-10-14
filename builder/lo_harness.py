"""LibreOffice (UNO) で xlsm を開き、VBA マクロを実行して結果を確かめるテスト用ハーネス。

使い方（例）:
    with Office() as off:
        doc = off.open("file.xlsm")
        off.run(doc, "modCurriculum.ApplyRecommendedSilent")
        print(off.cell(doc, "合格一貫カリキュラム", "B8"))
"""
import os
import shutil
import socket
import subprocess
import tempfile
import time

import uno
from com.sun.star.beans import PropertyValue


def _pv(name, value):
    p = PropertyValue()
    p.Name, p.Value = name, value
    return p


class Office:
    def __enter__(self):
        self.profile = tempfile.mkdtemp(prefix="lo_prof_")
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        self.port = s.getsockname()[1]
        s.close()
        env = os.environ.copy()
        env["SAL_USE_VCLPLUGIN"] = "svp"
        self.proc = subprocess.Popen(
            ["soffice", "--headless", "--norestore", "--nologo",
             f"-env:UserInstallation=file://{self.profile}",
             f"--accept=socket,host=127.0.0.1,port={self.port};urp;"],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        for _ in range(120):
            try:
                self.ctx = resolver.resolve(f"uno:socket,host=127.0.0.1,port={self.port};urp;StarOffice.ComponentContext")
                break
            except Exception:
                time.sleep(0.5)
        else:
            raise RuntimeError("soffice did not start")
        self.smgr = self.ctx.ServiceManager
        self._enable_vba()
        self.desktop = self.smgr.createInstanceWithContext("com.sun.star.frame.Desktop", self.ctx)
        return self

    def _enable_vba(self):
        cp = self.smgr.createInstanceWithContext("com.sun.star.configuration.ConfigurationProvider", self.ctx)
        for path in ("/org.openoffice.Office.Calc/Filter/Import/VBA",):
            acc = cp.createInstanceWithArguments("com.sun.star.configuration.ConfigurationUpdateAccess",
                                                 (_pv("nodepath", path),))
            for k in ("Load", "Executable", "Save"):
                try:
                    acc.setPropertyValue(k, True)
                except Exception:
                    pass
            acc.commitChanges()

    def __exit__(self, *a):
        try:
            self.desktop.terminate()
        except Exception:
            pass
        try:
            self.proc.wait(timeout=20)
        except Exception:
            self.proc.kill()
        shutil.rmtree(self.profile, ignore_errors=True)

    def open(self, path):
        url = uno.systemPathToFileUrl(os.path.abspath(path))
        return self.desktop.loadComponentFromURL(url, "_blank", 0, (
            _pv("Hidden", True), _pv("MacroExecutionMode", 4)))

    def run(self, doc, macro, args=()):
        sp = doc.getScriptProvider()
        script = sp.getScript(f"vnd.sun.star.script:VBAProject.{macro}?language=Basic&location=document")
        return script.invoke(tuple(args), (), ())

    def sheet(self, doc, name):
        return doc.Sheets.getByName(name)

    def cell(self, doc, sheet, addr):
        c = self.sheet(doc, sheet).getCellRangeByName(addr)
        return c.String

    def set(self, doc, sheet, addr, value):
        c = self.sheet(doc, sheet).getCellRangeByName(addr)
        if isinstance(value, (int, float)):
            c.Value = value
        else:
            c.String = value

    def save_pdf(self, doc, path, sheet_name=None):
        url = uno.systemPathToFileUrl(os.path.abspath(path))
        props = [_pv("FilterName", "calc_pdf_Export")]
        doc.storeToURL(url, tuple(props))

    def save_as(self, doc, path, filt="Calc MS Excel 2007 VBA XML"):
        url = uno.systemPathToFileUrl(os.path.abspath(path))
        doc.storeToURL(url, (_pv("FilterName", filt),))
