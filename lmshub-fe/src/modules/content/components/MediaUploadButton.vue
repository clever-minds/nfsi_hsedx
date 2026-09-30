<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiUpload, errorMessage } from '@/lib/api';

/**
 * Pick a file from the computer and upload it straight into the Media Library.
 *
 * Used by the Media Library page and inline in the Curriculum Builder, so an
 * instructor attaching a video to a lesson never has to leave the lesson.
 */
const props = withDefaults(defineProps<{ accept?: string; label?: string }>(), {
  accept: 'video/mp4,video/webm,video/ogg,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,image/jpeg,image/png,image/webp,application/pdf',
  label: '',
});

const emit = defineEmits<{ uploaded: [asset: { id: string; nama_file: string; tipe_file: string }] }>();

const { t } = useI18n();
const input = ref<HTMLInputElement | null>(null);
const progress = ref<number | null>(null);
const fileName = ref('');
const error = ref('');

async function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!file) return;
  error.value = '';
  // Refuse here rather than send a large file only for the server to reject it.
  if (!props.accept.split(',').includes(file.type)) {
    error.value = t('errors.media.unsupported_type');
    return;
  }
  fileName.value = file.name;
  progress.value = 0;
  try {
    const asset = await apiUpload<{ id: string; nama_file: string; tipe_file: string }>('/media/upload', file, (p) => {
      progress.value = p;
    });
    emit('uploaded', asset);
  } catch (err) {
    error.value = errorMessage(err, t('content.media.uploadFailed'));
  } finally {
    progress.value = null;
  }
}
</script>

<template>
  <div class="inline-flex flex-col gap-1">
    <input ref="input" type="file" class="hidden" :accept="props.accept" @change="onPick" />
    <button type="button" class="btn-primary" :disabled="progress !== null" @click="input?.click()">
      {{ progress !== null ? t('content.media.uploading', { n: progress }) : props.label || t('content.media.upload') }}
    </button>
    <div v-if="progress !== null" class="w-56">
      <p class="truncate text-xs text-slate-500" :title="fileName">{{ fileName }}</p>
      <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div class="h-full rounded-full bg-brand-500 transition-all" :style="{ width: `${progress}%` }"></div>
      </div>
    </div>
    <p v-if="error" class="max-w-xs text-xs text-red-600">{{ error }}</p>
  </div>
</template>
