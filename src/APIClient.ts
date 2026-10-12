/**
 * @pushplatform/web-sdk
 *
 * API Client for Device Registry endpoints
 */

import type { PushPlatformConfig, Installation } from './types';
import { SDKError, ErrorCode } from './types';

/**
 * API Client for backend communication
 */
export class APIClient {
  private config: PushPlatformConfig;
  private installationCredential: string | null = null;
  private credentialStorageKey: string;

  constructor(config: PushPlatformConfig) {
    this.config = config;
    this.credentialStorageKey = 'pushpilot_web_credential:' + JSON.stringify([
      config.apiBaseURL.replace(/\/+$/, ''), config.applicationId, config.environment || 'production', config.apiKey,
    ]);
    if (config.browserAuth) {
      if (config.installationCredential) {
        if (!/^wbinst_[A-Za-z0-9_-]{43}$/.test(config.installationCredential)) throw new SDKError(ErrorCode.INVALID_CONFIG, 'Invalid recovered installation credential');
        this.installationCredential = config.installationCredential;
        return;
      }
      const stored = localStorage.getItem(this.credentialStorageKey);
      if (stored && /^wbinst_[A-Za-z0-9_-]{43}$/.test(stored)) this.installationCredential = stored;
    }
  }

  private get installationURL(): string {
    const base = this.config.apiBaseURL.replace(/\/+$/, '');
    return this.config.browserAuth
      ? `${base}/v1/web/${encodeURIComponent(this.config.apiKey)}/installations`
      : `${base}/v1/installations`;
  }

  private bearer(registration = false): string {
    if (!this.config.browserAuth) return this.config.apiKey;
    if (this.installationCredential) return this.installationCredential;
    if (registration) return this.config.apiKey;
    throw new SDKError(ErrorCode.NOT_INITIALIZED, 'Browser installation credential is required');
  }

  private saveCredential(data: Record<string, unknown>): void {
    if (typeof data.installation_credential !== 'string' ||
        !/^wbinst_[A-Za-z0-9_-]{43}$/.test(data.installation_credential) ||
        typeof data.credential_expires_at !== 'string' ||
        !Number.isFinite(Date.parse(data.credential_expires_at)) ||
        Date.parse(data.credential_expires_at) <= Date.now()) {
      throw new SDKError(ErrorCode.API_ERROR, 'API response is missing a valid installation credential');
    }
    localStorage.setItem(this.credentialStorageKey, data.installation_credential);
    this.installationCredential = data.installation_credential;
  }

