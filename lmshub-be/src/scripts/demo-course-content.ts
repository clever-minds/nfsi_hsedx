/**
 * Long-form content for the demo catalogue, consumed by `demo.ts`.
 *
 * Written in English because the demo storefront is what a first-time visitor
 * judges the product by, and the interface ships English as its default locale.
 * Mixed-language demo data made the catalogue look untranslated even though the
 * UI itself is fully localised into four languages.
 *
 * Stored into `courses.ringkasan`, `courses.deskripsi` and `courses.meta`.
 */

export interface CourseContent {
  summary: string;
  /** Paragraphs separated by a blank line. */
  description: string;
  learn: string[];
  requirements: string[];
  audience: string[];
}

export const COURSE_CONTENT: Record<string, CourseContent> = {
  'web-development-foundations': {
    summary:
      'The complete groundwork for building websites: HTML, CSS and the JavaScript that brings a page to life.',
    description:
      'This is the course to take before any other. You will start with how the web actually works — what a browser does with a URL, what a server sends back — and then write your first page by hand.\n\nFrom there you build up: semantic HTML that search engines and screen readers can both understand, modern CSS layout with Flexbox and Grid, and enough JavaScript to make a page respond to the person using it.\n\nEvery section ends with something you have built rather than something you have watched. By the final lesson you will have a responsive multi-page portfolio site, deployed to a live URL you can share.',
    learn: [
      'How browsers, servers, HTTP and DNS fit together',
      'Semantic, accessible HTML that scores well on SEO audits',
      'Modern layout with Flexbox and CSS Grid',
      'Responsive design that holds up on phones, tablets and desktops',
      'JavaScript basics: variables, functions, events and the DOM',
      'Deploying your first site to a public URL for free',
    ],
    requirements: [
      'No coding experience at all — this course genuinely starts from zero',
      'Any laptop with a modern browser and an internet connection',
    ],
    audience: [
      'Complete beginners considering a move into tech',
      'Students who want a practical skill alongside their degree',
      'Business owners who want to understand their own website',
    ],
  },

  'modern-javascript': {
    summary:
      'Go from writing JavaScript to understanding it: ES6+, closures, the event loop, and async code that behaves.',
    description:
      'Most developers learn just enough JavaScript to get by, then spend years confused by the parts they skipped. This course closes those gaps deliberately.\n\nYou will work through the ES6+ features that modern codebases assume you know — destructuring, spread and rest, template literals, optional chaining, modules — and then go deeper into the three things that trip people up: scope, closures, and what `this` actually refers to.\n\nThe second half is asynchronous JavaScript, taught from the event loop upward. Callbacks, promises and async/await stop being syntax to memorise once you can picture what the runtime is doing. The final project is a dashboard that pulls from several APIs at once and handles every loading and failure state properly.',
    learn: [
      'ES6+ syntax that modern codebases take for granted',
      'Scope, closures and `this` — explained until they are obvious',
      'The event loop, and why async code runs in the order it does',
      'Promises and async/await, including error handling that works',
      'Consuming REST APIs with fetch, with real loading and error states',
      'Structuring a project with ES modules',
    ],
    requirements: [
      'Comfortable with HTML and CSS, and you have written some JavaScript before',
      'Web Development Foundations, or equivalent experience',
    ],
    audience: [
      'Junior developers who want to stop guessing and start knowing',
      'Bootcamp graduates filling in the fundamentals they moved past',
      'Anyone about to pick up React, Vue or Node.js',
    ],
  },

  'python-for-beginners': {
    summary:
      'Learn Python by writing small programs that do real work — files, data, and your first automation scripts.',
    description:
      'Python is the language people reach for when they want a computer to do something tedious for them, and that is exactly how this course teaches it.\n\nYou will cover the fundamentals — types, control flow, functions, collections, errors — but always in service of a script that does something: renaming a folder of files, cleaning a messy spreadsheet, pulling numbers off a web page.\n\nBy the end you will have written a dozen small tools you can actually keep using, and you will understand the language well enough to read other people’s Python without guessing.',
    learn: [
      'Python syntax, types and control flow, taught through working scripts',
      'Functions, modules and how to organise code as it grows',
      'Lists, dictionaries, sets and when each one is the right tool',
      'Reading and writing files, including CSV and JSON',
      'Handling errors so a script fails clearly instead of silently',
      'Automating a repetitive task end to end as your final project',
    ],
    requirements: [
      'No programming experience required',
      'A computer where you are allowed to install software',
    ],
    audience: [
      'Beginners choosing their first programming language',
      'Analysts and office workers who want to automate repetitive work',
      'Anyone heading toward data science or machine learning later',
    ],
  },

  'react-from-scratch': {
    summary:
      'Build production React: components, hooks, data fetching, routing and the state decisions that matter.',
    description:
      'React is easy to start and easy to get wrong. This course builds the mental model first — what a component really is, why re-renders happen, what the dependency array is for — before adding the tooling on top.\n\nYou will build one application across the whole course rather than a series of disconnected demos, adding routing, forms, data fetching, optimistic updates and error boundaries as the requirements grow. Each new piece arrives because the app needs it, which is how you will remember it.\n\nState management is treated as a decision, not a default. You will learn when component state is enough, when context is right, and when reaching for a library is genuinely justified.',
    learn: [
      'Components, props and the render cycle, without the hand-waving',
      'The core hooks — useState, useEffect, useMemo, useRef — and their traps',
      'Client routing, nested layouts and protected routes',
      'Data fetching with loading, error and empty states handled properly',
      'Forms and validation that stay manageable as they grow',
      'Choosing between local state, context and a state library',
    ],
    requirements: [
      'Solid modern JavaScript, especially ES6+ and async/await',
      'Modern JavaScript from Zero, or equivalent experience',
    ],
    audience: [
      'Developers moving from plain JavaScript to a framework',
      'React users who can build features but want to understand the model',
      'Teams standardising on React who need a shared foundation',
    ],
  },

  'vue-3-in-practice': {
    summary:
      'Vue 3 with the Composition API and Vite: reactive state, composables, routing and a build you understand.',
    description:
      'Vue rewards people who understand its reactivity system, so that is where this course starts. You will see what `ref` and `reactive` actually do before you write a line of application code.\n\nFrom there you build a real application with the Composition API — extracting composables, wiring up Vue Router, managing shared state with Pinia, and handling the asynchronous parts without the component turning into a mess.\n\nVite is covered as a tool you control rather than a black box: dev server, environment variables, build output, and what to check when a production build behaves differently from development.',
    learn: [
      'Vue 3 reactivity: ref, reactive, computed and watch',
      'The Composition API, and extracting logic into reusable composables',
      'Vue Router: nested routes, guards and lazy-loaded views',
      'Shared state with Pinia without over-engineering it',
      'Working with Vite: env variables, dev server and production builds',
      'Component patterns that survive a growing codebase',
    ],
    requirements: [
      'Comfortable with modern JavaScript and the DOM',
      'Any previous framework experience helps but is not required',
    ],
    audience: [
      'Developers picking Vue for a new project',
      'Vue 2 developers moving to the Composition API',
      'React developers who want a working knowledge of Vue',
    ],
  },

  'node-express-backend': {
    summary:
      'Design and ship a REST API with Node.js and Express: routing, auth, validation, database access and deployment.',
    description:
      'This course covers the half of web development that runs on the server. You will build one API from an empty folder to a deployed service, making the same decisions a real project forces on you.\n\nRouting, middleware, request validation and error handling come first, because an API that fails clearly is worth more than one with extra features. Then authentication with JWT, password hashing done correctly, and role-based access that you can actually reason about.\n\nThe database chapter uses PostgreSQL directly — schema design, migrations, indexes, and transactions — so you understand what an ORM would be doing for you before you decide whether to use one.',
    learn: [
      'Express routing, middleware and a project layout that scales',
      'Request validation and error handling that returns useful responses',
      'JWT authentication, refresh tokens and correct password hashing',
      'Role-based access control that stays readable',
      'PostgreSQL: schema design, migrations, indexes and transactions',
      'Deploying to a VPS with a process manager and a reverse proxy',
    ],
    requirements: [
      'Comfortable with JavaScript, including promises and async/await',
      'Basic command line familiarity',
    ],
    audience: [
      'Frontend developers moving toward full stack',
      'Developers who have used an ORM and want to understand the SQL underneath',
      'Anyone who needs to ship and operate an API, not just write one',
    ],
  },

  'sql-database-design': {
    summary:
      'Write queries with confidence and design schemas that will not need rescuing in six months.',
    description:
      'SQL is the skill that outlasts frameworks, and it is usually learned in fragments. This course teaches it in order.\n\nYou will start with SELECT and work up through joins, aggregation, subqueries and window functions, running every query against a realistic database rather than a three-row toy table. Query results are compared against what you expected, because that is how the syntax sticks.\n\nThe second half is design: normalisation explained in plain language, choosing keys and data types, indexing for the queries you actually run, and the schema mistakes that are cheap to fix now and expensive to fix later.',
    learn: [
      'SELECT, WHERE, ORDER BY and GROUP BY on realistic data',
      'Every join type, and how to tell which one you need',
      'Aggregation, subqueries and window functions',
      'Normalisation up to third normal form, without the jargon',
      'Choosing keys, data types and constraints deliberately',
      'Indexing for real query patterns, and reading a query plan',
    ],
    requirements: [
      'No database experience required',
      'PostgreSQL is used throughout, but the SQL applies to MySQL and others',
    ],
    audience: [
      'Developers who copy SQL from search results and want to stop',
      'Analysts who need to pull their own data',
      'Anyone designing a schema for the first time',
    ],
  },

  'git-github-teams': {
    summary:
      'Use Git the way teams actually use it: branches, reviews, conflicts, and getting out of trouble calmly.',
    description:
      'Most Git courses stop at commit and push. The problems start after that, so this course spends its time there.\n\nYou will learn the branching workflow used by working teams — feature branches, pull requests, code review, and keeping a branch current without wrecking its history. Merge conflicts are practised deliberately rather than avoided, until resolving one stops being stressful.\n\nA full section is devoted to recovery: undoing a bad commit, restoring deleted work, fixing a branch you pushed to by mistake. Knowing that nothing is truly lost is what makes people confident with Git.',
    learn: [
      'The commit, staging area and branch model, explained properly',
      'Feature branches, pull requests and review workflow',
      'Resolving merge conflicts without panic',
      'Rebase versus merge, and when each is appropriate',
      'Recovering lost work with reflog, revert and reset',
      'Tags, releases and useful commit messages',
    ],
    requirements: [
      'Some coding experience in any language',
      'Basic command line familiarity',
    ],
    audience: [
      'Developers joining their first team project',
      'Solo developers whose repository has become messy',
      'Designers and writers collaborating in a Git repository',
    ],
  },

  'linux-command-line': {
    summary:
      'Become fluent on the terminal: files, permissions, processes, networking and shell scripts that save you time.',
    description:
      'Every server you will ever deploy to runs Linux, and the terminal is how you talk to it. This course makes that conversation comfortable.\n\nYou will move through the filesystem, permissions, users and processes at a pace that assumes nothing, then into the tools that make the command line worth using: pipes, grep, sed, awk, find, and redirecting output where you want it.\n\nThe final section covers the practical server tasks — SSH keys, file transfer, services, logs, disk and memory checks — plus writing shell scripts to stop repeating yourself.',
    learn: [
      'Navigating the filesystem and managing files from the terminal',
      'Permissions, ownership and sudo, understood rather than memorised',
      'Pipes and the text-processing tools: grep, sed, awk, find',
      'Processes, services and reading logs when something breaks',
      'SSH keys, secure file transfer and basic server hygiene',
      'Writing shell scripts to automate routine work',
    ],
    requirements: [
      'No Linux experience needed',
      'A Linux machine, a virtual machine, WSL, or macOS Terminal',
    ],
    audience: [
      'Developers who need to deploy and maintain their own servers',
      'Students preparing for backend, DevOps or sysadmin work',
      'Anyone tired of clicking through interfaces for repetitive tasks',
    ],
  },

  'ui-ux-fundamentals': {
    summary:
      'The reasoning behind good interfaces: research, hierarchy, layout, typography and testing your decisions.',
    description:
      'Good design is a sequence of defensible decisions, and this course teaches the reasoning rather than a set of trends.\n\nYou will start with the user: how to run a short interview, turn what you heard into a problem statement, and map the journey before drawing anything. Then the visual craft — hierarchy, spacing, colour, typography and layout systems — each introduced as a tool for solving a specific problem.\n\nThe course ends where too many stop: testing. You will put a prototype in front of real people, watch where they hesitate, and iterate. A design you have tested is worth more than a design you have polished.',
    learn: [
      'User research you can actually run: interviews, personas, journey maps',
      'Information architecture and user flows before any visual work',
      'Visual hierarchy, spacing systems, colour and typography',
      'Wireframing and prototyping at the right level of detail',
      'Usability testing, and what to change based on what you see',
      'Accessibility basics: contrast, focus order, touch targets',
    ],
    requirements: [
      'No design background required',
      'Any prototyping tool works; Figma is used in the examples',
    ],
    audience: [
      'Developers who want their own projects to look considered',
      'Career changers moving into product design',
      'Founders and product managers making interface decisions',
    ],
  },

  'figma-for-designers': {
    summary:
      'Work quickly in Figma: auto layout, components, variants, styles and handing designs to developers.',
    description:
      'Figma rewards structure. This course teaches the parts that make files fast to build and painless to change.\n\nAuto layout is covered until it is second nature, because almost everything else depends on it. Then components, variants and properties — building a small design system that keeps a file consistent when the brief changes at the last minute.\n\nThe final chapter is collaboration: prototyping flows, commenting, developer handoff, and organising a file so that someone else can open it and immediately understand it.',
    learn: [
      'The Figma interface, frames, and file organisation that scales',
      'Auto layout for responsive, easily edited designs',
      'Components, variants and properties as a small design system',
      'Colour, text and effect styles shared across a project',
      'Interactive prototypes for testing and presentation',
      'Developer handoff: specs, exports and clear naming',
    ],
    requirements: [
      'A free Figma account',
      'No prior Figma experience needed',
    ],
    audience: [
      'Designers moving to Figma from another tool',
      'Developers who need to read and edit design files',
      'Anyone producing interface mockups regularly',
    ],
  },

  'graphic-design-canva': {
    summary:
      'Produce professional-looking marketing graphics quickly, even with no design training.',
    description:
      'Not everyone who needs a good-looking graphic has time to learn design properly. This course is the practical shortcut.\n\nYou will learn the handful of principles that separate an amateur layout from a professional one — alignment, contrast, whitespace, and restraint with fonts — and then apply them in Canva to the formats a small business actually needs.\n\nBy the end you will have a reusable brand kit and templates for social posts, presentations and print, so the next graphic takes minutes rather than an afternoon.',
    learn: [
      'The layout principles that make a design look professional',
      'Building a brand kit: colours, fonts and logo usage',
      'Templates for social media, presentations and print',
      'Choosing and pairing fonts without guessing',
      'Editing images: backgrounds, cropping and consistent filters',
      'Exporting correctly for screen and for print',
    ],
    requirements: [
      'A free Canva account',
      'No design experience required',
    ],
    audience: [
      'Small business owners producing their own marketing',
      'Social media managers who need volume without losing quality',
      'Anyone who needs decent graphics and has no designer',
    ],
  },

  'digital-marketing-practical': {
    summary:
      'Plan, run and measure campaigns across search, social and email — with numbers you can defend.',
    description:
      'Marketing advice is abundant and mostly untestable. This course focuses on the parts you can measure.\n\nYou will build a marketing plan from an actual audience and budget, choose channels for reasons you can explain, and set up tracking before spending anything — because a campaign you cannot measure is a campaign you cannot improve.\n\nEach channel is covered practically: search ads and keyword intent, paid social and creative testing, email sequences that people stay subscribed to, and landing pages built to convert. The final module is reporting: which numbers matter, which are vanity, and how to present results honestly.',
    learn: [
      'Building a marketing plan from audience, budget and goals',
      'Search advertising and keyword intent',
      'Paid social campaigns and structured creative testing',
      'Email sequences with useful open and click rates',
      'Landing pages and conversion rate basics',
      'Analytics and reporting that separates signal from vanity',
    ],
    requirements: [
      'No marketing background required',
      'A small test budget helps but the course works without one',
    ],
    audience: [
      'Business owners running their own marketing',
      'Marketers who want to move from tactics to measurable strategy',
      'Freelancers adding paid campaigns to their services',
    ],
  },

  'seo-for-business': {
    summary:
      'Rank for the searches that bring customers: keywords, on-page work, technical fixes and local SEO.',
    description:
      'SEO looks mysterious from outside and mostly is not. This course covers what actually moves rankings for a small business.\n\nYou will start with keyword research aimed at buying intent rather than traffic volume, because a thousand visitors who will never purchase are worth less than ten who will. Then on-page work: titles, headings, internal links and content that answers the question someone typed.\n\nTechnical SEO is covered at the level a business owner needs — site speed, mobile, indexing, structured data — and the course closes with local SEO and the reporting that shows whether any of it worked.',
    learn: [
      'Keyword research focused on intent, not raw volume',
      'On-page optimisation: titles, headings, structure and internal links',
      'Content that satisfies a search rather than repeating a phrase',
      'Technical SEO: speed, mobile, indexing and structured data',
      'Local SEO, business listings and reviews',
      'Measuring rankings and organic traffic over time',
    ],
    requirements: [
      'A website you can edit, or plans to build one',
      'No technical background required',
    ],
    audience: [
      'Small business owners competing for local searches',
      'Marketers who need organic traffic alongside paid',
      'Freelancers offering SEO as a service',
    ],
  },

  'copywriting-that-sells': {
    summary:
      'Write copy that persuades: research, structure, headlines, objections and testing what you wrote.',
    description:
      'Persuasive writing is a craft with rules, and this course teaches them in the order you use them.\n\nIt begins with research, because the best copy is mostly quoting your customer back to themselves. You will learn how to mine reviews, interviews and support tickets for the exact language people already use.\n\nThen structure: headlines that earn the next line, benefits distinguished from features, objections handled before they harden, and calls to action that feel like the obvious next step. Every module ends with you rewriting real copy, and the course closes with A/B testing so your opinions become evidence.',
    learn: [
      'Customer research that gives you the words to use',
      'Headlines that earn attention without exaggerating',
      'Turning features into benefits that matter to the reader',
      'Handling objections before the reader raises them',
      'Calls to action that convert without pressure',
      'A/B testing copy and reading the results honestly',
    ],
    requirements: [
      'No writing background required',
      'Bring a page or email of your own to rewrite',
    ],
    audience: [
      'Business owners writing their own sales pages',
      'Marketers who want stronger conversion copy',
      'Freelance writers moving into higher-value work',
    ],
  },

  'data-science-python': {
    summary:
      'The full analysis workflow in Python: cleaning, exploring, visualising and communicating what you found.',
    description:
      'Real analysis is mostly cleaning, and this course reflects that honestly. You will spend real time on messy data before touching a model.\n\nPandas is taught through the operations you use constantly — selecting, filtering, grouping, joining, reshaping, handling missing values — on datasets that are deliberately imperfect. Then exploratory analysis: distributions, relationships, outliers, and knowing when a pattern is real.\n\nVisualisation is treated as communication rather than decoration: choosing the right chart, removing what distracts, and presenting a finding to people who will not read your code. The final project takes one raw dataset all the way to a written conclusion.',
    learn: [
      'Pandas for real cleaning: missing values, types, duplicates, reshaping',
      'Exploratory analysis: distributions, correlations and outliers',
      'NumPy for the numerical work underneath',
      'Visualisation with matplotlib and seaborn, chosen deliberately',
      'Basic statistics: sampling, significance and common misreadings',
      'Presenting an analysis to a non-technical audience',
    ],
    requirements: [
      'Comfortable with Python basics: functions, loops, lists and dictionaries',
      'Python for Beginners, or equivalent experience',
    ],
    audience: [
      'Analysts moving from spreadsheets to Python',
      'Developers adding data skills',
      'Anyone preparing to study machine learning seriously',
    ],
  },

  'excel-data-analysis': {
    summary:
      'Turn a spreadsheet into an answer: formulas, pivot tables, cleaning and dashboards that update themselves.',
    description:
      'Excel remains the most widely used analysis tool in the world, and most people use a fraction of it. This course covers the fraction that matters.\n\nYou will learn the formulas that do real work — lookups, conditionals, text and date handling — and then pivot tables, which answer most business questions faster than anything else.\n\nCleaning is covered properly with Power Query, so importing a messy export stops being a manual chore. The course finishes with a dashboard that refreshes when the underlying data changes, rather than one rebuilt by hand every month.',
    learn: [
      'The formulas that carry real work: XLOOKUP, IF, SUMIFS, text and dates',
      'Pivot tables for fast answers to business questions',
      'Cleaning and reshaping data with Power Query',
      'Charts that communicate rather than decorate',
      'Conditional formatting and data validation for reliable sheets',
      'Building a dashboard that refreshes automatically',
    ],
    requirements: [
      'Basic familiarity with a spreadsheet',
      'Microsoft Excel; most of the course also applies to Google Sheets',
    ],
    audience: [
      'Office professionals who report on data regularly',
      'Small business owners tracking their own numbers',
      'Students preparing for analytical roles',
    ],
  },

  'machine-learning-foundations': {
    summary:
      'How machine learning actually works: the core algorithms, honest evaluation, and knowing when not to use it.',
    description:
      'This course treats machine learning as engineering rather than magic. Every algorithm is introduced by the problem it solves and the assumptions it makes.\n\nYou will implement the fundamentals — linear and logistic regression, decision trees, ensembles, clustering — with scikit-learn, but always with an explanation of what the fit is doing underneath. Feature engineering gets the attention it deserves, since it usually matters more than the model choice.\n\nEvaluation is the heart of the course. Train-test splits, cross-validation, the precision-recall trade-off, class imbalance, and the leakage that makes a model look brilliant in a notebook and useless in production. You will also learn to recognise the problems that should not be solved with machine learning at all.',
    learn: [
      'The supervised learning workflow from raw data to evaluated model',
      'Regression, classification, decision trees and ensemble methods',
      'Feature engineering, scaling and encoding done deliberately',
      'Cross-validation and honest evaluation metrics',
      'Overfitting, class imbalance and data leakage',
      'Unsupervised methods: clustering and dimensionality reduction',
    ],
    requirements: [
      'Confident Python and pandas',
      'Data Science with Python, or equivalent experience',
      'Comfort with basic algebra and statistics',
    ],
    audience: [
      'Analysts and developers moving into machine learning',
      'Students who want the reasoning, not just the library calls',
      'Practitioners who want to evaluate models honestly',
    ],
  },

  'confident-public-speaking': {
    summary:
      'Structure a talk, manage nerves, and hold a room — practised out loud, not just explained.',
    description:
      'Fear of speaking is mostly fear of being unprepared, so this course fixes the preparation first.\n\nYou will learn to structure a talk around one clear idea, open in a way that earns attention, and close with something people remember. Slides are treated as support rather than a script.\n\nDelivery is practised deliberately: breathing and pacing to steady your nerves, using pause instead of filler words, and handling the moment when a question catches you off guard. Every module asks you to record yourself, because improvement comes from hearing what you actually sound like.',
    learn: [
      'Structuring a talk around a single clear message',
      'Openings that earn attention and closings people remember',
      'Managing nerves with breathing, pacing and preparation',
      'Voice, pause and body language that support your point',
      'Slides that help the audience instead of competing with you',
      'Handling questions, including ones you cannot answer',
    ],
    requirements: [
      'A phone or laptop to record your practice runs',
      'No speaking experience required',
    ],
    audience: [
      'Professionals who present to colleagues or clients',
      'Students preparing for defences and interviews',
      'Anyone whose nerves have held them back',
    ],
  },

  'productive-time-management': {
    summary:
      'A system for deciding what to work on, protecting the time to do it, and finishing what you start.',
    description:
      'Productivity advice usually adds another system on top of a full life. This course starts by cutting instead.\n\nYou will audit where your time actually goes, separate what is urgent from what is important, and learn to say no in a way that holds. Only then do you build the system — capture, weekly review, and planning that survives contact with a real week.\n\nFocus is covered practically: time blocking, protecting deep work, handling interruptions and notifications, and recovering a day that has already gone sideways. The aim is a routine you will still be using in three months, not one that collapses in a fortnight.',
    learn: [
      'Auditing where your time actually goes',
      'Separating urgent from important, and acting on the difference',
      'A capture and review habit that stops things slipping',
      'Time blocking and protecting deep work',
      'Managing interruptions, notifications and meeting load',
      'Saying no without damaging relationships',
    ],
    requirements: [
      'No prerequisites',
      'Any calendar and note-taking app you already use',
    ],
    audience: [
      'Professionals with more responsibilities than hours',
      'Freelancers managing several clients at once',
      'Students balancing study, work and everything else',
    ],
  },
};

