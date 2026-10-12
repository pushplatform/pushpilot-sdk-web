# Конфигурация и API Web SDK

Все методы доступны у `PushPilot`. SDK — singleton:
одно приложение/окружение на страницу. Не переключайте конфигурацию после
инициализации; для другого приложения используйте отдельный origin или профиль
браузера. Сохранённая installation/subscription идентичность относится к этому
приложению. `localStorage` должен быть доступен.

## Конфигурация

| Поле | Назначение |
| --- | --- |
| `apiBaseURL` | Абсолютный HTTP(S) URL API/шлюза без query, fragment, userinfo. Без `/v1`; завершающий `/` удаляется SDK. |
| `apiKey` | Публичный `wbpub_` browser key приложения при `browserAuth: true`. Проектный секрет браузеру не передаётся. |
| `browserAuth` | Используйте `true` для `/v1/web/{apiKey}/installations` и credential своей установки. Для значения по умолчанию `false` см. раздел совместимости. |
| `installationCredential` | Credential своей установки, выданная доверенным сервером сайта для recovery. Не проектный секрет; сервер проверяет её при регистрации. |
| `applicationId` | UUID Web-приложения PushPilot. |
| `vapidPublicKey` | Base64url, 65-байтный публичный P-256 ключ без padding. Обязателен для новой подписки. |
| `environment` | `development` или `production`, по умолчанию `production`. |
| `serviceWorkerPath` | Путь к classic worker вашего origin; по умолчанию `/service-worker.js`. |
| `serviceWorkerScope` | Необязательный scope; по умолчанию браузер использует директорию worker. |
| `debugMode` | Диагностические логи, по умолчанию `false`. |

## Методы

| Метод | Результат |
| --- | --- |
| `isSupported()` | `boolean`, доступен до инициализации; проверяет secure context и браузерные API. |
| `initialize(config)` | `Promise<void>`, worker и Device Registry должны успешно зарегистрироваться; разрешение не запрашивается. При ошибке можно повторить. |
| `getInstallationId()` | `Promise<string>`, стабильный локальный UUID устройства. Backend ID установки используется SDK для запросов и может отличаться. |
| `getBackendInstallationId()` | `Promise<string>`, ID установки в backend для получения server identity proof. |
| `renewInstallationCredential()` | `Promise<void>`, только browserAuth: заменяет действующую credential и сохраняет новую. Остальные вкладки должны обновить страницу. |
| `requestPermission()` | `Promise<'granted' \| 'denied' \| 'default'>`, вызов из пользовательского жеста. |
| `getPermissionStatus()` | Текущее разрешение браузера. |
| `subscribe()` | `Promise<{endpoint, keys: {p256dh, auth}}>`, повторно использует подписку браузера и регистрирует её в API. |
| `unsubscribe()` | `Promise<void>`, сначала удаление из API, затем в браузере; при API-ошибке локальная подписка сохраняется для повтора. |
| `getSubscription()` | Подписка браузера или `null`; не подтверждает успешную регистрацию в API. |
| `login(userId, identityProof?)` / `logout()` | Привязка / отвязка external user ID, `Promise<void>`. В browserAuth login требует одноразовый proof сервера сайта. |
| `onNotificationReceived(callback)` / `onNotificationClicked(callback)` | Возвращают функцию удаления callback; страница должна быть открыта и инициализирована. |

При ручном удалении browser site data исчезают локальная идентичность и известный
subscription ID. При следующей подписке API должен идемпотентно вернуть ID того же
endpoint. Отписка после reload использует сохранённый ID или повторную регистрацию
существующей подписки. Не стирайте `localStorage` без необходимости.
После успешного удаления из API и ошибки браузера SDK сохраняет subscription ID
для повтора, включая reload. Повторная отписка отправляет DELETE с тем же ID
без повторного POST tokens. API/шлюз должен успешно обрабатывать повторную DELETE
уже удалённой подписки. ID очищается только после успешной локальной отписки.

## Совместимость с legacy API

Таблица ниже относится к legacy API/шлюзу. В `browserAuth: true` SDK использует
`/v1/web/{publicBrowserKey}/installations`, сначала Bearer public key, затем только
Bearer credential installation. PATCH для user association не доступен: требуется
verified login/logout. 401/403 сохраняются как `api_error`; credential не стирается
и public key не используется для захвата существующей установки. 429 сохраняет
HTTP status; API возвращает `Retry-After: 60`, автоматических повторов нет.
[Серверный контракт](https://github.com/pushplatform/pushpilot-server/blob/main/docs/WEB_BROWSER_AUTH.md).

Каждый запрос содержит `Authorization: Bearer <apiKey>`. JSON-запросы также
содержат `Content-Type: application/json`. Fetch имеет таймаут получения ответа
15 секунд; сетевые ошибки — `network_error`. HTTP-ошибки сохраняют статус в
`SDKError.context.status`. Ошибки инициализации не подменяют `api_error` сетевой
ошибкой. SDK не выполняет автоматических повторов.

| Запрос | JSON / ответ |
| --- | --- |
| `POST /v1/installations` | `{installation_id: localUUID, device_id: localUUID, application_id, platform: 'web', environment}` → `{id, created_at, user_id?}` (`installation_id` также принимается в ответе для совместимости). |
| `POST /v1/installations/{backendId}/tokens` | `{provider: 'web_push', token: endpoint, endpoint, keys: {p256dh, auth}, environment}` → `{subscription_id}`. |
| `DELETE /v1/installations/{backendId}/subscriptions/{subscriptionId}` | Пустое тело; успешный 2xx, обычно 204. |
| `POST /v1/installations/{backendId}/login` | `{external_user_id}` → успешный 2xx, тело не требуется. |
| `POST /v1/installations/{backendId}/logout` | Пустое тело → успешный 2xx. |

Сохранена совместимость старого endpoint-only token запроса без `endpoint`/`keys`,
если `PushSubscription.toJSON()` не содержит оба ключа. Такой запрос не доказывает
готовность к Web Push-доставке: для шифрования нужны оба ключа.

## Уведомления

Worker принимает JSON `{id?, title?, body?, data?, custom_data?, icon?, badge?,
image?, tag?, actions?, requireInteraction?}`. `data` имеет приоритет над
`custom_data`. Поле `data.url`/`custom_data.url` определяет переход. При отсутствии
ID генерируется UUID, сохраняемый до нажатия. Пустой push или не-JSON payload
также приводит к видимому уведомлению; не-JSON текст используется как body.

Ошибки: `insecure_context`, `service_worker_not_supported`,
`push_api_not_supported`, `service_worker_registration_failed`, `invalid_config`,
`permission_denied`, `permission_request_failed`, `subscription_failed`,
`unsubscribe_failed`, `api_error`, `validation_error`, `network_error`.
`denied` и `default` от запроса разрешения возвращаются как статусы.
