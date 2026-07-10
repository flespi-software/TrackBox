<template>
  <div>
    <div class="text-caption text-grey-6 q-mb-sm">
      Basemaps offered in the map’s layer switcher. Stored locally in this browser.
    </div>

    <div v-for="b in basemaps" :key="b.value" class="q-mb-xs">
      <q-checkbox
        :model-value="isEnabled(b.value)"
        :label="b.label"
        dense
        @update:model-value="(on) => settings.setBasemapEnabled(b.value, on)"
      />
    </div>

    <q-separator class="q-my-md" />

    <div class="text-caption text-grey-6 q-mb-sm">
      Custom tile layer — adds a “Custom” option when set.
    </div>
    <q-input
      v-model="url"
      label="Tile URL"
      hint="Template with {z}/{x}/{y} — e.g. https://tile.example.com/{z}/{x}/{y}.png"
      :rules="[validate]"
      reactive-rules
      lazy-rules
      dense
      outlined
      clearable
      @blur="apply"
      @keyup.enter="apply"
      @clear="apply"
    />
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { BASEMAPS } from '../sim/mapTiles'

// Empty = feature off; otherwise require an http(s) XYZ template.
function isValidTemplate(url) {
  if (!url) return true
  if (!/^https?:\/\//i.test(url)) return false
  return ['{z}', '{x}', '{y}'].every((t) => url.includes(t))
}

export default defineComponent({
  name: 'MapSettings',
  setup() {
    const settings = useSettingsStore()
    settings.load()
    return { settings, basemaps: BASEMAPS }
  },
  data() {
    return { url: this.settings.customTileUrl }
  },
  methods: {
    isEnabled(value) {
      return this.settings.enabledBasemaps.includes(value)
    },
    validate(v) {
      return isValidTemplate(v) || 'Use an http(s) URL containing {z}/{x}/{y}'
    },
    apply() {
      if (!isValidTemplate(this.url)) return // keep the error visible, don't save
      this.settings.setCustomTileUrl(this.url)
      this.url = this.settings.customTileUrl // reflect trimming / reset
    },
  },
})
</script>
