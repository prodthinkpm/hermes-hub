<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { HermesApiClient } from '@hermes-hub/core'
import { useHubStore } from '@/stores/hub'
import SectionTitle from '@/components/ui/SectionTitle.vue'
import UiButton from '@/components/ui/UiButton.vue'

const api = new HermesApiClient()
const hubStore = useHubStore()

const paths = ref<string[]>([])
const newPath = ref('')
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')
const tokenCopied = ref(false)

onMounted(async () => {
  const result = await api.getConfig()
  if (result.ok && result.data) {
    paths.value = [...result.data.paths]
  }
  void hubStore.fetchRegistrationToken()
})

function copyToken() {
  if (!hubStore.registrationToken) return
  void navigator.clipboard.writeText(hubStore.registrationToken)
  tokenCopied.value = true
  setTimeout(() => { tokenCopied.value = false }, 2000)
}

function addPath() {
  const val = newPath.value.trim()
  if (!val || paths.value.includes(val)) return
  paths.value.push(val)
  newPath.value = ''
}

function removePath(index: number) {
  paths.value.splice(index, 1)
}

async function save() {
  saving.value = true
  saved.value = false
  saveError.value = ''
  const result = await api.updateConfig(paths.value)
  if (result.ok) {
    saved.value = true
    setTimeout(() => {
      saved.value = false
    }, 2000)
  } else {
    saveError.value = result.error ?? 'Save failed'
  }
  saving.value = false
}
</script>

<template>
  <div class="p-7 max-[760px]:p-[18px]">
    <SectionTitle>
      <template #title>Settings</template>
      <template #subtitle>统一维护 Hermes Hub 的扫描路径。仅扫描这里配置的路径。</template>
    </SectionTitle>

    <div class="mb-5 app-panel p-5">
      <label class="mb-2 block text-[13px] font-extrabold text-snow">扫描路径</label>
      <p class="mb-3 text-xs text-slate">添加 Hermes 根目录路径，Hub 会扫描每个路径下的 profiles 子目录和根默认 Agent。</p>

      <div class="mb-3 grid gap-2">
        <div v-for="(p, i) in paths" :key="i" class="flex items-center gap-2 rounded-md border border-snow/10 bg-snow/[.035] px-3 h-11">
          <span class="text-sm text-snow flex-1">{{ p }}</span>
          <button
            class="size-7 inline-flex items-center justify-center rounded border border-snow/10 bg-snow/[.055] text-slate hover:text-danger transition"
            @click="removePath(i)"
            title="移除"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div v-if="paths.length === 0" class="rounded-md border border-snow/10 bg-snow/[.025] px-3 h-11 flex items-center text-xs text-slate">
          暂无扫描路径，请先添加至少一个路径。
        </div>
      </div>

      <div class="mb-3 flex gap-2">
        <input v-model="newPath" class="h-11 flex-1" placeholder="~/.hermes" @keyup.enter="addPath" />
        <UiButton @click="addPath">添加</UiButton>
      </div>

      <div class="flex items-center gap-3">
        <UiButton variant="primary" :disabled="saving" @click="save">
          {{ saving ? '保存中...' : '保存配置' }}
        </UiButton>
        <span v-if="saved" class="text-[13px] text-signal font-bold">已保存</span>
      </div>
      <p v-if="saveError" class="mt-2 text-sm text-danger">{{ saveError }}</p>
    </div>

    <!-- Registration Token -->
    <div class="mb-5 app-panel p-5">
      <label class="mb-2 block text-[13px] font-extrabold text-snow">Registration Token</label>
      <p class="mb-3 text-xs text-slate">Hub Agents must include this token when registering with the server.</p>
      <div class="flex items-center gap-2">
        <input
          :value="hubStore.registrationToken || '(no token configured)'"
          readonly
          class="h-11 flex-1 rounded-md border border-snow/10 bg-snow/[.035] px-3 text-sm text-parchment font-mono outline-none"
        />
        <UiButton :disabled="!hubStore.registrationToken" @click="copyToken">
          {{ tokenCopied ? 'Copied' : 'Copy' }}
        </UiButton>
      </div>
    </div>
  </div>
</template>
