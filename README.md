# PushPilot Web SDK

PushPilot подключает Web Push к вашему сайту: запрашивает разрешение пользователя,
регистрирует подписку в PushPilot, позволяет отписаться и обрабатывать нажатия
на уведомления. Работает через npm или обычный `<script>`.

## Установка

```sh
npm install @pushplatform/web-sdk@next
```

```js
import { PushPilot } from '@pushplatform/web-sdk';
```

Пакет включает ESM, CommonJS, TypeScript declarations и сборку для script tag.
Runtime-зависимостей нет.

## Настройка сайта

Для подключения нужны:

- HTTPS URL API PushPilot, без `/v1` в конце.
- UUID Web-приложения, окружение `production` или `development` и публичный
  browser key вида `wbpub_…` для этого приложения и окружения.
- Разрешённый origin сайта в настройке browser API, например `https://shop.example`.
- VAPID public key того же приложения и окружения: base64url, публичный P-256 ключ.
  Private VAPID key и проектный API key остаются на сервере.

Параметры browser API задаёт администратор вашего сервера PushPilot.
[Серверная настройка](https://github.com/pushplatform/pushpilot-server/blob/main/docs/WEB_BROWSER_AUTH.md).

Разместите worker на своём сайте. Для проекта с публичной директорией `public`:

```sh
mkdir -p public
cp node_modules/@pushplatform/web-sdk/dist/service-worker.js public/pushpilot-sw.js
```

После публикации сайта файл должен открываться по `/pushpilot-sw.js` с JavaScript
MIME type, без HTML fallback. Обновляйте копию worker при обновлении SDK.

## Минимальный пример

Добавьте кнопки на страницу и подключите файл приложения через ваш bundler:

```html
<button id="subscribe" disabled>Разрешить уведомления</button>
<button id="unsubscribe" disabled>Отписаться</button>
<p id="push-status" role="status"></p>
```

В файле приложения замените URL, UUID и публичные ключи своими значениями:

```js
import { PushPilot } from '@pushplatform/web-sdk';

const subscribe = document.getElementById('subscribe');
const unsubscribe = document.getElementById('unsubscribe');
const output = document.getElementById('push-status');
const showError = error => {
  output.textContent = `${error.code || 'error'}: ${error.message}`;
};

subscribe.onclick = async () => {
  subscribe.disabled = true;
  try {
    // Запрос разрешения вызывается только по нажатию пользователя.
    const permission = await PushPilot.requestPermission();
    if (permission !== 'granted') {
      output.textContent = permission === 'denied'
        ? 'Уведомления запрещены. Разрешите их в настройках сайта в браузере.'
        : 'Запрос закрыт. Нажмите кнопку, чтобы повторить.';
      return;
    }
    await PushPilot.subscribe();
    output.textContent = 'Подписка зарегистрирована в PushPilot';
  } catch (error) { showError(error); }
  finally { subscribe.disabled = false; }
};

unsubscribe.onclick = async () => {
  unsubscribe.disabled = true;
  try {
    await PushPilot.unsubscribe();
    output.textContent = 'Подписка удалена';
  } catch (error) { showError(error); }
  finally { unsubscribe.disabled = false; }
};

async function start() {
  if (!PushPilot.isSupported()) {
    output.textContent = 'Web Push недоступен в этом браузере или на этом origin.';
    return;
  }
  try {
    await PushPilot.initialize({
      apiBaseURL: 'https://api.example.com',
      applicationId: 'YOUR_APPLICATION_UUID',
      apiKey: 'wbpub_your_site',
      browserAuth: true,
      environment: 'production',
      vapidPublicKey: 'YOUR_PUBLIC_VAPID_KEY',
      serviceWorkerPath: '/pushpilot-sw.js',
      serviceWorkerScope: '/',
    });
    PushPilot.onNotificationClicked(notification => {
      output.textContent = `Открыто уведомление: ${notification.title || notification.id}`;
    });
    subscribe.disabled = false;
    unsubscribe.disabled = false;
    output.textContent = 'PushPilot подключён';
  } catch (error) { showError(error); }
}

start();
```

`initialize()` не запрашивает разрешение. При `denied` повторный вызов кнопкой
не изменит настройку браузера; пользователь должен разрешить уведомления вручную.
Ошибки API доступны через `error.code` и `error.context?.status`. Неуспешную
операцию можно повторить явно. При ошибке API во время отписки SDK сохраняет
браузерную подписку для повтора.

## Подключение обычным script tag

Скопируйте `dist/sdk.global.js` из установленного пакета в публичную директорию
сайта, например `/assets/pushpilot/sdk.global.js`. Worker разместите как описано выше.

```html
<script src="/assets/pushpilot/sdk.global.js"></script>
<script src="/main.js"></script>
```

В `main.js` используйте код примера, заменив строку `import` на:

```js
const { PushPilot } = window.PushPilot;
```

Подключайте скрипты после HTML кнопок. Bundler и `type="module"` для этого способа
не нужны.

## Service worker и переход по нажатию

Worker должен находиться на origin сайта. Файл `/pushpilot-sw.js` позволяет scope
`/`; для `/shop/sw.js` стандартный scope — `/shop/`. Текущая страница должна
находиться в этом scope. Более широкий scope требует заголовка
[`Service-Worker-Allowed`](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)
в ответе worker.

Если на сайте уже есть classic worker, скопируйте `dist/service-worker.js` по
адресу `/assets/pushpilot/service-worker.js` и добавьте в существующий worker:

```js
importScripts('/assets/pushpilot/service-worker.js');
```

Укажите путь существующего worker в `serviceWorkerPath`. Не регистрируйте второй
worker с тем же scope.

Для перехода по нажатию передайте URL в данных уведомления:

```json
{"title":"Заказ готов","body":"Откройте заказ","data":{"url":"/orders/123"}}
```

Worker открывает URL своего origin или фокусирует уже открытую страницу с этим
URL. Относительный адрес разрешается относительно scope; внешний или некорректный
URL заменяется адресом scope. `custom_data.url` также поддерживается.

`onNotificationClicked()` сообщает событие уже открытой и инициализированной
странице. При запуске сайта из закрытого состояния обрабатывайте адрес страницы
и его параметры: callback после открытия новой страницы не гарантируется.

## Поддержка браузеров и ограничения

- Для установки пакета через npm используйте Node.js 22.14+. Сам SDK выполняется
  в браузере.
- Нужны Service Worker, Push API и Notifications API. Проверяйте
  `PushPilot.isSupported()` до инициализации: наличие функций зависит от браузера,
  платформы и настроек пользователя.
  [Таблица совместимости Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API#browser_compatibility).
- В production нужны HTTPS для сайта и API. Для локальной разработки допустимы
  `http://localhost` и `http://127.0.0.1`.
- На iOS/iPadOS 16.4+ Web Push доступен веб-приложениям, добавленным на домашний
  экран. [Условия WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- Нужен доступный `localStorage`. Один экземпляр SDK использует одно приложение
  и окружение на странице; не переключайте их после инициализации.
- Browser credential действует 7 суток. `renewInstallationCredential()` заменяет
  действующую credential. Для восстановления просроченной или утраченной credential
  и для `login(userId, identityProof)` нужен доверенный сервер вашего сайта.
  [Конфигурация и методы](https://github.com/pushplatform/pushpilot-sdk-web/blob/main/docs/API.md).
- SDK регистрирует classic worker. Существующий module worker требует адаптации
  регистрации на стороне сайта. Обновление worker может ждать закрытия вкладок;
  согласуйте его `push` и `notificationclick` обработчики с PushPilot.
- Успешный `subscribe()` подтверждает регистрацию подписки в API. Доставка и показ
  уведомления зависят от сервера, push-сервиса, ОС и браузера; этот ответ их не подтверждает.

## Совместимость

Также доступны именованный экспорт `PushPlatform` и default export. Для нового
кода используйте `PushPilot`.

При `browserAuth: false` (значение по умолчанию) SDK использует legacy Device
Registry `/v1/installations`. Для публичного сайта этот режим требует вашего
серверного шлюза: он хранит проектный ключ, проверяет владение установкой и
выдаёт браузеру собственную credential. В конфигурации SDK укажите URL шлюза
и его credential. Проектный ключ `devices:write` нельзя размещать в HTML, JS,
public env или CDN. [HTTP-контракт совместимости](https://github.com/pushplatform/pushpilot-sdk-web/blob/main/docs/API.md#совместимость-с-legacy-api).

## Документация

- [Конфигурация и API](https://github.com/pushplatform/pushpilot-sdk-web/blob/main/docs/API.md).
- [Пример сайта: npm и script tag](https://github.com/pushplatform/pushpilot-sdk-web/tree/main/example).
- [Настройка браузерного API PushPilot](https://github.com/pushplatform/pushpilot-server/blob/main/docs/WEB_BROWSER_AUTH.md).

Лицензия: [MIT](https://github.com/pushplatform/pushpilot-sdk-web/blob/main/LICENSE).
