import type { MonthlyReportData, MilestoneData, HotContentData, AnnualSummaryData } from './types';
import { getRank, getNextRank, getRankProgress } from './rank-system';

// Card dimensions
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

// Color palette
const DARK_BG_START = '#1a1a2e';
const DARK_BG_END = '#16213e';
const GOLD = '#FFD700';
const WHITE = '#ffffff';
const WHITE_DIM = 'rgba(255,255,255,0.7)';
const WHITE_MUTED = 'rgba(255,255,255,0.4)';
const ACCENT_BLUE = '#0f3460';
const FOOTER_TEXT = '知析 · 知乎创作者收益分析';

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  return canvas;
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  grad.addColorStop(0, DARK_BG_START);
  grad.addColorStop(1, DARK_BG_END);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Subtle decorative circles
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(CARD_WIDTH - 100, 150, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(100, CARD_HEIGHT - 200, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawGradientText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colors: [string, string],
  fontSize: number,
  fontWeight = '700',
  align: CanvasTextAlign = 'center',
): void {
  ctx.font = `${fontWeight} ${fontSize}px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = align;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const startX = align === 'center' ? x - textWidth / 2 : x;
  const grad = ctx.createLinearGradient(startX, y - fontSize, startX + textWidth, y);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);
}

function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  progress: number,
  color: string,
): void {
  // Background track
  drawRoundedRect(ctx, x, y, w, h, h / 2, 'rgba(255,255,255,0.1)');
  // Fill
  if (progress > 0) {
    const fillW = Math.max(h, w * progress);
    drawRoundedRect(ctx, x, y, fillW, h, h / 2, color);
  }
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  size: number,
  filled: number,
): void {
  for (let i = 0; i < count; i++) {
    const cx = x + i * (size + 8);
    ctx.save();
    ctx.translate(cx, y);
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const outerAngle = (j * Math.PI * 2) / 5 - Math.PI / 2;
      const innerAngle = outerAngle + Math.PI / 5;
      if (j === 0) {
        ctx.moveTo(Math.cos(outerAngle) * size, Math.sin(outerAngle) * size);
      } else {
        ctx.lineTo(Math.cos(outerAngle) * size, Math.sin(outerAngle) * size);
      }
      ctx.lineTo(Math.cos(innerAngle) * (size * 0.4), Math.sin(innerAngle) * (size * 0.4));
    }
    ctx.closePath();
    ctx.fillStyle = i < filled ? GOLD : 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.restore();
  }
}

function drawDecorativeParticles(ctx: CanvasRenderingContext2D, count: number): void {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = Math.random() * CARD_WIDTH;
    const y = Math.random() * CARD_HEIGHT;
    const r = Math.random() * 3 + 1;
    ctx.globalAlpha = Math.random() * 0.3 + 0.1;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.font = `400 32px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText(FOOTER_TEXT, CARD_WIDTH / 2, CARD_HEIGHT - 50);

  // Decorative line above footer
  ctx.beginPath();
  ctx.moveTo(200, CARD_HEIGHT - 80);
  ctx.lineTo(CARD_WIDTH - 200, CARD_HEIGHT - 80);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawRankBadge(ctx: CanvasRenderingContext2D, totalIncomeCents: number, cx: number, cy: number): void {
  const rank = getRank(totalIncomeCents);
  const badgeW = 260;
  const badgeH = 60;
  const bx = cx - badgeW / 2;
  const by = cy - badgeH / 2;

  const grad = ctx.createLinearGradient(bx, by, bx + badgeW, by);
  grad.addColorStop(0, rank.gradient[0]);
  grad.addColorStop(1, rank.gradient[1]);
  drawRoundedRect(ctx, bx, by, badgeW, badgeH, 30, grad);

  ctx.font = `700 28px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText(`${rank.icon} ${rank.name}`, cx, cy + 10);
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatCentsShort(cents: number): string {
  const yuan = cents / 100;
  if (yuan >= 10000) return `${(yuan / 10000).toFixed(1)}万`;
  if (yuan >= 1000) return `${(yuan / 1000).toFixed(1)}千`;
  return yuan.toFixed(2);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to convert canvas to blob'));
    }, 'image/png');
  });
}

// ─── Monthly Report Card ──────────────────────────────────────────────────────

export async function renderMonthlyReportCard(data: MonthlyReportData): Promise<Blob> {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  drawBackground(ctx);
  drawDecorativeParticles(ctx, 30);

  // Month label
  const [year, month] = data.month.split('-');
  ctx.font = `400 38px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText(`${year}年${parseInt(month)}月`, CARD_WIDTH / 2, 110);

  // Title
  ctx.font = `700 52px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.fillStyle = WHITE;
  ctx.fillText('月度战报', CARD_WIDTH / 2, 180);

  // Rank badge
  drawRankBadge(ctx, data.cumulativeIncome, CARD_WIDTH / 2, 260);

  // Divider
  ctx.beginPath();
  ctx.moveTo(120, 310);
  ctx.lineTo(CARD_WIDTH - 120, 310);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Main income number
  ctx.font = `400 36px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText('本月总收益', CARD_WIDTH / 2, 380);

  drawGradientText(ctx, `¥ ${formatCents(data.totalIncome)}`, CARD_WIDTH / 2, 490, [GOLD, '#FFA500'], 100);

  // Stats grid
  const statsY = 580;
  const statsData = [
    { label: '日均收益', value: `¥${formatCents(data.dailyAvgIncome)}` },
    { label: '最佳单日', value: `¥${formatCents(data.bestDayIncome)}` },
    {
      label: '环比增长',
      value: `${data.growthRate >= 0 ? '+' : ''}${(data.growthRate * 100).toFixed(1)}%`,
    },
  ];
  const cellW = (CARD_WIDTH - 160) / 3;

  statsData.forEach((stat, i) => {
    const sx = 80 + i * cellW + cellW / 2;
    drawRoundedRect(ctx, 80 + i * cellW, statsY, cellW - 20, 160, 16, 'rgba(255,255,255,0.05)');
    ctx.font = `400 30px "PingFang SC", "Noto Sans SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = WHITE_MUTED;
    ctx.fillText(stat.label, sx, statsY + 55);
    ctx.font = `700 44px "PingFang SC", "Noto Sans SC", sans-serif`;
    ctx.fillStyle = stat.label === '环比增长' ? (data.growthRate >= 0 ? '#52c41a' : '#ff4d4f') : GOLD;
    ctx.fillText(stat.value, sx, statsY + 120);
  });

  // Best day label
  if (data.bestDayDate) {
    ctx.font = `400 26px "PingFang SC", "Noto Sans SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = WHITE_MUTED;
    ctx.fillText(`最佳日期：${data.bestDayDate}`, CARD_WIDTH / 2, statsY + 200);
  }

  // Progress to next rank
  const nextRank = getNextRank(data.cumulativeIncome);
  const progress = getRankProgress(data.cumulativeIncome);
  const progressY = 860;

  drawRoundedRect(ctx, 80, progressY, CARD_WIDTH - 160, 140, 16, 'rgba(255,255,255,0.05)');
  ctx.font = `400 28px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText(nextRank ? `距离 ${nextRank.icon} ${nextRank.name}` : '已达最高段位', 110, progressY + 45);

  if (nextRank) {
    const remaining = nextRank.threshold - data.cumulativeIncome;
    ctx.textAlign = 'right';
    ctx.fillStyle = WHITE_MUTED;
    ctx.fillText(`还差 ¥${formatCentsShort(remaining)}`, CARD_WIDTH - 110, progressY + 45);
  }

  const rank = getRank(data.cumulativeIncome);
  drawProgressBar(ctx, 110, progressY + 70, CARD_WIDTH - 220, 28, progress, rank.color);

  ctx.font = `400 24px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText(`累计收益 ¥${formatCentsShort(data.cumulativeIncome)}`, CARD_WIDTH / 2, progressY + 125);

  // Cumulative income display
  ctx.font = `400 32px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE_MUTED;

  drawFooter(ctx);

  return canvasToBlob(canvas);
}

// ─── Milestone Card ───────────────────────────────────────────────────────────

export async function renderMilestoneCard(data: MilestoneData): Promise<Blob> {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  drawBackground(ctx);
  drawDecorativeParticles(ctx, 50);

  // Big trophy icon area
  ctx.font = `200px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('🏆', CARD_WIDTH / 2, 340);

  // Glowing circle behind trophy
  ctx.save();
  const glow = ctx.createRadialGradient(CARD_WIDTH / 2, 260, 20, CARD_WIDTH / 2, 260, 200);
  glow.addColorStop(0, 'rgba(255,215,0,0.15)');
  glow.addColorStop(1, 'rgba(255,215,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(CARD_WIDTH / 2, 260, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Title
  ctx.font = `700 56px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE;
  ctx.fillText('成就达成！', CARD_WIDTH / 2, 430);

  // Milestone name
  drawGradientText(ctx, data.name, CARD_WIDTH / 2, 540, [GOLD, '#FFA500'], 48);

  // Achievement date
  ctx.font = `400 34px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText(`达成日期：${data.achievedDate}`, CARD_WIDTH / 2, 620);

  // Rank badge
  drawRankBadge(ctx, data.cumulativeIncome, CARD_WIDTH / 2, 720);

  // Divider
  ctx.beginPath();
  ctx.moveTo(200, 770);
  ctx.lineTo(CARD_WIDTH - 200, 770);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Total achievements
  ctx.font = `400 32px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText('已解锁成就', CARD_WIDTH / 2, 840);

  ctx.font = `700 100px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.fillStyle = GOLD;
  ctx.fillText(String(data.totalMilestones), CARD_WIDTH / 2, 960);

  // Stars decoration
  const starCount = Math.min(5, data.totalMilestones);
  const starSize = 32;
  const totalStarW = starCount * (starSize + 8) - 8;
  drawStars(ctx, CARD_WIDTH / 2 - totalStarW / 2 + starSize / 2, 1010, 5, starSize, starCount);

  // Cumulative income
  ctx.font = `400 30px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText(`累计收益 ¥${formatCentsShort(data.cumulativeIncome)}`, CARD_WIDTH / 2, 1100);

  drawFooter(ctx);

  return canvasToBlob(canvas);
}

// ─── Hot Content Card ─────────────────────────────────────────────────────────

export async function renderHotContentCard(data: HotContentData): Promise<Blob> {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  drawBackground(ctx);
  drawDecorativeParticles(ctx, 20);

  // Header label
  ctx.font = `400 36px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText('爆款内容', CARD_WIDTH / 2, 100);

  // Fire emoji
  ctx.font = `80px sans-serif`;
  ctx.fillText('🔥', CARD_WIDTH / 2, 220);

  // Title box
  drawRoundedRect(ctx, 80, 260, CARD_WIDTH - 160, 200, 20, 'rgba(255,255,255,0.06)');

  // Content title — wrap to 2 lines
  const maxTitleWidth = CARD_WIDTH - 200;
  ctx.font = `600 40px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE;

  const words = data.title.split('');
  const lines: string[] = [];
  let currentLine = '';
  for (const char of words) {
    const testLine = currentLine + char;
    if (ctx.measureText(testLine).width > maxTitleWidth && currentLine !== '') {
      lines.push(currentLine);
      currentLine = char;
      if (lines.length >= 2) break;
    } else {
      currentLine = testLine;
    }
  }
  if (lines.length < 2 && currentLine) {
    lines.push(currentLine);
  }

  const lineHeight = 56;
  const titleStartY = 260 + (200 - lines.length * lineHeight) / 2 + lineHeight;
  lines.slice(0, 2).forEach((line, i) => {
    const displayLine =
      i === 1 && lines.length === 2 && data.title.length > line.length + lines[0].length
        ? line.slice(0, -2) + '…'
        : line;
    ctx.fillText(displayLine, CARD_WIDTH / 2, titleStartY + i * lineHeight);
  });

  // Revenue
  ctx.font = `400 34px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText('内容收益', CARD_WIDTH / 2, 530);

  drawGradientText(ctx, `¥ ${formatCents(data.income)}`, CARD_WIDTH / 2, 640, [GOLD, '#FFA500'], 96);

  // Metrics grid
  const metricsY = 700;
  const metricData = [
    { label: '阅读量', value: data.pv >= 10000 ? `${(data.pv / 10000).toFixed(1)}w` : String(data.pv) },
    { label: 'RPM', value: `¥${data.rpm.toFixed(2)}` },
    { label: '超越', value: `${data.percentile.toFixed(0)}%` },
  ];
  const mCellW = (CARD_WIDTH - 160) / 3;

  metricData.forEach((m, i) => {
    const mx = 80 + i * mCellW + mCellW / 2;
    drawRoundedRect(ctx, 80 + i * mCellW, metricsY, mCellW - 20, 160, 16, 'rgba(255,255,255,0.05)');
    ctx.font = `400 28px "PingFang SC", "Noto Sans SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = WHITE_MUTED;
    ctx.fillText(m.label, mx, metricsY + 55);
    ctx.font = `700 46px "PingFang SC", "Noto Sans SC", sans-serif`;
    ctx.fillStyle = m.label === '超越' ? '#52c41a' : GOLD;
    ctx.fillText(m.value, mx, metricsY + 120);
  });

  // RPM rank percentile bar
  const barY = 920;
  ctx.font = `400 28px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText('内容排名百分位', 80, barY);
  ctx.textAlign = 'right';
  ctx.fillText(`前 ${(100 - data.percentile).toFixed(0)}%`, CARD_WIDTH - 80, barY);
  drawProgressBar(ctx, 80, barY + 20, CARD_WIDTH - 160, 30, data.percentile / 100, ACCENT_BLUE);
  // Highlight marker
  const markerX = 80 + (CARD_WIDTH - 160) * (data.percentile / 100);
  drawRoundedRect(ctx, markerX - 4, barY + 15, 8, 40, 4, GOLD);

  // Star rating based on RPM
  const starRating = Math.min(5, Math.max(1, Math.round(data.rpm / 2)));
  const starY = 1030;
  ctx.font = `400 30px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText('内容质量评级', CARD_WIDTH / 2, starY);
  const sSize = 40;
  const sTotalW = 5 * (sSize + 10) - 10;
  drawStars(ctx, CARD_WIDTH / 2 - sTotalW / 2 + sSize / 2, 1070, 5, sSize, starRating);

  drawFooter(ctx);

  return canvasToBlob(canvas);
}

// ─── Annual Summary Card ──────────────────────────────────────────────────────

export async function renderAnnualSummaryCard(data: AnnualSummaryData): Promise<Blob> {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  drawBackground(ctx);
  drawDecorativeParticles(ctx, 40);

  // Year header
  ctx.font = `400 40px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText(`${data.year} 年度总结`, CARD_WIDTH / 2, 100);

  ctx.font = `700 54px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.fillStyle = WHITE;
  ctx.fillText('年度收益报告', CARD_WIDTH / 2, 170);

  // Rank badge
  drawRankBadge(ctx, data.cumulativeIncome, CARD_WIDTH / 2, 255);

  // Total income — large
  ctx.font = `400 34px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText('年度总收益', CARD_WIDTH / 2, 340);

  drawGradientText(ctx, `¥ ${formatCents(data.totalIncome)}`, CARD_WIDTH / 2, 450, [GOLD, '#FFA500'], 96);

  // Key metrics
  const kpY = 510;
  const kpData = [
    { label: '内容篇数', value: `${data.contentCount}篇` },
    { label: '最佳月份', value: data.bestMonth },
    { label: '最高月收益', value: `¥${formatCentsShort(data.bestMonthIncome)}` },
  ];
  const kpCellW = (CARD_WIDTH - 160) / 3;

  kpData.forEach((kp, i) => {
    const kpx = 80 + i * kpCellW + kpCellW / 2;
    drawRoundedRect(ctx, 80 + i * kpCellW, kpY, kpCellW - 20, 140, 16, 'rgba(255,255,255,0.05)');
    ctx.font = `400 26px "PingFang SC", "Noto Sans SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = WHITE_MUTED;
    ctx.fillText(kp.label, kpx, kpY + 48);
    ctx.font = `700 40px "PingFang SC", "Noto Sans SC", sans-serif`;
    ctx.fillStyle = GOLD;
    ctx.fillText(kp.value, kpx, kpY + 110);
  });

  // Mini bar chart (12 months)
  const chartX = 80;
  const chartY = 720;
  const chartW = CARD_WIDTH - 160;
  const chartH = 220;

  ctx.font = `400 28px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE_DIM;
  ctx.fillText('月度收益趋势', CARD_WIDTH / 2, chartY - 10);

  drawRoundedRect(ctx, chartX, chartY, chartW, chartH, 12, 'rgba(255,255,255,0.03)');

  const incomes = data.monthlyIncomes.slice(0, 12);
  const maxIncome = Math.max(...incomes, 1);
  const barW = Math.floor((chartW - 40) / 12);
  const barSpacing = 4;

  incomes.forEach((income, i) => {
    const barH = income > 0 ? Math.max(6, Math.floor(((chartH - 50) * income) / maxIncome)) : 4;
    const bx = chartX + 20 + i * barW + barSpacing / 2;
    const by = chartY + chartH - 36 - barH;

    const isMax = income === maxIncome && income > 0;
    const barColor = isMax ? GOLD : 'rgba(255,255,255,0.25)';

    drawRoundedRect(ctx, bx, by, barW - barSpacing, barH, 4, barColor);

    // Month label
    ctx.font = `400 20px "PingFang SC", "Noto Sans SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = WHITE_MUTED;
    ctx.fillText(`${i + 1}月`, bx + (barW - barSpacing) / 2, chartY + chartH - 8);
  });

  // Growth trajectory note
  const firstHalf = incomes.slice(0, 6).reduce((a, b) => a + b, 0);
  const secondHalf = incomes.slice(6, 12).reduce((a, b) => a + b, 0);
  const growthTrend = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

  ctx.font = `400 28px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = growthTrend >= 0 ? '#52c41a' : '#ff4d4f';
  const trendText =
    growthTrend >= 0
      ? `📈 下半年同比上半年 +${growthTrend.toFixed(1)}%`
      : `📉 下半年同比上半年 ${growthTrend.toFixed(1)}%`;
  ctx.fillText(trendText, CARD_WIDTH / 2, chartY + chartH + 50);

  // Cumulative vs year income
  ctx.font = `400 28px "PingFang SC", "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE_MUTED;
  ctx.fillText(`累计收益 ¥${formatCentsShort(data.cumulativeIncome)}`, CARD_WIDTH / 2, chartY + chartH + 100);

  drawFooter(ctx);

  return canvasToBlob(canvas);
}
