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
            Your flespi token and map API keys are kept in an encrypted vault.
            <b>Choose a master password</b> to protect it — you'll enter it to
            unlock the vault next time. There's no recovery if you forget it.
          </template>
          <template v-else>
            Enter your <b>master password</b> to unlock the encrypted vault
            (flespi token and map API keys).
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
            :disable="!password"
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
    return { password: '', error: '', busy: false, isNew: false }
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
      this.error = ''
      try {
        this.isNew = !(await secureStore.vaultExists())
      } catch {
        this.isNew = false
      }
    },
    async unlock() {
      if (!this.password || this.busy) return
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
