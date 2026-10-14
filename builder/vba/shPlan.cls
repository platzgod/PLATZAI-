Option Explicit

' ダブルクリック（タブレットではダブルタップ）で受講済み・確認済みを付け外しする
'  各科目6行: 1講座の帯 / 2回 / 3塾の教材 / 4塾の毎月チェック / 5家庭学習の教材 / 6家庭学習の毎月チェック
'  B〜R列 = 17期間（高2の1月〜直前Ⅱ期）、共通テスト対策: W〜Z列(9〜12月)
Private Sub Worksheet_BeforeDoubleClick(ByVal Target As Range, Cancel As Boolean)
    Dim c As Range, v As String, mark As String, off As Long, lastRow As Long
    Set c = Target.Cells(1, 1)
    mark = ChrW(&H2611)                                    ' チェック済みの印
    v = CStr(c.Value)
    lastRow = FIRST_ROW + NSUB * BLOCK - 1
    If c.Row < FIRST_ROW Or c.Row > lastRow Then Exit Sub
    If c.Column >= 2 And c.Column <= 1 + NPER Then
        off = (c.Row - FIRST_ROW) Mod BLOCK
        If off = 1 Then                                    ' 講座の回
            If v = "" Or v = ChrW(&H203B) Then Exit Sub    ' 空欄・※ は対象外
            Cancel = True
            If Left(v, 1) = mark Then c.Value = Mid(v, 2) Else c.Value = mark & v
        ElseIf off = 3 Or off = 5 Then                     ' 教材の毎月チェック
            If v = ChrW(&H2610) Then
                Cancel = True: c.Value = mark
            ElseIf v = mark Then
                Cancel = True: c.Value = ChrW(&H2610)
            End If
        End If
    ElseIf c.Column >= COL_KYOTE + 1 And c.Column <= COL_KYOTE + 4 Then   ' 共通テスト対策
        If v = "" Then Exit Sub
        Cancel = True
        If Left(v, 1) = mark Then c.Value = Mid(v, 2) Else c.Value = mark & v
    End If
End Sub
