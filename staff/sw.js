/* OBSIDIAN DESIGN — staff page service worker. Its one job is alerts while the page is closed.
   A push arrives with no content; this asks the API (with the member's own sign-in cookie) for their newest
   notification and shows it. Pressing the alert opens the staff page at the right place. Nothing is cached. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  e.waitUntil((async function () {
    var title = 'أوبسيديان ديزاين', body = 'عندك تنبيه جديد.', link = '#notifications', tag = 'obs';
    try {
      var res = await fetch('/api/staff/notifications/count', { credentials: 'same-origin', cache: 'no-store' });
      var d = await res.json();
      if (d.ok && d.newest) { title = d.newest.title; body = d.newest.body || ''; link = d.newest.link || link; tag = 'obs-' + d.last; }
    } catch (err) {}
    await self.registration.showNotification(title, { body: body, icon: '/assets/img/app-192.png', badge: '/assets/img/app-192.png', tag: tag, renotify: true, dir: 'rtl', lang: 'ar', data: { link: link } });
  })());
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = '/staff/' + ((e.notification.data && e.notification.data.link) || '#notifications');
  e.waitUntil((async function () {
    var all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < all.length; i++) {
      if (new URL(all[i].url).pathname.indexOf('/staff/') === 0) { await all[i].focus(); return all[i].navigate ? all[i].navigate(url) : null; }
    }
    return self.clients.openWindow(url);
  })());
});
