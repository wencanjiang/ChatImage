"use strict";

// Build a self-contained HTML human-evaluation sheet from an instance-experiment
// output dir. Shows each run's rendered page.png next to the question, with
// 1-5 score inputs for image quality (IQ) and alignment accuracy (AA), plus the
// objective basic/strict verdicts. A "Download CSV" button exports the scores.
//
// Usage: node scripts/build-eval-sheet.js [expDir]
//   expDir defaults to tmp/instance-experiment

const fs = require("fs");
const path = require("path");

const EXP_DIR = process.argv[2] || path.join(process.cwd(), "tmp", "instance-experiment");

function loadRows() {
  const rows = [];
  const runDirs = fs.readdirSync(EXP_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^run-\d+$/.test(d.name))
    .map((d) => d.name)
    .sort();
  for (const runName of runDirs) {
    const repeat = Number(runName.split("-")[1]);
    const reportPath = path.join(EXP_DIR, runName, "real-demo-run-report.json");
    if (!fs.existsSync(reportPath)) continue;
    let report;
    try { report = JSON.parse(fs.readFileSync(reportPath, "utf8")); } catch { continue; }
    for (const c of report.cases || []) {
      const png = path.join(EXP_DIR, runName, c.id, "page.png");
      rows.push({
        repeat,
        id: c.id,
        category: c.category || "",
        question: (c.question || "").split("\n")[0].slice(0, 240),
        status: c.status,
        hotspots: c.hotspotCount || 0,
        img: fs.existsSync(png) ? path.relative(EXP_DIR, png).replace(/\\/g, "/") : ""
      });
    }
  }
  return rows;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function main() {
  if (!fs.existsSync(EXP_DIR)) {
    console.error(`experiment dir not found: ${EXP_DIR}`);
    process.exit(1);
  }
  const rows = loadRows();
  const cards = rows.map((r, i) => `
    <div class="card" data-i="${i}">
      <div class="meta">
        <span class="cat">${esc(r.category)}</span>
        <strong>${esc(r.id)}</strong> <span class="rep">repeat ${r.repeat}</span>
        <span class="verdict ${r.status === "generated" ? "ok" : "bad"}">${esc(r.status)} · ${r.hotspots} hotspots</span>
      </div>
      <div class="q">${esc(r.question)}</div>
      ${r.img ? `<img loading="lazy" src="${esc(r.img)}" alt="${esc(r.id)}">` : `<div class="noimg">no page.png (failed run)</div>`}
      <div class="scores">
        <label>IQ <select data-k="iq"><option value=""></option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>
        <label>AA <select data-k="aa"><option value=""></option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>
        <input class="notes" data-k="notes" placeholder="notes">
      </div>
    </div>`).join("\n");

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ChatImage 人类评估打分表</title>
<style>
  body{font:14px/1.5 system-ui,Segoe UI,Arial;margin:0;background:#f6f6f4;color:#222}
  header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:12px 20px;display:flex;gap:16px;align-items:center;z-index:5}
  header h1{font-size:16px;margin:0}
  button{font:inherit;padding:8px 14px;border:1px solid #1f6feb;background:#1f6feb;color:#fff;border-radius:8px;cursor:pointer}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;padding:20px}
  .card{background:#fff;border:1px solid #e3e3e0;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
  .meta{padding:10px 12px;font-size:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .cat{background:#eef;border-radius:4px;padding:1px 6px;color:#446}
  .rep{color:#888}
  .verdict{margin-left:auto;font-size:11px;padding:1px 6px;border-radius:4px}
  .verdict.ok{background:#e6f6ea;color:#1a7f37}
  .verdict.bad{background:#fdecea;color:#b3261e}
  .q{padding:0 12px 8px;color:#555;font-size:12px}
  img{width:100%;display:block;background:#fafafa}
  .noimg{padding:40px;text-align:center;color:#b3261e;background:#fdf3f2}
  .scores{display:flex;gap:10px;align-items:center;padding:10px 12px;border-top:1px solid #eee}
  .scores label{display:flex;gap:4px;align-items:center}
  .notes{flex:1;padding:4px 6px;border:1px solid #ccc;border-radius:6px}
</style></head><body>
<header>
  <h1>ChatImage 人类评估打分表</h1>
  <span>${rows.length} runs · IQ=图像质量 AA=对齐准确度（1-5）</span>
  <button onclick="dl()">下载 CSV</button>
</header>
<div class="grid">${cards}</div>
<script>
function dl(){
  var out=[["case_id","category","repeat","status","hotspots","IQ","AA","notes"]];
  document.querySelectorAll('.card').forEach(function(c){
    var sel=function(k){var e=c.querySelector('[data-k="'+k+'"]');return e?e.value:""};
    var m=c.querySelector('.meta');
    out.push([
      c.querySelector('strong').textContent,
      c.querySelector('.cat').textContent,
      (c.querySelector('.rep').textContent||'').replace('repeat ','').trim(),
      c.querySelector('.verdict').textContent.split('·')[0].trim(),
      (c.querySelector('.verdict').textContent.match(/(\\d+) hotspots/)||[,''])[1],
      sel('iq'),sel('aa'),sel('notes')
    ]);
  });
  var csv=out.map(function(r){return r.map(function(x){x=String(x==null?'':x);return /[",\\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x}).join(',')}).join('\\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='human-eval-scores.csv';a.click();
}
</script></body></html>`;

  const outPath = path.join(EXP_DIR, "eval-sheet.html");
  fs.writeFileSync(outPath, html, "utf8");
  console.log(`wrote ${path.relative(process.cwd(), outPath)} (${rows.length} runs)`);
  console.log(`open it in a browser, score IQ/AA per card, then click "下载 CSV".`);
}

main();
