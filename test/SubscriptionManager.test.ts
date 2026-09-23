import { describe, expect, it, vi } from 'vitest';
import { SubscriptionManager } from '../src/SubscriptionManager';
import { ErrorCode } from '../src/types';

const vapidKey = btoa(String.fromCharCode(4, ...new Uint8Array(64))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function managerWith(subscription: any = null) {
  const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription), subscribe: vi.fn() } } as any;
  return { manager: new SubscriptionManager({ getRegistration: vi.fn().mockResolvedValue(registration) } as any, vapidKey), registration };
}

describe('SubscriptionManager Web Push lifecycle', () => {
  it('converts the configured VAPID key and passes it to subscribe', async () => {
    const { manager, registration } = managerWith();
    const subscription = { endpoint: 'https://push.example/sub', toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }) };
    registration.pushManager.subscribe.mockResolvedValue(subscription);
    Object.defineProperty(global, 'Notification', { value: { permission: 'granted' }, configurable: true });

    await manager.subscribe();
    const options = registration.pushManager.subscribe.mock.calls[0][0];
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(options.applicationServerKey).toHaveLength(65);
    expect(options.applicationServerKey[0]).toBe(4);
  });

  it('rejects a missing VAPID key before calling the browser', async () => {
    const { registration } = managerWith();
    const manager = new SubscriptionManager({ getRegistration: vi.fn().mockResolvedValue({ pushManager: registration.pushManager }) } as any);
    Object.defineProperty(global, 'Notification', { value: { permission: 'granted' }, configurable: true });
    await expect(manager.subscribe()).rejects.toMatchObject({ code: ErrorCode.SUBSCRIPTION_FAILED });
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('rejects an invalid VAPID key before calling the browser', async () => {
    const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() } } as any;
    const manager = new SubscriptionManager({ getRegistration: vi.fn().mockResolvedValue(registration) } as any, 'not-base64!');
    Object.defineProperty(global, 'Notification', { value: { permission: 'granted' }, configurable: true });
    await expect(manager.subscribe()).rejects.toMatchObject({ code: ErrorCode.SUBSCRIPTION_FAILED });
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('is idempotent when unsubscribing without an existing subscription', async () => {
    const { manager, registration } = managerWith(null);
    await expect(manager.unsubscribe()).resolves.toBeUndefined();
    await expect(manager.unsubscribe()).resolves.toBeUndefined();
    expect(registration.pushManager.getSubscription).toHaveBeenCalledTimes(2);
  });
});
