import { register } from 'register-service-worker'
import { Notify } from 'quasar'

// With skipWaiting + clientsClaim (quasar.config.js) a new service worker takes
// over immediately even when other tabs are open, so updates aren't blocked by
// open tabs. We nudge the user to refresh so the page picks up the new assets.

let reloading = false

register(process.env.SERVICE_WORKER_FILE, {
  updated() {
    Notify.create({
      message: `A new version of ${__APP_PRODUCT__} is available.`,
      caption: 'Refresh to update.',
      color: 'primary',
      icon: 'mdi-update',
      timeout: 0,
      position: 'bottom',
      actions: [
        {
          label: 'Refresh',
          color: 'white',
          handler: () => {
            reloading = true
            window.location.reload()
          },
        },
        { label: 'Later', color: 'white' },
      ],
    })
  },

  offline() {
    Notify.create({
      message: 'Offline — running from cache.',
      color: 'grey-8',
      icon: 'mdi-wifi-off',
      timeout: 2000,
      position: 'bottom',
    })
  },
})

// If the controlling SW changes (e.g. the user refreshed another tab), reload
// once to stay consistent with the freshly activated version.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}
