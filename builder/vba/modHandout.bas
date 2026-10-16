Option Explicit

' ============================================================================
'  配布用カリキュラム（生徒に渡す A3 横の1枚）
'   管理表から、チェック欄・進捗・空欄を除いて組み直す。
'   科目ごとに中身のある行だけ：映像講座／受講回／塾の教材／家庭学習／共通テスト
'   共通テスト講座は 9月〜12月 の位置に「講座名：回 → 回 …」の帯で入れる
' ============================================================================

' 位置などの定数（関数にしているのは、どの環境でも確実に値が入るようにするため）
Private Function hSheet() As String: hSheet = "配布用カリキュラム": End Function
Private Function hFirst() As Long: hFirst = 7: End Function
Private Function hC0() As Long: hC0 = 3: End Function
Private Function hNPer() As Long: hNPer = 17: End Function
Private Function hKyStart() As Long: hKyStart = 11: End Function
Private Function hKyEnd() As Long: hKyEnd = 14: End Function
Private Function hClear() As Long: hClear = 150: End Function
Private Function hFont() As String: hFont = "游ゴシック": End Function

' ボタン：配布用を印刷
Public Sub PrintHandout()
    Dim ws As Worksheet
    MakeHandout
    Set ws = ThisWorkbook.Worksheets(hSheet)
    ws.Activate
    ws.PrintPreview
End Sub

Public Sub MakeHandout()
    Dim ws As Worksheet, pl As Worksheet, st As Worksheet
    Dim s As Long, r0 As Long, r As Long, rStart As Long, k As Long, i As Long, c As Long, e As Long
    Dim subj As String, col As Long, kinds As Variant, offs As Variant
    Dim t As String, txt As String, seq As String, kind As String, area As Range

    Set ws = ThisWorkbook.Worksheets(hSheet)
    Set pl = ThisWorkbook.Worksheets(PLAN_SHEET)
    Set st = ThisWorkbook.Worksheets("設定")
    Application.ScreenUpdating = False

    gStep = "配布用:クリア"
    Set area = ws.Range(ws.Cells(hFirst, 1), ws.Cells(hFirst + hClear, hC0 + hNPer - 1))
    area.UnMerge
    area.Clear
    area.EntireRow.RowHeight = 18
    gStep = "配布用:まとめ"
    ws.Range("A3").Value = SummaryText()

    kinds = Array("講座", "回", "塾", "家")
    offs = Array(0, 1, 2, 4)
    r = hFirst
    For s = 0 To NSUB - 1
        subj = CStr(st.Cells(SET_FIRST + s, 1).Value)
        r0 = FIRST_ROW + s * BLOCK
        col = pl.Cells(r0, 1).Interior.Color
        rStart = r
        If st.Cells(SET_FIRST + s, 2).Value = "○" Then
            For k = 0 To 3
                kind = CStr(kinds(k))
                If RowHasContent(pl, r0 + offs(k), kind) Then
                    gStep = "配布用:行見出し"
                    LabelRow ws, r, kind, col
                    c = 2
                    Do While c <= 1 + hNPer
                        e = c + pl.Cells(r0 + offs(k), c).MergeArea.Columns.Count - 1
                        t = CleanText(kind, CStr(pl.Cells(r0 + offs(k), c).Value))
                        gStep = "配布用:帯"
                        If t <> "" Then PutSpan ws, r, c - 2, e - 2, t, kind, col
                        c = e + 1
                    Loop
                    r = r + 1
                End If
            Next k
        End If
        If st.Cells(SET_FIRST + s, 3).Value = "○" Then
            For k = 0 To BLOCK - 1
                txt = CStr(pl.Cells(r0 + k, COL_KYOTE).Value)
                If txt <> "" Then
                    seq = ""
                    For i = 1 To 4
                        t = CleanText("回", CStr(pl.Cells(r0 + k, COL_KYOTE + i).Value))
                        If t <> "" Then
                            If seq <> "" Then seq = seq & " → "
                            seq = seq & t
                        End If
                    Next i
                    If seq <> "" Then txt = txt & "：" & seq
                    LabelRow ws, r, "共テ", col
                    PutSpan ws, r, hKyStart, hKyEnd, txt, "共テ", col
                    r = r + 1
                End If
            Next k
        End If
        gStep = "配布用:科目"
        If r > rStart Then FinishBlock ws, rStart, r - 1, subj, col
    Next s
    gStep = "配布用:フッター"
    Footer ws, r - 1
    Application.ScreenUpdating = True
