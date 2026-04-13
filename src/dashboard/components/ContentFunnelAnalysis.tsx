import React, { useMemo, useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Empty } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { ContentDailyRecord, IncomeRecord } from '@/shared/types';
import { db } from '@/db/database';
import { useCurrentUser } from '@/hooks/use-current-user';
import { computeRPM } from '@/shared/stats';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';
import { themeColors } from '../theme';

interface Props {
  dailyRecords: ContentDailyRecord[];
  incomeRecords: IncomeRecord[];
  demoMode?: boolean;
}

interface Benchmark {
  ctr: number;
  engagementRate: number;
  rpm: number;
}

function pctDiff(current: number, baseline: number): { value: number; color: string; text: string } {
  if (baseline === 0) return { value: 0, color: themeColors.muted, text: '--' };
  const diff = ((current - baseline) / baseline) * 100;
  const color = diff > 5 ? themeColors.sage : diff < -5 ? themeColors.warmRed : themeColors.muted;
  const sign = diff > 0 ? '+' : '';
  return { value: diff, color, text: `${sign}${diff.toFixed(1)}% vs 均值` };
}

export function ContentFunnelAnalysis({ dailyRecords, incomeRecords, demoMode }: Props) {
  const { user } = useCurrentUser();
  const currency = useCurrency();
  const [benchmark, setBenchmark] = useState<Benchmark | null>(() =>
    demoMode ? { ctr: 25, engagementRate: 2.5, rpm: 3.0 } : null,
  );

  useEffect(() => {
    if (demoMode || !user) return;

    (async () => {
      const allDaily = await db.contentDaily.where('userId').equals(user.id).toArray();
      const allIncome = await db.incomeRecords.where('userId').equals(user.id).toArray();

      let totalShow = 0,
        totalPv = 0,
        totalInteraction = 0,
        totalIncome = 0,
        totalRead = 0;
      for (const r of allDaily) {
        totalShow += r.show;
        totalPv += r.pv;
        totalInteraction += r.upvote + r.comment + r.collect + r.share;
      }
      for (const r of allIncome) {
        totalIncome += r.currentIncome;
        totalRead += r.currentRead;
      }

      setBenchmark({
        ctr: totalShow > 0 ? (totalPv / totalShow) * 100 : 0,
        engagementRate: totalPv > 0 ? (totalInteraction / totalPv) * 100 : 0,
        rpm: computeRPM(currency.convert(totalIncome), totalRead),
      });
    })();
  }, [user, demoMode, currency]);

  const metrics = useMemo(() => {
    if (dailyRecords.length === 0) return null;

    let totalShow = 0,
      totalPv = 0,
      totalUpvote = 0,
      totalComment = 0,
      totalCollect = 0,
      totalShare = 0;
    for (const r of dailyRecords) {
      totalShow += r.show;
      totalPv += r.pv;
      totalUpvote += r.upvote;
      totalComment += r.comment;
      totalCollect += r.collect;
      totalShare += r.share;
    }
    const totalInteraction = totalUpvote + totalComment + totalCollect + totalShare;

    let totalIncome = 0,
      totalRead = 0;
    for (const r of incomeRecords) {
      totalIncome += r.currentIncome;
      totalRead += r.currentRead;
    }

    const ctr = totalShow > 0 ? (totalPv / totalShow) * 100 : 0;
    const engagementRate = totalPv > 0 ? (totalInteraction / totalPv) * 100 : 0;
    const rpm = computeRPM(currency.convert(totalIncome), totalRead);

    return {
      ctr,
      engagementRate,
      rpm,
      totalShow,
      totalPv,
      totalInteraction,
      totalIncome: currency.convert(totalIncome),
    };
  }, [dailyRecords, incomeRecords, currency]);

  if (dailyRecords.length === 0) {
    return (
      <Card title="流量漏斗分析" size="small">
        <Empty description="请先在「每日数据详情」中拉取数据" />
      </Card>
    );
  }

  if (!metrics) return null;

  const ctrDiff = benchmark ? pctDiff(metrics.ctr, benchmark.ctr) : null;
  const engDiff = benchmark ? pctDiff(metrics.engagementRate, benchmark.engagementRate) : null;
  const rpmDiff = benchmark ? pctDiff(metrics.rpm, benchmark.rpm) : null;

  const funnelOption = {
    tooltip: { trigger: 'item' as const },
    series: [
      {
        type: 'funnel',
        left: '15%',
        right: '15%',
        top: 10,
        bottom: 10,
        minSize: '20%',
        maxSize: '100%',
        sort: 'descending' as const,
        gap: 4,
        label: {
          show: true,
          position: 'inside' as const,
          formatter: '{b}\n{c}',
          fontSize: 12,
        },
        data: [
          { value: metrics.totalShow, name: '曝光量', itemStyle: { color: '#999' } },
          { value: metrics.totalPv, name: '阅读量', itemStyle: { color: themeColors.warmBlue } },
          { value: metrics.totalInteraction, name: '互动量', itemStyle: { color: themeColors.sage } },
          {
            value: Math.round(metrics.totalIncome * 100) / 100,
            name: `收益(${currency.suffix || currency.prefix || '元'})`,
            itemStyle: { color: themeColors.amber },
          },
        ],
      },
    ],
  };

  return (
    <Card title="流量漏斗分析" size="small">
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small" style={{ background: themeColors.paper }}>
            <Statistic
              title="点击率 (CTR)"
              value={metrics.ctr}
              precision={2}
              suffix="%"
              valueStyle={{ color: themeColors.warmBlue, fontWeight: 600 }}
            />
            {ctrDiff && <div style={{ fontSize: 12, color: ctrDiff.color, marginTop: 4 }}>{ctrDiff.text}</div>}
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ background: themeColors.paper }}>
            <Statistic
              title="参与率"
              value={metrics.engagementRate}
              precision={2}
              suffix="%"
              valueStyle={{ color: themeColors.sage, fontWeight: 600 }}
            />
            {engDiff && <div style={{ fontSize: 12, color: engDiff.color, marginTop: 4 }}>{engDiff.text}</div>}
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ background: themeColors.paper }}>
            <Statistic
              title="变现率 (RPM)"
              value={metrics.rpm}
              precision={currency.precision}
              prefix={currency.rpmPfx}
              suffix={currency.rpmSfx}
              valueStyle={{ color: themeColors.amber, fontWeight: 600 }}
            />
            {rpmDiff && <div style={{ fontSize: 12, color: rpmDiff.color, marginTop: 4 }}>{rpmDiff.text}</div>}
          </Card>
        </Col>
      </Row>
      <ReactECharts option={funnelOption} style={{ height: 220 }} />
    </Card>
  );
}