// ── Instructors ───────────────────────────────────────────────────────────

export interface InstructorContent {
  name: string;
  email: string;
  headline: string;
  bio: string;
  expertise: string[];
  social: Record<string, string>;
}

/**
 * Four instructors rather than two. The storefront prints the instructor count
 * next to the enrolled-student count, and "2 expert instructors" beside a
 * five-figure student number reads as fabricated.
 */
export const INSTRUCTORS: Record<string, InstructorContent> = {
  rina: {
    name: 'Rina Wijaya',
    email: 'rina@lmshub.test',
    headline: 'Frontend engineer and interface designer',
    bio: 'Rina has spent eight years building web products for startups and larger companies, moving between engineering and design often enough to be fluent in both. She teaches on the principle that a concept you can explain out loud is one you actually understand, so her courses ask you to build and describe rather than follow along. Over 15,000 students have completed her courses.',
    expertise: ['JavaScript', 'React', 'Vue', 'TypeScript', 'UI/UX', 'Figma'],
    social: {
      linkedin: 'https://linkedin.com/in/rina-wijaya-demo',
      youtube: 'https://youtube.com/@rinawijaya-demo',
      website: 'https://rinawijaya-demo.dev',
    },
  },
  daniel: {
    name: 'Daniel Okafor',
    email: 'daniel@lmshub.test',
    headline: 'Backend and infrastructure engineer',
    bio: 'Daniel builds and operates the systems that stay up at three in the morning. After a decade across payments and logistics platforms, he teaches backend work the way it is actually practised: databases understood rather than abstracted away, deployments you can repeat, and failure handled before it happens. He is unreasonably enthusiastic about well-written error messages.',
    expertise: ['Node.js', 'PostgreSQL', 'Linux', 'Docker', 'System Design', 'Git'],
    social: {
      linkedin: 'https://linkedin.com/in/daniel-okafor-demo',
      github: 'https://github.com/danielokafor-demo',
    },
  },
  amara: {
    name: 'Amara Silva',
    email: 'amara@lmshub.test',
    headline: 'Brand designer and marketing strategist',
    bio: 'Amara has run marketing for small businesses long enough to be sceptical of advice that cannot be measured. She works across brand, copy and campaigns, and teaches the version that fits a real budget and a team of one or two. Her students leave with assets they are already using, not folders of exercises.',
    expertise: ['Digital Marketing', 'SEO', 'Copywriting', 'Brand Design', 'Canva'],
    social: {
      linkedin: 'https://linkedin.com/in/amara-silva-demo',
      instagram: 'https://instagram.com/amara.designs.demo',
    },
  },
  kenji: {
    name: 'Kenji Tanaka',
    email: 'kenji@lmshub.test',
    headline: 'Data scientist and analytics lead',
    bio: 'Kenji has spent most of his career persuading organisations that their data is messier than they think, then helping them fix it. He teaches analysis as a craft with an emphasis on honest evaluation, and is candid about the problems machine learning should not be pointed at. He also coaches presenting, on the grounds that an analysis nobody understands has not been finished.',
    expertise: ['Python', 'pandas', 'Machine Learning', 'Statistics', 'Excel', 'Data Visualisation'],
    social: {
      linkedin: 'https://linkedin.com/in/kenji-tanaka-demo',
      github: 'https://github.com/kenjitanaka-demo',
      website: 'https://kenjitanaka-demo.dev',
    },
  },
};
