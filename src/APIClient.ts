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

  constructor(config: PushPlatformConfig) {
    this.config = config;
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
      const response = await fetch(`${this.config.apiBaseURL}/v1/installations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
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
      return this.mapInstallation(data);
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
    try {
      const response = await fetch(
        `${this.config.apiBaseURL}/v1/installations/${installationId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
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
  async loginUser(installationId: string, userId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.apiBaseURL}/v1/installations/${installationId}/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            external_user_id: userId,
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
      const response = await fetch(
        `${this.config.apiBaseURL}/v1/installations/${installationId}/logout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
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
      const response = await fetch(
        `${this.config.apiBaseURL}/v1/installations/${installationId}/tokens`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            provider: 'web_push',
            token: subscription.endpoint,
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.toJSON().keys?.p256dh,
              auth: subscription.toJSON().keys?.auth,
            },
            environment: this.config.environment,
          }),
        }
      );

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }
      const data = await response.json();
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
      const response = await fetch(
        `${this.config.apiBaseURL}/v1/installations/${installationId}/subscriptions/${subscriptionId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
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

  /**
   * Handle error response from API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `API error: ${response.status}`;
    let errorCode = ErrorCode.API_ERROR;

    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;

      // Map specific API errors to SDK error codes
      if (response.status === 401 || response.status === 403) {
        errorCode = ErrorCode.API_ERROR;
        errorMessage = 'Authentication failed. Check your API key.';
      } else if (response.status === 404) {
        errorCode = ErrorCode.API_ERROR;
        errorMessage = 'Resource not found.';
      } else if (response.status === 400) {
        errorCode = ErrorCode.VALIDATION_ERROR;
      } else if (response.status >= 500) {
        errorCode = ErrorCode.API_ERROR;
        errorMessage = 'Server error. Please try again later.';
      }
    } catch {
      // Failed to parse error response, use default message
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
    return {
      installationId: data.id || data.installation_id, // Backend returns 'id'
      userId: data.user_id || undefined,
      createdAt: new Date(data.created_at),
    };
  }
}
