/**
 * Custom render helper that wraps the rendered component tree with the
 * providers that production components rely on but individual unit tests
 * shouldn't have to know about.
 *
 * Currently: `CurrencyProvider` — components that call `useCurrency()` will
 * throw if rendered without it. Import `render` from this file instead of
 * `@testing-library/react` in any test that mounts UI that reads currency
 * formatting from context.
 *
 * Re-exports the remaining `@testing-library/react` helpers so tests can use
 * this file as a drop-in replacement. We avoid `export *` (which can be
 * finicky around local name collisions depending on the bundler) and
 * explicitly re-export each API we actually use.
 */

import React, { type ReactElement, type ReactNode } from 'react';
import {
  render as baseRender,
  cleanup,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import { CurrencyProvider } from '@/dashboard/contexts/CurrencyContext';

function AllProviders({ children }: { children: ReactNode }): ReactElement {
  return <CurrencyProvider>{children}</CurrencyProvider>;
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>): RenderResult {
  return baseRender(ui, { ...options, wrapper: AllProviders });
}

export { cleanup, screen, fireEvent, waitFor, act, within };
export type { RenderOptions, RenderResult };
