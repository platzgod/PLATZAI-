# 初回だけ実行するセットアップ（「セットアップ.bat」をダブルクリック）
# 1. 必要なソフトの確認  2. Python ライブラリのインストール  3. フォルダ作成
# 4. OneDrive の「常にこのデバイスに保持」  5. タスクスケジューラーへの登録（毎日 13:00 と 21:00）
param(
    [string[]]$Times = @('13:00', '21:00'),
    [string]$TaskName = 'AI自動添削'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ok = $true

function Step($text) { Write-Host ''; Write-Host "■ $text" -ForegroundColor Cyan }
function Good($text) { Write-Host "  OK  $text" -ForegroundColor Green }
function Bad($text)  { Write-Host "  NG  $text" -ForegroundColor Red; $script:ok = $false }

Step "フォルダ: $root"
if ($env:OneDrive -and $root.StartsWith($env:OneDrive)) { Good 'OneDrive の中にあります' }
else { Write-Host '  注意  OneDrive の外にあります。先生と共有する場合は OneDrive の中に置いてください。' -ForegroundColor Yellow }

Step '必要なソフトの確認'
if (Get-Command claude -ErrorAction SilentlyContinue) { Good ('Claude Code: ' + (& claude --version)) }
else { Bad 'Claude Code が見つかりません。https://claude.com/claude-code の手順でインストールし、一度 claude を起動してログインしてください。' }
if (Get-Command git -ErrorAction SilentlyContinue) { Good 'Git for Windows' }
else { Bad 'Git for Windows が見つかりません（Claude Code が使います）。https://git-scm.com/download/win からインストールしてください。' }
$py = if (Get-Command python -ErrorAction SilentlyContinue) { 'python' } elseif (Get-Command py -ErrorAction SilentlyContinue) { 'py' } else { $null }
if ($py) { Good ('Python: ' + (& $py --version 2>&1)) }
else { Bad 'Python が見つかりません。https://www.python.org/downloads/ からインストールし、「Add python.exe to PATH」に必ずチェックを入れてください。' }

if ($py) {
    Step 'Python ライブラリのインストール'
    & $py -m pip install --quiet --upgrade python-docx pdfplumber
    if ($LASTEXITCODE -eq 0) { Good 'python-docx, pdfplumber' } else { Bad 'pip install に失敗しました' }
}

Step 'フォルダの作成'
foreach ($name in '添削前', '添削後', 'ログ', '作業用') {
    New-Item -ItemType Directory -Force -Path (Join-Path $root $name) | Out-Null
    Good $name
}

Step 'OneDrive: 常にこのデバイスに保持'
# クラウドにしか無い状態だと、自動実行のときにファイルを読めないことがあるため
& attrib.exe +P -U "$root" /S /D 2>$null
if ($LASTEXITCODE -eq 0) { Good '設定しました' } else { Write-Host '  注意  設定できませんでした。エクスプローラーでフォルダを右クリック →「常にこのデバイス上に保持する」を選んでください。' -ForegroundColor Yellow }

Step "タスクスケジューラーへの登録（$($Times -join ' と ')）"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$root\tools\run.ps1`"" `
    -WorkingDirectory $root
$triggers = $Times | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
# StartWhenAvailable: 予定時刻に PC が切れていたら、次に起動したときに実行する
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings `
    -Principal $principal -Description 'OneDrive の添削前フォルダの提出物を Claude Code で添削し、添削後フォルダに納品する' -Force | Out-Null
Good "タスク「$TaskName」を登録しました"

Write-Host ''
if ($ok) {
    Write-Host 'セットアップが完了しました。' -ForegroundColor Green
    Write-Host '・まず「添削前」に提出物を 1 件入れ、「添削実行.bat」をダブルクリックして動作を確認してください。'
    Write-Host '　（入れてから 10 分間は OneDrive の同期待ちとして処理されません）'
} else {
    Write-Host 'NG の項目を直してから、もう一度セットアップ.bat を実行してください。' -ForegroundColor Red
}
