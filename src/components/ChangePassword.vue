<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="onModel">
    <q-card style="width: 380px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="mdi-shield-key-outline" color="primary" size="sm" class="q-mr-sm" />
        <div class="text-subtitle1 text-bold">Change master password</div>
      </q-card-section>
      <q-card-section>
        <div class="text-caption text-grey-7 q-mb-sm">
          Re-encrypts the vault with a new password. There's no recovery if you forget it.
        </div>
        <q-input
          v-model="pwd"
          type="password"
          label="New master password"
          dense
          outlined
          autofocus
          class="q-mb-sm"
          :error="!!error"
          :error-message="error"
        />
        <q-input
          v-model="confirm"
          type="password"
          label="Confirm new password"
          dense
          outlined
          @keyup.enter="apply"
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cancel" :disable="busy" @click="close" />
        <q-btn
          unelevated
          color="primary"
          label="Change"
          :loading="busy"
          :disable="!pwd || !confirm"
          @click="apply"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue'
import { secureStore } from '../secureStore'

export default defineComponent({
  name: 'ChangePassword',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  data() {
    return { pwd: '', confirm: '', error: '', busy: false }
  },
  watch: {
    modelValue(v) {
      if (v) {
        this.pwd = ''
        this.confirm = ''
        this.error = ''
      }
    },
  },
  methods: {
    async apply() {
      if (this.busy) return
      if (!this.pwd) {
        this.error = 'Empty password'
        return
      }
      if (this.pwd !== this.confirm) {
        this.error = 'Passwords do not match'
        return
      }
      this.busy = true
      this.error = ''
      try {
        // A stuck native call shouldn't freeze the UI — race against a timeout.
        await Promise.race([
          secureStore.changePassword(this.pwd),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000)),
        ])
        this.$q.notify({ type: 'positive', message: 'Master password changed' })
        this.close()
      } catch (e) {
        const m = e && e.message
        if (m === 'timeout') {
          this.error = 'Timed out. Try again; if it persists, restart the app.'
        } else if (m === 'rekey-failed-unsafe') {
          this.error = 'Re-encryption was interrupted — restart the app (use "Forgot password?" if it stays locked).'
        } else {
          // rekey-failed-safe and anything else: the live vault is untouched.
          this.error = 'Could not change the password — the vault is unchanged.'
        }
      } finally {
        this.busy = false
      }
    },
    close() {
      this.$emit('update:modelValue', false)
    },
    onModel(v) {
      if (!v) this.close()
    },
  },
})
</script>
