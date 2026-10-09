// Demo accounts for the LOCAL development server and automated tests only.
// They exist only in the in-memory database on this computer and are recreated on every start.
// They are never created in the real (Supabase) project. The .test domain is reserved and cannot receive mail.
export const DEMO_PASSWORD = 'nuvora-local-demo-2026';

export const ACCOUNTS = {
  student:      { email: 'maya.student@nuvora.test',     name: 'Maya Patel',     role: 'student' },
  classmate:    { email: 'leo.student@nuvora.test',      name: 'Leo Martins',    role: 'student' },
  nextBatch:    { email: 'sara.student@nuvora.test',     name: 'Sara Kim',       role: 'student' },
  otherProgram: { email: 'omar.student@nuvora.test',     name: 'Omar Haddad',    role: 'student' },
  newcomer:     { email: 'nia.applicant@nuvora.test',    name: 'Nia Brooks',     role: 'student' },
  // Tuition and access situations for the admin area (see server/demo.mjs).
  grace:        { email: 'ines.student@nuvora.test',     name: 'Ines Duarte',    role: 'student' },
  lapsed:       { email: 'kenji.student@nuvora.test',    name: 'Kenji Sato',     role: 'student' },
  stopped:      { email: 'lucas.student@nuvora.test',    name: 'Lucas Moreau',   role: 'student' },
  extended:     { email: 'amara.student@nuvora.test',    name: 'Amara Okafor',   role: 'student' },
  instructor:   { email: 'elena.instructor@nuvora.test', name: 'Elena Ruiz',     role: 'instructor' },
  instructor2:  { email: 'kofi.instructor@nuvora.test',  name: 'Kofi Mensah',    role: 'instructor' },
  admin:        { email: 'admin@nuvora.test',            name: 'Nuvora Admin',   role: 'admin' },
};
