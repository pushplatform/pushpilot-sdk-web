import { describe, expect, it } from 'vitest';
import { settleWillDisplay } from '../src/PushPlatform';

describe('notification will display', () => {
  it('shows the banner when nobody handles the event', () => {
    expect(settleWillDisplay(() => undefined)).toBe(false);
  });

  it('hides the banner when preventDefault runs before the handler returns', () => {
    expect(settleWillDisplay((preventDefault) => preventDefault())).toBe(true);
  });

  it('ignores preventDefault after the handler returns', () => {
    let late: (() => void) | undefined;
    const prevented = settleWillDisplay((preventDefault) => {
      late = preventDefault;
    });
    late?.();
    expect(prevented).toBe(false);
  });
});
