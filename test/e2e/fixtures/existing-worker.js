// Host lexical bindings must coexist with the packed SDK imported below.
const t = "host-t";
const sw = "host-sw";
importScripts("/vendor/service-worker.js");
self.hostValues = () => ({ t, sw });
