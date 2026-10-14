Option Explicit

' ボタン：科目を反映
' 設定シートの受験科目（○）に合わせて、管理表の科目（6行ずつ）を表示/非表示にし、A3横に収まるよう列幅を調整する
Public Sub ApplySubjects()
    Dim ws As Worksheet, st As Worksheet, s As Long, r As Long, k As Long, show As Boolean
    Set ws = ThisWorkbook.Worksheets(PLAN_SHEET)
    Set st = ThisWorkbook.Worksheets("設定")
    Application.ScreenUpdating = False
    For s = 0 To NSUB - 1
        show = (st.Cells(SET_FIRST + s, 2).Value = "○") Or (st.Cells(SET_FIRST + s, 3).Value = "○")
        r = FIRST_ROW + s * BLOCK
        ws.Rows(r & ":" & (r + BLOCK - 1)).Hidden = Not show
        ' 共通テストだけで使う科目は、共通テスト講座が入っている行（最低2行）だけ残す
        If show And st.Cells(SET_FIRST + s, 2).Value <> "○" Then
            For k = 2 To BLOCK - 1
                If CStr(ws.Cells(r + k, COL_KYOTE).Value) = "" Then ws.Rows(r + k).Hidden = True
            Next k
        End If
    Next s
    FitA3 ws
    Application.ScreenUpdating = True
End Sub

' 表示中の行の高さから、A3横（印刷域 404mm×284mm）の比率になるよう B〜R列（17期間）の幅を決める
Public Sub FitA3(ws As Worksheet)
    Dim k As Long, w As Double, h As Double, cw As Double, per As Double, lastRow As Long
    lastRow = FIRST_ROW + NSUB * BLOCK + 1
    On Error GoTo done
    For k = 1 To 5
        w = ws.Range("A1:Z1").Width
        h = ws.Range("A1:A" & lastRow).Height
        cw = ws.Columns("B").ColumnWidth
        per = ws.Range("B1").Width / cw
        cw = cw + ((h * 404# / 284# - w) / CDbl(NPER)) / per
        If cw < 4 Then cw = 4
        If cw > 30 Then cw = 30
        ws.Range("B:R").ColumnWidth = Round(cw, 2)
    Next k
done:
End Sub

' ボタン：成績表を印刷
' 使っていない科目・模試・教材の行を隠してから、成績表と成績グラフ（2枚）の印刷プレビューを開く
Public Sub PrintReport()
    Dim ws As Worksheet
    PrepareReport
    Set ws = ThisWorkbook.Worksheets("成績表")
    ws.Activate
    ThisWorkbook.Worksheets(Array("成績表", "成績グラフ")).PrintPreview   ' 1枚目：レポート、2枚目：グラフ
    ws.Select
End Sub

Public Sub PrepareReport()
    Dim ws As Worksheet, r As Long
    Application.Calculate
    Set ws = ThisWorkbook.Worksheets("成績表")
    Application.ScreenUpdating = False
    For r = 12 To 23                                   ' 講座：回が1つもない科目は隠す
        ws.Rows(r).Hidden = (Val(CStr(ws.Cells(r, "O").Value)) = 0)
    Next r
    For r = 27 To 34                                   ' 模試：模試名が空の行は隠す
        ws.Rows(r).Hidden = (CStr(ws.Cells(r, "A").Value) = "")
    Next r
    For r = 40 To 49                                   ' 自学教材：教材名が空の行は隠す
        ws.Rows(r).Hidden = (CStr(ws.Cells(r, "C").Value) = "")
    Next r
    Application.ScreenUpdating = True
End Sub

' ボタン：管理表（A3横）を印刷
Public Sub PrintPlan()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(PLAN_SHEET)
    ws.Activate
    ws.PrintPreview
End Sub
