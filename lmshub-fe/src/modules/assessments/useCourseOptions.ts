import { ref } from 'vue';
import { apiGetFull } from '@/lib/api';

export interface CourseOption {
  id: string;
  title: string;
}

/**
 * register course untuk dropdown di layar assessment.
 *
 * Layar-layar ini dulu meminta "Course ID" diketik sebagai text — dan
 * mengirimnya dengan name field yang no dikenal backend, sehingga bank soal,
 * quiz, dan assignment no pernah bisa created. Backend sudah membatasi register to
 * course milik instructor, jadi yang tampil di sini memang yang boleh dipilih.
 */
export function useCourseOptions() {
  const courses = ref<CourseOption[]>([]);
  const loading = ref(false);

  async function load() {
    loading.value = true;
    try {
      const res = await apiGetFull<CourseOption[]>('/courses', { limit: 100, sort: 'title', order: 'asc' });
      courses.value = (res.data ?? []).map((c) => ({ id: c.id, title: c.title }));
    } catch {
      courses.value = [];
    } finally {
      loading.value = false;
    }
  }

  return { courses, loading, load };
}
