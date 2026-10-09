// Plain site.js - no imports, no exports
// Just basic variable declarations to test if JS processing works
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];