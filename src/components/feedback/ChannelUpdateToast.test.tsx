import { act, fireEvent, render, screen } from '@testing-library/react';
import { createDemoDashboard } from '../../fixtures/demoData';
import { ChannelUpdateToast } from './ChannelUpdateToast';
import {
  CHANNEL_UPDATE_VISIBLE_MS,
  channelUpdateStorageKey,
} from './channelUpdateStorage';

const data = createDemoDashboard('small');
const latestObservedAt = data.snapshots.at(-1)?.observedAt ?? '';
const previousObservedAt = data.snapshots.at(-2)?.observedAt ?? '';

function seedPreviousSnapshot() {
  window.localStorage.setItem(
    channelUpdateStorageKey(data.channel.channelId),
    previousObservedAt,
  );
}

describe('ChannelUpdateToast', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size;
        },
      } satisfies Storage,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('quietly establishes a first-visit baseline without showing old movement', () => {
    render(<ChannelUpdateToast data={data} />);

    expect(
      screen.queryByRole('status', { name: 'New channel update' }),
    ).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem(channelUpdateStorageKey(data.channel.channelId)),
    ).toBe(latestObservedAt);
  });

  it('does not regress a last-seen marker when older data loads', () => {
    const newerObservedAt = '2026-08-28T09:00:00.000Z';
    window.localStorage.setItem(
      channelUpdateStorageKey(data.channel.channelId),
      newerObservedAt,
    );
    render(<ChannelUpdateToast data={data} />);

    expect(
      screen.queryByRole('status', { name: 'New channel update' }),
    ).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem(channelUpdateStorageKey(data.channel.channelId)),
    ).toBe(newerObservedAt);
  });

  it('shows real current values and deltas once for a newer snapshot', () => {
    seedPreviousSnapshot();
    const first = render(<ChannelUpdateToast data={data} />);

    const update = screen.getByRole('status', { name: 'New channel update' });
    expect(update).toHaveTextContent('586 subscribers');
    expect(update).toHaveTextContent('+83');
    expect(update).toHaveTextContent('48,200 views');
    expect(update).toHaveTextContent('+14,251');
    expect(update).toHaveTextContent('23 uploads');
    expect(update).toHaveTextContent('+2');
    expect(
      screen.getByRole('button', { name: 'Dismiss channel update' }),
    ).toHaveAttribute('type', 'button');

    first.unmount();
    render(<ChannelUpdateToast data={data} />);
    expect(
      screen.queryByRole('status', { name: 'New channel update' }),
    ).not.toBeInTheDocument();
  });

  it('auto-dismisses after eight seconds', () => {
    vi.useFakeTimers();
    seedPreviousSnapshot();
    render(<ChannelUpdateToast data={data} />);

    act(() => vi.advanceTimersByTime(CHANNEL_UPDATE_VISIBLE_MS));
    expect(screen.getByRole('status', { name: 'New channel update' })).toHaveClass(
      'is-leaving',
    );

    act(() => vi.advanceTimersByTime(160));
    expect(
      screen.queryByRole('status', { name: 'New channel update' }),
    ).not.toBeInTheDocument();
  });

  it('pauses the timeout while hovered or keyboard-focused', () => {
    vi.useFakeTimers();
    seedPreviousSnapshot();
    render(<ChannelUpdateToast data={data} />);

    const update = screen.getByRole('status', { name: 'New channel update' });
    const close = screen.getByRole('button', { name: 'Dismiss channel update' });
    fireEvent.mouseEnter(update);
    act(() => vi.advanceTimersByTime(CHANNEL_UPDATE_VISIBLE_MS + 1_000));
    expect(update).toBeVisible();

    fireEvent.mouseLeave(update);
    fireEvent.focus(close);
    act(() => vi.advanceTimersByTime(CHANNEL_UPDATE_VISIBLE_MS + 1_000));
    expect(update).toBeVisible();

    fireEvent.blur(close, { relatedTarget: null });
    act(() => vi.advanceTimersByTime(CHANNEL_UPDATE_VISIBLE_MS + 160));
    expect(
      screen.queryByRole('status', { name: 'New channel update' }),
    ).not.toBeInTheDocument();
  });
});
