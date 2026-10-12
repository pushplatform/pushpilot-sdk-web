# Отдельная задача: безопасная браузерная авторизация Web SDK

Статус: реализована в отдельных ветках `feat/web-browser-auth` backend и Web SDK
(2026-10-12), подготовлена к ревью. PR #1 SDK уже merged; backend в нём не менялся.
Для прямого подключения требуется rollout нового backend, миграции и server-side
конфигурации origin/application/environment; GitHub CI проверяет владелец.
[Контракт, жизненный цикл и доказательства](https://github.com/pushplatform/pushpilot-server/blob/feat/web-browser-auth/docs/WEB_BROWSER_AUTH.md).

## Что уже есть

По исходникам Device Registry существуют регистрация installation, сохранение
Web Push endpoint и ключей, login/logout и идемпотентная DELETE подписки.
Маршруты и JSON совместимы с [текущим SDK](API.md). Public VAPID key уже можно
передать в конфигурации SDK; private VAPID key остаётся на сервере.
Эта сверка исходников не подтверждает доставку через внешние push-сервисы.

Legacy Bearer со scope `devices:write` ограничен проектом, а не установкой
конкретного посетителя. Проверка связи subscription с installation и проектом
не доказывает владение установкой посетителем. Такой ключ нельзя помещать
в HTML, JS, public env или CDN. Legacy CORS перечисляет локальные origin;
новые `/v1/web` маршруты используют отдельный allowlist приложения.

## Контракт и реализация

1. Регистрация принимает browser credential, ограниченную application/environment,
   без прав `messages:*`, `admin:*` и изменения чужих установок. Требуются защита
   от злоупотребления регистрацией и ограничения частоты запросов.
2. Реализованный ответ регистрации:
   `{id, installation_credential, credential_expires_at, created_at}`. Последующие token/login/logout/delete
   авторизуются credential этой установки. Сервер проверяет владение, application
   и environment, а не только UUID из URL. Credential действует 7 суток;
   renewal заменяет её, revoke отзывает. Повторная регистрация не выдаёт credential чужой
   установки по известному `device_id`: требуется действующая credential или
   доверенная процедура восстановления. SDK с `browserAuth: true` обменивает публичный
   `wbpub_` идентификатор на credential установки и сохраняет её отдельно по API/app/env/key.
   При 401 SDK не возвращается к публичному ключу. Trusted recovery сервера сайта
   передаётся через `installationCredential`; renewal доступен отдельным методом SDK.
3. Login принимает доверенное подтверждение пользователя от сервера сайта.
   Переданный браузером `external_user_id` сам по себе не доказывает личность.
4. Production CORS настраивается для HTTPS origin сайта; OPTIONS разрешает
   Authorization, Content-Type и используемые GET/POST/DELETE. Browser PATCH отключён;
   привязка пользователя выполняется только через verified login. CORS и allowlist
   origin не заменяют аутентификацию и проверку владения.
5. Public VAPID key соответствует application/environment. Его выдаёт публичная
   конфигурация либо владелец сайта для статической конфигурации SDK; private key
   никогда не выдаётся браузеру. Автоматическая выдача public key не обязательна.
6. Повторная регистрация того же endpoint возвращает стабильный `subscription_id`
   для активной подписки. Повторная DELETE уже удалённой подписки даёт успешный
   ответ: SDK сохраняет ID до завершения локальной отписки и может повторить DELETE.

## Альтернатива и критерии готовности

Шлюз сайта может сохранить текущие маршруты/JSON, хранить проектный секрет
на сервере и выдавать браузеру credential, связанную с сессией/установкой.
Он проверяет владение ID, разрешённые application/environment, login и частоту
запросов. Пример SDK не содержит такого шлюза.

Прямую anonymous регистрацию теперь обеспечивает backend-контракт выше.
Для login и восстановления нужен сервер сайта, проверяющий сессию посетителя
и своё сопоставление installation: универсальный прокси project API запрещён.
Production rollout остаётся отдельным шагом: миграция, secrets, origins, scoped
VAPID и HTTPS deployment. Console UI конфигурации в эту работу не входит.

- Посетитель A не может изменять токены, пользователя или подписки посетителя B,
  подставив чужой installation/subscription ID.
- Отозванные и просроченные credential отклоняются; browser credential не даёт
  проектных административных прав и не позволяет отправлять сообщения.
- Подключение публичного HTTPS-сайта работает без серверного секрета в браузере;
  проходят preflight, регистрация, подписка, login/logout и повторы отписки.
- Обмен credential покрыт тестами backend/шлюза и интеграционными тестами SDK.
  Реальная push-доставка проверяется отдельно после явного разрешения владельца.
