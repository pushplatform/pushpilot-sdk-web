# 0.3.7 — 2026-11-08

- Примеры initialize показывают UUID и options с applicationId/debugMode без адреса сервера.
- Установочная npm-команда не фиксирует patch-версию. Уточнены обычная регистрация и browserAuth; сохранены настройки VAPID и Service Worker.
- Функциональное поведение SDK не менялось.

# 0.3.5 — 2026-11-03

## 0.3.6

Report the package version in device registration; align install documentation and lockfile.

- Service worker при получении пуша отправляет `received: true`. Клик по-прежнему отправляет только открытие.
- Страница при инициализации и при возврате на вкладку отправляет `PUT /session`.

# 0.3.4 — 2026-11-02

- Worker отправляет `PUT /notifications/{id}` при нажатии на уведомление, в том числе без открытой страницы. Конфигурацию и очередь нажатий он хранит в IndexedDB.
- `notificationId` в событиях получения, показа и нажатия. Поле `notification_id` больше не попадает в `data`.
- `PushPlatform.getSubscriptionId()` возвращает id подписки браузера.

# 0.3.3 — 2026-11-02

- `foregroundBannerFallback` задаёт секунды запасного системного баннера. Ноль и отсутствие ждут решение страницы.

# 0.3.2 — 2026-11-02

- Поле адреса только `url`. Старое имя адреса удалено из API, примера и тестов.

# 0.3.1 — 2026-11-02

- Публичные `onNotificationWillDisplay` и `onPushToken`. Если подписка уже есть, `onPushToken` сразу получает текущий endpoint.
- `apiKey` не отправляется, кроме `browserAuth` с ключом `wbpub_`.

# 0.3.0 — 2026-11-01

- `initialize` takes an application id or `{applicationId, environment}`. No API key. The default address is https://api.pushpilot.ru.
- A foreground notification can be prevented, and the push subscription endpoint is emitted as the device token.

# 0.2.0 — 2026-11-01

- Unified application ID and permanent shared application key for SDK and server; no project/environment setup step.
- Actual device kind, language, time zone, OS/SDK/app version and notification permission metadata. Unknown facts stay unknown.
- Optional legacy environment compatibility; iOS defaults to build-entitlement APNs transport detection.
- Test subscription remains a separate console marker.

# Changelog

## 0.1.1

- Пользовательский README на русском: npm/script tag, настройка worker и VAPID,
  пример подписки и отписки, обработка клика, ограничения и документация.
- Основной бренд PushPilot; legacy API описан в разделе совместимости.
- Обновлено описание npm-пакета. Исполняемые файлы SDK не изменены.

## 0.1.0

- Опциональный browserAuth: публичный `wbpub_` ключ, установка с собственной
  credential, scope хранения, verified login, renewal и trusted server recovery.
- `getBackendInstallationId()` для installation-bound identity proof; legacy API
  и значение `getInstallationId()` сохранены.

- Установка npm: ESM, CommonJS и declarations для обоих форматов; сохранено имя
  `@pushplatform/web-sdk`, добавлен алиас класса `PushPilot`.
- Собранный `sdk.global.js` для обычного script tag без bundler.
- Пример сайта на собранном пакете: явный запрос разрешения, подписка, отписка,
  повтор ошибок API и локальное уведомление с переходом.
- Явный service worker scope, таймаут активации, ошибки регистрации и API;
  ID уведомления сохраняется до нажатия, события получения рассылаются страницам.
- Classic worker собран как IIFE для импорта в существующий worker сайта
  без конфликтов глобальных переменных.
- Повтор отписки после локальной ошибки сохраняет ID и не создаёт заново
  серверную подписку; состояние сохраняется при reload.
- Русская документация с HTTP-контрактом и требованием серверного шлюза для
  публичного сайта при текущей серверной схеме ключей.
- Проверка настоящего tarball, чистого npm-потребителя и браузерных сценариев.
- CI и ручной release workflow с выключенной по умолчанию публикацией.
- Зависимости сборки/тестов обновлены; runtime-зависимостей нет.

## Исходная реализация — 2026-09-21

TypeScript SDK, установка устройства, разрешения, Web Push subscription lifecycle,
service worker и Device Registry API.
