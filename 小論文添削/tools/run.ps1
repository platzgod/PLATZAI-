# 添削の実行（タスクスケジューラーから 1 日 2 回呼ばれる。手動なら「添削実行.bat」をダブルクリック）
# 1. 未処理の提出物があるかを確認し、無ければすぐ終わる
# 2. あれば Claude Code に CLAUDE.md の手順で添削・納品させる
# 3. 実行の記録を「ログ」フォルダに残す（30 日より古いものは削除）

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'

$logDir = Join-Path $root 'ログ'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ((Get-Date -Format 'yyyyMMdd_HHmm') + '.txt')
Get-ChildItem $logDir -Filter *.txt | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force

function Write-Log($text) {
    $line = (Get-Date -Format 'HH:mm:ss') + ' ' + $text
    Add-Content -Path $log -Value $line -Encoding UTF8
    Write-Host $line
}

$py = if (Get-Command python -ErrorAction SilentlyContinue) { 'python' } else { 'py' }
$count = & $py tools/pending.py --count 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Log "pending.py の実行に失敗しました: $count"
    exit 1
}
if ([int]$count -eq 0) {
    Write-Log '未処理の提出物はありません。'
    exit 0
}

Write-Log "未処理の提出物 $count 件を添削します。"
# プロンプトは英語にしておく（日本語の引数は Windows の文字コードで化けることがあるため）
$prompt = 'Follow CLAUDE.md in this folder: correct every pending submission in the input folder, deliver the Word files to the output folder, and finish with the completion report described in section 8.'
& claude -p $prompt --allowedTools 'Read,Write,Edit,Bash,WebSearch,WebFetch' 2>&1 |
    ForEach-Object { Add-Content -Path $log -Value $_ -Encoding UTF8; Write-Host $_ }
Write-Log "終了しました（終了コード $LASTEXITCODE）。"