End Sub

' 表示用に整える（受講回の済印と ※、教材の【塾】【家】、地歴の注記を外す）
Private Function CleanText(ByVal kind As String, ByVal v As String) As String
    v = Trim(v)
    If v = "" Then Exit Function
    If kind = "回" Then
        If Left(v, 1) = ChrW(&H2611) Then v = Mid(v, 2)
        If v = ChrW(&H203B) Then v = ""
    ElseIf kind = "塾" Or kind = "家" Then
        If Left(v, 1) = "（" Then
            v = ""
        ElseIf Left(v, 3) = "【塾】" Or Left(v, 3) = "【家】" Then
            v = Mid(v, 4)
        End If
    End If
    CleanText = v
End Function

Private Function RowHasContent(pl As Worksheet, ByVal r As Long, ByVal kind As String) As Boolean
    Dim c As Long
    For c = 2 To 1 + hNPer
        If CleanText(kind, CStr(pl.Cells(r, c).Value)) <> "" Then
            RowHasContent = True
            Exit Function
        End If
    Next c
End Function

Private Function KindLabel(ByVal kind As String) As String
    Select Case kind
        Case "講座": KindLabel = "映像講座"
        Case "回": KindLabel = "受講回"
        Case "塾": KindLabel = "塾の教材"
        Case "家": KindLabel = "家庭学習"
        Case Else: KindLabel = "共通テスト"
    End Select
End Function

' 色を白に向けて t（0〜1）だけ薄める
Private Function Tint(ByVal c As Long, ByVal t As Double) As Long
    Dim rr As Long, gg As Long, bb As Long
    rr = c Mod 256
    gg = (c \ 256) Mod 256
    bb = (c \ 65536) Mod 256
    Tint = RGB(rr + (255 - rr) * t, gg + (255 - gg) * t, bb + (255 - bb) * t)
End Function

Private Sub SetBorder(rng As Range, ByVal edge As Long, ByVal weight As Long, ByVal color As Long)
    With rng.Borders(edge)
        .LineStyle = xlContinuous
        .Weight = weight
        .Color = color
    End With
End Sub

Private Sub LabelRow(ws As Worksheet, ByVal r As Long, ByVal kind As String, ByVal col As Long)
    Dim lineC As Long, rng As Range
    lineC = RGB(&HC9, &HCE, &HD8)
    Select Case kind
        Case "講座": ws.Rows(r).RowHeight = 20
        Case "回": ws.Rows(r).RowHeight = 14
        Case Else: ws.Rows(r).RowHeight = 18
    End Select
    Set rng = ws.Range(ws.Cells(r, 2), ws.Cells(r, hC0 + hNPer - 1))
    SetBorder rng, xlEdgeLeft, xlThin, lineC
    SetBorder rng, xlEdgeRight, xlThin, lineC
    SetBorder rng, xlEdgeTop, xlThin, lineC
    SetBorder rng, xlEdgeBottom, xlThin, lineC
    SetBorder rng, xlInsideVertical, xlThin, lineC
    ws.Range(ws.Cells(r, hC0), ws.Cells(r, hC0 + hNPer - 1)).Interior.Color = RGB(&HF4, &HF5, &HF8)
    With ws.Cells(r, 2)
        .Value = KindLabel(kind)
        .Font.Name = hFont
        .Font.Size = 8
        .Font.Bold = True
        .Font.Color = col
        .Interior.Color = Tint(col, 0.88)
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
    End With
End Sub

Private Sub PutSpan(ws As Worksheet, ByVal r As Long, ByVal a As Long, ByVal b As Long, ByVal text As String, _
                    ByVal kind As String, ByVal col As Long)
    Dim rng As Range, bg As Long, fc As Long, sz As Double, bold As Boolean
    Set rng = ws.Range(ws.Cells(r, hC0 + a), ws.Cells(r, hC0 + b))
    Select Case kind
        Case "講座": bg = col: fc = RGB(255, 255, 255): sz = 9: bold = True
        Case "回": bg = Tint(col, 0.9): fc = RGB(&H1D, &H24, &H33): sz = 8: bold = False
        Case "塾": bg = Tint(col, 0.7): fc = RGB(&H1D, &H24, &H33): sz = 8.5: bold = True
        Case "家": bg = RGB(&HFC, &HEB, &HD6): fc = RGB(&H1D, &H24, &H33): sz = 8.5: bold = True
        Case Else: bg = Tint(col, 0.8): fc = RGB(&H17, &H35, &H8F): sz = 8.5: bold = True
    End Select
    If b > a Then rng.Merge
    rng.Interior.Color = bg
    With rng.Cells(1, 1)
        .Value = text
        .Font.Name = hFont
        .Font.Size = sz
        .Font.Bold = bold
        .Font.Color = fc
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
        .ShrinkToFit = True
    End With
