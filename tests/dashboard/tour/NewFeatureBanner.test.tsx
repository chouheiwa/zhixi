import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('NewFeatureBanner', () => {
  it('renders with feature count', async () => {
    const { NewFeatureBanner } = await import('@/dashboard/tour/NewFeatureBanner');
    const onView = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(<NewFeatureBanner featureCount={3} onViewFeatures={onView} onDismiss={onDismiss} />);
    expect(container).toBeTruthy();
    expect(container.textContent).toContain('3');
  });

  it('calls onViewFeatures when button clicked', async () => {
    const { NewFeatureBanner } = await import('@/dashboard/tour/NewFeatureBanner');
    const onView = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(<NewFeatureBanner featureCount={2} onViewFeatures={onView} onDismiss={onDismiss} />);
    const buttons = container.querySelectorAll('button');
    // Find the "view" button
    for (const btn of buttons) {
      if (btn.textContent?.includes('查看') || btn.textContent?.includes('了解')) {
        fireEvent.click(btn);
        break;
      }
    }
    expect(onView).toHaveBeenCalled();
  });
});
