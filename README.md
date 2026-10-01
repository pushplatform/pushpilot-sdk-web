# @pushplatform/web-sdk

Web SDK for PushPlatform - Web Push notifications integration.

## Features

- ✅ TypeScript SDK with full type safety
- ✅ Web Push API integration
- ✅ Service Worker support
- ✅ Persistent Installation ID
- ✅ User login/logout
- ✅ Permission management
- ✅ Subscription lifecycle management

## Installation

```bash
npm install @pushplatform/web-sdk
```

For a local, unpublished package check, run `npm test`, `npm run typecheck`,
`npm run build`, then `npm run pack:check`. The dry-run archive must contain
`dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, and both service-worker
entrypoints; no registry publish is required.

## Quick Start

### 1. Initialize SDK

```typescript
import { PushPlatform } from '@pushplatform/web-sdk';

await PushPlatform.initialize({
  apiKey: 'your-api-key',
  applicationId: 'your-app-uuid',
  apiBaseURL: 'https://api.pushplatform.com',
  environment: 'production',
  debugMode: false,
});
```

### 2. Request Permission & Subscribe

```typescript
// Request permission (must be in response to user gesture)
const permission = await PushPlatform.requestPermission();

if (permission === 'granted') {
  // Subscribe to push notifications
  const subscription = await PushPlatform.subscribe();
  console.log('Subscribed:', subscription.endpoint);
}
```

### 3. Login User

```typescript
await PushPlatform.login('user-123');
```

### 4. Listen for Notifications

```typescript
PushPlatform.onNotificationReceived((notification) => {
  console.log('Received:', notification);
});

PushPlatform.onNotificationClicked((notification) => {
  console.log('Clicked:', notification);
});
```

## Requirements

- Modern browser with Service Worker support
- HTTPS (or localhost for development)
- Web Push API support

## Browser Compatibility

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 50+ | ✅ Full |
| Edge | 17+ | ✅ Full |
| Firefox | 44+ | ✅ Full |
| Safari | 16+ | ⚠️ Limited (iOS 16.4+) |
| Opera | 37+ | ✅ Full |

## Limitations

- ❌ No VoIP equivalent (Web limitation)
- ❌ No guaranteed background execution
- ❌ No arbitrary background work
- ⚠️ Push Service controls delivery timing
- ⚠️ Requires HTTPS (except localhost)
- ⚠️ Requires user gesture for permission

## API Reference

See [API Documentation](./docs/API.md) for detailed API reference.

## License

MIT
