// apps_script/*.gs を1つのファイル「貼り付け用_コード.gs」にまとめる。
// Apps Script のエディタの「コード.gs」に、これを丸ごと貼り付ければ動く。
// 実行：node report_system/build_bundle.js
'use strict';
const fs = require('fs');
const path = require('path');

const FILES = ['Config.gs', 'Report.gs', 'Sheets.gs', 'Send.gs', 'LineLink.gs', 'Menu.gs'];
const OUT = path.join(__dirname, '貼り付け用_コード.gs');

function build() {
  const head = [
    '/**',
    ' * 個人指導塾PLATZ 学習報告書システム（貼り付け用・1ファイル版）',
    ' *',
    ' * このファイルの中身をすべてコピーし、Apps Script の「コード.gs」に貼り付けて保存してください。',
    ' * 元のファイル：report_system/apps_script/ （直すときは元のファイルを直し、node report_system/build_bundle.js で作り直す）',
    ' */',
    ''
  ].join('\n');
  const body = FILES.map(f => {
    const src = fs.readFileSync(path.join(__dirname, 'apps_script', f), 'utf8').trim();
    return '// ======================================================================\n// ' + f +
      '\n// ======================================================================\n\n' + src + '\n';
  }).join('\n');
  fs.writeFileSync(OUT, head + body);
  return OUT;
}

module.exports = { build, OUT };
if (require.main === module) console.log('作成：' + build());
