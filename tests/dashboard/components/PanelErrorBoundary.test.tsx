import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelErrorBoundary } from '@/dashboard/components/PanelErrorBoundary';

let shouldCrash = false;

function CrashPanel() {
  if (shouldCrash) {
    throw new Error('模拟渲染异常');
  }

  return <div>面板内容正常</div>;
}

describe('PanelErrorBoundary', () => {
  beforeEach(() => {
    shouldCrash = false;
  });

  it('renders children when no error is thrown', () => {
    render(
      <PanelErrorBoundary panelName="趋势面板">
        <CrashPanel />
      </PanelErrorBoundary>,
    );

    expect(screen.getByText('面板内容正常')).toBeTruthy();
  });

  it('shows fallback UI and logs panel context when a child throws', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldCrash = true;

    render(
      <PanelErrorBoundary panelName="趋势面板">
        <CrashPanel />
      </PanelErrorBoundary>,
    );

    expect(screen.getByText('面板加载出错')).toBeTruthy();
    expect(screen.getByText('趋势面板：模拟渲染异常')).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('retries rendering after reset', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldCrash = true;

    render(
      <PanelErrorBoundary panelName="趋势面板">
        <CrashPanel />
      </PanelErrorBoundary>,
    );

    expect(screen.getByText('面板加载出错')).toBeTruthy();

    shouldCrash = false;
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    expect(screen.getByText('面板内容正常')).toBeTruthy();

    consoleErrorSpy.mockRestore();
  });
});