End Sub

Private Sub FinishBlock(ws As Worksheet, ByVal rStart As Long, ByVal rEnd As Long, ByVal subj As String, ByVal col As Long)
    Dim navy As Long, rng As Range
    navy = RGB(&H17, &H35, &H8F)
    Set rng = ws.Range(ws.Cells(rStart, 1), ws.Cells(rEnd, 1))
    If rEnd > rStart Then rng.Merge
    rng.Interior.Color = col
    With rng.Cells(1, 1)
        .Value = subj
        .Font.Name = hFont
        .Font.Size = IIf(Len(subj) <= 3, 12, 10)
        .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
        .WrapText = True
    End With
    SetBorder rng, xlEdgeLeft, xlMedium, navy
    SetBorder ws.Range(ws.Cells(rEnd, 1), ws.Cells(rEnd, hC0 + hNPer - 1)), xlEdgeBottom, xlMedium, navy
    SetBorder ws.Range(ws.Cells(rStart, hC0 + hKyStart), ws.Cells(rEnd, hC0 + hKyStart)), xlEdgeLeft, xlMedium, navy
End Sub

Private Sub Footer(ws As Worksheet, ByVal lastRow As Long)
    Dim f1 As Long, f2 As Long, lastC As Long, gray As Long
    f1 = lastRow + 2
    f2 = lastRow + 3
    lastC = hC0 + hNPer - 1
    gray = RGB(&H6B, &H74, &H88)
    ws.Range(ws.Cells(f1, 1), ws.Cells(f1, lastC)).Merge
    ws.Cells(f1, 1).Value = "※ 受講回・教材の進め方は目安です。学習の進み具合に合わせて講師が調整します。" & _
                            "共通テスト対策は9月スタート。直前期は志望校の過去問演習が中心になります。"
    ws.Range(ws.Cells(f2, 1), ws.Cells(f2, lastC - 3)).Merge
    ws.Cells(f2, 1).Value = "高校・大学受験専門 個人指導塾PLATZ ／ 〒373-0817 群馬県太田市飯塚町1417-1 ／ TEL 0276-55-4230 ／ 定休日：日・水"
    ws.Range(ws.Cells(f2, lastC - 2), ws.Cells(f2, lastC)).Merge
    ws.Cells(f2, lastC - 2).Formula = "=""作成日：""&TEXT(基準日,""yyyy年m月d日"")"
    ws.Cells(f2, lastC - 2).HorizontalAlignment = xlRight
    With ws.Range(ws.Cells(f1, 1), ws.Cells(f2, lastC)).Font
        .Name = hFont
        .Size = 8.5
        .Color = gray
    End With
    On Error Resume Next
    ws.PageSetup.PrintArea = ws.Range(ws.Cells(1, 1), ws.Cells(f2, lastC)).Address
    On Error GoTo 0
End Sub

' 3行目：パターン・受験科目のまとめ
Private Function SummaryText() As String
    Dim items As Range, chk As Range, i As Long, ko As String, ky As String
    Set items = ThisWorkbook.Names("kItems").RefersToRange
    Set chk = ThisWorkbook.Names("kChecks").RefersToRange
    For i = 1 To items.Rows.Count
        If CStr(chk.Cells(i, 1).Value) = ChrW(&H2713) Then
            If ko <> "" Then ko = ko & "・"
            ko = ko & CStr(items.Cells(i, 1).Value)
        End If
        If CStr(chk.Cells(i, 2).Value) = ChrW(&H2713) Then
            If ky <> "" Then ky = ky & "・"
            ky = ky & CStr(items.Cells(i, 1).Value)
        End If
    Next i
    If ko = "" Then ko = "なし"
    If ky = "" Then ky = "なし"
    SummaryText = NV("kPatternKey") & "　｜　個別試験：" & ko & "　｜　共通テスト：" & ky
End Function
