import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { IncomeRecord } from '@/shared/types';

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
  const { articleStats, answerStats, monthlyData } = useMemo(() => {
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

    const article: TypeStats = { count: 0, totalIncome: 0, totalRead: 0, totalInteraction: 0 };
    const answer: TypeStats = { count: 0, totalIncome: 0, totalRead: 0, totalInteraction: 0 };
    for (const v of contentMap.values()) {
      const target = v.type === 'article' ? article : answer;
      target.count++;
      target.totalIncome += v.income;
      target.totalRead += v.read;
      target.totalInteraction += v.interaction;
    }

    const monthMap = new Map<string, { articleIncome: number; answerIncome: number }>();
    for (const r of records) {
      const month = r.recordDate.slice(0, 7);
      const existing = monthMap.get(month) ?? { articleIncome: 0, answerIncome: 0 };
      if (r.contentType === 'article') {
        existing.articleIncome += r.currentIncome;
      } else {
        existing.answerIncome += r.currentIncome;
      }
      monthMap.set(month, existing);
    }
    const months = Array.from(monthMap.keys()).sort();
    const monthly = months.map(m => ({ month: m, ...monthMap.get(m)! }));

    return { articleStats: article, answerStats: answer, monthlyData: monthly };
  }, [records]);

  const rpm = (income: number, read: number) =>
    read > 0 ? (income / 100 / read) * 1000 : 0;

  const chartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['文章', '回答'], textStyle: { fontSize: 11 } },
    grid: { left: 50, right: 20, top: 30, bottom: 25 },
    xAxis: {
      type: 'category' as const,
      data: monthlyData.map(d => d.month),
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 10, formatter: (v: number) => `¥${(v / 100).toFixed(0)}` },
    },
    series: [
      {
        name: '文章',
        type: 'bar',
        data: monthlyData.map(d => d.articleIncome),
        itemStyle: { color: '#1a73e8', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 20,
      },
      {
        name: '回答',
        type: 'bar',
        data: monthlyData.map(d => d.answerIncome),
        itemStyle: { color: '#fbbc04', borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 20,
      },
    ],
  };

  return (
    <Card title="文章 vs 回答" size="small">
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" style={{ background: '#f0f5ff', border: 'none' }}>
            <div style={{ marginBottom: 8 }}>
              <Tag color="blue">文章</Tag>
              <span style={{ fontSize: 12, color: '#999' }}>{articleStats.count} 篇</span>
            </div>
            <Row gutter={8}>
              <Col span={8}>
                <Statistic title="总收益" value={articleStats.totalIncome / 100} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="篇均收益" value={articleStats.count > 0 ? articleStats.totalIncome / 100 / articleStats.count : 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="RPM" value={rpm(articleStats.totalIncome, articleStats.totalRead)} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" style={{ background: '#fffbe6', border: 'none' }}>
            <div style={{ marginBottom: 8 }}>
              <Tag color="gold">回答</Tag>
              <span style={{ fontSize: 12, color: '#999' }}>{answerStats.count} 篇</span>
            </div>
            <Row gutter={8}>
              <Col span={8}>
                <Statistic title="总收益" value={answerStats.totalIncome / 100} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="篇均收益" value={answerStats.count > 0 ? answerStats.totalIncome / 100 / answerStats.count : 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="RPM" value={rpm(answerStats.totalIncome, answerStats.totalRead)} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
      {monthlyData.length > 1 && (
        <ReactECharts option={chartOption} style={{ height: 220 }} />
      )}
    </Card>
  );
}
