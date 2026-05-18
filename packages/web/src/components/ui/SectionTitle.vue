<template>
  <div class="mb-[18px] flex items-end justify-between gap-4">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-3">
        <slot name="before-title" />
        <h2 class="m-0 text-[28px] font-extrabold tracking-[-.03em] text-snow"><slot name="title" /></h2>
      </div>
      <p v-if="$slots.subtitle" class="mt-2 text-sm text-slate"><slot name="subtitle" /></p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2.5">
      <slot name="actions" />
    </div>
  </div>
</template>
