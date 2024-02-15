<template>
  <div class="py-[6px] bg-[#f8fafc] flex justify-between items-center">
    <div className="text-right mx-[8px]">
      <span className="text-gray-600 bg-slate-300 p-[4px] rounded-lg text-[12px]">
        {{ size }} 词
      </span>
    </div>
  </div>
</template>
<script setup lang="ts">
type BottomBarType = {
  size?: number
}
withDefaults(defineProps<BottomBarType>(), {})
</script>
