import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { IncomeRecord } from '@/shared/types';
import { contentTypeLabel, contentTypeColor, contentTypeChartColor } from '@/shared/content-type';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';

interface Props {
  records: IncomeRecord[];
}

interface TypeStats {
  count: number;
  totalIncome: number;
  totalRead: number;
  totalInteraction: number;
}

export function ContentTypeComparisonPanel({ records }: Props) {
  const currency = useCurrency();
  const { typeStatsMap, typeKeys, monthlyData } = useMemo(() => {
    const contentMap = new Map<string, { type: string; income: number; read: number; interaction: number }>();
    for (const r of records) {
      const existing = contentMap.get(r.contentId);
      if (existing) {
        existing.income += r.currentIncome;
        existing.read += r.currentRead;
        existing.interaction += r.currentInteraction;
      } else {
        contentMap.set(r.contentId, {
          type: r.contentType,
          income: r.currentIncome,
          read: r.currentRead,
          interaction: r.currentInteraction,
        });
      }
    }

    const statsMap = new Map<string, TypeStats>();
    for (const v of contentMap.values()) {
      const existing = statsMap.get(v.type) ?? { count: 0, totalIncome: 0, totalRead: 0, totalInteraction: 0 };
      existing.count++;
      existing.totalIncome += v.income;
      existing.totalRead += v.read;
      existing.totalInteraction += v.interaction;
      statsMap.set(v.type, existing);
    }

    const monthMap = new Map<string, Map<string, number>>();
    for (const r of records) {
      const month = r.recordDate.slice(0, 7);
      const existing = monthMap.get(month) ?? new Map<string, number>();
      existing.set(r.contentType, (existing.get(r.contentType) ?? 0) + r.currentIncome);
      monthMap.set(month, existing);
    }
    const months = Array.from(monthMap.keys()).sort();
    const monthly = months.map((m) => ({ month: m, incomeByType: monthMap.get(m)! }));

    const keys = Array.from(statsMap.keys()).sort();
    return { typeStatsMap: statsMap, typeKeys: keys, monthlyData: monthly };
  }, [records]);

  const rpm = (income: number, read: number) => (read > 0 ? (income / 100 / read) * 1000 : 0);

  const TYPE_BG: Record<string, string> = {
    article: '#f0f5ff',
    answer: '#fffbe6',
    pin: '#f0f5f0',
  };

  const chartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: typeKeys.map(contentTypeLabel), textStyle: { fontSize: 11 } },
    grid: { left: 50, right: 20, top: 30, bottom: 25 },
    xAxis: {
      type: 'category' as const,
      data: monthlyData.map((d) => d.month),
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 10, formatter: (v: number) => currency.fmtAxis(currency.convert(v)) },
    },
    series: typeKeys.map((type) => ({
      name: contentTypeLabel(type),
      type: 'bar',
      data: monthlyData.map((d) => d.incomeByType.get(type) ?? 0),
      itemStyle: { color: contentTypeChartColor(type), borderRadius: [2, 2, 0, 0] },
      barMaxWidth: 20,
    })),
  };

  const colSpan = typeKeys.length <= 2 ? 12 : 8;

  return (
    <Card title="内容类型对比" size="small">
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {typeKeys.map((type) => {
          const stats = typeStatsMap.get(type)!;
          return (
            <Col span={colSpan} key={type}>
              <Card size="small" style={{ background: TYPE_BG[type] ?? '#f5f5f5', border: 'none' }}>
                <div style={{ marginBottom: 8 }}>
                  <Tag color={contentTypeColor(type)}>{contentTypeLabel(type)}</Tag>
                  <span style={{ fontSize: 12, color: '#999' }}>{stats.count} 篇</span>
                </div>
                <Row gutter={8}>
                  <Col span={8}>
                    <Statistic
                      title="总收益"
                      value={stats.totalIncome / 100}
                      precision={2}
                      prefix="¥"
                      valueStyle={{ fontSize: 16 }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="篇均收益"
                      value={stats.count > 0 ? stats.totalIncome / 100 / stats.count : 0}
                      precision={2}
                      prefix="¥"
                      valueStyle={{ fontSize: 16 }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="RPM"
                      value={rpm(stats.totalIncome, stats.totalRead)}
                      precision={2}
                      prefix="¥"
                      valueStyle={{ fontSize: 16 }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          );
        })}
      </Row>
      {monthlyData.length > 1 && <ReactECharts option={chartOption} style={{ height: 220 }} />}
    </Card>
  );
}
