<template>
  <q-btn
    v-if="!$route.params.token && !token"
    icon="mdi-account-circle"
    label="login"
    color="red-7"
    no-caps
    class="login-btn"
    @click="onLoginClick"
  />
  <q-btn
    v-else-if="!$route.params.token && token"
    no-caps
    color="green-8"
    icon-right="mdi-logout"
    label="Logout"
    class="login-btn"
    @click="logout"
  />
  <q-circular-progress v-else indeterminate color="positive" class="login-btn" />

  <!-- Token entry (used on desktop/Tauri where the OAuth popup can't return). -->
  <q-dialog v-model="tokenDialog" :persistent="applying">
    <q-card style="width: 380px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-subtitle1 text-bold">Log in with a token</div>
        <q-space />
        <q-btn icon="mdi-close" flat round dense :disable="applying" v-close-popup />
      </q-card-section>
      <q-card-section>
        <div class="text-caption text-grey-7 q-mb-sm">
          Paste a flespi token. Create one in the flespi panel → Tokens.
        </div>
        <q-input
          v-model="tokenInput"
          label="flespi token"
          dense
          outlined
          autofocus
          :disable="applying"
          @keyup.enter="applyToken"
        />
        <div v-if="applying" class="row items-center text-caption text-primary q-mt-sm">
          <q-spinner size="16px" class="q-mr-xs" /> Applying token and connecting…
        </div>
        <q-btn
          flat
          dense
          no-caps
          size="sm"
          color="primary"
          icon-right="mdi-open-in-new"
          label="Open flespi panel"
          class="q-mt-xs"
          @click="openPanel"
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cancel" :disable="applying" v-close-popup />
        <q-btn
          unelevated
          color="primary"
          label="Apply"
          :loading="applying"
          :disable="!tokenInput.trim()"
          @click="applyToken"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue'
import { mapActions, mapState } from 'pinia'
import { useAuthStore } from '../../stores/auth'
import { useMiscStore } from '../../stores/misc'
import { isTauri, openExternal } from '../../platform'

export default defineComponent({
  name: 'LoginButton',
  data() {
    return { tokenDialog: false, tokenInput: '', applying: false }
  },
  computed: {
    ...mapState(useAuthStore, {
      host: function (store) {
        /* store.$region is set in boot/flespi-io.js; fall back to flespi.io. */
        return (store.$region && store.$region.rest) || 'https://flespi.io'
      },
      token: (store) => store.token,
    }),
  },
  methods: {
    ...mapActions(useAuthStore, ['initConnection', 'clearToken', 'setToken']),
    ...mapActions(useMiscStore, ['getFromStore']),
    logout() {
      this.clearToken()
    },
    onLoginClick() {
      // Desktop (Tauri) can't receive the OAuth popup's postMessage → use a
      // token paste dialog. Web/PWA keeps the normal login popup.
      if (isTauri) {
        this.tokenDialog = true
      } else {
        this.openLoginRegisterWindow(`${this.host}/login/#/providers`)
      }
    },
    openPanel() {
      openExternal(`${this.host}/`)
    },
    async applyToken() {
      const t = (this.tokenInput || '').trim()
      if (!t || this.applying) return
      this.applying = true
      try {
        await this.setToken(t)
        this.tokenDialog = false
        this.tokenInput = ''
        this.$nextTick(() => this.$router.push('/'))
      } catch (e) {
        this.$q.notify({ type: 'negative', message: 'Could not apply the token.' })
        if (process.env.DEV) console.log('[login] applyToken', e)
      } finally {
        this.applying = false
      }
    },
    openLoginRegisterWindow(url, title) {
      title = title || 'auth'
      const w = 500,
        h = 600
      const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : screen.left
      const dualScreenTop = window.screenTop !== undefined ? window.screenTop : screen.top

      const width = window.innerWidth
        ? window.innerWidth
        : document.documentElement.clientWidth
          ? document.documentElement.clientWidth
          : screen.width
      const height = window.innerHeight
        ? window.innerHeight
        : document.documentElement.clientHeight
          ? document.documentElement.clientHeight
          : screen.height

      const left = width / 2 - w / 2 + dualScreenLeft
      const top = height / 2 - h / 2 + dualScreenTop
      const newWindow = window.open(
        url,
        title,
        'toolbar=no,location=no,status=yes,resizable=yes,scrollbars=yes, width=' +
          w +
          ', height=' +
          h +
          ', top=' +
          top +
          ', left=' +
          left,
      )

      // Puts focus on the newWindow
      if (window.focus) {
        newWindow.focus()
      }
    },
  },
  watch: {
    $route(route) {
      if (route.params && route.params.token) {
        console.log('[watch route]: token')
        this.setToken(this.$route.params.token).then(() => {
          this.$nextTick(() => {
            this.$router.push('/')
          })
        })
      }
    },
  },
  created() {
    // first try to login with the token that is passed in URL, if any
    if (this.$route.params && this.$route.params.token) {
      console.log('[login]: route params token')
      const nextPath = this.$route.params.devices ? '/devices/' + this.$route.params.devices : '/'
      this.setToken(this.$route.params.token).then(() => {
        this.$nextTick(() => {
          this.$router.push(nextPath)
        })
      })
      return true
    }
    // second try to login with the token stored in session storage, if any
    const sessionStorageToken = this.getFromStore({ store: this.$q.sessionStorage, name: 'token' })
    if (sessionStorageToken) {
      console.log('[login]: session storage token')
      this.setToken(sessionStorageToken).then(() => {
        this.$nextTick(() => {
          this.$router.push('/')
        })
      })
      return true
    }
    // finally create message listener for receiving a token from login/register window
    const tokenHandler = (event) => {
      /*
      event.data format:
      FlespiLogin|token:{"token":"1111111111111111111111111111111111","region":{"cdn":"https://cdn.flespi.io","default":true,"gw":"gw.flespi.io","gw-ftp":"{channel-address}:21","gw-ip":"185.213.2.30","media":"https://media.flespi.io","mqtt":"mqtt.flespi.io:8883","mqtt-ws":"mqtt.flespi.io:443","name":"eu","registration-allowed":true,"rest":"https://flespi.io"}}
      */
      if (typeof event.data === 'string' && ~event.data.indexOf('FlespiLogin|token:')) {
        console.log(event)
        let payload = event.data
        payload = payload.replace('FlespiLogin|token:', '')
        payload = JSON.parse(payload)

        console.log('[login]: token from login/register window')
        this.setToken(payload.token).then(() => {
          this.$nextTick(() => {
            this.$router.push('/')
          })
        })
        // window.removeEventListener('message', tokenHandler)
      }
    }
    window.addEventListener('message', tokenHandler)
  },
})
</script>

<style lang="sass">
.login-btn
  width: 100%
  height: 100%
  border-radius: 0 !important
  text-transform: uppercase
</style>
