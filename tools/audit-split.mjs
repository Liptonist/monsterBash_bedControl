#!/usr/bin/env node
// 変更履歴（kyuugo/auditLog）の退避と絞り込み（任意・運用用）
//
// 本番の auditLog から、ユーザー管理の記録だけを残して他を消すための道具。
// データベースには触らない。Firebase コンソールで書き出した JSON を読み、
//   ・退避用の控え（書き出したものそのまま）
//   ・残す分だけの JSON（コンソールから読み込み直す用）
//   ・消える分の JSON（消す前に中身を確かめる用）
// の3つを書き出すだけ。実際の入れ替えは人がコンソールで行う。
//
//   1. コンソール → Realtime Database → kyuugo/auditLog を選び
//      「JSON をエクスポート」で保存
//   2. node tools/audit-split.mjs auditLog.json
//      （まず中身だけ見るなら node tools/audit-split.mjs auditLog.json --list）
//   3. 出てきた keep の JSON を kyuugo/auditLog に「JSON をインポート」
//      （インポートはそのノードを丸ごと置き換える。控えを取ってから行う）
//
// ルールは変えない。インポートは管理者操作なのでルールを通らないが、
// 書き出すのは元のデータの部分集合なので、形も項目もそのまま。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

// 残す操作（users.html の logChange と対応）。ここが唯一の定義。
const KEEP_ACTIONS = [
  'ユーザー追加',
  'ユーザー削除',
  'パスワード変更',
  'パスワード再設定メール送信',
];

// 消えると分かっている操作。ここにも KEEP_ACTIONS にも無い操作は
// 見落としかもしれないので、消す前に名前を挙げて知らせる。
const KNOWN_DROP_ACTIONS = [
  '登録', '編集', '退室', '移動', '台数変更',
  'ゴミ箱へ移動', '一覧に戻す', '入室に戻す',
  '日次の締め', '開催年・日の変更', 'CSV書き出し',
];

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const force    = args.includes('--force');
const outDir   = argValue('--out-dir') ?? '.';
const src      = args.find(a => !a.startsWith('--'));

function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function die(msg) {
  console.error('エラー: ' + msg);
  process.exit(1);
}

if (!src) {
  die('書き出した JSON のパスを指定してください\n'
    + '  使い方: node tools/audit-split.mjs <auditLog.json> [--list] [--out-dir 出力先] [--force]');
}
if (!existsSync(src)) die(`ファイルが見つかりません: ${src}`);

let raw;
try {
  raw = JSON.parse(readFileSync(src, 'utf8'));
} catch (e) {
  die(`JSON として読めません: ${e.message}`);
}

// auditLog そのものを書き出したのか、上の階層ごと書き出したのかを吸収する。
// kyuugo ごと・データベース全体でも、auditLog の位置を辿って取り出す。
function findAuditLog(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (o.auditLog)        return {at: 'auditLog',        map: o.auditLog};
  if (o.kyuugo?.auditLog) return {at: 'kyuugo/auditLog', map: o.kyuugo.auditLog};
  return {at: '（指定されたファイルそのもの）', map: o};
}

const found = findAuditLog(raw);
const log   = found?.map;
if (!log || typeof log !== 'object' || Array.isArray(log)) {
  die('auditLog の中身（キーと記録の対応）が見つかりません');
}

const entries = Object.entries(log);
if (entries.length === 0) die('記録が0件です。書き出す場所を間違えていないか確かめてください');

// 記録らしくないものが混ざっていたら、そこで止める。丸ごと消す操作の前なので
// 「たぶん大丈夫」で進めない。
const notEntry = entries.find(([, v]) =>
  !v || typeof v !== 'object' || Array.isArray(v) || typeof v.action !== 'string');
if (notEntry) {
  die(`変更履歴の記録ではないものが入っています（キー: ${notEntry[0]}）。\n`
    + `      auditLog より上の階層を書き出していないか確かめてください`);
}

const keepSet = new Set(KEEP_ACTIONS);
const keep = [], drop = [];
for (const e of entries) (keepSet.has(e[1].action) ? keep : drop).push(e);

// 操作ごとの件数。多い順、同数なら名前順。
const counts = new Map();
for (const [, v] of entries) counts.set(v.action, (counts.get(v.action) || 0) + 1);
const byCount = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));

const dateOf = ts => Number.isFinite(ts) && ts > 0
  ? new Date(ts).toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'}) : '（日時なし）';
