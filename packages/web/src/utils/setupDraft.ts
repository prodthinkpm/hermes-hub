import type { SetupRunPayload } from '@hermes-hub/core'

const STORAGE_PREFIX = 'hermes-hub:setup-draft:'

function storageKey(draftId: string): string {
  return `${STORAGE_PREFIX}${draftId}`
}

export function createSetupDraftId(profileId: string): string {
  return `${profileId}:${Date.now()}`
}

export function saveSetupDraft(draftId: string, payload: SetupRunPayload): void {
  sessionStorage.setItem(storageKey(draftId), JSON.stringify(payload))
}

export function loadSetupDraft(draftId: string): SetupRunPayload | null {
  const raw = sessionStorage.getItem(storageKey(draftId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as SetupRunPayload
  } catch {
    return null
  }
}

export function deleteSetupDraft(draftId: string): void {
  sessionStorage.removeItem(storageKey(draftId))
}