  /**
   * Register installation with backend
   */
  async registerInstallation(params: {
    installationId: string;
    platform: string;
    environment: string;
  }): Promise<Installation> {
    try {
      const response = await this.request(this.installationURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.bearer(true)}`,
        },
        body: JSON.stringify({
          installation_id: params.installationId,
          device_id: params.installationId, // Use installation ID as device ID for web
          application_id: this.config.applicationId,
          platform: params.platform,
          environment: params.environment,
        }),
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json();
      const installation = this.mapInstallation(data);
      if (this.config.browserAuth) this.saveCredential(data);
      return installation;
    } catch (error) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw new SDKError(
        ErrorCode.NETWORK_ERROR,
        `Failed to register installation: ${String(error)}`
      );
    }
  }

  /**
   * Update installation (login/logout)
   */
  async updateInstallation(
    installationId: string,
    params: { userId?: string | null }
  ): Promise<Installation> {
    if (this.config.browserAuth) throw new SDKError(ErrorCode.INVALID_CONFIG, 'Use verified login/logout with browser authentication');
    try {
      const response = await this.request(
        `${this.installationURL}/${installationId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bearer()}`,
          },
          body: JSON.stringify({
            user_id: params.userId,
          }),
        }
      );

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json();
      return this.mapInstallation(data);
    } catch (error) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw new SDKError(
        ErrorCode.NETWORK_ERROR,
        `Failed to update installation: ${String(error)}`
      );
    }
  }

  /**
   * Login user (POST /v1/installations/{id}/login)
   */
  async loginUser(installationId: string, userId: string, identityProof?: string): Promise<void> {
    if (this.config.browserAuth && !identityProof) throw new SDKError(ErrorCode.VALIDATION_ERROR, 'Browser login requires a server identity proof');
    try {
      const response = await this.request(
        `${this.installationURL}/${installationId}/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bearer()}`,
          },
          body: JSON.stringify({
            external_user_id: userId,
            identity_proof: identityProof,
          }),
        }
      );

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // Login returns 200 with empty body
    } catch (error) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw new SDKError(
        ErrorCode.NETWORK_ERROR,
        `Failed to login user: ${String(error)}`
      );
    }
  }

  /**
   * Logout user (POST /v1/installations/{id}/logout)
   */
  async logoutUser(installationId: string): Promise<void> {
    try {
      const response = await this.request(
        `${this.installationURL}/${installationId}/logout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bearer()}`,
          },
        }
      );

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // Logout returns 200 with empty body
    } catch (error) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw new SDKError(
        ErrorCode.NETWORK_ERROR,
        `Failed to logout user: ${String(error)}`
      );
    }
  }

  /**
   * Register push subscription
   */
  async registerSubscription(
    installationId: string,
    subscription: PushSubscription
  ): Promise<string> {
    try {
      const serialized = subscription.toJSON();
      const body: Record<string, unknown> = {
        provider: 'web_push',
        token: subscription.endpoint,
        environment: this.config.environment,
      };
      if (serialized.keys?.p256dh && serialized.keys?.auth) {
        body.endpoint = subscription.endpoint;
        body.keys = { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth };
      }
      const response = await this.request(
        `${this.installationURL}/${installationId}/tokens`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bearer()}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }
      const data = await response.json();
      if (typeof data?.subscription_id !== 'string' || !data.subscription_id.trim()) {
        throw new SDKError(ErrorCode.API_ERROR, 'API response is missing subscription_id');
      }
      return data.subscription_id;
    } catch (error) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw new SDKError(
        ErrorCode.NETWORK_ERROR,
        `Failed to register subscription: ${String(error)}`
      );
    }
  }

  /**
   * Delete push subscription
   */
  async deleteSubscription(
    installationId: string,
    subscriptionId: string
  ): Promise<void> {
    try {
      const response = await this.request(
        `${this.installationURL}/${installationId}/subscriptions/${subscriptionId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.bearer()}`,
          },
        }
      );

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }
    } catch (error) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw new SDKError(
        ErrorCode.NETWORK_ERROR,
        `Failed to delete subscription: ${String(error)}`
      );
    }
  }

  async renewInstallationCredential(installationId: string): Promise<void> {
    if (!this.config.browserAuth) throw new SDKError(ErrorCode.INVALID_CONFIG, 'Credential renewal requires browserAuth');
    try {
      const response = await this.request(`${this.installationURL}/${installationId}/credential/renew`, {
        method: 'POST', headers: { Authorization: `Bearer ${this.bearer()}` },
      });
      if (!response.ok) await this.handleErrorResponse(response);
      const data = await response.json();
      if (data?.id !== installationId) throw new SDKError(ErrorCode.API_ERROR, 'Credential belongs to another installation');
      this.saveCredential(data);
    } catch (error) {
      if (error instanceof SDKError) throw error;
      throw new SDKError(ErrorCode.NETWORK_ERROR, 'Failed to renew installation credential');
    }
  }

  private async request(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Handle error response from API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `API error: ${response.status}`;
    const errorCode = response.status === 400 ? ErrorCode.VALIDATION_ERROR : ErrorCode.API_ERROR;
    try {
      const data = await response.json();
      const message = data.message || data.error?.message || data.error;
      if (typeof message === 'string') errorMessage = message;
    } catch {
      // An HTML/text error response still retains its HTTP status and SDK code.
    }
    if (response.status === 401 || response.status === 403) {
      errorMessage = this.config.browserAuth
        ? 'Browser authentication failed. Check installation credential and allowed origin.'
        : 'Authentication failed. Check your API key and scopes.';
    } else if (response.status >= 500) {
      errorMessage = 'Server error. Please try again later.';
    }

    throw new SDKError(errorCode, errorMessage, {
      status: response.status,
      statusText: response.statusText,
    });
  }

  /**
   * Map API response to Installation type
   */
  private mapInstallation(data: any): Installation {
    if (typeof (data?.id || data?.installation_id) !== 'string' || !(data.id || data.installation_id).trim()) {
      throw new SDKError(ErrorCode.API_ERROR, 'API response is missing installation id');
    }
    return {
      installationId: data.id || data.installation_id, // Backend returns 'id'
      userId: data.user_id || undefined,
      createdAt: new Date(data.created_at),
    };
  }
}
