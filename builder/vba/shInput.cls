Option Explicit

' 志望校・文理・偏差値・選択科目を変えたら、おすすめカリキュラムを自動で反映する
Private Sub Worksheet_Change(ByVal Target As Range)
    If gBusy Then Exit Sub
    If Intersect(Target, ThisWorkbook.Names("kAutoInputs").RefersToRange) Is Nothing Then Exit Sub
    If NV("kAutoApply") <> "する" Then Exit Sub
    AutoApply
End Sub
