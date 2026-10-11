# Web SDK PushPilot

`@pushplatform/web-sdk` — Web Push SDK для сайта: разрешения, регистрация
установки, подписка/отписка, события уведомлений. Сохранены имя npm-пакета
и класс `PushPlatform`; `PushPilot` — его совместимый алиас.

Пакет подготовлен к публикации. Команда установки из registry станет доступна
после выпуска владельцем npm scope. Проверка локального архива уже предусмотрена
без публикации. Реальная доставка через внешние push-сервисы отдельно требует проверки.

## Установка через npm

```sh
npm install @pushplatform/web-sdk
```

Используйте Node.js 22.14+ для инструментов этого репозитория. Сам SDK работает
в браузере и не имеет runtime-зависимостей.

```js
import { PushPilot } from '@pushplatform/web-sdk';
```

ESM, CommonJS и TypeScript declarations включены. npm не размещает service worker
на вашем сайте автоматически: скопируйте `dist/service-worker.js` в публичную
директорию сайта, например `public/pushpilot-sw.js`. Сохраните файл при обновлении
пакета в вашем build-скрипте.

## Обычный script tag

Скопируйте `dist/sdk.global.js` и `dist/service-worker.js` из установленного пакета
на свой сервер. Например, SDK в `/assets/pushpilot/sdk.global.js`, worker в
`/pushpilot-sw.js`. Сборка `sdk.global.js` не требует bundler или `type="module"`.

```html
<button id="enable" disabled>Разрешить уведомления</button>
<button id="disable" disabled>Отписаться</button>
<p id="status" role="status"></p>
<script src="/assets/pushpilot/sdk.global.js"></script>
<script>
  const { PushPilot } = window.PushPilot;
  const status = document.getElementById('status');
  const enable = document.getElementById('enable');
  const disable = document.getElementById('disable');
  const error = e => { status.textContent = `${e.code || 'error'}: ${e.message}`; };

  async function start() {
    if (!PushPilot.isSupported()) {
      status.textContent = 'Web Push недоступен. Нужны HTTPS и поддерживаемый браузер.';
      return;
    }
    try {
      await PushPilot.initialize({
        apiBaseURL: 'https://your-site.example/pushpilot', // ваш серверный шлюз
        apiKey: 'BROWSER_GATEWAY_CREDENTIAL', // НЕ секретный API key PushPilot
        applicationId: 'YOUR_APPLICATION_UUID',
        vapidPublicKey: 'YOUR_PUBLIC_VAPID_KEY',
        environment: 'production',
        serviceWorkerPath: '/pushpilot-sw.js',
        serviceWorkerScope: '/',
      });
      PushPilot.onNotificationClicked(n => { status.textContent = `Нажатие: ${n.title || n.id}`; });
      enable.disabled = false;
      disable.disabled = !(await PushPilot.getSubscription());
    } catch (e) { error(e); }
  }
  enable.onclick = async () => {
    enable.disabled = true;
    try {
      // Вызывается непосредственно обработчиком нажатия.
      const permission = await PushPilot.requestPermission();
      if (permission === 'granted') {
        await PushPilot.subscribe();
        disable.disabled = false;
        status.textContent = 'Подписка зарегистрирована';
      } else {
        status.textContent = permission === 'denied'
          ? 'Уведомления запрещены. Измените настройки сайта в браузере.'
          : 'Запрос закрыт. Можно повторить.';
      }
    } catch (e) { error(e); }
    finally { enable.disabled = false; }
  };
  disable.onclick = async () => {
    disable.disabled = true;
    try { await PushPilot.unsubscribe(); status.textContent = 'Подписка удалена'; }
    catch (e) { error(e); disable.disabled = false; }
  };
  start();
</script>
```

Для npm используйте те же методы после `import { PushPilot } ...`.
Не вызывайте `requestPermission()` при загрузке страницы. Запрос, закрытый
пользователем (`default`), можно повторить кнопкой; при `denied` нужны настройки
браузера. Ошибка API показывается через `SDKError.code`, HTTP-статус — в
`context.status`. Повторите неуспешную операцию явно. После ошибки регистрации
в API браузерная подписка может уже существовать: `getSubscription()` показывает
состояние браузера, а успешный `subscribe()` подтверждает регистрацию в PushPilot.

## HTTPS и service worker

