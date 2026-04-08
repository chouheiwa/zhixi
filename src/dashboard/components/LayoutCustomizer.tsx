import React, { useState } from 'react';
import { Drawer, Switch, Button, Flex, Divider, Typography } from 'antd';
import { MenuOutlined, UndoOutlined } from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TabConfig } from '@/shared/types';
import { getPanelMeta } from '@/dashboard/panel-registry';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  tabs: TabConfig[];
  onUpdate: (tabs: TabConfig[]) => void;
  onReset: () => void;
}

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Flex align="center" gap={8} style={{ padding: '6px 0' }}>
        <MenuOutlined {...listeners} style={{ cursor: 'grab', color: '#999' }} />
        {children}
      </Flex>
    </div>
  );
}

export function LayoutCustomizer({ open, onClose, tabs, onUpdate, onReset }: Props) {
  const [expandedTab, setExpandedTab] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedTabs.findIndex((t) => t.key === active.id);
    const newIndex = sortedTabs.findIndex((t) => t.key === over.id);
    const reordered = arrayMove(sortedTabs, oldIndex, newIndex).map((t, i) => ({ ...t, order: i }));
    onUpdate(reordered);
  };

  const handleTabVisibility = (tabKey: string, visible: boolean) => {
    onUpdate(tabs.map((t) => (t.key === tabKey ? { ...t, visible } : t)));
  };

  const handlePanelDragEnd = (tabKey: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    onUpdate(
      tabs.map((t) => {
        if (t.key !== tabKey) return t;
        const sortedPanels = [...t.panels].sort((a, b) => a.order - b.order);
        const oldIndex = sortedPanels.findIndex((p) => p.key === active.id);
        const newIndex = sortedPanels.findIndex((p) => p.key === over.id);
        const reordered = arrayMove(sortedPanels, oldIndex, newIndex).map((p, i) => ({ ...p, order: i }));
        return { ...t, panels: reordered };
      }),
    );
  };

  const handlePanelVisibility = (tabKey: string, panelKey: string, visible: boolean) => {
    onUpdate(
      tabs.map((t) => {
        if (t.key !== tabKey) return t;
        return {
          ...t,
          panels: t.panels.map((p) => (p.key === panelKey ? { ...p, visible } : p)),
        };
      }),
    );
  };

  return (
    <Drawer
      title="自定义布局"
      open={open}
      onClose={onClose}
      width={360}
      footer={
        <Flex justify="center">
          <Button icon={<UndoOutlined />} onClick={onReset}>
            恢复默认
          </Button>
        </Flex>
      }
    >
      <Text type="secondary" style={{ fontSize: 12, marginBottom: 12, display: 'block' }}>
        拖拽调整顺序，开关控制显示/隐藏
      </Text>

      <Divider titlePlacement="left" plain style={{ fontSize: 12 }}>
        标签页
      </Divider>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
        <SortableContext items={sortedTabs.map((t) => t.key)} strategy={verticalListSortingStrategy}>
          {sortedTabs.map((tab) => (
            <SortableItem key={tab.key} id={tab.key}>
              <Flex justify="space-between" align="center" style={{ flex: 1 }}>
                <span
                  style={{ cursor: 'pointer', fontWeight: expandedTab === tab.key ? 600 : 400 }}
                  onClick={() => setExpandedTab(expandedTab === tab.key ? null : tab.key)}
                >
                  {tab.label}
                </span>
                <Switch
                  size="small"
                  checked={tab.visible}
                  onChange={(checked) => handleTabVisibility(tab.key, checked)}
                />
              </Flex>
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>

      {expandedTab &&
        (() => {
          const tab = tabs.find((t) => t.key === expandedTab);
          if (!tab || tab.panels.length === 0) return null;
          const sortedPanels = [...tab.panels].sort((a, b) => a.order - b.order);

          return (
            <>
              <Divider titlePlacement="left" plain style={{ fontSize: 12 }}>
                「{tab.label}」内面板
              </Divider>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handlePanelDragEnd(expandedTab, e)}
              >
                <SortableContext items={sortedPanels.map((p) => p.key)} strategy={verticalListSortingStrategy}>
                  {sortedPanels.map((panel) => {
                    const meta = getPanelMeta(panel.key);
                    return (
                      <SortableItem key={panel.key} id={panel.key}>
                        <Flex justify="space-between" align="center" style={{ flex: 1 }}>
                          <span style={{ fontSize: 13 }}>{meta?.label ?? panel.key}</span>
                          <Switch
                            size="small"
                            checked={panel.visible}
                            onChange={(checked) => handlePanelVisibility(expandedTab, panel.key, checked)}
                          />
                        </Flex>
                      </SortableItem>
                    );
                  })}
                </SortableContext>
              </DndContext>
            </>
          );
        })()}
    </Drawer>
  );
}
