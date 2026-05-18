<template>
  <div class="flex items-center justify-between gap-3 border-b border-snow/10 px-5 py-4">
    <div>
      <h3 class="m-0 text-base font-extrabold tracking-[-.02em] text-snow"><slot name="title" /></h3>
      <p v-if="$slots.subtitle" class="mt-1 text-xs text-slate"><slot name="subtitle" /></p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