В production нужен HTTPS; для разработки допустим `http://localhost` или
`http://127.0.0.1`. Проверяйте возможности через `isSupported()`, а не только
название или версию браузера. На iOS/iPadOS 16.4+ Web Push доступен веб-приложениям,
добавленным на домашний экран ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).

Worker должен обслуживаться вашим origin с JavaScript MIME type, без HTML fallback
на неизвестные URL. Файл в корне (`/pushpilot-sw.js`) позволяет scope `/`.
Для `/shop/sw.js` стандартный scope — `/shop/`; текущая страница должна находиться
в этом scope. Более широкий scope требует HTTP-заголовка
`Service-Worker-Allowed` на ответе worker
([правила регистрации](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)).
SDK ждёт активацию своей регистрации до 15 секунд и сообщает ошибку.

Если на сайте уже есть worker, не заменяйте его отдельным worker с тем же scope.
Добавьте в существующий classic worker:

```js
importScripts('/assets/pushpilot/service-worker.js');
```

И укажите его путь в `serviceWorkerPath`. Для module worker используйте статический
`import` при сборке своего worker; SDK сам регистрирует classic worker. Если ваш
существующий worker уже зарегистрирован как module, интеграция требует адаптации
регистрации на стороне сайта. Проверьте конфликтующие `push`/`notificationclick`
обработчики. Шаблон не содержит `skipWaiting`: обновление существующего активного
worker может ждать закрытия вкладок. Политику обновлений определяет сайт.

Worker показывает уведомление, рассылает `NOTIFICATION_RECEIVED` открытым страницам,
по нажатию рассылает `NOTIFICATION_CLICKED` и открывает `data.url` (или
`custom_data.url`) вашего origin. Относительный URL разрешается относительно scope;
при некорректном или внешнем URL открывается scope. Для открытого точного URL
используется `focus()`. Callback страницы работает, когда она уже открыта и SDK
инициализирован. Для холодного открытия используйте URL и его параметры;
событие callback после запуска новой страницы не гарантируется.

## Подключение к PushPilot

Нужны Application UUID, окружение (`development`/`production`), API URL и публичный
VAPID key, совпадающий с ключом backend для этого приложения и окружения. Private
VAPID key остаётся на сервере. SDK добавляет `Bearer` в Authorization и использует
маршруты существующего Device Registry, перечисленные в [API.md](docs/API.md).

В текущем backend ключ `devices:write` ограничен проектом, а не одной установкой
посетителя. Это серверный секрет: **не кладите его в HTML, JS, public env или CDN**.
Для публичного сайта настройте собственный шлюз с теми же маршрутами и JSON:
он хранит секрет, проверяет сессию/владение установкой, application и environment,
ограничивает частоту запросов. `apiBaseURL` указывает на шлюз, `apiKey` — его
специальную browser credential. SDK отправляет `Bearer`, не cookies; схема выдачи
и проверки этой credential относится к вашему шлюзу. SDK не реализует шлюз.

При прямой интеграции в закрытом тестовом окружении нужен API key со scope
`devices:write`, совпадающими project и environment. Cross-origin API должен
разрешать origin сайта, OPTIONS, POST/PATCH/DELETE и заголовки Authorization,
Content-Type. При HTTPS-сайте API тоже должен быть HTTPS. Недостающий публичный
контракт и ограничение текущего CORS записаны в [отчёте релиза](docs/WEB_SDK_RELEASE.md).

## Пример и проверки

```sh
npm ci
npm run dev:example
# http://127.0.0.1:3000/example/index.html — script tag
# http://127.0.0.1:3000/example/npm.html — npm import
```

Заполните форму конфигурации, подключитесь, затем нажмите кнопку разрешения,
подписки или отписки. «Показать локальное уведомление» проверяет отображение и
переход без внешней доставки. [Инструкция примера](example/README.md).

```sh
npx playwright install chromium
npm run release:check
```

Команда проверяет типы, unit-тесты, содержимое настоящего `npm pack`, установку
`.tgz` в чистый проект, ESM/CJS/TypeScript и страницы собранного примера в Chromium.
PushManager и API в этих сценариях — локальные fixtures. Фактическая подписка
у внешнего push-провайдера, доставка и ручное нажатие системного уведомления
в проверку не входят. [Подготовка публикации и доступы](docs/WEB_SDK_RELEASE.md).

Лицензия: [MIT](LICENSE).
