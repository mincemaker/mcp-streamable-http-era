// 原文から、指定した書き出しで始まる 1 文を丸ごと出す（改行をまたいでよい）。
//   node examples/quote.mjs sources/<file>.md "<書き出し>" ["<書き出し>" …]
import { readFileSync } from 'node:fs';

// コードブロックに貼るので、Markdown の記号（リンク・太字・バッククォート）は外して文字だけにする
const plain = (s) => s.replace(/\[([^\]]*)\](\([^)]*\)|\[[^\]]*\])/g, '$1').replace(/\*\*|`/g, '');

const [file, ...starts] = process.argv.slice(2);
// 段落の区切りは残す（コロンで終わる段落も 1 文として出せるように）
const text = readFileSync(file, 'utf8').replace(/\n\s*\n/g, '\0').replace(/\s+/g, ' ');
for (const s of starts) {
  const i = text.indexOf(s);
  if (i < 0) { console.log(`NOT FOUND: ${s}`); process.exitCode = 1; continue; }
  // 文末は「. 」か段落の終わり。e.g. / i.e. の点では切らない
  const end = /(?<!\b(?:e\.g|i\.e|etc))\.(?= |\0|$)|\0/g;
  end.lastIndex = i;
  const m = end.exec(text);
  console.log(plain(text.slice(i, m ? m.index + (m[0] === '.' ? 1 : 0) : undefined).trim()));
}
