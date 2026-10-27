<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { sanitizeHtml } from '@/lib/sanitize';

/**
 * Editor text kaya sederhana untuk halaman statis — tanpa dependensi tambahan.
 *
 * `contenteditable` + perintah pemformatan bawaan peramban, ditambah mode
 * "HTML" untuk yang ingin menempel markup sendiri. Isi selalu disaring
 * `sanitizeHtml` sebelum dimasukkan to editor: memasang HTML mentah to
 * elemen yang hidup akan menjalankan `onerror`/`onload` di dalamnya, di
 * peramban admin sendiri. Server menyaring lagi sebelum menyimpan.
 */
const props = defineProps<{ modelValue: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { t } = useI18n();
const editor = ref<HTMLDivElement | null>(null);
const mode = ref<'visual' | 'html'>('visual');
const source = ref('');

const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);

function onContextMenu(e: MouseEvent) {
  if (props.disabled) return;
  e.preventDefault();

  const menuWidth = 360;
  const menuHeight = 55;
  const x = Math.min(e.clientX, window.innerWidth - menuWidth - 12);
  const y = Math.min(e.clientY, window.innerHeight - menuHeight - 12);

  contextMenuX.value = Math.max(12, x);
  contextMenuY.value = Math.max(12, y);
  showContextMenu.value = true;
}

function closeContextMenu() {
  showContextMenu.value = false;
}

function render(html: string) {
  if (editor.value) editor.value.innerHTML = sanitizeHtml(html);
}

onMounted(() => {
  render(props.modelValue);
  document.addEventListener('click', closeContextMenu);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeContextMenu);
});

// grade from luar (mis. membuka halaman lain di form yang sama) — jangan
// menimpa saat perubahan itu berasal from ketikan di editor ini sendiri.
watch(
  () => props.modelValue,
  (v) => {
    if (mode.value === 'visual' && editor.value && v !== editor.value.innerHTML) render(v);
    if (mode.value === 'html' && v !== source.value) source.value = v;
  },
);

function onInput() {
  emit('update:modelValue', editor.value?.innerHTML ?? '');
}

function exec(command: string, value?: string) {
  if (props.disabled) return;
  editor.value?.focus();
  document.execCommand(command, false, value);
  onInput();
}

function block(tag: string) {
  exec('formatBlock', tag);
}

function link() {
  const url = window.prompt(t('pages.editor.linkPrompt'), 'https://');
  if (!url) return;
  // Skema berbahaya ditolak di sini juga, bukan hanya by sanitizer.
  if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url.trim())) return;
  exec('createLink', url.trim());
}

function toggleMode() {
  if (mode.value === 'visual') {
    source.value = editor.value?.innerHTML ?? props.modelValue;
    mode.value = 'html';
  } else {
    const clean = sanitizeHtml(source.value);
    emit('update:modelValue', clean);
    mode.value = 'visual';
    // Elemen editor baru dirender ulang setelah v-show berganti.
    requestAnimationFrame(() => render(clean));
  }
}

