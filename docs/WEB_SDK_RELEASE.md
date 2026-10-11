# Подготовка релиза Web SDK PushPilot

Ветка: `feat/web-sdk-release`. Исходная точка: `960c2ed`.

## Прогресс

- Прочитаны README, исходники SDK, пример, тесты, CI и последние коммиты.
  Файлов AGENTS.md в репозитории и родительских каталогах нет. Рабочее дерево
  перед началом было чистым; существующая реализация используется как основа.
- Базовые проверки: 55 unit-тестов и typecheck проходят.
- Обнаружены: отсутствие classic-script сборки, пример на исходниках,
  скрытые ошибки service worker, нет проверки архива и release workflow.
- API сверяется только чтением соседнего `pushpilot-server`; его файлы,
  console, мобильные SDK и база не изменяются.
- Реальная доставка через внешние push-сервисы не выполняется.

## Состояние

Реализация, документация и финальные локальные проверки готовы.
Следующий шаг: commit, push ветки и создание PR.

## Реализация

- ESM/CJS + classic IIFE (`window.PushPilot`), алиас класса `PushPilot` с сохранением
  `PushPlatform` и имени npm-пакета. Экспорты типов для ESM и CJS проверяются отдельно.
- Пример использует собранные JS. Два входа: script tag и npm import; service worker
  берётся из того же пакета, разрешение запрашивается только кнопкой. Есть отписка,
  повтор после ошибки и локальное уведомление.
- SDK сообщает ошибки worker вместо ложной успешной инициализации. Добавлены scope,
  таймаут активации, проверка поддержки Notification, сохранение API error/status,
  проверка обязательных ID в ответах, обработка неуспешной browser unsubscribe.
- Worker сохраняет ID, рассылает события получения/нажатия, нормализует URL и
  ограничивает переход origin сайта. Новый `skipWaiting` не добавлен.
- Сборка worker больше не перезаписывает `index.d.ts` основного SDK. Дефект
  обнаружен именно установкой tarball в чистый проект.
- MIT license, allowlist упаковки, `prepack`, русские README/API/пример, расширенный
  CI и ручной release workflow. Инструменты используют Node 22.14+; runtime deps нет.

## Недостающий контракт для публичного сайта

По чтению `pushpilot-server` (`cmd/api/main.go`, `internal/auth/scopes.go`,
`internal/handler/device_handler.go`, `internal/handler/admin_device_handler.go`):
маршруты регистрации/подписки/отписки существуют, но browser-safe authentication
и production CORS не подтверждены. Серверные файлы не менялись.

Нужен отдельный публичный Web SDK контракт (либо шлюз владельца сайта):

1. Browser credential, ограниченная application/environment и разрешёнными origin,
   без `messages:*`, `admin:*` и без доступа к чужим установкам проекта. Текущий
   `devices:write` — проектный серверный ключ, публиковать его нельзя.
2. Установочный credential, возвращаемый при регистрации устройства и проверяемый
   на token/login/logout/delete, чтобы публичный клиент не мог изменять чужие ID.
   Ответ регистрации: `{id, installation_credential, created_at}`; дальнейшие
   запросы авторизуются credential этой установки. Текущий SDK ожидает единый
   Bearer и такой обмен пока не реализован: новый контракт потребует адаптера SDK.
3. Публичное получение `vapidPublicKey` для конкретных application/environment
   или документированный способ выдачи владельцу сайта. Private key не выдаётся.
4. Настраиваемый allowlist production origin и OPTIONS для Authorization,
   Content-Type, POST/PATCH/DELETE. Текущий CORS в `main.go` перечисляет localhost.
5. Для шлюза: сохранить JSON/маршруты из `docs/API.md`, проверять владение
   installation ID и разрешённое приложение; идемпотентно возвращать один
   `subscription_id` для повторной регистрации endpoint; повторная DELETE должна
   давать успешный ответ. Секрет `devices:write` остаётся на сервере шлюза.

Для закрытого тестового стенда существующий Device Registry достаточен. Пример
не содержит шлюз и не выдаёт тестовую фикстуру за публичный ключ PushPilot.

