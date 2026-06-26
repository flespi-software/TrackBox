<template>
  <div>
    <div class="text-subtitle2 q-mb-xs">Routing provider API keys</div>
    <div class="text-caption text-grey-6 q-mb-md">
      Keys for the “Build by roads” providers that require one. Stored locally in
      this browser.
    </div>

    <q-input
      v-for="p in keyedProviders"
      :key="p.value"
      :model-value="settings.keyFor(p.value)"
      :label="p.label.replace(/\\s*\\(.*\\)$/, '') + ' API key'"
      type="password"
      dense
      outlined
      clearable
      class="q-mb-sm"
      @update:model-value="(v) => settings.setKey(p.value, v || '')"
    >
      <template #append>
        <q-btn
          v-if="p.keyUrl"
          flat
          dense
          no-caps
          size="sm"
          color="primary"
          label="get key"
          icon-right="mdi-open-in-new"
          @click.stop="open(p.keyUrl)"
        />
      </template>
    </q-input>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { ROUTERS } from '../sim/routers'
import { useSettingsStore } from '../stores/settings'
import { openExternal } from '../platform'

export default defineComponent({
  name: 'RouterKeysSettings',
  setup() {
    const settings = useSettingsStore()
    settings.load()
    return { settings }
  },
  computed: {
    keyedProviders() {
      return ROUTERS.filter((r) => r.needsKey)
    },
  },
  methods: {
    open(url) {
      openExternal(url)
    },
  },
})
</script>
