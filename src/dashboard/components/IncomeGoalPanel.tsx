import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal, InputNumber, Progress, Flex, Statistic } from 'antd';
import { TrophyOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getGoal, saveGoal, deleteGoal } from '@/db/goal-store';
import type { IncomeGoal } from '@/db/database';

interface Props {
  userId: string;
  monthIncome: number;
  monthDaysElapsed: number;
  monthDaysTotal: number;
}

export function IncomeGoalPanel({ userId, monthIncome, monthDaysElapsed, monthDaysTotal }: Props) {
  const [goal, setGoal] = useState<IncomeGoal | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const loadGoal = useCallback(async () => {
    const g = await getGoal(userId, period);
    setGoal(g ?? null);
    setLoading(false);
  }, [userId, period]);

  useEffect(() => { loadGoal(); }, [loadGoal]);

  const handleSave = async () => {
    if (!inputValue || inputValue <= 0) return;
    await saveGoal({
      userId,
      period,
      targetAmount: Math.round(inputValue * 100),
      createdAt: Date.now(),
    });
    setModalOpen(false);
    setInputValue(null);
    loadGoal();
  };

  const handleDelete = async () => {
    await deleteGoal(userId, period);
    loadGoal();
  };

  if (loading) return null;

  if (!goal) {
    return (
      <Card size="small" style={{ background: '#fafafa', border: '1px dashed #d9d9d9' }}>
        <Flex justify="center" align="center" gap={8} style={{ padding: 8 }}>
          <TrophyOutlined style={{ color: '#faad14', fontSize: 18 }} />
          <Button type="primary" ghost size="small" onClick={() => setModalOpen(true)}>
            设定本月收益目标
          </Button>
        </Flex>
        <Modal
          title="设定本月收益目标"
          open={modalOpen}
          onOk={handleSave}
          onCancel={() => { setModalOpen(false); setInputValue(null); }}
          okText="保存"
          cancelText="取消"
        >
          <InputNumber
            value={inputValue}
            onChange={setInputValue}
            min={1}
            precision={0}
            prefix="¥"
            placeholder="输入目标金额（元）"
            style={{ width: '100%', marginTop: 16 }}
            size="large"
          />
        </Modal>
      </Card>
    );
  }

  const target = goal.targetAmount / 100;
  const percent = target > 0 ? Math.min((monthIncome / target) * 100, 100) : 0;
  const dailyAvg = monthDaysElapsed > 0 ? monthIncome / monthDaysElapsed : 0;
  const daysRemaining = monthDaysTotal - monthDaysElapsed;
  const projected = monthIncome + dailyAvg * daysRemaining;

  const progressColor = percent < 50 ? '#1890ff' : percent < 80 ? '#fa8c16' : '#52c41a';

  return (
    <Card
      size="small"
      title={<><TrophyOutlined style={{ color: '#faad14' }} /> 本月目标</>}
      extra={
        <Flex gap={4}>
          <Button
            type="text" size="small" icon={<EditOutlined />}
            onClick={() => { setInputValue(target); setModalOpen(true); }}
          />
          <Button type="text" size="small" icon={<DeleteOutlined />} onClick={handleDelete} />
        </Flex>
      }
    >
      <Progress
        percent={Math.round(percent)}
        strokeColor={progressColor}
        format={() => `${percent.toFixed(1)}%`}
      />
      <Flex justify="space-between" style={{ marginTop: 8 }}>
        <Statistic title="已达成" value={monthIncome} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
        <Statistic title="目标" value={target} precision={0} prefix="¥" valueStyle={{ fontSize: 16, color: '#999' }} />
        <Statistic title="月底预计" value={projected} precision={2} prefix="¥" valueStyle={{ fontSize: 16, color: projected >= target ? '#52c41a' : '#fa8c16' }} />
      </Flex>
      <div style={{ fontSize: 11, color: '#999', marginTop: 4, textAlign: 'center' }}>
        按当前日均 ¥{dailyAvg.toFixed(2)}，还剩 {daysRemaining} 天
      </div>

      <Modal
        title="修改本月收益目标"
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setInputValue(null); }}
        okText="保存"
        cancelText="取消"
      >
        <InputNumber
          value={inputValue}
          onChange={setInputValue}
          min={1}
          precision={0}
          prefix="¥"
          placeholder="输入目标金额（元）"
          style={{ width: '100%', marginTop: 16 }}
          size="large"
        />
      </Modal>
    </Card>
  );
}