function onSource() {
  emit('update:modelValue', source.value);
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <div class="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5 text-sm">
      <template v-if="mode === 'visual'">
        <button type="button" class="rte-btn font-bold" :title="t('pages.editor.bold')" :disabled="disabled" @click="exec('bold')">B</button>
        <button type="button" class="rte-btn italic" :title="t('pages.editor.italic')" :disabled="disabled" @click="exec('italic')">I</button>
        <button type="button" class="rte-btn underline" :title="t('pages.editor.underline')" :disabled="disabled" @click="exec('underline')">U</button>
        <span class="mx-1 h-5 w-px bg-slate-200"></span>
        <button type="button" class="rte-btn" :disabled="disabled" @click="block('h2')">H2</button>
        <button type="button" class="rte-btn" :disabled="disabled" @click="block('h3')">H3</button>
        <button type="button" class="rte-btn" :title="t('pages.editor.paragraph')" :disabled="disabled" @click="block('p')">¶</button>
        <span class="mx-1 h-5 w-px bg-slate-200"></span>
        <button type="button" class="rte-btn" :title="t('pages.editor.bulletList')" :disabled="disabled" @click="exec('insertUnorderedList')">• —</button>
        <button type="button" class="rte-btn" :title="t('pages.editor.numberList')" :disabled="disabled" @click="exec('insertOrderedList')">1.</button>
        <button type="button" class="rte-btn" :title="t('pages.editor.quote')" :disabled="disabled" @click="block('blockquote')">❝</button>
        <button type="button" class="rte-btn" :title="t('pages.editor.link')" :disabled="disabled" @click="link">🔗</button>
        <button type="button" class="rte-btn" :title="t('pages.editor.clear')" :disabled="disabled" @click="exec('removeFormat')">⌫</button>
      </template>
      <button type="button" class="rte-btn ms-auto" @click="toggleMode">
        {{ mode === 'visual' ? t('pages.editor.htmlMode') : t('pages.editor.visualMode') }}
      </button>
    </div>
    <div
      v-show="mode === 'visual'"
      ref="editor"
      class="prose-page min-h-[260px] px-4 py-3 outline-none"
      :contenteditable="!disabled"
      @input="onInput"
      @contextmenu="onContextMenu"
    ></div>
    <textarea
      v-if="mode === 'html'"
      v-model="source"
      class="block min-h-[260px] w-full border-0 px-4 py-3 font-mono text-xs outline-none"
      :disabled="disabled"
      spellcheck="false"
      @input="onSource"
    ></textarea>

    <!-- ── Floating Right-Click Formatting Toolbar ── -->
    <Teleport to="body">
      <div
        v-if="showContextMenu"
        class="fixed z-[9999] flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/95 p-1.5 text-xs text-white shadow-2xl backdrop-blur-md ring-1 ring-white/10"
        :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
        @click.stop
      >
        <button type="button" class="floating-btn font-bold" title="Bold (Ctrl+B)" @click="exec('bold'); closeContextMenu()">B</button>
        <button type="button" class="floating-btn italic font-serif" title="Italic (Ctrl+I)" @click="exec('italic'); closeContextMenu()">I</button>
        <button type="button" class="floating-btn underline" title="Underline (Ctrl+U)" @click="exec('underline'); closeContextMenu()">U</button>
        <span class="h-4 w-px bg-slate-700"></span>
        <button type="button" class="floating-btn font-bold" title="Heading 2" @click="block('h2'); closeContextMenu()">H2</button>
        <button type="button" class="floating-btn font-bold" title="Heading 3" @click="block('h3'); closeContextMenu()">H3</button>
        <button type="button" class="floating-btn" title="Paragraph" @click="block('p'); closeContextMenu()">¶</button>
        <span class="h-4 w-px bg-slate-700"></span>
        <button type="button" class="floating-btn" title="Bullet List" @click="exec('insertUnorderedList'); closeContextMenu()">• —</button>
        <button type="button" class="floating-btn" title="Number List" @click="exec('insertOrderedList'); closeContextMenu()">1.</button>
        <button type="button" class="floating-btn font-serif" title="Quote" @click="block('blockquote'); closeContextMenu()">❝</button>
        <button type="button" class="floating-btn" title="Insert Link" @click="link(); closeContextMenu()">🔗</button>
        <button type="button" class="floating-btn text-rose-400" title="Clear Formatting" @click="exec('removeFormat'); closeContextMenu()">⌫</button>
        <button type="button" class="ml-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white" title="Close" @click="closeContextMenu">✕</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.rte-btn {
  @apply min-w-[2rem] rounded px-2 py-1 text-slate-600 transition hover:bg-white hover:text-slate-900 disabled:opacity-40;
}
.floating-btn {
  @apply min-w-[1.75rem] rounded px-2 py-1 text-slate-200 transition hover:bg-white/20 hover:text-white active:scale-95;
}
</style>