## Публикация и доступы от владельца

Публикация не выполнялась. Registry вернул 404 для `@pushplatform/web-sdk` при
проверке: имя/право первого выпуска всё равно должен подтвердить владелец scope.
Видимость репозитория и настройки аккаунтов не изменяются.

- Нужны права publish в npm scope `@pushplatform`, 2FA и решение о первой версии.
  Для самого первого выпуска владелец должен создать/выпустить пакет с 2FA, затем
  настроить Trusted Publisher; workflow подготовлен для уже настроенной доверенной
  связи и не создаёт её автоматически.
- Настроить npm Trusted Publisher: GitHub owner `pushplatform`, repository
  `pushpilot-sdk-web`, workflow `release.yml`, environment `npm-production` и
  разрешение `npm publish`. Для OIDC нужны Node 22.14+, npm 11.5.1+; workflow
  использует Node 24. [Официальная инструкция](https://docs.npmjs.com/trusted-publishers/).
- Нужны права администратора GitHub для environment `npm-production`, reviewers
  и переменной `ENABLE_NPM_PUBLISH=true` (пока не создаётся). По умолчанию
  workflow только проверяет и сохраняет архив. Запуск publish также требует
  `publish=true`, ветку `main`, совпадение `expected_version` с package.json.
- Provenance автоматически появляется при OIDC для публичных репозитория/пакета;
  для приватного repo недоступен. Репозиторий не переводим в public и не обещаем
  provenance до успешной публикации. GitHub API подтвердил, что repo уже public;
  его видимость не менялась.
- Для отдельной проверки доставки позже нужны HTTPS origin тестового сайта,
  Application UUID, environment, безопасный gateway credential и соответствующий
  public VAPID key; private VAPID key остаётся у владельца backend.

Процедура после merge: повысить версию при необходимости, зафиксировать её с
lockfile, запустить `release.yml` с `publish=false`, изучить artifact/pack-report,
затем включить доступы выше и отдельно запустить публикацию. Publish job использует
тот же проверенный tarball (`--ignore-scripts`), а не пересобирает пакет.


## Проверки и границы результата

- Базовый набор: 55 unit-тестов. После изменений: 70 unit-тестов, typecheck проходят.
- Настоящий tarball: allowlist из 24 файлов, ESM/CJS, оба TypeScript NodeNext
  потребителя и bundler сборка сайта из установленного `.tgz` проходят. В архиве
  нет test config, workflow, node_modules, backend-файлов или ключей.
- Chromium: 9 сценариев проходят. Проверены script tag и npm entry, отсутствие
  автозапроса разрешения, пользовательский жест, denied/default, reload/отписка,
  API 401/500/503 и повторы, worker 404, реальная активация worker и локальное
  `showNotification`/`getNotifications`.
- Для подписки `PushManager` и API подменены локальными fixtures; HTTP ограничен
  локальным origin. Push и click события синтетические в настоящем worker;
  `focus` в click-сценарии подменён, так как системное нажатие не автоматизируется.
  Нормализация URL, ID и focus/openWindow дополнительно проверены unit-тестами.
- Используется полный Chromium (`channel: chromium`): headless shell не выдаёт
  notification permission в этом окружении. Это отличие тестовой среды, не
  основание менять SDK или объявлять доставку проверенной.
- Реальный browser PushManager subscribe у провайдера, внешняя push-доставка,
  ручное нажатие системного уведомления, Safari/iOS/Firefox не проверялись.
- Runtime-зависимостей нет. После обновления инструментов устранены high/critical
  findings. Генератор bundled declarations добавляет 4 moderate dev-only findings
  (`sprintf-js` → `argparse` → API Extractor); совместимого исправления npm не
  предлагает, `audit fix --force` откатывал бы API Extractor на несовместимую версию.
  Они не входят как зависимости в опубликованный пакет.

- Финальная проверка: `npm ci` по обновлённому lockfile проходит; оба workflow
  проходят YAML parsing; обычный `npm pack` запускает `prepack` и содержит те же
  24 разрешённых файла. `npm audit --omit=dev` — 0 findings.
