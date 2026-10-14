Option Explicit

' ============================================================================
'  おすすめカリキュラムの自動反映
'   生徒情報シートの「系統」「前期レベル」「後期レベル」（数式で自動判定）をもとに、
'   カリキュラムDB / 共テDB / 教材マスタから管理表・模試自学シートへ書き込む。
'   前期 = 高2の1月〜夏期Ⅱ期（17期間のうち 1〜11 列目）、後期 = 9月〜直前Ⅱ期（12〜17 列目）
' ============================================================================

Public Const PLAN_SHEET As String = "合格一貫カリキュラム"
Public Const FIRST_ROW As Long = 8
Public Const BLOCK As Long = 6
Public Const NSUB As Long = 12
Public Const NPER As Long = 17
Public Const SPLIT_AT As Long = 11          ' 前期の期間数
Public Const COL_PROGRESS As Long = 19      ' S列：進捗
Public Const COL_CHECK As Long = 21         ' U列：受講する講座のチェック
Public Const COL_KYOTE As Long = 22         ' V列：共通テスト講座名
Public Const SET_FIRST As Long = 13         ' 設定シート：受験科目の先頭行
Public Const MAT_FIRST As Long = 20         ' 模試・自学：② 教材の先頭行
Public Const MAT_COUNT As Long = 10

Public gBusy As Boolean
Public gSilent As Boolean
Public gLastError As String

' --- ボタン：おすすめカリキュラムを反映
Public Sub ApplyRecommended()
    If HasChecks() Then
        If MsgBox("管理表にチェック済み（" & ChrW(&H2611) & "）の記録があります。" & vbLf & _
                  "おすすめカリキュラムを反映すると、講座・教材とチェックが入れ替わります。続けますか？", _
                  vbYesNo + vbExclamation, "おすすめカリキュラムを反映") <> vbYes Then Exit Sub
    End If
    BuildCurriculum
    If gLastError <> "" Then Exit Sub
    MsgBox "おすすめカリキュラムを反映しました。" & vbLf & vbLf & _
           "系統：" & NV("kSystem") & vbLf & _
           "前期（高2の1月〜夏期）：" & NV("kPreLevel") & "レベル" & vbLf & _
           "後期（9月〜直前）：" & NV("kPostLevel") & "レベル", vbInformation, "おすすめカリキュラムを反映"
End Sub

' --- 確認なしで反映（生徒情報の入力変更時・テスト用）
Public Sub ApplyRecommendedSilent()
    gSilent = True
    BuildCurriculum
    gSilent = False
End Sub

' 直前の反映で起きたエラー（テスト・確認用）
Public Function LastError() As String
    LastError = gLastError
End Function

' --- 生徒情報シートの入力が変わったとき
Public Sub AutoApply()
    If gBusy Then Exit Sub
    If HasChecks() Then
        If MsgBox("志望校・偏差値などが変わりました。おすすめカリキュラムを反映し直しますか？" & vbLf & _
                  "（チェック済み（" & ChrW(&H2611) & "）の記録は消えます。『いいえ』なら今の管理表のままです）", _
                  vbYesNo + vbQuestion, "おすすめカリキュラム") <> vbYes Then Exit Sub
    End If
    BuildCurriculum
End Sub

' --- 名前の定義（生徒情報シートの判定セルなど）の値
Public Function NV(ByVal nm As String) As String
    NV = CStr(ThisWorkbook.Names(nm).RefersToRange.Value)
End Function

' --- 管理表にチェック済みが1つでもあるか
Public Function HasChecks() As Boolean
    Dim ws As Worksheet, mark As String, n As Double
    Set ws = ThisWorkbook.Worksheets(PLAN_SHEET)
    mark = ChrW(&H2611)
    n = Application.WorksheetFunction.CountIf(ws.Range(ws.Cells(FIRST_ROW, 2), ws.Cells(FIRST_ROW + NSUB * BLOCK - 1, 1 + NPER)), mark & "*")
    n = n + Application.WorksheetFunction.CountIf(ws.Range(ws.Cells(FIRST_ROW, COL_KYOTE + 1), ws.Cells(FIRST_ROW + NSUB * BLOCK - 1, COL_KYOTE + 4)), mark & "*")
    HasChecks = (n > 0)
End Function

