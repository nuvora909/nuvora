import { html, accent } from '../lib/html.mjs';
import { icon } from '../lib/icons.mjs';
import { page, pageHead } from '../lib/layout.mjs';
import { finder, faqList } from '../lib/components.mjs';
import { breadcrumbList, faqPage } from '../lib/schema.mjs';

const FAQ = [
  ['Is the match score a prediction of how I will do?', 'No. It is calculated from your answers with fixed rules: how well a program fits your goal (up to 40 points), your background (25), the prerequisites (15) and your weekly time (20). Open â€œHow this score is calculatedâ€ under your result to see every point.'],
  ['Why does it ask about a bachelorâ€™s degree?', 'Only when a masterâ€™s-level program is your best fit, because those programs need a bachelorâ€™s degree in any field. If you do not have one, we never recommend them.'],
  ['What happens to my answers?', 'They stay in this browser tab. Nothing is sent to Nuvora unless you request a seat and choose to include your saved plan. If you tick â€œSave my plan on this deviceâ€, your answers and match are kept in this browser for 90 days so the site can show your match; â€œForget my planâ€ removes them.'],
  ['Can I change my answers?', 'Yes. Use Back to change one answer, or Start over.'],
];

const body = () => html`
${pageHead({ eyebrow: 'Find my program', title: accent('Find the program that fits *you*'), lede: 'Four quick questions about you, your goal and your time. You get a match with the reasons, then your term-by-term learning path with dates and costs.', crumbs: [['/', 'Home'], ['/find-your-program/', 'Find my program']] })}
<section class="sec" aria-labelledby="finder-title">
  <h2 class="sr-only" id="finder-title">Your answers and how matching works</h2>
  <div class="wrap split" style="align-items:start">
    <div class="stack" style="gap:16px">
      ${finder({ id: 'finder' })}
      <div class="box">
        <label class="check"><input type="checkbox" data-save-plan><span>Save my plan on this device for 90 days, so the site can highlight my match.</span></label>
        <div class="row"><button class="btn ghost sm" type="button" data-forget-plan>Forget my plan</button><a class="small" style="display:inline-flex;align-items:center;min-height:44px" href="/legal/privacy/#on-device">What is stored</a></div>
      </div>
    </div>
    <div class="stack" style="gap:16px">
      <div class="box"><h3>${icon('target')} How matching works</h3>
        <p class="muted">Every program is scored out of 100 from your answers, using the same published rules for everyone:</p>
        <ul class="ticks">
          <li>${icon('check')}<span><b>Goal fit, up to 40:</b> how directly the program serves the goal you chose.</span></li>
          <li>${icon('check')}<span><b>Background, up to 25:</b> how well it suits where you are starting from.</span></li>
          <li>${icon('check')}<span><b>Prerequisites, up to 15:</b> whether you have the coding the program expects.</span></li>
          <li>${icon('check')}<span><b>Weekly time, up to 20:</b> whether your hours cover the programâ€™s workload.</span></li>
        </ul>
        <p class="small muted">Masterâ€™s-level programs are never suggested to someone without a bachelorâ€™s degree. If you have not coded yet, the programs that teach Python from the start always come first.</p></div>
      <div class="box"><h3>${icon('lock')} Private by default</h3><p class="muted">Your answers stay in this browser. Nothing is sent to Nuvora unless you request a seat and choose to include your saved plan.</p></div>
    </div>
  </div>
</section>
<section class="sec tinted" id="path" aria-label="Your learning path" hidden>
  <div class="wrap" data-path></div>
</section>
<section class="sec" aria-labelledby="ffaq"><div class="wrap">
  <h2 id="ffaq" style="margin-bottom:20px">${accent('About the *match*')}</h2>
  ${faqList(FAQ)}
</div></section>`;

export default function find() {
  return [{
    path: '/find-your-program/',
    html: page({
      path: '/find-your-program/',
      title: 'Find my program: a 4-question program match',
      description: 'Answer four questions about your background, goal and weekly time to get a matched Nuvora program, the reasons for it and a term-by-term learning path.',
      body: body(),
      schema: [breadcrumbList([['/', 'Home'], ['/find-your-program/', 'Find my program']]), faqPage(FAQ)],
      scripts: ['/js/find.js'],
    }),
  }];
}
