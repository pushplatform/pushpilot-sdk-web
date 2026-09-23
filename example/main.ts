import { PushPlatform } from '../src/index';

const UI = {
  initStatus: document.getElementById('init-status')!,
  permissionStatus: document.getElementById('permission-status')!,
  subscriptionStatus: document.getElementById('subscription-status')!,
  authStatus: document.getElementById('auth-status')!,
  installationId: document.getElementById('installation-id')!,
  subscriptionInfo: document.getElementById('subscription-info')!,
  subscriptionData: document.getElementById('subscription-data')!,
  notificationsContainer: document.getElementById('notifications-container')!,

  btnInit: document.getElementById('btn-init') as HTMLButtonElement,
  btnPermission: document.getElementById('btn-permission') as HTMLButtonElement,
  btnSubscribe: document.getElementById('btn-subscribe') as HTMLButtonElement,
  btnUnsubscribe: document.getElementById('btn-unsubscribe') as HTMLButtonElement,
  btnLogin: document.getElementById('btn-login') as HTMLButtonElement,
  btnLogout: document.getElementById('btn-logout') as HTMLButtonElement,
  userIdInput: document.getElementById('user-id-input') as HTMLInputElement,
};

let currentUserId: string | null = null;
const notifications: Array<{ title: string; body: string; timestamp: Date; type: string }> = [];

function updateStatus(element: HTMLElement, status: string, className: 'success' | 'error' | 'info' | 'warning') {
  element.textContent = status;
  element.className = `status ${className}`;
}

function log(message: string, data?: any) {
  console.log(`[SDK Test] ${message}`, data || '');
}

function showError(message: string, error: any) {
  console.error(`[SDK Test] ${message}`, error);
  alert(`Error: ${message}\n\n${error.message || error}`);
}

function addNotification(title: string, body: string, type: string) {
  notifications.unshift({ title, body, timestamp: new Date(), type });
  renderNotifications();
}

