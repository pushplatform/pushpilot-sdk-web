import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APIClient } from '../src/APIClient';
import { SDKError } from '../src/types';

const config = {
  apiKey: 'key',
  applicationId: 'app',
  apiBaseURL: 'http://localhost:8085',
  environment: 'production' as const,
};

describe('APIClient Web Push subscription contract', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('registers a Web Push endpoint through the token contract and returns its ID', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ subscription_id: 'sub-123' }), { status: 201 }
    ));
    const client = new APIClient(config);
    const subscription = { endpoint: 'https://push.example/subscription', toJSON: () => ({}) } as PushSubscription;

    await expect(client.registerSubscription('installation-1', subscription)).resolves.toBe('sub-123');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8085/v1/installations/installation-1/tokens',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ provider: 'web_push', token: subscription.endpoint, environment: 'production' }),
      })
    );
  });

  it('removes the subscription using the installation-scoped endpoint', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await new APIClient(config).deleteSubscription('installation-1', 'sub-123');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8085/v1/installations/installation-1/subscriptions/sub-123',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('surfaces backend registration failures without changing local state', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(new APIClient(config).registerSubscription('installation-1', {
      endpoint: 'https://push.example/subscription', toJSON: () => ({}),
    } as PushSubscription)).rejects.toBeInstanceOf(SDKError);
  });

  it('surfaces backend removal failures for retry', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(new APIClient(config).deleteSubscription('installation-1', 'sub-123'))
      .rejects.toBeInstanceOf(SDKError);
  });
});
