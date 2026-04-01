import React, { useMemo } from 'react';
import { Card, List, Tag, Flex } from 'antd';
import { TrophyOutlined, LockOutlined, CheckCircleFilled } from '@ant-design/icons';
import type { DailySummary, IncomeRecord } from '@/shared/types';

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
  const milestones = useMemo(() => {
    const totalIncome = allSummaries.reduce((s, d) => s + d.totalIncome, 0) / 100;

    let maxDailyIncome = 0;
    for (const s of allSummaries) {
      const dayIncome = s.totalIncome / 100;
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
        cumulative += s.totalIncome / 100;
        if (cumulative >= threshold) return s.date;
      }
      return undefined;
    };

    const maxDailyDate = sortedSummaries.find((s) => s.totalIncome / 100 === maxDailyIncome)?.date;

    const result: Milestone[] = [];

    for (const target of [10, 50, 100, 500, 1000, 5000, 10000]) {
      const date = findCumulativeDate(target);
      result.push({
        category: '累计收益',
        name: `累计收益达到 ¥${target}`,
        target,
        unit: '元',
        achieved: totalIncome >= target,
        achievedDate: date,
        current: totalIncome,
      });
    }

    for (const target of [1, 5, 10, 50]) {
      result.push({
        category: '单日最高',
        name: `单日收益突破 ¥${target}`,
        target,
        unit: '元',
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
  }, [allSummaries, allRecords]);

  const categories = ['累计收益', '单日最高', '内容数量', '连续收益'];

  return (
    <Flex vertical gap={16}>
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
                        : `还差 ${(item.target - item.current).toFixed(item.unit === '元' ? 2 : 0)} ${item.unit}`}
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
