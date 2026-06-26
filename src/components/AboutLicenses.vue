<template>
  <q-dialog :model-value="modelValue" @update:model-value="close">
    <q-card style="width: 640px; max-width: 96vw; height: 80vh" class="column">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="mdi-scale-balance" color="primary" size="sm" class="q-mr-sm" />
        <div class="text-subtitle1 text-bold">Open-source licenses</div>
        <q-space />
        <q-btn icon="mdi-close" flat round dense @click="close" />
      </q-card-section>

      <q-card-section class="q-pb-none">
        <div class="text-caption text-grey-7">
          {{ product }} v{{ version }} is built with these open-source libraries. The
          desktop runtime is <b>Tauri</b> and its plugins (Apache-2.0 / MIT,
          <a href="https://tauri.app" @click.prevent="openExt('https://tauri.app')">tauri.app</a>);
          bundled Rust crates are permissive (MIT / Apache-2.0). Map data ©
          <a href="https://www.openstreetmap.org/copyright" @click.prevent="openExt('https://www.openstreetmap.org/copyright')">OpenStreetMap</a>
          contributors, tiles by
          <a href="https://carto.com/attributions" @click.prevent="openExt('https://carto.com/attributions')">CARTO</a>.
        </div>
        <q-input
          v-model="filter"
          dense
          outlined
          clearable
          class="q-mt-sm"
          placeholder="Filter packages…"
          prepend-icon="mdi-magnify"
        >
          <template #prepend><q-icon name="mdi-magnify" /></template>
        </q-input>
      </q-card-section>

      <q-card-section class="col scroll q-pt-sm">
        <!-- Our own license -->
        <q-expansion-item
          default-opened
          dense
          switch-toggle-side
          icon="mdi-scale-balance"
          :label="`${product} — MIT License`"
          :caption="`© ${year} ${holder}`"
        >
          <pre class="license-text">{{ mitText }}</pre>
        </q-expansion-item>
        <q-separator spaced />

        <div v-if="loading" class="row items-center justify-center q-pa-lg text-grey-6">
          <q-spinner size="22px" class="q-mr-sm" /> Loading…
        </div>
        <div v-else>
          <div class="text-caption text-grey-6 q-mb-xs">{{ shown.length }} packages</div>
          <q-expansion-item
            v-for="p in shown"
            :key="p.name + p.version"
            dense
            switch-toggle-side
            :label="p.name"
            :caption="`${p.version} · ${p.license}`"
          >
            <div class="q-px-md q-pb-sm">
              <a
                v-if="p.homepage"
                :href="p.homepage"
                class="text-caption"
                @click.prevent="openExt(p.homepage)"
                >{{ p.homepage }}</a
              >
              <pre v-if="p.licenseText" class="license-text">{{ p.licenseText }}</pre>
              <div v-else class="text-caption text-grey-6 q-mt-xs">
                License: {{ p.license }} (full text at the homepage above).
              </div>
            </div>
          </q-expansion-item>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue'
import { openExternal } from '../platform'

export default defineComponent({
  name: 'AboutLicenses',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  data() {
    return {
      product: __APP_PRODUCT__,
      version: __APP_VERSION__,
      holder: 'flespi',
      filter: '',
      packages: [],
      loading: false,
    }
  },
  computed: {
    year() {
      return new Date().getFullYear()
    },
    mitText() {
      return `MIT License

Copyright (c) ${this.year} ${this.holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    },
    shown() {
      const q = (this.filter || '').trim().toLowerCase()
      if (!q) return this.packages
      return this.packages.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.license || '').toLowerCase().includes(q),
      )
    },
  },
  watch: {
    modelValue(v) {
      if (v && !this.packages.length) this.load()
    },
  },
  methods: {
    async load() {
      this.loading = true
      try {
        // Lazy chunk so the (large) license list isn't in the main bundle.
        const mod = await import('../third-party-licenses.json')
        this.packages = mod.default || mod
      } catch {
        this.packages = []
      } finally {
        this.loading = false
      }
    },
    openExt(url) {
      openExternal(url)
    },
    close() {
      this.$emit('update:modelValue', false)
    },
  },
})
</script>

<style scoped>
.license-text {
  white-space: pre-wrap;
  font-size: 11px;
  line-height: 1.35;
  max-height: 240px;
  overflow: auto;
  margin: 6px 0 0;
  opacity: 0.8;
}
</style>