const times = entries.map(([, v]) => v.at).filter(t => Number.isFinite(t) && t > 0);

console.log(`読み込み: ${src}（${found.at}）`);
console.log(`記録 ${entries.length} 件`
  + (times.length ? `　${dateOf(Math.min(...times))} 〜 ${dateOf(Math.max(...times))}` : ''));
console.log('');
console.log('操作ごとの件数（残 = このあとも残る）:');
for (const [action, n] of byCount) {
  console.log(`  ${keepSet.has(action) ? '残' : '削'}  ${String(n).padStart(5)}  ${action || '（操作名なし）'}`);
}

// 知らない操作名は、消す側に回る前に名前を挙げる
const unknown = byCount.filter(([a]) =>
  !keepSet.has(a) && !KNOWN_DROP_ACTIONS.includes(a)).map(([a]) => a || '（操作名なし）');
if (unknown.length) {
  console.log('');
  console.log('注意: 見覚えのない操作名があります。残す必要がないか確かめてください:');
  unknown.forEach(a => console.log(`  ・${a}`));
  console.log('  残す場合は、このファイルの KEEP_ACTIONS に足してから実行し直してください。');
}

console.log('');
console.log(`残す ${keep.length} 件 / 消える ${drop.length} 件`);

if (keep.length === 0) {
  console.log('');
  console.log('残る記録が0件です。auditLog を空にすることになります。');
}

if (listOnly) {
  console.log('');
  console.log('--list を付けたので、ファイルは書き出していません。');
  process.exit(0);
}

// 元の並び（書き出したときのキー順）のまま、部分集合として組み立てる
const toObj = list => Object.fromEntries(list);

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
const base  = basename(src).replace(/\.json$/i, '');
const out = {
  backup:  join(outDir, `${base}-backup-${stamp}.json`),   // 退避（元のまま）
  keep:    join(outDir, `${base}-keep-${stamp}.json`),     // 読み込み直す分
  removed: join(outDir, `${base}-removed-${stamp}.json`),  // 消える分（確認用）
};

if (outDir !== '.' && !existsSync(outDir)) mkdirSync(outDir, {recursive: true});
for (const p of Object.values(out)) {
  if (existsSync(p) && !force) die(`すでにあります: ${p}（上書きするなら --force）`);
}

const write = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8');
write(out.backup,  log);
write(out.keep,    toObj(keep));
write(out.removed, toObj(drop));

// 書き出したものを読み直して、件数と中身が元と一致するか確かめる。
// これから元を消すので、控えが本当に取れているかはここで確認しておく。
const reread = p => JSON.parse(readFileSync(p, 'utf8'));
const back = reread(out.backup), k = reread(out.keep), d = reread(out.removed);
const nb = Object.keys(back).length, nk = Object.keys(k).length, nd = Object.keys(d).length;
if (nb !== entries.length || nk !== keep.length || nd !== drop.length || nk + nd !== nb) {
  die('書き出したファイルの件数が合いません。処理を進めないでください');
}
if (JSON.stringify(back) !== JSON.stringify(log)) {
  die('退避したファイルの中身が元と一致しません。処理を進めないでください');
}
for (const [key, v] of Object.entries(k)) {
  if (JSON.stringify(v) !== JSON.stringify(log[key])) {
    die(`残す記録の中身が元と違います（キー: ${key}）。処理を進めないでください`);
  }
}

console.log('');
console.log('書き出しました:');
// 見出しは全角なので、桁は全角スペースで揃える
console.log(`  退避（元のまま）　${String(nb).padStart(5)} 件  ${out.backup}`);
console.log(`  残す分　　　　　　${String(nk).padStart(5)} 件  ${out.keep}`);
console.log(`  消える分（確認用）${String(nd).padStart(5)} 件  ${out.removed}`);
console.log('');
console.log('このあとの手順:');
console.log(`  1. ${out.backup} を手元の安全な場所に置く（これが退避したもの）`);
console.log(`  2. ${out.removed} を開いて、消えて困る記録が無いか目を通す`);
console.log('  3. コンソール → Realtime Database → kyuugo/auditLog の「JSON をインポート」で');
console.log(`     ${out.keep} を読み込む（auditLog は丸ごと置き換わる）`);
console.log('  4. 変更履歴の画面を開き、ユーザー管理の記録だけが残っているか確かめる');
