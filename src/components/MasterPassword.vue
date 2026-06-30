<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="onModel">
    <q-card style="width: 380px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="mdi-shield-key" color="primary" size="sm" class="q-mr-sm" />
        <div class="text-subtitle1 text-bold">Secret vault</div>
      </q-card-section>
      <q-card-section>
        <div class="text-caption text-grey-7 q-mb-sm">
          <template v-if="isNew">
            Your flespi token and map API keys are saved on this device in an
            <b>encrypted vault</b> so you don't re-enter them every time.
            <b>Choose a master password</b> to protect them — you'll need to enter it
            <b>each time you open the app</b> to unlock the vault.
            There's no recovery if you forget it. Prefer not to save secrets? Just
            <b>Skip</b>.
          </template>
          <template v-else>
            Enter your <b>master password</b> to unlock the encrypted vault with your
            saved flespi token and map API keys. You'll be asked for it on every launch.
          </template>
        </div>
        <q-input
          v-model="password"
          type="password"
          :label="isNew ? 'New master password' : 'Master password'"
          dense
          outlined
          autofocus
          :error="!!error"
          :error-message="error"
          @keyup.enter="unlock"
        />
        <q-input
          v-if="isNew"
          v-model="confirm"
          type="password"
          label="Confirm password"
          dense
          outlined
          class="q-mt-sm"
          :error="mismatch"
          error-message="Passwords don't match"
          @keyup.enter="unlock"
        />
      </q-card-section>
      <q-card-actions align="between">
        <q-btn
          flat
          dense
          no-caps
          size="sm"
          color="negative"
          label="Forgot password?"
          :disable="busy"
          @click="resetVault"
        />
        <div>
          <q-btn flat label="Skip" :disable="busy" @click="skip" />
          <q-btn
            unelevated
            color="primary"
            :label="isNew ? 'Set password' : 'Unlock'"
            :loading="busy"
            :disable="!password || (isNew && password !== confirm)"
            @click="unlock"
          />
        </div>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue'
import { secureStore } from '../secureStore'

export default defineComponent({
  name: 'MasterPassword',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'unlocked'],
  data() {
    return { password: '', confirm: '', error: '', busy: false, isNew: false }
  },
  computed: {
    mismatch() {
      return this.isNew && this.confirm.length > 0 && this.password !== this.confirm
    },
  },
  watch: {
    // On open, detect whether this is first-time setup or unlocking an existing
    // vault, so the copy/buttons say the right thing.
    modelValue: {
      immediate: true,
      handler(v) {
        if (v) this.detectNew()
      },
    },
  },
  methods: {
    async detectNew() {
      this.password = ''
      this.confirm = ''
      this.error = ''
      try {
        this.isNew = !(await secureStore.vaultExists())
      } catch {
        this.isNew = false
      }
    },
    async unlock() {
      if (!this.password || this.busy) return
      if (this.isNew && this.password !== this.confirm) {
        this.error = "Passwords don't match"
        return
      }
      this.busy = true
      this.error = ''
      try {
        // A wrong password can make the vault decryption hang on the native side,
        // so race it against a timeout to keep the UI responsive.
        await Promise.race([
          secureStore.unlock(this.password),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000)),
        ])
        this.password = ''
        this.confirm = ''
        this.$emit('unlocked')
        this.$emit('update:modelValue', false)
      } catch (e) {
        this.error =
          e && e.message === 'timeout'
            ? 'Unlocking timed out. Try again; if it persists, restart the app.'
            : 'Wrong password or vault could not be opened'
      } finally {
        this.busy = false
      }
    },
    resetVault() {
      this.$q
        .dialog({
          title: 'Reset vault',
          message:
            "There's no password recovery for an encrypted vault. Resetting deletes it — " +
            'the saved token and API keys are lost and you set a new password. Continue?',
          cancel: true,
          persistent: true,
          ok: { label: 'Reset', color: 'negative' },
        })
        .onOk(async () => {
          this.busy = true
          this.error = ''
          try {
            await secureStore.reset()
            this.password = ''
            this.error = 'Vault reset. Set a new master password (restart the app if it hangs).'
          } catch {
            this.error = 'Could not reset the vault — delete vault.hold manually and restart.'
          } finally {
            this.busy = false
          }
        })
    },
    skip() {
      this.$emit('update:modelValue', false)
    },
    onModel(v) {
      if (!v) this.$emit('update:modelValue', false)
    },
  },
})
</script>
