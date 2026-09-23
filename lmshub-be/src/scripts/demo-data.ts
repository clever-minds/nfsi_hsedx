import { COURSE_CONTENT } from './demo-course-content';

/** Static catalogue shape for the demo seeder: categories, courses, students. */

export const CATEGORIES: Array<{ name: string; slug: string; icon: string }> = [
  { name: 'Programming', slug: 'programming', icon: '💻' },
  { name: 'Design', slug: 'design', icon: '🎨' },
  { name: 'Business & Marketing', slug: 'business-marketing', icon: '📈' },
  { name: 'Data & AI', slug: 'data-ai', icon: '🤖' },
  { name: 'Personal Development', slug: 'personal-development', icon: '🌱' },
  { name: 'IT & Software', slug: 'it-software', icon: '🖥️' },
];

export type InstructorKey = 'rina' | 'daniel' | 'amara' | 'kenji';
export type Level = 'pemula' | 'menengah' | 'mahir';

export interface CourseSeed {
  title: string;
  slug: string;
  category: string;
  level: Level;
  /** Major units in the store currency (USD in the demo). */
  price: number;
  instructor: InstructorKey;
}

/** Level codes are stored in the database; these are the labels shown on artwork. */
export const LEVEL_LABEL: Record<Level, string> = {
  pemula: 'Beginner',
  menengah: 'Intermediate',
  mahir: 'Advanced',
};

export const COURSES: CourseSeed[] = [
  { title: 'Web Development Foundations', slug: 'web-development-foundations', category: 'programming', level: 'pemula', price: 49, instructor: 'rina' },
  { title: 'Modern JavaScript from Zero', slug: 'modern-javascript', category: 'programming', level: 'menengah', price: 59, instructor: 'rina' },
  { title: 'Python for Beginners', slug: 'python-for-beginners', category: 'programming', level: 'pemula', price: 45, instructor: 'kenji' },
  { title: 'React from Scratch to Production', slug: 'react-from-scratch', category: 'programming', level: 'menengah', price: 69, instructor: 'rina' },
  { title: 'Vue 3 and Vite in Practice', slug: 'vue-3-in-practice', category: 'programming', level: 'menengah', price: 65, instructor: 'rina' },
  { title: 'Backend APIs with Node.js and Express', slug: 'node-express-backend', category: 'programming', level: 'menengah', price: 69, instructor: 'daniel' },
  { title: 'SQL and Database Design', slug: 'sql-database-design', category: 'programming', level: 'pemula', price: 45, instructor: 'daniel' },
  { title: 'Git and GitHub for Teams', slug: 'git-github-teams', category: 'it-software', level: 'pemula', price: 35, instructor: 'daniel' },
  { title: 'Linux and the Command Line', slug: 'linux-command-line', category: 'it-software', level: 'menengah', price: 45, instructor: 'daniel' },
  { title: 'UI/UX Design Fundamentals', slug: 'ui-ux-fundamentals', category: 'design', level: 'pemula', price: 59, instructor: 'rina' },
  { title: 'Figma from the Ground Up', slug: 'figma-for-designers', category: 'design', level: 'pemula', price: 39, instructor: 'rina' },
  { title: 'Fast Graphic Design with Canva', slug: 'graphic-design-canva', category: 'design', level: 'pemula', price: 29, instructor: 'amara' },
  { title: 'Practical Digital Marketing', slug: 'digital-marketing-practical', category: 'business-marketing', level: 'menengah', price: 49, instructor: 'amara' },
  { title: 'SEO for Small Business', slug: 'seo-for-business', category: 'business-marketing', level: 'menengah', price: 45, instructor: 'amara' },
  { title: 'Copywriting That Sells', slug: 'copywriting-that-sells', category: 'business-marketing', level: 'pemula', price: 39, instructor: 'amara' },
  { title: 'Data Science with Python', slug: 'data-science-python', category: 'data-ai', level: 'mahir', price: 79, instructor: 'kenji' },
  { title: 'Excel for Data Analysis', slug: 'excel-data-analysis', category: 'data-ai', level: 'pemula', price: 29, instructor: 'kenji' },
  { title: 'Machine Learning Foundations', slug: 'machine-learning-foundations', category: 'data-ai', level: 'mahir', price: 89, instructor: 'kenji' },
  { title: 'Confident Public Speaking', slug: 'confident-public-speaking', category: 'personal-development', level: 'pemula', price: 25, instructor: 'amara' },
  { title: 'Productive Time Management', slug: 'productive-time-management', category: 'personal-development', level: 'pemula', price: 25, instructor: 'kenji' },
];

// ── Curriculum ────────────────────────────────────────────────────────────

export interface CurriculumSection {
  title: string;
  lessons: string[];
}

/**
 * Build a curriculum from the course's own learning outcomes.
 *
 * The previous seeder gave all twenty courses the identical three sections
 * ("Core Material Part 1/2/3"), which is the clearest possible signal that a
 * catalogue is filler. Deriving lesson titles from each course's `learn` list
 * means every curriculum is different and actually describes that course.
 */
export function curriculumFor(slug: string): CurriculumSection[] {
  const learn = COURSE_CONTENT[slug]?.learn ?? [];
  const half = Math.ceil(learn.length / 2);

  return [
    {
      title: 'Getting Started',
      lessons: ['Welcome and how this course works', 'Setting up your tools'],
    },
    {
      title: 'Core Concepts',
      lessons: learn.slice(0, half),
    },
    {
      title: 'Putting It Into Practice',
      lessons: learn.slice(half),
    },
    {
      title: 'Wrapping Up',
      lessons: ['Final project walkthrough', 'Where to go next'],
    },
  ].filter((s) => s.lessons.length > 0);
}

// ── People ────────────────────────────────────────────────────────────────

/** The student whose account reviewers are given; her progress is the demo tour. */
export const LEAD_STUDENT = { name: 'Sara Mitchell', email: 'siti@lmshub.test' };

export const OTHER_STUDENTS: Array<{ name: string; email: string }> = [
  { name: 'Marcus Reid', email: 'marcus@lmshub.test' },
  { name: 'Priya Nair', email: 'priya@lmshub.test' },
  { name: 'Lucas Moreau', email: 'lucas@lmshub.test' },
  { name: 'Aisha Rahman', email: 'aisha@lmshub.test' },
  { name: 'Tomas Novak', email: 'tomas@lmshub.test' },
  { name: 'Grace Bennett', email: 'grace@lmshub.test' },
  { name: 'Diego Alvarez', email: 'diego@lmshub.test' },
  { name: 'Yuki Sato', email: 'yuki@lmshub.test' },
];

/** Lead student: courses in progress, with the completion percentage to fake up to. */
export const LEAD_IN_PROGRESS: Array<[slug: string, percent: number]> = [
  ['web-development-foundations', 75],
  ['python-for-beginners', 40],
  ['react-from-scratch', 25],
  ['ui-ux-fundamentals', 12],
  ['data-science-python', 5],
];

/** Lead student: finished courses, each of which issues a certificate. */
export const LEAD_COMPLETED: string[] = ['sql-database-design', 'copywriting-that-sells'];
