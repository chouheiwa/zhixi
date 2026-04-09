/** Generates a fully self-contained HTML report for Zhihu income analysis. */

export interface HtmlReportData {
  userName: string;
  generatedAt: string;
  // Overview
  totalIncome: number; // cents
  contentCount: number;
  dailyAvgIncome: number; // cents
  activeDays: number;
  // Daily trend (for SVG line chart)
  dailyTrend: { date: string; income: number }[]; // income in cents
  // Top 10 content by income
  topContent: { title: string; contentType: string; income: number; pv: number; rpm: number }[];
  // RPM by content type
  rpmByType: { type: string; rpm: number; count: number }[];
  // Full content list
  allContent: {
    title: string;
    contentType: string;
    totalIncome: number;
    totalPv: number;
    publishDate: string;
  }[];
}

function formatIncome(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

function buildSvgChart(dailyTrend: { date: string; income: number }[]): string {
  if (dailyTrend.length === 0) return '<p style="color:#999;text-align:center;padding:40px 0">暂无趋势数据</p>';

  const W = 900;
  const H = 280;
  const PAD_L = 60;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 50;

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxIncome = Math.max(...dailyTrend.map((d) => d.income), 1);
  const n = dailyTrend.length;

  const xOf = (i: number) => PAD_L + (i / Math.max(n - 1, 1)) * chartW;
  const yOf = (v: number) => PAD_T + chartH - (v / maxIncome) * chartH;

  // Build polyline points
  const pts = dailyTrend.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.income).toFixed(1)}`).join(' ');

  // Area polygon (close at bottom)
  const firstX = xOf(0).toFixed(1);
  const lastX = xOf(n - 1).toFixed(1);
  const bottomY = (PAD_T + chartH).toFixed(1);
  const areaPts = `${firstX},${bottomY} ${pts} ${lastX},${bottomY}`;

  // X-axis date labels: show every 7th or fewer
  const step = Math.max(1, Math.ceil(n / 10));
  const xLabels: string[] = [];
  for (let i = 0; i < n; i += step) {
    const x = xOf(i).toFixed(1);
    const label = dailyTrend[i].date.slice(5); // MM-DD
    xLabels.push(
      `<text x="${x}" y="${(PAD_T + chartH + 18).toFixed(1)}" text-anchor="middle" font-size="11" fill="#888">${label}</text>`,
    );
  }

  // Y-axis labels (5 ticks)
  const yLabels: string[] = [];
  for (let t = 0; t <= 4; t++) {
    const v = (maxIncome * t) / 4;
    const y = yOf(v).toFixed(1);
    yLabels.push(
      `<text x="${(PAD_L - 8).toFixed(1)}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="#aaa">${(v / 100).toFixed(2)}</text>`,
      `<line x1="${PAD_L}" y1="${y}" x2="${(PAD_L + chartW).toFixed(1)}" y2="${y}" stroke="#f0f0f0" stroke-width="1"/>`,
    );
  }

  // Hover dots: one per data point, reveal tooltip via CSS
  const dots = dailyTrend
    .map(
      (d, i) =>
        `<circle class="dot" cx="${xOf(i).toFixed(1)}" cy="${yOf(d.income).toFixed(1)}" r="4" fill="#1890ff" stroke="#fff" stroke-width="2" data-date="${d.date}" data-income="${formatIncome(d.income)}"/>`,
    )
    .join('');

  return `
<div style="position:relative;overflow:visible">
  <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
    ${yLabels.join('\n    ')}
    <polygon points="${areaPts}" fill="#1890ff" fill-opacity="0.08"/>
    <polyline points="${pts}" fill="none" stroke="#1890ff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${xLabels.join('\n    ')}
  </svg>
  <div id="chart-tooltip" style="display:none;position:fixed;background:#333;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;pointer-events:none;z-index:9999;white-space:nowrap"></div>
</div>`;
}

