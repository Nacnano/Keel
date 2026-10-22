import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Sheet } from './Sheet';

afterEach(() => {
  cleanup();
  document.getElementById('root')?.remove();
});

function Harness({ modeless = false }: { modeless?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Listening options</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Options" modeless={modeless}>
        <button disabled>Unavailable</button>
        <input aria-label="Session name" />
        <button>Done</button>
      </Sheet>
    </>
  );
}

function renderInRoot(ui: React.ReactNode) {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  return { root, ...render(ui, { container: root }) };
}

describe('Sheet', () => {
  it('focuses the modal, traps Tab in both directions, and restores the trigger on Escape', () => {
    const { root } = renderInRoot(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Listening options' });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole('button', { name: 'Close' });
    const done = screen.getByRole('button', { name: 'Done' });
    expect(screen.getByRole('dialog', { name: 'Options' })).toHaveAttribute('aria-modal', 'true');
    expect(close).toHaveFocus();
    expect(root).toHaveAttribute('inert');

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(done).toHaveFocus();
    fireEvent.keyDown(done, { key: 'Tab' });
    expect(close).toHaveFocus();
    trigger.focus();
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(root).not.toHaveAttribute('inert');
    expect(trigger).toHaveFocus();
  });

  it('preserves a pre-existing inert state and cleans up when unmounted', () => {
    const { root, rerender, unmount } = renderInRoot(
      <Sheet open={false} onClose={vi.fn()} title="Options">
        Details
      </Sheet>,
    );
    root.setAttribute('inert', '');
    rerender(
      <Sheet open onClose={vi.fn()} title="Options">
        Details
      </Sheet>,
    );
    expect(root).toHaveAttribute('inert');
    unmount();
    expect(root).toHaveAttribute('inert');
  });

  it('leaves modeless inspectors and the background keyboard-accessible', () => {
    const { root } = renderInRoot(<Harness modeless />);
    const trigger = screen.getByRole('button', { name: 'Listening options' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('complementary', { name: 'Options' })).not.toHaveAttribute(
      'aria-modal',
    );
    expect(root).not.toHaveAttribute('inert');
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: 'Tab', shiftKey: true });
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