' --- 本体
Public Sub BuildCurriculum()
    Dim ws As Worksheet, db As Worksheet, st As Worksheet
    Dim sysName As String, preLv As String, postLv As String, school As String
    Dim s As Long, r As Long, subj As String, lastRow As Long
    Dim prevEvents As Boolean

    On Error GoTo fail
    gLastError = ""
    gBusy = True
    prevEvents = Application.EnableEvents
    Application.EnableEvents = False
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    Application.Calculate

    Set ws = ThisWorkbook.Worksheets(PLAN_SHEET)
    Set db = ThisWorkbook.Worksheets("カリキュラムDB")
    Set st = ThisWorkbook.Worksheets("設定")
    sysName = NV("kSystem")
    preLv = NV("kPreLevel")
    postLv = NV("kPostLevel")
    school = NV("kSchool")
    lastRow = FIRST_ROW + NSUB * BLOCK - 1

    ' 1) 受験科目（○）を、設定シートのおすすめ列からコピー
    For s = 0 To NSUB - 1
        st.Cells(SET_FIRST + s, 2).Value = st.Cells(SET_FIRST + s, 5).Value
        st.Cells(SET_FIRST + s, 3).Value = st.Cells(SET_FIRST + s, 6).Value
    Next s

    ' 2) 管理表をクリア
    With ws.Range(ws.Cells(FIRST_ROW, 2), ws.Cells(lastRow, 1 + NPER))
        .UnMerge
        .ClearContents
    End With
    ws.Range(ws.Cells(FIRST_ROW, COL_CHECK), ws.Cells(lastRow, COL_KYOTE + 4)).ClearContents
    ws.Rows(FIRST_ROW & ":" & lastRow).Hidden = False

    ' 3) 科目ごとに書き込み
    For s = 0 To NSUB - 1
        subj = CStr(st.Cells(SET_FIRST + s, 1).Value)
        r = FIRST_ROW + s * BLOCK
        If st.Cells(SET_FIRST + s, 2).Value = "○" Then
            WriteBand ws, db, r, sysName & "|" & subj, preLv, postLv, "講座", school, False
            WriteBand ws, db, r + 1, sysName & "|" & subj, preLv, postLv, "回", school, False
            WriteBand ws, db, r + 2, sysName & "|" & subj, preLv, postLv, "塾", school, True
            WriteBand ws, db, r + 4, sysName & "|" & subj, preLv, postLv, "家", school, True
        End If
        If st.Cells(SET_FIRST + s, 3).Value = "○" Then WriteKyote ws, r, subj
    Next s

    ' 4) 模試・自学シートの家庭学習教材リスト
    FillMaterials

    Application.DisplayAlerts = True
    Application.EnableEvents = prevEvents
    ApplySubjects
    gBusy = False
    Exit Sub
fail:
    gLastError = "BuildCurriculum: " & Err.Number & " " & Err.Description
    Application.DisplayAlerts = True
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    gBusy = False
    If Not gSilent Then MsgBox "反映中にエラーが起きました。" & vbLf & gLastError, vbExclamation, "おすすめカリキュラム"
End Sub

' 1行分（17期間）を前期・後期の2つのパターンから組み立てて書き込む
'   withChecks = True なら、教材の帯の下の行に未チェックの印を置く
Private Sub WriteBand(ws As Worksheet, db As Worksheet, r As Long, keyBase As String, _
                      preLv As String, postLv As String, kind As String, school As String, withChecks As Boolean)
    Dim vals(1 To 17) As String, c As Long, m As Variant, lv As String, v As String
    Dim startC As Long, endC As Long, k As Long

    For c = 1 To NPER
        If c <= SPLIT_AT Then lv = preLv Else lv = postLv
        If c = 1 Or c = SPLIT_AT + 1 Then
            m = Application.Match(keyBase & "|" & lv & "|" & kind, db.Columns(1), 0)
        End If
        If IsError(m) Then
            vals(c) = ""
        Else
            vals(c) = CStr(db.Cells(m, 5 + c).Value)
        End If
    Next c

    c = 1
    Do While c <= NPER
        v = vals(c)
        If v = "" Or v = ChrW(&H2190) Then
            c = c + 1
        Else
            startC = c
            endC = c
            Do While endC < NPER
                If vals(endC + 1) <> ChrW(&H2190) Then Exit Do
                endC = endC + 1
            Loop
            ws.Cells(r, 1 + startC).Value = Replace(v, "{志望校}", school)
            If endC > startC Then ws.Range(ws.Cells(r, 1 + startC), ws.Cells(r, 1 + endC)).Merge
            If withChecks And Left(v, 1) <> "（" Then
                For k = startC To endC
                    ws.Cells(r + 1, 1 + k).Value = ChrW(&H2610)
                Next k
            End If
            c = endC + 1
        End If
    Loop
