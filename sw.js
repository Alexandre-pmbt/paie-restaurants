/* Service worker minimal : permet l'installation comme application, sans mettre les pages en cache
   (le logiciel reste toujours à jour ; les données viennent directement de Supabase). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
