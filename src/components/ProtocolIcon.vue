<template>
  <q-icon v-if="isMdi" :name="icon" :size="size" />
  <!-- SVG comes from trusted in-repo protocol descriptors, not user input -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span v-else class="protocol-svg" :style="{ fontSize: size }" v-html="icon" />
</template>

<script>
export default {
  name: 'ProtocolIcon',
  props: {
    icon: { type: String, default: 'mdi-send' },
    size: { type: String, default: '24px' },
  },
  computed: {
    isMdi() {
      return /^(mdi-|img:|svguse:|fa-|las |lab |lar )/.test(this.icon)
    },
  },
}
</script>

<style scoped>
.protocol-svg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.protocol-svg :deep(svg) {
  width: 1em;
  height: 1em;
  fill: currentColor;
}
</style>
