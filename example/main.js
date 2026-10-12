const { PushPlatform, SDKError } = window.PushPilot;
const byId = (id) => document.getElementById(id);
let initialized = false;
let busy = false;
let subscribed = false;
let pendingSubscription = false;

function render() {
  const permission =
    "Notification" in window ? Notification.permission : "default";
  byId("btn-init").disabled =
    busy || initialized || !PushPlatform.isSupported();
  byId("btn-permission").disabled =
    busy || !initialized || permission !== "default";
  byId("btn-subscribe").disabled =
    busy || !initialized || permission !== "granted" || subscribed;
  byId("btn-unsubscribe").disabled =
    busy || !initialized || (!subscribed && !pendingSubscription);
  byId("btn-preview").disabled =
    busy || !initialized || permission !== "granted";
  byId("permission-status").textContent =
    permission === "granted"
      ? "Разрешение получено"
      : permission === "denied"
        ? "Уведомления запрещены. Измените разрешение в настройках сайта."
        : "Разрешение не запрошено";
  byId("subscription-status").textContent = subscribed
    ? "Подписка зарегистрирована в PushPilot"
    : pendingSubscription
      ? "Подписка браузера есть, регистрация в API не завершена. Повторите подписку или отпишитесь."
      : "Подписки нет";
}

function showError(error) {
  const code = error instanceof SDKError ? error.code : "unknown_error";
  const status = error.context?.status;
  byId("error").textContent =
    `${code}${status ? ` (HTTP ${status})` : ""}: ${error.message || String(error)}`;
}

async function run(action) {
  busy = true;
  byId("error").textContent = "";
  render();
  try {
    await action();
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    render();
  }
}

function logEvent(type, notification) {
  byId("events").textContent =
    `${type}: ${JSON.stringify(notification, null, 2)}`;
}

byId("config").addEventListener("submit", (event) => {
  event.preventDefault();
  void run(async () => {
    const config = Object.fromEntries(new FormData(event.currentTarget));
    await PushPlatform.initialize({
      ...config,
      serviceWorkerPath: "./service-worker.js",
      serviceWorkerScope: "./",
    });
    initialized = true;
    byId("init-status").textContent = "SDK подключён";
    byId("init-status").className = "success";
    byId("installation-id").textContent =
      await PushPlatform.getInstallationId();
    pendingSubscription = !!(await PushPlatform.getSubscription());
    // After reload, the user can explicitly register the existing subscription or unsubscribe.
    PushPlatform.onNotificationReceived((notification) =>
      logEvent("Получено", notification),
    );
    PushPlatform.onNotificationClicked((notification) =>
      logEvent("Нажатие", notification),
    );
  });
});

byId("btn-permission").addEventListener("click", () => {
  // Called synchronously within the gesture, before any API request or other await.
  void run(async () => {
    await PushPlatform.requestPermission();
  });
});
byId("btn-subscribe").addEventListener("click", () => {
  void run(async () => {
    try {
      await PushPlatform.subscribe();
      subscribed = true;
      pendingSubscription = false;
    } catch (error) {
      pendingSubscription = !!(await PushPlatform.getSubscription());
      throw error;
    }
  });
});
byId("btn-unsubscribe").addEventListener("click", () => {
  void run(async () => {
    await PushPlatform.unsubscribe();
    subscribed = pendingSubscription = false;
  });
});
byId("btn-preview").addEventListener("click", () => {
  void run(async () => {
    const registration = await navigator.serviceWorker.getRegistration(
      location.href,
    );
    await registration.showNotification("Локальная проверка PushPilot", {
      body: "Нажмите, чтобы вернуться к примеру.",
      data: { id: "local-preview", url: location.pathname },
      tag: "pushpilot-local-preview",
    });
  });
});

if (!PushPlatform.isSupported()) {
  byId("init-status").textContent = window.isSecureContext
    ? "Браузер не поддерживает Web Push. На iOS откройте сайт как приложение с домашнего экрана."
    : "Для Web Push нужен HTTPS. В разработке используйте localhost.";
}
render();
