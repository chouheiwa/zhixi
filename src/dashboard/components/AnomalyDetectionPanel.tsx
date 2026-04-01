import React, { useMemo } from 'react';
import { Card, Row, Col, Tag, Empty } from 'antd';
import ReactECharts from 'echarts-for-react';
import { timeSeriesZoom, withZoomGrid } from './chartConfig';
import type { DailySummary } from '@/shared/types';
import { eachDayInRange } from '@/shared/date-utils';
import { detectAnomalies } from '@/shared/stats';
import { FormulaBlock } from './FormulaHelp';
import { themeColors } from '../theme';

interface AnomalyTooltipParam {
  dataIndex: number;
}

interface Props {
  summaries: DailySummary[];
  startDate: string;
  endDate: string;
}

function describeAnomaly(z: number, value: number, mean: number): string {
  const pct = mean > 0 ? Math.abs(((value - mean) / mean) * 100).toFixed(0) : '?';
  if (z > 3) return `收益异常高，比平时多 ${pct}%，可能有爆款内容`;
  if (z > 2) return `收益偏高，比平时多 ${pct}%`;
  if (z < -3) return `收益异常低，比平时少 ${pct}%，可能受平台波动影响`;
  return `收益偏低，比平时少 ${pct}%`;
}

export function AnomalyDetectionPanel({ summaries, startDate, endDate }: Props) {
  const days = eachDayInRange(startDate, endDate);
  const summaryMap = new Map(summaries.map((s) => [s.date, s]));

  const analysis = useMemo(() => {
    const incomes = days.map((d) => (summaryMap.get(d)?.totalIncome ?? 0) / 100);
    const mean = incomes.reduce((a, b) => a + b, 0) / (incomes.length || 1);
    const incomeAnomalies = detectAnomalies(incomes, 2.0, days);
    return { incomes, mean, incomeAnomalies };
  }, [summaries, startDate, endDate]);

  const dates = days.map((d) => d.slice(5));

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: AnomalyTooltipParam[]) => {
        const idx = params[0].dataIndex;
        const date = days[idx];
        const income = analysis.incomes[idx];
        const anomaly = analysis.incomeAnomalies.find((a) => a.index === idx);
        let text = `${date}<br/>收益: ¥${income.toFixed(2)}`;
        if (anomaly) {
          text += `<br/><b style="color:${anomaly.zScore > 0 ? themeColors.sage : themeColors.warmRed}">${describeAnomaly(anomaly.zScore, anomaly.value, analysis.mean)}</b>`;
        }
        return text;
      },
    },
    grid: withZoomGrid({ left: 50, right: 30, top: 40, bottom: 25 }),
    title: { text: '收益波动监控', textStyle: { fontSize: 13, fontWeight: 600 }, left: 0 },
    xAxis: { type: 'category' as const, data: dates, axisLabel: { fontSize: 10 }, axisTick: { show: false } },
    yAxis: {
      type: 'value' as const,
      axisLabel: { fontSize: 10, formatter: (v: number) => `¥${v.toFixed(0)}` },
      splitNumber: 3,
    },
    series: [
      {
        type: 'bar',
        data: analysis.incomes.map((v, i) => {
          const anomaly = analysis.incomeAnomalies.find((a) => a.index === i);
          return {
            value: v,
            itemStyle: anomaly
              ? {
                  color: anomaly.zScore > 0 ? 'rgba(107, 143, 113, 0.7)' : 'rgba(196, 89, 74, 0.7)',
                  borderRadius: [3, 3, 0, 0],
                }
              : { color: 'rgba(91, 122, 157, 0.25)', borderRadius: [3, 3, 0, 0] },
          };
        }),
        large: true,
        largeThreshold: 500,
        barMaxWidth: 14,
        markLine: {
          silent: true,
          data: [{ yAxis: analysis.mean, label: { formatter: `日均 ¥${analysis.mean.toFixed(2)}`, fontSize: 10 } }],
          lineStyle: { color: '#999', type: 'dashed' },
        },
      },
    ],
    ...timeSeriesZoom,
  };

  return (
    <Card
      title="收益波动监控"
      size="small"
      extra={
        analysis.incomeAnomalies.length > 0 ? (
          <Tag color="warning">{analysis.incomeAnomalies.length} 天异常</Tag>
        ) : (
          <Tag color="success">波动正常</Tag>
        )
      }
    >
      <Row gutter={16}>
        <Col span={14}>
          <ReactECharts option={option} style={{ height: 250 }} />
          <div style={{ fontSize: 11, color: '#999', marginTop: -4 }}>
            绿色 = 收益突增 | 红色 = 收益骤降 | 虚线 = 日均收益
          </div>
        </Col>
        <Col span={10}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>异常日说明</div>
          {analysis.incomeAnomalies.length === 0 ? (
            <Empty description="所选时间范围内收益平稳" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div style={{ maxHeight: 210, overflow: 'auto' }}>
              {analysis.incomeAnomalies
                .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
                .map((a, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      marginBottom: 6,
                      background: a.zScore > 0 ? '#e8f5e9' : '#ffebee',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{a.date}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>¥{a.value.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: a.zScore > 0 ? '#2e7d32' : '#c62828' }}>
                      {describeAnomaly(a.zScore, a.value, analysis.mean)}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Col>
      </Row>
      <FormulaBlock
        title=""
        items={[
          {
            name: '异常检测（Z-score 方法）',
            formula: 'Z = (当日收益 - 平均收益) ÷ 标准差\n|Z| ≥ 2 判定为异常',
            desc: '标准差衡量收益的正常波动范围。Z值表示当天偏离平均值多少个标准差。|Z|≥2意味着该值出现的概率不到5%，属于统计意义上的异常。',
          },
        ]}
      />
    </Card>
  );
}