function renderNotifications() {
  if (notifications.length === 0) {
    UI.notificationsContainer.innerHTML = '<div class="empty-state">No notifications yet</div>';
    return;
  }

  UI.notificationsContainer.innerHTML = notifications.map(n => `
    <div class="notification-item">
      <div class="title">${escapeHtml(n.title)}</div>
      <div class="body">${escapeHtml(n.body)}</div>
      <div class="meta">${n.type} • ${n.timestamp.toLocaleTimeString()}</div>
    </div>
  `).join('');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function initialize() {
  try {
    log('Initializing SDK...');
    UI.btnInit.disabled = true;

    // Load config from sessionStorage (injected via console for testing)
    const configJson = sessionStorage.getItem('pushplatform_test_config');
    let config;

    if (configJson) {
      config = JSON.parse(configJson);
      log('Using config from sessionStorage', config);
    } else {
      // Default test config - inject real values via console before testing
      config = {
        apiKey: 'REPLACE_WITH_REAL_API_KEY',
        applicationId: 'REPLACE_WITH_REAL_APP_ID',
        apiBaseURL: 'http://localhost:8085',
        environment: 'development',
      };
      log('⚠️  Using placeholder config. Inject real credentials via console:',
          'See RUNTIME_TEST_INSTRUCTIONS.md');
    }

    await PushPlatform.initialize({
      apiKey: config.apiKey,
      applicationId: config.applicationId,
      apiBaseURL: config.apiBaseURL,
      environment: config.environment,
      serviceWorkerPath: '/service-worker.js',
      debugMode: true,
    });

    const installationId = await PushPlatform.getInstallationId();
    log('SDK initialized', { installationId });

    UI.installationId.textContent = installationId;
    updateStatus(UI.initStatus, 'Initialized', 'success');

    UI.btnPermission.disabled = false;
    UI.userIdInput.disabled = false;
    UI.btnLogin.disabled = false;

    const permissionStatus = await PushPlatform.getPermissionStatus();
    updatePermissionUI(permissionStatus);

    const subscription = await PushPlatform.getSubscription();
    updateSubscriptionUI(subscription);

    setupEventListeners();

  } catch (error: any) {
    showError('Failed to initialize SDK', error);
    updateStatus(UI.initStatus, `Error: ${error.message}`, 'error');
    UI.btnInit.disabled = false;
  }
}

function setupEventListeners() {
  log('Setting up event listeners...');

  PushPlatform.onNotificationReceived((notification) => {
    log('Notification received', notification);
    addNotification(
      notification.title || 'No title',
      notification.body || 'No body',
      'Received'
    );
  });

  PushPlatform.onNotificationClicked((notification) => {
    log('Notification clicked', notification);
    addNotification(
      notification.title || 'No title',
      notification.body || 'No body',
      'Clicked'
    );
  });
}

async function requestPermission() {
  try {
    log('Requesting notification permission...');
    UI.btnPermission.disabled = true;

    const status = await PushPlatform.requestPermission();
    log('Permission status', status);

    updatePermissionUI(status);

    if (status === 'granted') {
      UI.btnSubscribe.disabled = false;
    }

  } catch (error: any) {
    showError('Failed to request permission', error);
  } finally {
    UI.btnPermission.disabled = false;
  }
}

function updatePermissionUI(status: NotificationPermission) {
  if (status === 'granted') {
    updateStatus(UI.permissionStatus, 'Granted ✓', 'success');
    UI.btnSubscribe.disabled = false;
  } else if (status === 'denied') {
    updateStatus(UI.permissionStatus, 'Denied ✗', 'error');
  } else {
    updateStatus(UI.permissionStatus, 'Default (not asked)', 'warning');
  }
}

async function subscribe() {
  try {
    log('Subscribing to push notifications...');
    UI.btnSubscribe.disabled = true;

    const subscription = await PushPlatform.subscribe();
    log('Subscribed', subscription);

    updateSubscriptionUI(subscription);

  } catch (error: any) {
    showError('Failed to subscribe', error);
    UI.btnSubscribe.disabled = false;
  }
}

async function unsubscribe() {
  try {
    log('Unsubscribing from push notifications...');
    UI.btnUnsubscribe.disabled = true;

    await PushPlatform.unsubscribe();
    log('Unsubscribed');

    updateSubscriptionUI(null);

  } catch (error: any) {
    showError('Failed to unsubscribe', error);
  } finally {
    UI.btnUnsubscribe.disabled = false;
  }
}

function updateSubscriptionUI(subscription: any) {
  if (subscription) {
    updateStatus(UI.subscriptionStatus, 'Subscribed ✓', 'success');
    UI.subscriptionInfo.style.display = 'block';
    UI.subscriptionData.textContent = JSON.stringify(subscription, null, 2);
    UI.btnSubscribe.disabled = true;
    UI.btnUnsubscribe.disabled = false;
  } else {
    updateStatus(UI.subscriptionStatus, 'Not subscribed', 'info');
    UI.subscriptionInfo.style.display = 'none';
    UI.btnSubscribe.disabled = false;
    UI.btnUnsubscribe.disabled = true;
  }
}

async function login() {
  try {
    const userId = UI.userIdInput.value.trim();
    if (!userId) {
      alert('Please enter a user ID');
      return;
    }

    log('Logging in...', { userId });
    UI.btnLogin.disabled = true;

    await PushPlatform.login(userId);
    log('Logged in', { userId });

    currentUserId = userId;
    updateStatus(UI.authStatus, `Logged in as: ${userId}`, 'success');
    UI.btnLogout.disabled = false;

  } catch (error: any) {
    showError('Failed to login', error);
  } finally {
    UI.btnLogin.disabled = false;
  }
}

async function logout() {
  try {
    log('Logging out...');
    UI.btnLogout.disabled = true;

    await PushPlatform.logout();
    log('Logged out');

    currentUserId = null;
    UI.userIdInput.value = '';
    updateStatus(UI.authStatus, 'Anonymous', 'info');

  } catch (error: any) {
    showError('Failed to logout', error);
  } finally {
    UI.btnLogout.disabled = false;
  }
}

UI.btnInit.addEventListener('click', initialize);
UI.btnPermission.addEventListener('click', requestPermission);
UI.btnSubscribe.addEventListener('click', subscribe);
UI.btnUnsubscribe.addEventListener('click', unsubscribe);
UI.btnLogin.addEventListener('click', login);
UI.btnLogout.addEventListener('click', logout);

log('Test app loaded. Click "Initialize" to start.');
