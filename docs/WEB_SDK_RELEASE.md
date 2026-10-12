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
- После ревью PR #1 исправлены конфликт общей области видимости classic worker
  и повторная регистрация при неудачной локальной отписке. Regression tests
  воспроизвели дефекты до исправления. Backend-контракт сохранён отдельной
  открытой задачей. GitHub Checks не опрашиваются, результат CI сообщает владелец.

## Состояние

Исходная реализация, документация и локальные проверки готовы. Изменения закоммичены
(`c418d0b`), ветка `feat/web-sdk-release` отправлена в origin без force.
[PR #1](https://github.com/pushplatform/pushpilot-sdk-web/pull/1) создан в `main`.
Пакет не публиковался; merge PR и release workflow не запускались.

## Исправления после ревью PR #1 (2026-10-11)

- `service-worker.js` теперь IIFE с прежним именем файла; CJS worker сохранён.
  Переменные существующего worker не конфликтуют с SDK. Браузерный regression
  импортирует worker именно из установленного tarball, проверяет активацию,
  сохранность `const t`/`const sw` сайта и установленный обработчик push.
- Subscription ID сохраняется до успешной локальной отписки. Если ID впервые
  получен внутри unsubscribe, он также записывается в localStorage до DELETE.
  Повтор и reload используют тот же ID и идемпотентный DELETE без POST tokens.
- Шесть regression cases покрывают `false`/исключение от browser unsubscribe,
  повтор с/без reload, изначально неизвестный ID, последующую ошибку API и
  окончательную успешную очистку. Серверная подписка при повторе не восстанавливается.
- На финальном коде проходят typecheck и 52 unit-теста четырёх затронутых файлов.
  Остальные unit-тесты без причины не повторялись. `pack:check` проверил архив
  из 25 файлов, установку вне checkout, ESM/CJS, TypeScript NodeNext и сборку сайта.
  Новая задача backend включена в allowlist; test-only worker fixture в архив не входит.
- Chromium: девять прежних сценариев прошли; после финальной правки повторены
  четыре затронутых сценария (npm/script, импорт worker и локальное уведомление),
  все проходят. Новый тест явно ждёт `activated`: `ready` может вернуть `activating`.
- Повторное ревью изменённого кода: блокирующих замечаний нет. Проверены сохранение
  ID при ошибках/перезагрузке и очистка после успеха, изоляция worker, exports и
  allowlist упаковки. Серверных секретов в добавленных файлах/архиве не обнаружено.
  Release workflow не менялся: merge запускает CI, публикация требует отдельного
  workflow_dispatch и включённых условий publish.
- Заключение относится к коду и локальным проверкам. GitHub Checks не опрашиваются,
  результат нового CI ожидается от владельца. GitHub в браузере не используется.
  Внешняя push-доставка, merge и публикация не выполнялись. Исправления предназначены
  для того же PR #1 в ветке `feat/web-sdk-release`.

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

## Отдельная задача backend

[Безопасная браузерная авторизация Web SDK](WEB_BROWSER_AUTH_TASK.md) остаётся
открытой: credential отдельной установки, проверка владения, доверенный login,
production CORS и адаптация обмена credential в SDK. Альтернатива — шлюз сайта
с серверным проектным ключом. Маршруты Device Registry уже существуют; секрет
`devices:write` нельзя публиковать в браузере. Backend и база в этом PR не меняются.

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
  потребителя и bundler сборка сайта из установленного `.tgz` проходят.
  Чистый потребитель создаётся вне checkout, во временном каталоге, чтобы
  Node/TypeScript не использовали зависимости родительского репозитория. В архиве
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

- GitHub CI для исходной реализации и отчёта прошёл в push и pull_request
  ([run](https://github.com/pushplatform/pushpilot-sdk-web/actions/runs/38155104344)).
  Усиленная проверка потребителя вне checkout также прошла локально с 9
  браузерными сценариями; итоговая версия проверяется CI в этом же PR.
