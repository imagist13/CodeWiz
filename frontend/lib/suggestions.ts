/** Hundreds of example prompts shown on the welcome screen. */

export type Suggestion = {
  title: string;
  label: string;
  prompt: string;
};

export const SUGGESTIONS: Suggestion[] = [
  // ── Productivity ──────────────────────────────────────────────
  {
    title: "A todo app",
    label: "with drag-and-drop reordering",
    prompt: "Build a todo app with drag and drop reordering",
  },
  {
    title: "A kanban board",
    label: "like Trello",
    prompt: "Build a kanban board with draggable cards and multiple columns",
  },
  {
    title: "A habit tracker",
    label: "with streaks and stats",
    prompt: "Build a habit tracker that shows streaks and weekly stats",
  },
  {
    title: "A pomodoro timer",
    label: "with task list",
    prompt: "Build a pomodoro timer with a built-in task list",
  },
  {
    title: "A note-taking app",
    label: "with folders and search",
    prompt: "Build a note-taking app with folders, tags, and full-text search",
  },
  {
    title: "A bookmark manager",
    label: "with categories",
    prompt: "Build a bookmark manager with categories and a quick-add form",
  },
  {
    title: "A daily journal",
    label: "with mood tracking",
    prompt:
      "Build a daily journal app that lets you log entries and track your mood",
  },
  {
    title: "A time tracker",
    label: "with project breakdown",
    prompt: "Build a time tracker that shows hours logged per project",
  },
  {
    title: "A reading list",
    label: "with progress bars",
    prompt:
      "Build a reading list app where I can track books and reading progress",
  },
  {
    title: "A goal tracker",
    label: "with milestones",
    prompt:
      "Build a goal tracker with milestones, deadlines, and progress bars",
  },
  {
    title: "A personal CRM",
    label: "for managing contacts",
    prompt:
      "Build a personal CRM where I can store contacts, notes, and interactions",
  },
  {
    title: "A weekly planner",
    label: "with drag-and-drop",
    prompt: "Build a weekly planner with time blocks I can drag and rearrange",
  },
  {
    title: "A recipe manager",
    label: "with ingredient scaling",
    prompt:
      "Build a recipe manager where I can save recipes and scale ingredients",
  },
  {
    title: "A budget tracker",
    label: "with charts",
    prompt: "Build a budget tracker with income, expenses, and pie charts",
  },
  {
    title: "A meeting scheduler",
    label: "with calendar view",
    prompt:
      "Build a meeting scheduler with a calendar view and time slot selection",
  },

  // ── Developer Tools ───────────────────────────────────────────
  {
    title: "A markdown editor",
    label: "with live preview",
    prompt: "Build a markdown editor with a live preview pane",
  },
  {
    title: "A JSON formatter",
    label: "with syntax highlighting",
    prompt: "Build a JSON formatter and validator with syntax highlighting",
  },
  {
    title: "A regex tester",
    label: "with match highlighting",
    prompt: "Build a regex tester that highlights matches in real time",
  },
  {
    title: "A color picker",
    label: "with palette generator",
    prompt:
      "Build a color picker with a palette generator and contrast checker",
  },
  {
    title: "A CSS gradient generator",
    label: "with live preview",
    prompt:
      "Build a CSS gradient generator with live preview and copy-to-clipboard",
  },
  {
    title: "A code snippet manager",
    label: "with syntax highlighting",
    prompt:
      "Build a code snippet manager with language detection and syntax highlighting",
  },
  {
    title: "A base64 encoder/decoder",
    label: "with file support",
    prompt:
      "Build a base64 encoder and decoder that supports text and file uploads",
  },
  {
    title: "A diff viewer",
    label: "for comparing text",
    prompt: "Build a side-by-side diff viewer for comparing two blocks of text",
  },
  {
    title: "A cron expression builder",
    label: "with schedule preview",
    prompt:
      "Build a cron expression builder that shows the next scheduled run times",
  },
  {
    title: "A URL shortener",
    label: "with click analytics",
    prompt: "Build a URL shortener that shows click counts and referrer stats",
  },
  {
    title: "A REST API tester",
    label: "like Postman",
    prompt:
      "Build a REST API tester where I can send requests and see responses",
  },
  {
    title: "A Lorem Ipsum generator",
    label: "with options",
    prompt:
      "Build a Lorem Ipsum generator with paragraph, sentence, and word count options",
  },
  {
    title: "A UUID generator",
    label: "with history",
    prompt: "Build a UUID generator that keeps a history of generated UUIDs",
  },
  {
    title: "A timestamp converter",
    label: "between formats",
    prompt:
      "Build a timestamp converter that converts between Unix, ISO, and human-readable formats",
  },
  {
    title: "A SQL formatter",
    label: "with highlighting",
    prompt:
      "Build a SQL query formatter and beautifier with syntax highlighting",
  },

  // ── Landing Pages & Marketing ─────────────────────────────────
  {
    title: "A landing page",
    label: "for a SaaS product",
    prompt: "Build a modern landing page for a SaaS product",
  },
  {
    title: "A pricing page",
    label: "with tier comparison",
    prompt:
      "Build a pricing page with three tiers and a feature comparison table",
  },
  {
    title: "A portfolio site",
    label: "with project gallery",
    prompt: "Build a portfolio website with a filterable project gallery",
  },
  {
    title: "A product launch page",
    label: "with countdown timer",
    prompt:
      "Build a product launch page with email signup and a countdown timer",
  },
  {
    title: "A startup landing page",
    label: "with hero and features",
    prompt:
      "Build a startup landing page with a hero section, features grid, and CTA",
  },
  {
    title: "A changelog page",
    label: "with version timeline",
    prompt: "Build a changelog page that displays updates in a timeline format",
  },
  {
    title: "A waitlist page",
    label: "with email signup",
    prompt:
      "Build a waitlist page with email signup and a social proof counter",
  },
  {
    title: "A testimonials page",
    label: "with carousel",
    prompt: "Build a testimonials page with a card carousel and star ratings",
  },
  {
    title: "A team page",
    label: "with member cards",
    prompt: "Build a team page with photo cards, roles, and social links",
  },
  {
    title: "A FAQ page",
    label: "with accordion",
    prompt: "Build a FAQ page with collapsible accordion sections",
  },
  {
    title: "A blog landing page",
    label: "with article cards",
    prompt:
      "Build a blog landing page with article cards, categories, and featured posts",
  },
  {
    title: "An event page",
    label: "with RSVP form",
    prompt:
      "Build an event landing page with schedule, speakers, and an RSVP form",
  },
  {
    title: "A restaurant site",
    label: "with menu sections",
    prompt:
      "Build a restaurant website with menu sections, photos, and a contact form",
  },
  {
    title: "A fitness studio site",
    label: "with class schedule",
    prompt:
      "Build a fitness studio website with class schedule and trainer profiles",
  },
  {
    title: "A real estate listing",
    label: "with property cards",
    prompt:
      "Build a real estate listing page with property cards, filters, and a map",
  },

  // ── Dashboards & Data ─────────────────────────────────────────
  {
    title: "A weather dashboard",
    label: "with live city search",
    prompt:
      "Build a weather dashboard that lets me search cities and see forecasts",
  },
  {
    title: "An analytics dashboard",
    label: "with charts and KPIs",
    prompt:
      "Build an analytics dashboard with line charts, bar charts, and KPI cards",
  },
  {
    title: "A stock ticker",
    label: "with live price cards",
    prompt:
      "Build a stock ticker dashboard with price cards and sparkline charts",
  },
  {
    title: "A fitness dashboard",
    label: "with workout stats",
    prompt:
      "Build a fitness dashboard that tracks workouts, calories, and progress",
  },
  {
    title: "A project dashboard",
    label: "with status cards",
    prompt:
      "Build a project management dashboard with task counts and status pie chart",
  },
  {
    title: "A social media dashboard",
    label: "with metrics",
    prompt:
      "Build a social media dashboard with follower counts and engagement metrics",
  },
  {
    title: "A server monitoring dashboard",
    label: "with gauges",
    prompt:
      "Build a server monitoring dashboard with CPU, memory, and disk gauges",
  },
  {
    title: "A crypto dashboard",
    label: "with portfolio tracker",
    prompt: "Build a crypto dashboard with portfolio tracker and price charts",
  },
  {
    title: "A sales dashboard",
    label: "with revenue charts",
    prompt:
      "Build a sales dashboard with revenue trends, top products, and conversion rates",
  },
  {
    title: "A student grades dashboard",
    label: "with GPA calculator",
    prompt:
      "Build a student grades dashboard with GPA calculator and course breakdown",
  },

  // ── E-commerce ────────────────────────────────────────────────
  {
    title: "A product catalog",
    label: "with filters and cart",
    prompt:
      "Build a product catalog with category filters, search, and a shopping cart",
  },
  {
    title: "A product page",
    label: "with image gallery",
    prompt:
      "Build a product detail page with image gallery, size selector, and reviews",
  },
  {
    title: "A shopping cart",
    label: "with quantity controls",
    prompt:
      "Build a shopping cart page with quantity controls and order summary",
  },
  {
    title: "A checkout form",
    label: "with validation",
    prompt:
      "Build a multi-step checkout form with address, payment, and confirmation",
  },
  {
    title: "A wishlist page",
    label: "with product cards",
    prompt:
      "Build a wishlist page where users can save and manage favorite products",
  },
  {
    title: "An order tracking page",
    label: "with status timeline",
    prompt:
      "Build an order tracking page with a status timeline and delivery details",
  },

  // ── Social & Community ────────────────────────────────────────
  {
    title: "A chat interface",
    label: "with message bubbles",
    prompt:
      "Build a chat interface with message bubbles, timestamps, and typing indicator",
  },
  {
    title: "A social feed",
    label: "with posts and comments",
    prompt: "Build a social feed with post cards, likes, and a comment section",
  },
  {
    title: "A user profile page",
    label: "with activity feed",
    prompt:
      "Build a user profile page with avatar, bio, stats, and activity feed",
  },
  {
    title: "A forum thread",
    label: "with nested replies",
    prompt: "Build a forum thread view with nested replies and voting",
  },
  {
    title: "A leaderboard",
    label: "with rank badges",
    prompt:
      "Build a leaderboard with rank numbers, avatars, scores, and badges",
  },
  {
    title: "A poll/voting app",
    label: "with results chart",
    prompt:
      "Build a poll app where users can vote and see live results as a bar chart",
  },
  {
    title: "A notifications page",
    label: "with categories",
    prompt:
      "Build a notifications page with read/unread states and category filters",
  },
  {
    title: "A guestbook",
    label: "with message cards",
    prompt:
      "Build a guestbook where visitors can leave messages displayed as cards",
  },

  // ── Games & Fun ───────────────────────────────────────────────
  {
    title: "A tic-tac-toe game",
    label: "with score tracking",
    prompt: "Build a tic-tac-toe game with score tracking and reset",
  },
  {
    title: "A memory card game",
    label: "with flip animations",
    prompt:
      "Build a memory card matching game with flip animations and a timer",
  },
  {
    title: "A snake game",
    label: "with score counter",
    prompt:
      "Build a classic snake game with keyboard controls and a high score counter",
  },
  {
    title: "A typing speed test",
    label: "with WPM counter",
    prompt:
      "Build a typing speed test that measures words per minute and accuracy",
  },
  {
    title: "A quiz app",
    label: "with score and timer",
    prompt:
      "Build a multiple-choice quiz app with a timer, score, and results screen",
  },
  {
    title: "A word scramble game",
    label: "with hints",
    prompt: "Build a word scramble game with hints and a streak counter",
  },
  {
    title: "A wordle clone",
    label: "with keyboard",
    prompt:
      "Build a Wordle clone with an on-screen keyboard and colored tile feedback",
  },
  {
    title: "A 2048 game",
    label: "with swipe controls",
    prompt: "Build a 2048 number puzzle game with keyboard and swipe controls",
  },
  {
    title: "A sudoku puzzle",
    label: "with validation",
    prompt: "Build a sudoku puzzle with input validation and a hint button",
  },
  {
    title: "A dice roller",
    label: "with roll history",
    prompt: "Build a dice roller with customizable dice count and roll history",
  },
  {
    title: "A coin flip app",
    label: "with animation",
    prompt: "Build a coin flip app with a flip animation and streak tracker",
  },
  {
    title: "A rock-paper-scissors game",
    label: "vs. computer",
    prompt:
      "Build a rock-paper-scissors game against the computer with score tracking",
  },
  {
    title: "A minesweeper game",
    label: "with difficulty levels",
    prompt:
      "Build a minesweeper game with beginner, intermediate, and expert modes",
  },
  {
    title: "A simon says game",
    label: "with sound and light",
    prompt:
      "Build a Simon Says memory game with colored buttons and increasing difficulty",
  },
  {
    title: "A trivia game",
    label: "with categories",
    prompt: "Build a trivia game with category selection and a scoreboard",
  },

  // ── Utilities ─────────────────────────────────────────────────
  {
    title: "A calculator",
    label: "with history",
    prompt:
      "Build a calculator with basic and scientific modes and calculation history",
  },
  {
    title: "A unit converter",
    label: "with categories",
    prompt:
      "Build a unit converter for length, weight, temperature, and currency",
  },
  {
    title: "A stopwatch",
    label: "with lap times",
    prompt: "Build a stopwatch with start, stop, lap, and reset buttons",
  },
  {
    title: "A countdown timer",
    label: "with alarm",
    prompt: "Build a countdown timer with custom duration and an alarm sound",
  },
  {
    title: "A password generator",
    label: "with strength meter",
    prompt:
      "Build a password generator with length slider, character options, and strength meter",
  },
  {
    title: "A QR code generator",
    label: "with download",
    prompt:
      "Build a QR code generator that takes a URL and lets you download the image",
  },
  {
    title: "A tip calculator",
    label: "with bill split",
    prompt:
      "Build a tip calculator with bill splitting and custom tip percentage",
  },
  {
    title: "A BMI calculator",
    label: "with chart",
    prompt:
      "Build a BMI calculator with a result chart showing health categories",
  },
  {
    title: "An emoji picker",
    label: "with search",
    prompt:
      "Build an emoji picker with category tabs, search, and copy-on-click",
  },
  {
    title: "A text-to-speech app",
    label: "with voice options",
    prompt: "Build a text-to-speech app with voice selection and speed control",
  },
  {
    title: "A character counter",
    label: "with word stats",
    prompt: "Build a character and word counter with reading time estimate",
  },
  {
    title: "A mortgage calculator",
    label: "with amortization",
    prompt:
      "Build a mortgage calculator with monthly payment and amortization schedule",
  },
  {
    title: "A flashcard app",
    label: "with flip animation",
    prompt:
      "Build a flashcard study app with flip animation and spaced repetition",
  },

  // ── Forms & Auth ──────────────────────────────────────────────
  {
    title: "A login page",
    label: "with social providers",
    prompt:
      "Build a login page with email/password, Google, and GitHub sign-in buttons",
  },
  {
    title: "A signup form",
    label: "with validation",
    prompt:
      "Build a signup form with real-time validation and password strength indicator",
  },
  {
    title: "A multi-step form",
    label: "with progress bar",
    prompt:
      "Build a multi-step form with a progress bar and back/next navigation",
  },
  {
    title: "A survey form",
    label: "with various input types",
    prompt:
      "Build a survey form with radio buttons, checkboxes, sliders, and text areas",
  },
  {
    title: "A contact form",
    label: "with success message",
    prompt:
      "Build a contact form with name, email, message fields, and success confirmation",
  },
  {
    title: "A feedback widget",
    label: "with emoji rating",
    prompt:
      "Build a feedback widget with emoji-based rating and optional comment",
  },
  {
    title: "A settings page",
    label: "with toggle switches",
    prompt:
      "Build a settings page with toggle switches, dropdowns, and save button",
  },
  {
    title: "A file upload form",
    label: "with drag and drop",
    prompt:
      "Build a file upload form with drag and drop, preview, and progress bar",
  },

  // ── Media & Content ───────────────────────────────────────────
  {
    title: "An image gallery",
    label: "with lightbox",
    prompt:
      "Build an image gallery with grid layout and lightbox modal on click",
  },
  {
    title: "A music player",
    label: "with playlist",
    prompt:
      "Build a music player UI with play/pause, progress bar, and playlist sidebar",
  },
  {
    title: "A video player page",
    label: "with controls",
    prompt:
      "Build a video player page with custom controls and a playlist panel",
  },
  {
    title: "A podcast player",
    label: "with episode list",
    prompt:
      "Build a podcast player with episode list, playback speed, and progress",
  },
  {
    title: "A photo editor",
    label: "with filters",
    prompt:
      "Build a photo editor with brightness, contrast, and filter controls",
  },
  {
    title: "A meme generator",
    label: "with text overlay",
    prompt:
      "Build a meme generator with image upload and draggable text overlay",
  },
  {
    title: "A drawing canvas",
    label: "with tools",
    prompt: "Build a drawing canvas with pen, eraser, color picker, and export",
  },
  {
    title: "A wallpaper browser",
    label: "with categories",
    prompt:
      "Build a wallpaper browser with category tabs, search, and download buttons",
  },

  // ── Education ─────────────────────────────────────────────────
  {
    title: "A flashcard deck",
    label: "for language learning",
    prompt:
      "Build a flashcard deck for learning vocabulary with flip cards and progress",
  },
  {
    title: "A periodic table",
    label: "with element details",
    prompt: "Build an interactive periodic table with element details on click",
  },
  {
    title: "A math practice app",
    label: "with random problems",
    prompt:
      "Build a math practice app that generates random problems and checks answers",
  },
  {
    title: "A sorting visualizer",
    label: "with animations",
    prompt:
      "Build a sorting algorithm visualizer with step-by-step animation controls",
  },
  {
    title: "A typing tutor",
    label: "with lessons",
    prompt:
      "Build a typing tutor with lessons, accuracy tracking, and WPM stats",
  },
  {
    title: "A world map quiz",
    label: "with country names",
    prompt:
      "Build a world map quiz that tests knowledge of country names and capitals",
  },
  {
    title: "A multiplication table",
    label: "with practice mode",
    prompt:
      "Build an interactive multiplication table with a timed practice mode",
  },
  {
    title: "A binary converter",
    label: "with step-by-step",
    prompt:
      "Build a binary-to-decimal converter that shows the step-by-step conversion",
  },

  // ── Health & Lifestyle ────────────────────────────────────────
  {
    title: "A meal planner",
    label: "with weekly calendar",
    prompt:
      "Build a meal planner with a weekly calendar and grocery list generator",
  },
  {
    title: "A water intake tracker",
    label: "with daily goal",
    prompt: "Build a water intake tracker with a daily goal and progress ring",
  },
  {
    title: "A workout log",
    label: "with exercise library",
    prompt:
      "Build a workout log with exercise library, sets/reps tracking, and history",
  },
  {
    title: "A sleep tracker",
    label: "with quality chart",
    prompt:
      "Build a sleep tracker with bedtime logging and a weekly quality chart",
  },
  {
    title: "A meditation timer",
    label: "with ambient sounds",
    prompt:
      "Build a meditation timer with session length picker and calming UI",
  },
  {
    title: "A calorie counter",
    label: "with food search",
    prompt: "Build a calorie counter with food search and daily intake chart",
  },
  {
    title: "A medication reminder",
    label: "with schedule",
    prompt:
      "Build a medication reminder with schedule, dosage, and check-off list",
  },
  {
    title: "A plant care tracker",
    label: "with watering schedule",
    prompt:
      "Build a plant care tracker with plant profiles and watering schedule",
  },

  // ── Travel & Location ─────────────────────────────────────────
  {
    title: "A trip planner",
    label: "with itinerary builder",
    prompt:
      "Build a trip planner with day-by-day itinerary and a packing checklist",
  },
  {
    title: "A flight status tracker",
    label: "with search",
    prompt:
      "Build a flight status tracker with search by flight number and departure board",
  },
  {
    title: "A currency converter",
    label: "with live rates",
    prompt: "Build a currency converter with flag icons and formatted amounts",
  },
  {
    title: "A city guide",
    label: "with place cards",
    prompt:
      "Build a city guide with categorized place cards, ratings, and photos",
  },
  {
    title: "A road trip planner",
    label: "with stops list",
    prompt:
      "Build a road trip planner with a list of stops, distances, and travel time",
  },

  // ── Miscellaneous ─────────────────────────────────────────────
  {
    title: "A birthday countdown",
    label: "with confetti",
    prompt:
      "Build a birthday countdown page with days remaining and confetti animation",
  },
  {
    title: "A decision wheel",
    label: "with spin animation",
    prompt:
      "Build a spinning decision wheel where you add options and spin to choose",
  },
  {
    title: "A random name picker",
    label: "with animation",
    prompt: "Build a random name picker with a slot-machine style animation",
  },
  {
    title: "A mood board",
    label: "with image grid",
    prompt:
      "Build a mood board with image upload, text notes, and color swatches",
  },
  {
    title: "A newsletter signup",
    label: "with animation",
    prompt:
      "Build a newsletter signup component with email validation and success animation",
  },
  {
    title: "A dark mode toggle demo",
    label: "with transitions",
    prompt:
      "Build a page that showcases a smooth dark/light mode toggle with transitions",
  },
  {
    title: "A scroll progress indicator",
    label: "with sections",
    prompt:
      "Build a page with a scroll progress indicator bar and section navigation",
  },
  {
    title: "A 404 error page",
    label: "with fun illustration",
    prompt:
      "Build a creative 404 error page with an illustration and a home link",
  },
  {
    title: "An elevator pitch page",
    label: "with animations",
    prompt: "Build a one-page elevator pitch with scroll-triggered animations",
  },
  {
    title: "A thank you page",
    label: "with confetti",
    prompt:
      "Build a thank you page with a confetti animation and summary details",
  },
  {
    title: "A cookie consent banner",
    label: "with preferences",
    prompt:
      "Build a cookie consent banner with accept, reject, and preference options",
  },
  {
    title: "A command palette",
    label: "with keyboard nav",
    prompt:
      "Build a command palette modal with fuzzy search and keyboard navigation",
  },
  {
    title: "A toast notification system",
    label: "with types",
    prompt:
      "Build a toast notification demo with success, error, warning, and info types",
  },
  {
    title: "An onboarding flow",
    label: "with step carousel",
    prompt:
      "Build an onboarding flow with a step carousel, illustrations, and skip button",
  },
  {
    title: "A breadcrumb nav",
    label: "with dropdown",
    prompt:
      "Build a breadcrumb navigation component with dropdown menus for long paths",
  },
  {
    title: "A file explorer",
    label: "with tree view",
    prompt:
      "Build a file explorer with a tree view, icons, and expand/collapse",
  },
  {
    title: "A drag-and-drop list",
    label: "with reorder",
    prompt:
      "Build a sortable list with smooth drag-and-drop reordering animations",
  },
  {
    title: "A star rating component",
    label: "with hover preview",
    prompt: "Build a star rating component with hover preview and click to set",
  },
  {
    title: "A progress stepper",
    label: "with status icons",
    prompt:
      "Build a progress stepper component with completed, active, and upcoming states",
  },
  {
    title: "A data table",
    label: "with sort and filter",
    prompt: "Build a data table with column sorting, filtering, and pagination",
  },
  {
    title: "A kanban-style task board",
    label: "with drag columns",
    prompt:
      "Build a kanban-style task board with draggable cards between columns",
  },
  {
    title: "A responsive navbar",
    label: "with mobile menu",
    prompt:
      "Build a responsive navbar with logo, links, and a hamburger menu on mobile",
  },
  {
    title: "A sticky sidebar layout",
    label: "with scroll spy",
    prompt:
      "Build a documentation layout with sticky sidebar and scroll-spy navigation",
  },
  {
    title: "A masonry grid",
    label: "with image cards",
    prompt: "Build a masonry grid layout with differently sized image cards",
  },
  {
    title: "An infinite scroll feed",
    label: "with loading skeleton",
    prompt: "Build an infinite scroll feed with loading skeleton cards",
  },
  {
    title: "A tag input",
    label: "with autocomplete",
    prompt:
      "Build a tag input component with autocomplete suggestions and remove buttons",
  },
  {
    title: "A date picker",
    label: "with range selection",
    prompt:
      "Build a date picker component with single date and range selection modes",
  },
  {
    title: "A theme customizer",
    label: "with live preview",
    prompt:
      "Build a theme customizer panel with color pickers and live preview",
  },
  {
    title: "An accordion FAQ",
    label: "with smooth animation",
    prompt:
      "Build an accordion component with smooth expand/collapse animations",
  },
  {
    title: "A comparison slider",
    label: "with before/after",
    prompt:
      "Build a before/after image comparison slider with a draggable divider",
  },
  {
    title: "A pricing calculator",
    label: "with sliders",
    prompt:
      "Build a pricing calculator with usage sliders and real-time cost estimate",
  },
  {
    title: "A feature flag dashboard",
    label: "with toggles",
    prompt:
      "Build a feature flag dashboard with toggle switches and environment tabs",
  },
  {
    title: "An API key manager",
    label: "with copy and revoke",
    prompt:
      "Build an API key manager with create, copy, and revoke functionality",
  },
  {
    title: "A webhook tester",
    label: "with request log",
    prompt:
      "Build a webhook testing page with a unique URL and incoming request log",
  },
  {
    title: "A font preview tool",
    label: "with Google Fonts",
    prompt:
      "Build a font preview tool that lets you browse and compare Google Fonts",
  },
  {
    title: "A CSS box model visualizer",
    label: "with live controls",
    prompt:
      "Build a CSS box model visualizer with sliders for margin, border, and padding",
  },
  {
    title: "A gradient mesh background",
    label: "with controls",
    prompt:
      "Build a page with an animated gradient mesh background and color controls",
  },
  {
    title: "A clock widget",
    label: "with time zones",
    prompt:
      "Build a clock widget showing multiple time zones with analog and digital display",
  },
  {
    title: "A weather widget",
    label: "with icons",
    prompt:
      "Build a compact weather widget with temperature, condition icons, and forecast",
  },
  {
    title: "A GitHub profile card",
    label: "with repos",
    prompt:
      "Build a GitHub-style profile card with avatar, bio, stats, and top repos",
  },
  {
    title: "A Spotify-style player",
    label: "with album art",
    prompt:
      "Build a Spotify-style music player card with album art and playback controls",
  },
  {
    title: "A Twitter/X clone",
    label: "with tweet composer",
    prompt:
      "Build a Twitter/X-style feed with tweet composer, like, and retweet buttons",
  },
  {
    title: "An invoice generator",
    label: "with PDF export",
    prompt:
      "Build an invoice generator with line items, tax calculation, and print view",
  },
  {
    title: "A resume builder",
    label: "with sections",
    prompt:
      "Build a resume builder with editable sections and a clean print layout",
  },
  {
    title: "A link-in-bio page",
    label: "like Linktree",
    prompt: "Build a link-in-bio page with avatar, links, and social icons",
  },
  {
    title: "A changelog widget",
    label: "with new badge",
    prompt:
      "Build an in-app changelog widget with new/updated badges and dismiss",
  },
  {
    title: "A table of contents",
    label: "with scroll tracking",
    prompt:
      "Build a table of contents sidebar that highlights the current section on scroll",
  },
];

/** Return `count` random suggestions (stable per render via caller's useMemo). */
export function pickRandom(count: number): Suggestion[] {
  const shuffled = [...SUGGESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
