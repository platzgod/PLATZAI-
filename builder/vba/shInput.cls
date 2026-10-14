Option Explicit

' データシート：第1志望校・文理・レベル指定・受験科目のチェックを変えたら、カリキュラムに自動で反映する
Private Sub Worksheet_Change(ByVal Target As Range)
    If gBusy Then Exit Sub
    If Intersect(Target, ThisWorkbook.Names("kAutoInputs").RefersToRange) Is Nothing And _
       Intersect(Target, ThisWorkbook.Names("kChecks").RefersToRange) Is Nothing Then Exit Sub
    If NV("kAutoApply") <> "する" Then Exit Sub
    AutoApply
End Sub

' 受験科目のチェック欄はダブルクリックで付け外し
Private Sub Worksheet_BeforeDoubleClick(ByVal Target As Range, Cancel As Boolean)
    Dim c As Range
    Set c = Target.Cells(1, 1)
    If Intersect(c, ThisWorkbook.Names("kChecks").RefersToRange) Is Nothing Then Exit Sub
    Cancel = True
    If CStr(c.Value) = ChrW(&H2713) Then c.Value = "" Else c.Value = ChrW(&H2713)
End Sub
