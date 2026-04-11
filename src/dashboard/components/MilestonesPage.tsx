import React, { useMemo } from 'react';
import { Card, List, Tag, Flex } from 'antd';
import { TrophyOutlined, LockOutlined, CheckCircleFilled } from '@ant-design/icons';
import type { DailySummary, IncomeRecord } from '@/shared/types';
import { ShareCardButton } from './ShareCardButton';
import { useCurrency } from '@/dashboard/contexts/CurrencyContext';
import { convertFromSalt, formatIncome, currencyLabel } from '@/shared/currency';

interface Props {
  allSummaries: DailySummary[];
  allRecords: IncomeRecord[];
}

interface Milestone {
  category: string;
  name: string;
  target: number;
  unit: string;
  achieved: boolean;
  achievedDate?: string;
  current: number;
}

export function MilestonesPage({ allSummaries, allRecords }: Props) {
  const { unit } = useCurrency();
  const milestones = useMemo(() => {
    const totalIncome = convertFromSalt(
      allSummaries.reduce((s, d) => s + d.totalIncome, 0),
      unit,
    );

    let maxDailyIncome = 0;
    for (const s of allSummaries) {
      const dayIncome = convertFromSalt(s.totalIncome, unit);
      if (dayIncome > maxDailyIncome) maxDailyIncome = dayIncome;
    }

    const contentIds = new Set<string>();
    for (const r of allRecords) contentIds.add(r.contentId);
    const contentCount = contentIds.size;

    let maxStreak = 0;
    let currentStreak = 0;
    const sortedSummaries = [...allSummaries].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sortedSummaries.length; i++) {
      if (sortedSummaries[i].totalIncome > 0) {
        currentStreak++;
        if (i > 0) {
          const prev = new Date(sortedSummaries[i - 1].date);
          const curr = new Date(sortedSummaries[i].date);
          const diff = (curr.getTime() - prev.getTime()) / 86400000;
          if (diff !== 1) currentStreak = 1;
        }
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

    const findCumulativeDate = (threshold: number): string | undefined => {
      let cumulative = 0;
      for (const s of sortedSummaries) {
        cumulative += convertFromSalt(s.totalIncome, unit);
        if (cumulative >= threshold) return s.date;
      }
      return undefined;
    };

    const maxDailyDate = sortedSummaries.find((s) => convertFromSalt(s.totalIncome, unit) === maxDailyIncome)?.date;

    const result: Milestone[] = [];

    const cLabel = currencyLabel(unit);
    const cumulativeTargets =
      unit === 'yuan' ? [10, 50, 100, 500, 1000, 5000, 10000] : [1000, 5000, 10000, 50000, 100000, 500000, 1000000];
    for (const target of cumulativeTargets) {
      const date = findCumulativeDate(target);
      result.push({
        category: '累计收益',
        name: `累计收益达到 ${formatIncome(unit === 'yuan' ? target * 100 : target, unit)}`,
        target,
        unit: cLabel,
        achieved: totalIncome >= target,
        achievedDate: date,
        current: totalIncome,
      });
    }

    const dailyTargets = unit === 'yuan' ? [1, 5, 10, 50] : [100, 500, 1000, 5000];
    for (const target of dailyTargets) {
      result.push({
        category: '单日最高',
        name: `单日收益突破 ${formatIncome(unit === 'yuan' ? target * 100 : target, unit)}`,
        target,
        unit: cLabel,
        achieved: maxDailyIncome >= target,
        achievedDate: maxDailyIncome >= target ? maxDailyDate : undefined,
        current: maxDailyIncome,
      });
    }

    for (const target of [10, 50, 100]) {
      result.push({
        category: '内容数量',
        name: `产出内容达到 ${target} 篇`,
        target,
        unit: '篇',
        achieved: contentCount >= target,
        current: contentCount,
      });
    }

    for (const target of [7, 30, 90]) {
      result.push({
        category: '连续收益',
        name: `连续 ${target} 天有收益`,
        target,
        unit: '天',
        achieved: maxStreak >= target,
        current: maxStreak,
      });
    }

    return result;
  }, [allSummaries, allRecords, unit]);

  const categories = ['累计收益', '单日最高', '内容数量', '连续收益'];

  return (
    <Flex vertical gap={16}>
      <Flex justify="flex-end">
        <ShareCardButton allSummaries={allSummaries} allRecords={allRecords} />
      </Flex>
      {categories.map((category) => {
        const items = milestones.filter((m) => m.category === category);
        const achieved = items.filter((m) => m.achieved).length;
        return (
          <Card
            key={category}
            title={
              <>
                <TrophyOutlined style={{ color: '#faad14', marginRight: 8 }} />
                {category}
              </>
            }
            size="small"
            extra={
              <Tag color={achieved === items.length ? 'green' : 'default'}>
                {achieved}/{items.length}
              </Tag>
            }
          >
            <List
              size="small"
              dataSource={items}
              renderItem={(item) => (
                <List.Item>
                  <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                    <Flex align="center" gap={8}>
                      {item.achieved ? (
                        <CheckCircleFilled style={{ color: '#52c41a' }} />
                      ) : (
                        <LockOutlined style={{ color: '#d9d9d9' }} />
                      )}
                      <span style={{ color: item.achieved ? undefined : '#999' }}>{item.name}</span>
                    </Flex>
                    <span style={{ fontSize: 12, color: '#999' }}>
                      {item.achieved
                        ? (item.achievedDate ?? '已达成')
                        : `还差 ${(item.target - item.current).toFixed(item.unit === currencyLabel(unit) ? (unit === 'yuan' ? 2 : 0) : 0)} ${item.unit}`}
                    </span>
                  </Flex>
                </List.Item>
              )}
            />
          </Card>
        );
      })}
    </Flex>
  );
}
