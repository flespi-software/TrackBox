<template>
  <q-dialog v-model="show">
    <q-card class="changelog-card">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="mdi-history" class="q-mr-sm" color="primary" />
        <div class="text-subtitle1 text-bold">What’s new</div>
        <q-space />
        <q-btn icon="mdi-close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="changelog-body scroll">
        <div v-for="v in versions" :key="v.title" class="q-mb-md">
          <div class="text-subtitle2 text-primary">{{ v.title }}</div>
          <div v-for="(s, i) in v.sections" :key="i" class="q-mt-xs">
            <div v-if="s.title" class="text-caption text-weight-medium text-grey-7">
              {{ s.title }}
            </div>
            <ul class="changelog-list">
              <li v-for="(it, j) in s.items" :key="j">{{ it }}</li>
            </ul>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue'
import changelog from '../../CHANGELOG.md?raw'

// Minimal parse of our own (trusted) changelog: '## x' → version, '### x' →
// section, '- x' → item. Inline **bold**/`code` markers are stripped for display.
function parseChangelog(md) {
  const versions = []
  let cur = null
  let sec = null
  for (const line of md.split('\n')) {
    let m
    if ((m = line.match(/^##\s+(.+)/))) {
      cur = { title: m[1].replace(/[[\]]/g, ''), sections: [] }
      versions.push(cur)
      sec = null
    } else if ((m = line.match(/^###\s+(.+)/)) && cur) {
      sec = { title: m[1], items: [] }
      cur.sections.push(sec)
    } else if ((m = line.match(/^[-*]\s+(.+)/)) && cur) {
      if (!sec) {
        sec = { title: '', items: [] }
        cur.sections.push(sec)
      }
      sec.items.push(m[1].replace(/\*\*|`/g, ''))
    }
  }
  return versions
}

const VERSIONS = parseChangelog(changelog)

export default defineComponent({
  name: 'ChangelogDialog',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  data() {
    return { versions: VERSIONS }
  },
  computed: {
    show: {
      get() {
        return this.modelValue
      },
      set(v) {
        this.$emit('update:modelValue', v)
      },
    },
  },
})
</script>

<style scoped>
.changelog-card {
  width: 460px;
  max-width: 95vw;
}
.changelog-body {
  max-height: 60vh;
}
.changelog-list {
  margin: 2px 0 0;
  padding-left: 18px;
}
.changelog-list li {
  margin: 2px 0;
  line-height: 1.4;
}
</style>
