<script setup>
import { ref } from 'vue'
import { useDialogFocus } from './useDialogFocus.js'
import './account-panels.css'
defineProps({ message: String })
const emit = defineEmits(['resolve'])
const dialog = ref(null)
useDialogFocus(dialog, () => emit('resolve', false))
</script>
<template>
  <div class="account-overlay save-confirm-layer">
    <section ref="dialog" class="account-dialog save-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="save-confirm-title">
      <header><div><h2 id="save-confirm-title">确认进度操作</h2><p>{{ message }}</p></div></header>
      <footer><button @click="emit('resolve', false)">保留当前进度</button><button class="control-danger" @click="emit('resolve', true)">确认继续</button></footer>
    </section>
  </div>
</template>
<style scoped>
.save-confirm-layer { z-index: 110; }
.save-confirm-dialog { max-width: 480px; }
footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
</style>
