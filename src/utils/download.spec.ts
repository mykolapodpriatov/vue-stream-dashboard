import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from './download';

describe('downloadText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('clicks a temporary anchor pointing at a blob of the text, then revokes it', () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.href).toBe('blob:fake');
        expect(this.download).toBe('session.json');
        expect(this.isConnected).toBe(true);
      });

    downloadText('session.json', '{"ok":true}');

    expect(create).toHaveBeenCalledTimes(1);
    const blob = create.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    // Revoked on the next task, not synchronously.
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });
});