function buildTopContentTable(
  topContent: { title: string; contentType: string; income: number; pv: number; rpm: number }[],
): string {
  const rows = topContent
    .slice(0, 10)
    .map(
      (c, i) => `
    <tr>
      <td style="text-align:center;color:#999">${i + 1}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</td>
      <td><span class="type-badge type-${c.contentType}">${contentTypeLabel(c.contentType)}</span></td>
      <td style="text-align:right;font-weight:600;color:#d46b08">${formatIncome(c.income)}</td>
      <td style="text-align:right">${c.pv.toLocaleString()}</td>
      <td style="text-align:right">${(c.rpm / 100).toFixed(2)}</td>
    </tr>`,
    )
    .join('');

  return `
<table class="data-table" id="top-content-table">
  <thead>
    <tr>
      <th style="width:40px">#</th>
      <th>标题</th>
      <th style="width:70px">类型</th>
      <th class="sortable" data-col="3" style="width:100px">收益 ▲</th>
      <th class="sortable" data-col="4" style="width:90px">阅读量</th>
      <th class="sortable" data-col="5" style="width:90px">RPM(元)</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

function buildRpmByTypeSection(rpmByType: { type: string; rpm: number; count: number }[]): string {
  if (rpmByType.length === 0) return '<p style="color:#999">暂无数据</p>';

  const maxRpm = Math.max(...rpmByType.map((r) => r.rpm), 1);
  const bars = rpmByType
    .map(
      (r) => `
  <div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
      <span style="font-weight:500">${contentTypeLabel(r.type)}</span>
      <span style="color:#666">RPM: <strong style="color:#1890ff">${(r.rpm / 100).toFixed(2)}</strong> 元 &nbsp;·&nbsp; ${r.count} 篇</span>
    </div>
    <div style="background:#f5f5f5;border-radius:4px;height:12px;overflow:hidden">
      <div style="background:#1890ff;height:100%;width:${((r.rpm / maxRpm) * 100).toFixed(1)}%;border-radius:4px;transition:width 0.3s"></div>
    </div>
  </div>`,
    )
    .join('');

  return bars;
}

function buildAllContentTable(
  allContent: {
    title: string;
    contentType: string;
    totalIncome: number;
    totalPv: number;
    publishDate: string;
  }[],
): string {
  const rows = allContent
    .map(
      (c) => `
    <tr>
      <td style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</td>
      <td><span class="type-badge type-${c.contentType}">${contentTypeLabel(c.contentType)}</span></td>
      <td style="text-align:right;font-weight:600;color:#d46b08">${formatIncome(c.totalIncome)}</td>
      <td style="text-align:right">${c.totalPv.toLocaleString()}</td>
      <td style="text-align:right">${c.totalPv > 0 ? ((c.totalIncome / 100 / c.totalPv) * 1000).toFixed(2) : '-'}</td>
      <td style="text-align:center;color:#999">${c.publishDate}</td>
    </tr>`,
    )
    .join('');

  return `
<table class="data-table" id="all-content-table">
  <thead>
    <tr>
      <th>标题</th>
      <th style="width:70px">类型</th>
      <th class="sortable" data-col="2" style="width:100px">收益 ▼</th>
      <th class="sortable" data-col="3" style="width:90px">阅读量</th>
      <th class="sortable" data-col="4" style="width:90px">RPM(元)</th>
      <th class="sortable" data-col="5" style="width:100px">发布日期</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function contentTypeLabel(type: string): string {
  const map: Record<string, string> = { article: '文章', answer: '回答', pin: '想法' };
  return map[type] ?? '未知';
}

function formatChineseDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background: #f5f6fa;
  color: #333;
  font-size: 14px;
  line-height: 1.6;
}
#app { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e8e8e8;
}
.brand { font-size: 26px; font-weight: 700; color: #1890ff; letter-spacing: 0.04em; }
.brand-sub { font-size: 13px; color: #888; margin-top: 2px; }
.meta { text-align: right; font-size: 12px; color: #aaa; }
section { background: #fff; border-radius: 10px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
section h2 {
  font-size: 16px; font-weight: 600; color: #222;
  margin-bottom: 20px; padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
}
.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 600px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
.stat-card {
  background: #f9fafb; border-radius: 8px; padding: 16px 18px;
  border-left: 3px solid #1890ff;
}
.stat-label { font-size: 12px; color: #888; margin-bottom: 6px; }
.stat-value { font-size: 22px; font-weight: 700; color: #1890ff; }
.stat-value.income { color: #d46b08; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th {
  background: #fafafa; font-weight: 600; text-align: left;
  padding: 10px 12px; border-bottom: 2px solid #f0f0f0;
  color: #555; white-space: nowrap;
}
.data-table td { padding: 9px 12px; border-bottom: 1px solid #f5f5f5; vertical-align: middle; }
.data-table tbody tr:hover { background: #f9fbff; }
.data-table th.sortable { cursor: pointer; user-select: none; }
.data-table th.sortable:hover { color: #1890ff; }
.type-badge {
  display: inline-block; font-size: 11px; padding: 1px 8px;
  border-radius: 10px; font-weight: 500;
}
.type-article { background: #e6f4ff; color: #1677ff; }
.type-answer  { background: #fffbe6; color: #d48806; }
.type-pin     { background: #f6ffed; color: #389e0d; }
.dot { cursor: pointer; transition: r 0.15s; }
.dot:hover { r: 6; }
@media print {
  body { background: #fff; }
  section { box-shadow: none; border: 1px solid #e8e8e8; break-inside: avoid; }
  .dot { display: none; }
}
`;

const JS = `
(function() {
  // Tooltip for SVG chart dots
  var tooltip = document.getElementById('chart-tooltip');
  document.querySelectorAll('.dot').forEach(function(dot) {
    dot.addEventListener('mouseenter', function(e) {
      tooltip.textContent = dot.getAttribute('data-date') + '  ' + dot.getAttribute('data-income');
      tooltip.style.display = 'block';
    });
    dot.addEventListener('mousemove', function(e) {
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 32) + 'px';
    });
    dot.addEventListener('mouseleave', function() {
      tooltip.style.display = 'none';
    });
  });

  // Table sorting
  function parseCell(td) {
    var t = td.textContent.trim().replace(/[¥,]/g, '');
    var n = parseFloat(t);
    return isNaN(n) ? t.toLowerCase() : n;
  }

  function sortTable(tableId) {
    var table = document.getElementById(tableId);
    if (!table) return;
    var headers = table.querySelectorAll('th.sortable');
    headers.forEach(function(th) {
      th.addEventListener('click', function() {
        var col = parseInt(th.getAttribute('data-col'));
        var asc = th.getAttribute('data-asc') !== 'true';
        // Reset all headers
        headers.forEach(function(h) {
          h.removeAttribute('data-asc');
          h.textContent = h.textContent.replace(/ [▲▼]$/, '');
        });
        th.setAttribute('data-asc', asc ? 'true' : 'false');
        th.textContent += asc ? ' ▲' : ' ▼';

        var tbody = table.querySelector('tbody');
        var rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort(function(a, b) {
          var ca = parseCell(a.cells[col]);
          var cb = parseCell(b.cells[col]);
          if (ca < cb) return asc ? -1 : 1;
          if (ca > cb) return asc ?  1 : -1;
          return 0;
        });
        rows.forEach(function(r) { tbody.appendChild(r); });
      });
    });
  }

  sortTable('top-content-table');
  sortTable('all-content-table');
})();
`;

export function generateHtmlReport(data: HtmlReportData): string {
  const genDate = formatChineseDate(data.generatedAt.slice(0, 10));

  const svgChart = buildSvgChart(data.dailyTrend);
  const topTable = buildTopContentTable(data.topContent);
  const rpmBars = buildRpmByTypeSection(data.rpmByType);
  const allTable = buildAllContentTable(data.allContent);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>知析 - 收益分析报告 · ${escapeHtml(data.userName)}</title>
  <style>${CSS}</style>
</head>
<body>
<div id="app">

  <header>
    <div>
      <div class="brand">知析</div>
      <div class="brand-sub">${escapeHtml(data.userName)} 的创作数据报告</div>
    </div>
    <div class="meta">
      <div>生成时间：${genDate}</div>
      <div style="margin-top:4px">由知析 Chrome 扩展生成</div>
    </div>
  </header>

  <section id="overview">
    <h2>数据总览</h2>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">累计收益</div>
        <div class="stat-value income">${formatIncome(data.totalIncome)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">参与内容</div>
        <div class="stat-value">${data.contentCount} 篇</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">日均收益</div>
        <div class="stat-value income">${formatIncome(data.dailyAvgIncome)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">有收益天数</div>
        <div class="stat-value">${data.activeDays} 天</div>
      </div>
    </div>
  </section>

  <section id="trend">
    <h2>每日收益趋势</h2>
    ${svgChart}
  </section>

  <section id="top-content">
    <h2>收益 Top 10 内容</h2>
    ${topTable}
  </section>

  <section id="rpm-analysis">
    <h2>各类型 RPM 分析</h2>
    ${rpmBars}
  </section>

  <section id="all-content">
    <h2>全部内容明细（${data.allContent.length} 篇）</h2>
    <div style="overflow-x:auto">
      ${allTable}
    </div>
  </section>

</div>
<script>
const REPORT_DATA = ${JSON.stringify(data)};
${JS}
</script>
</body>
</html>`;
}