End Sub

' 共通テスト対策（V〜Z列）
Private Sub WriteKyote(ws As Worksheet, r As Long, subj As String)
    Dim kd As Worksheet, i As Long, k As Long, tag As String, ok As Boolean, lastR As Long
    Dim bunri As String, soc As String
    Set kd = ThisWorkbook.Worksheets("共テDB")
    bunri = NV("kBunri")
    soc = NV("kSocial1") & "/" & NV("kSocial2")
    lastR = Application.WorksheetFunction.CountA(kd.Columns(1))
    k = 0
    For i = 2 To lastR
        If CStr(kd.Cells(i, 1).Value) = subj Then
            tag = CStr(kd.Cells(i, 7).Value)
            Select Case tag
                Case "全", "情報": ok = True
                Case "文系", "理系": ok = (tag = bunri)
                Case "公共政経": ok = (InStr(soc, "政経") > 0)
                Case "公共倫理": ok = (InStr(soc, "倫理") > 0)
                Case Else: ok = False
            End Select
            If ok And k < BLOCK Then
                ws.Cells(r + k, COL_KYOTE).Value = kd.Cells(i, 2).Value
                ws.Cells(r + k, COL_KYOTE + 1).Value = kd.Cells(i, 3).Value
                ws.Cells(r + k, COL_KYOTE + 2).Value = kd.Cells(i, 4).Value
                ws.Cells(r + k, COL_KYOTE + 3).Value = kd.Cells(i, 5).Value
                ws.Cells(r + k, COL_KYOTE + 4).Value = kd.Cells(i, 6).Value
                k = k + 1
            End If
        End If
    Next i
End Sub

' 模試・自学シート ② 家庭学習推奨教材：管理表の【家】の教材を教材マスタと照合して並べる
Private Sub FillMaterials()
    Dim ws As Worksheet, mk As Worksheet, ms As Worksheet, st As Worksheet
    Dim names(1 To 10) As String, n As Long, s As Long, c As Long, i As Long, j As Long
    Dim txt As String, key As String, lastM As Long, dup As Boolean, anyKyote As Boolean
    Set ws = ThisWorkbook.Worksheets(PLAN_SHEET)
    Set mk = ThisWorkbook.Worksheets("模試・自学")
    Set ms = ThisWorkbook.Worksheets("教材マスタ")
    Set st = ThisWorkbook.Worksheets("設定")
    lastM = Application.WorksheetFunction.CountA(ms.Columns(1))
    n = 0
    anyKyote = False
    For s = 0 To NSUB - 1
        If st.Cells(SET_FIRST + s, 3).Value = "○" Then anyKyote = True
        If st.Cells(SET_FIRST + s, 2).Value = "○" Then
            For c = 2 To 1 + NPER
                txt = CStr(ws.Cells(FIRST_ROW + s * BLOCK + 4, c).Value)
                If txt <> "" Then
                    For i = 2 To lastM
                        key = CStr(ms.Cells(i, 1).Value)
                        If key <> "" And key <> "共通テスト過去問" And key <> "過去問" And InStr(txt, key) > 0 Then
                            dup = False
                            For j = 1 To n
                                If names(j) = key Then dup = True
                            Next j
                            If Not dup And n < MAT_COUNT - 2 Then
                                n = n + 1
                                names(n) = key
                            End If
                        End If
                    Next i
                End If
            Next c
        End If
    Next s
    If anyKyote Then
        n = n + 1
        names(n) = "共通テスト過去問"
    End If
    n = n + 1
    names(n) = "過去問"

    For j = 0 To MAT_COUNT - 1
        mk.Range(mk.Cells(MAT_FIRST + j, 1), mk.Cells(MAT_FIRST + j, 4)).ClearContents
        mk.Cells(MAT_FIRST + j, 6).MergeArea.ClearContents
    Next j
    For j = 1 To n
        For i = 2 To lastM
            If CStr(ms.Cells(i, 1).Value) = names(j) Then
                mk.Cells(MAT_FIRST + j - 1, 1).Value = ms.Cells(i, 2).Value
                mk.Cells(MAT_FIRST + j - 1, 2).Value = ms.Cells(i, 3).Value
                mk.Cells(MAT_FIRST + j - 1, 3).Value = ms.Cells(i, 4).Value
                mk.Cells(MAT_FIRST + j - 1, 6).Value = ms.Cells(i, 5).Value
                Exit For
            End If
        Next i
    Next j
End Sub
