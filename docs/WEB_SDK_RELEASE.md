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

[Безопасная браузерная авторизация Web SDK](WEB_BROWSER_AUTH_TASK.md) на момент
исходного release PR оставалась открытой: credential отдельной установки, проверка владения, доверенный login,
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

## 2026-10-12: безопасный browser API

Владелец подтвердил merge Web PR и зелёный CI; локальный main обновлён до
`788a554`. Новая работа изолирована в ветках `feat/web-browser-auth` двух
репозиториев. Backend основан на `origin/main eac126e`, в отдельном worktree;
чужие owner/console изменения и рабочая база сохранены.

- Реализован [backend-контракт](WEB_BROWSER_AUTH_TASK.md): публичный browser key,
  отдельная installation credential, scope application/environment/origin,
  проверка владения, запрет переноса чужого endpoint, shared rate limits,
  verified login, renewal/revoke и server-only recovery. Секрет проекта браузеру
  не передаётся; сервер сайта проверяет сессию и владение перед proof/recovery.
- SDK `browserAuth: true` использует `/v1/web`, хранит credential по API/app/env/key,
  не переходит к публичному ключу после 401. Добавлены identity proof для login,
  `getBackendInstallationId`, `renewInstallationCredential` и recovery candidate
  `installationCredential`, который подтверждается API до сохранения.
- Typecheck и 63 unit tests четырёх затронутых файлов — PASS. Pack check — PASS:
  25 разрешённых файлов, ESM/CJS/NodeNext, чистая установка tarball вне checkout
  и сборка сайта. Состав/exports/dependencies и ручной release workflow сохранены;
  merge сам не запускает публикацию. Test-only HTTP harness не входит в архив.
- Пять Chromium сценариев — PASS: browserAuth и legacy reload/unsubscribe через
  npm/script tag, локальный настоящий worker с синтетическими push/click событиями.
  PushManager/API здесь используют fixtures. Отдельный Node harness проверил
  собранный SDK через настоящий новый HTTP backend: register, tokens, verified
  login/logout, renewal и unsubscribe на одноразовом PostgreSQL testcontainer.
- Backend финальный HTTP suite с race detector — 11/11 subtests PASS, включая
  параллельную регистрацию, foreign scope/ID/endpoint, JWT proof replay/expiry,
  revoked/expired credential, shared quotas и отказ счётчиков. Затронутые service/
  config tests с race detector и go vet — PASS. Подробные команды и границы:
  [backend evidence](https://github.com/pushplatform/pushpilot-server/blob/feat/web-browser-auth/docs/WEB_BROWSER_AUTH.md).

Production rollout миграции и server config пока не выполнен. Рабочая БД,
console и внешняя push-доставка не проверялись/не менялись. GitHub Checks не
опрашиваются, их результат сообщит владелец. Merge и публикация не выполняются.

## 2026-10-12: публикация в npm с dist-tag next

Владелец подтвердил merge Server/Web SDK и зелёный CI, явно разрешил публичную
публикацию в `@pushplatform` с тегом `next`. Локальный SDK main обновлён до
`726e52dd1eb7328cb6ed35caec68cb8c55260b61`. Server main включает
`origin/main c9d5db0` через локальный merge `3d8f136`; существующий локальный
коммит и незакоммиченная owner-console работа сохранены. Server main не пушился.

Использован готовый проверенный tarball, без новой сборки и повторения тестов:

- Опубликована версия: `@pushplatform/web-sdk@0.1.0`, dist-tag `next`, public access.
- Архив: `.artifacts/pushplatform-web-sdk-0.1.0.tgz`, 25 файлов, 90355 bytes.
- SHA-256: `65ef23a3f4165a1d466dc159288ea102f60fb1fcf0da888bb8263b809a42023f`.
- Все файлы архива побайтно совпадают с checkout смердженного SDK до добавления
  этой записи. Дерево `main` совпадает с ранее проверенным SDK commit `cf53d14`.
- Страница: [@pushplatform/web-sdk 0.1.0](https://www.npmjs.com/package/@pushplatform/web-sdk/v/0.1.0).
- Команда установки: `npm install @pushplatform/web-sdk@next`.
- Фиксация версии: `npm install @pushplatform/web-sdk@0.1.0`.

**Статус: публикация завершена, установка из npm проверена.** Первоначальный
`npm publish` остановился с `EOTP`; владелец выполнил 2FA и подтвердил успешную
публикацию. Registry независимо подтвердил `next = 0.1.0` (также `latest = 0.1.0`;
теги после публикации не менялись в этой проверке), shasum
`2a4ab79c402aadf9fe5f7217171c92a672715659` и integrity готового tarball.

В 08:32 UTC выполнена **ровно одна** чистая установка из публичного registry,
вне checkout и с новым пустым npm cache:

```sh
npm install @pushplatform/web-sdk@next --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --cache=/private/tmp/pushpilot-web-npm-next-install.PWIoVj/npm-cache --fetch-retries=0
```

Результат: установлен один пакет версии `0.1.0`; package-lock указывает на
`https://registry.npmjs.org/@pushplatform/web-sdk/-/web-sdk-0.1.0.tgz`, integrity
совпадает с ранее проверенной сборкой. ESM import и CommonJS require проходят,
алиас `PushPilot` доступен. Script-tag/worker exports разрешаются в существующие
файлы, declarations ESM/CJS присутствуют; runtime dependencies нет. Эта проверка
не запускала браузер или повторную компиляцию TypeScript.

Чистый consumer сохранён в `/private/tmp/pushpilot-web-npm-next-install.PWIoVj`,
локальный JSON-отчёт — `.artifacts/npm-next-install-report.json` (не входит в
публикуемый пакет). Lifecycle scripts выключены. Сборки, unit/browser/backend
тесты и GitHub Checks не повторялись. Deploy и реальные push не выполнялись.

## 2026-10-12: пользовательская документация, patch 0.1.1

README переписан как инструкция подключения PushPilot: npm/script tag, browser
API configuration, service worker/VAPID, кнопки subscribe/unsubscribe и callback
клика. История классов сведена к текущим экспортам в разделе совместимости;
внутренние статусы и release-процедуры остаются в этом документе. Legacy API
описан отдельно. Обновлены description, API-документация и changelog.

Для изменения README на npm требуется новая версия:
[правило npm](https://docs.npmjs.com/about-package-readme-files/#updating-an-existing-package-readmemd-file).
Подготовлена `0.1.1`, версия и корневой lockfile согласованы. Registry подтвердил,
что версия ещё не занята. `.artifacts/pushplatform-web-sdk-0.1.1.tgz` упаковывается
с `--ignore-scripts` из неизменённого проверенного dist версии 0.1.0. Сборки,
установка и уже пройденные тесты не повторяются; публикация 0.1.1 не выполняется.

Команда владельцу после ревью/merge документации:

```sh
npm publish /Users/pavelvladimiroff/Documents/dev/MonoRepo/pushpilot-sdk-web/.artifacts/pushplatform-web-sdk-0.1.1.tgz --ignore-scripts --access public --tag next --registry=https://registry.npmjs.org
```

При запросе 2FA добавить `--otp=YOUR_2FA_CODE`. Уже опубликованная 0.1.0
не меняется. В RN отдельная ветка содержит только публичные тексты и patch
metadata 1.0.1; JS/native/plugin payload переиспользуется из опубликованной 1.0.0.
