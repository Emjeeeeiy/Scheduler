/* The two legal documents shown on the sign-in screen.

   This is app copy, not shared logic: it describes what this build actually
   does (see README.md → Security, Notable decisions and The Journal), so it
   lives next to the UI that renders it rather than in packages/shared. The
   version is also what is written to the account's profile doc when someone
   accepts, so a future revision is a new version and can be told apart from
   the one they agreed to.

   Not legal advice: have the wording reviewed before publishing. */

export const TERMS_VERSION = '2026-11-23'
export const LAST_UPDATED = '23 November 2026'

export const CONTACT_LINE = 'Questions about these documents: mangamj471@gmail.com.'

export const TERMS_SECTIONS = [
  {
    id: 'about',
    heading: 'About these terms',
    paragraphs: [
      'Cadence is a personal time-blocking planner provided for your own individual use. These terms govern your use of the website, its mobile shell and the optional server features that can be turned on for an account.',
      'By creating an account, or by continuing to use Cadence after registering, you agree to these Terms of Service and to the Privacy Policy. If you do not agree, please do not create an account.',
    ],
  },
  {
    id: 'account',
    heading: 'Your account',
    paragraphs: [
      'Cadence has one private account per person. There is no team, organisation or shared-workspace feature: every view assumes you are looking at your own tasks, events and notes. You may sign in with Google or with an email address and a password.',
      'You are responsible for keeping your credentials safe and for what happens in your account. Do not register using an email address you do not control. Server-side features such as AI suggestions, push reminders and the daily digest become available only after the address on your account has been verified.',
    ],
  },
  {
    id: 'content',
    heading: 'Your content',
    paragraphs: [
      'The tasks, events, tags, saved templates and journal notes you write remain yours. We do not claim ownership of them and do not use them for advertising.',
      'Your content is stored in a private area of a Firebase Firestore database that is accessible only to your account. You can export your data from Settings → Your data, restore a backup, move individual items to the Trash, empty the Trash, or delete your account and its data from Settings → Account.',
    ],
  },
  {
    id: 'use',
    heading: 'Acceptable use',
    paragraphs: [
      'Use Cadence for its intended purpose: planning your own time. Do not try to access another account, bypass the security rules or the rate limits on the AI routes, misuse the optional server features, interfere with the service for anyone else, or use the app to store content you are not allowed to store.',
      'The optional AI planning assistant are tool you choose to enable. When you use them, you are responsible for reviewing what they propose and for the access you grant.',
    ],
  },
  {
    id: 'ai',
    heading: 'AI suggestions',
    paragraphs: [
      'Cadence can use a language model to suggest tags, turn a sentence into a task, plan a day, and read a journal note for things you intend to do. These are suggestions, not facts: the app checks what comes back against your real tags, times and open tasks, but a proposal can still be wrong.',
      'Review proposals before accepting them. AI output is not legal, medical or financial advice, and you should not rely on it as such.',
    ],
  },
  {
    id: 'availability',
    heading: 'Availability and changes',
    paragraphs: [
      'Cadence is provided as it is, with no guarantee of uninterrupted or error-free availability. It can work offline on a device where it has been opened before, but offline data depends on that device and its browser.',
      'Features may change over time. If these terms are revised, people creating an account will be asked to accept the new version; the version and time accepted are recorded on the profile at registration. Keep your own export if you rely on your data.',
    ],
  },
  {
    id: 'contact',
    heading: 'Contact',
    paragraphs: [CONTACT_LINE],
  },
]

export const PRIVACY_SECTIONS = [
  {
    id: 'collect',
    heading: 'What Cadence stores',
    paragraphs: [
      'Your account: the email address Firebase Authentication holds for you, the display name you chose, and a profile photo if you add one.',
      'Your content: task titles, notes, dates, times, durations and completion state; events; tags and their colours; saved templates; focus-session history; and journal notes, including their text, paper and drawings. A record of which version of these documents you accepted, and when, is stored on your profile.',
      'Preferences such as theme, week start, landing view and keyboard shortcuts are kept on the device where you set them; your digest preference and tags are kept on your account.',
    ],
  },
  {
    id: 'where',
    heading: 'Where it lives',
    paragraphs: [
      'Your content is stored in Firebase Firestore under an area identified by your account and is protected by Firestore security rules: only your signed-in account can read or write it. Authentication is handled by Firebase using Google sign-in or an email address and password.',
      'The app keeps a working copy in your browser\'s IndexedDB so it can open instantly and keep working offline. Signing out clears this browser\'s offline copy of your account. Signing out does not by itself delete your data from Firestore.',
    ],
  },
  {
    id: 'ai-data',
    heading: 'What is sent to AI providers',
    paragraphs: [
      'Ask AI sends the conversation, the first word of your display name, your tag names, your free time for the coming week, a sample of recent task titles and your current open tasks to Google Gemini. Events are not sent. Task titles and the text you type into the chat leave your device for this feature; input sizes are capped on the server.',
      'The journal\'s Plan it can propose where your to-dos would go. Your checklist lines are proposed locally without a network call; only when you press the button may the written note (or your selection) be sent, capped at 8,000 characters, with no images, drawings or ticked items. Nothing is sent in the background.',
      'Any other optional connector you configure yourself, such as the MCP endpoint, is a separate way for an AI client you control to reach your own data. Model providers process the information you send under their own terms.',
    ],
  },
  {
    id: 'notifications',
    heading: 'Notifications and email',
    paragraphs: [
      'If you turn on push reminders, the service that delivers them stores the endpoint for this device and the reminder text, which includes task titles. You can turn reminders off at any time in Settings → Notifications or from the sign-in screen after signing out.',
      'If you turn on the daily digest, it is emailed by SendGrid only to the verified address Firebase Authentication holds for you — never to an address typed into your profile — and every message includes an unsubscribe link.',
    ],
  },
  {
    id: 'analytics',
    heading: 'Analytics and advertising',
    paragraphs: [
      'The app does not include analytics or advertising trackers, and it does not sell your data. Ordinary technical logs, such as IP addresses and browser details, may be kept by the hosting and service providers that deliver the website, authentication, database, email and push services, according to their own policies.',
    ],
  },
  {
    id: 'choices',
    heading: 'Your choices',
    paragraphs: [
      'Settings → Your data lets you export a JSON backup and one-way CSV or calendar exports. The Trash holds deleted tasks, events and notes until you empty it. Settings → Account lets you delete your account, which removes your Auth account and the data under your account.',
      'You can turn off push notifications, the daily digest and the optional AI features, clear this browser\'s site data, or stop using the service entirely.',
    ],
  },
  {
    id: 'children',
    heading: 'Children',
    paragraphs: [
      'Cadence is intended for adults managing their own time. It is not directed at children, and you should not create an account if you are below the minimum age required in your country.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes to this policy',
    paragraphs: [
      'This policy will be updated when the app\'s behaviour changes. The version and date at the top of the dialog show which copy you are reading; a new version is presented when an account is created, and the acceptance is recorded on the profile at that point.',
      CONTACT_LINE,
    ],
  },
]
