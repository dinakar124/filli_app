// ============================================================
// Tests: Question Matching -- does the engine actually match
// the right saved answer to the right form question?
//
// This is the core product behavior. If matching is broken,
// users see wrong answers or no answers on application forms.
// ============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  similarity, normalize, findMatchesSync
} = require('../lib/qa-engine-core.js');

// -- Fixture: the answers a real user would have saved --
const SAVED_PAIRS = [
  {
    id: 'why-company', question: 'Why do you want to work at [company]?',
    answer: 'I have 5 years building consumer experiences at Amazon Fire TV...',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 3
  },
  {
    id: 'impressive-project', question: 'What is the most impressive project you\'ve worked on?',
    answer: 'The Fire TV Burton navigation architecture...',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 2
  },
  {
    id: 'tricky-bug', question: 'Describe a tricky bug or production issue you tracked down',
    answer: 'A production crash on Fire TV affecting 60K+ occurrences...',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 1
  },
  {
    id: 'fullstack', question: 'Walk us through a full-stack feature you owned end to end',
    answer: 'The Offers for You personalized recommendation slider at Best Buy...',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 1
  },
  {
    id: 'non-engineers', question: 'Tell us about a time you built a feature for users who weren\'t engineers',
    answer: 'At Amazon Fire TV I built internal diagnostic tooling...',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 1
  },
  {
    id: 'internal-platforms', question: 'What interests you about building internal platforms?',
    answer: 'The leverage and feedback loop...',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 1
  },
  {
    id: 'interesting-tech', question: 'What\'s the most interesting technology you\'ve discovered recently?',
    answer: 'I built a fully automated job scanning pipeline...',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 1
  },
  {
    id: 'auth-us', question: 'Are you legally authorized to work in the United States?',
    answer: 'Yes',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 5
  },
  {
    id: 'sponsorship', question: 'Do you now or will you ever require employment sponsorship?',
    answer: 'No',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 5
  },
  {
    id: 'android-years', question: 'How many years of Android mobile app development experience do you have?',
    answer: '4+ years',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 3
  },
  {
    id: 'proudest-android', question: 'Please share your proudest Android feature in 2-3 sentences',
    answer: 'The Burton navigation architecture on Fire TV...',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 1
  },
  {
    id: 'ai-tools', question: 'Are you familiar with or open to using AI tools?',
    answer: 'Yes -- I actively use AI tools...',
    created: '2026-09-30T00:00:00Z', updated: '2026-09-30T00:00:00Z', useCount: 2
  }
];


describe('Question matching -- same question, different wording', () => {

  it('matches "Why Suno?" to the saved "Why [company]?" template', () => {
    const matches = findMatchesSync(SAVED_PAIRS, 'Why are you interested in working at Suno?');
    assert.ok(matches.length > 0, 'should return at least one match');
    assert.equal(matches[0].id, 'why-company',
      'the "why company" answer should be the top match for any "why [specific company]" question');
  });

  it('matches "What project are you most proud of?" to "impressive project"', () => {
    const matches = findMatchesSync(SAVED_PAIRS, 'What project are you most proud of?');
    const top = matches[0];
    assert.ok(top, 'should match something');
    // should be either impressive-project or proudest-android -- both are valid
    assert.ok(
      top.id === 'impressive-project' || top.id === 'proudest-android',
      `top match should be a project-pride answer, got "${top.id}"`
    );
  });

  it('matches "Tell me about a hard bug you fixed" to "tricky bug"', () => {
    const matches = findMatchesSync(SAVED_PAIRS, 'Tell me about a hard bug you fixed');
    assert.ok(matches.length > 0);
    assert.equal(matches[0].id, 'tricky-bug');
  });

  it('matches "Describe a feature you shipped end-to-end" to "fullstack"', () => {
    const matches = findMatchesSync(SAVED_PAIRS, 'Describe a feature you shipped end-to-end');
    assert.ok(matches.length > 0);
    assert.equal(matches[0].id, 'fullstack');
  });

  it('matches "Do you require visa sponsorship?" to the sponsorship answer', () => {
    const matches = findMatchesSync(SAVED_PAIRS, 'Do you require visa sponsorship to work in the US?');
    assert.ok(matches.length > 0);
    assert.equal(matches[0].id, 'sponsorship');
  });

  it('matches "Are you authorized to work in this country?" to auth answer', () => {
    const matches = findMatchesSync(SAVED_PAIRS, 'Are you authorized to work in this country?');
    assert.ok(matches.length > 0);
    assert.equal(matches[0].id, 'auth-us');
  });

  it('matches "How much Android experience do you have?" to android-years', () => {
    const matches = findMatchesSync(SAVED_PAIRS,
      'How many years of experience do you have with Android development?');
    assert.ok(matches.length > 0);
    assert.equal(matches[0].id, 'android-years');
  });
});


describe('Question matching -- should NOT match unrelated questions', () => {

  it('does not match "What is your salary expectation?" to any saved answer above threshold', () => {
    const matches = findMatchesSync(SAVED_PAIRS, 'What is your salary expectation?');
    // we have no salary answer saved -- matches should be empty or very low score
    if (matches.length > 0) {
      assert.ok(matches[0].score < 0.4,
        `an unrelated question should not score high, got ${matches[0].score} for "${matches[0].id}"`);
    }
  });

  it('does not confuse "bug" question with "feature" question', () => {
    const bugMatches = findMatchesSync(SAVED_PAIRS,
      'Describe a challenging production issue you debugged');
    const featureMatches = findMatchesSync(SAVED_PAIRS,
      'Tell us about a feature you built end-to-end from planning to release');

    assert.notEqual(bugMatches[0]?.id, featureMatches[0]?.id,
      'bug question and feature question should match to different saved answers');
    assert.equal(bugMatches[0]?.id, 'tricky-bug');
    assert.equal(featureMatches[0]?.id, 'fullstack');
  });

  it('does not match "What is your address?" to anything meaningful', () => {
    const matches = findMatchesSync(SAVED_PAIRS, 'What is your home address?');
    if (matches.length > 0) {
      assert.ok(matches[0].score < 0.35,
        'a completely unrelated personal info question should not match saved career answers');
    }
  });
});


describe('Question matching -- ranking quality', () => {

  it('ranks exact re-wordings higher than thematic cousins', () => {
    // "What's your proudest Android feature?" is closest to proudest-android,
    // not to impressive-project (which is also about pride but not Android-specific)
    const matches = findMatchesSync(SAVED_PAIRS,
      'What is your proudest Android feature? What made it challenging?');
    assert.ok(matches.length >= 2);
    assert.equal(matches[0].id, 'proudest-android',
      'the Android-specific pride question should match the Android-specific answer first');
  });

  it('returns at most 5 results even with many partial matches', () => {
    const matches = findMatchesSync(SAVED_PAIRS,
      'Tell us about your experience with technology and projects');
    assert.ok(matches.length <= 5, `should cap at 5 results, got ${matches.length}`);
  });

  it('scores an identical question at 1.0 (or near it)', () => {
    const score = similarity(
      'What is the most impressive project you\'ve worked on?',
      'What is the most impressive project you\'ve worked on?'
    );
    assert.ok(score > 0.95, `identical questions should score ~1.0, got ${score}`);
  });

  it('scores completely unrelated questions near 0', () => {
    const score = similarity(
      'What is your favorite color?',
      'Describe the architecture of a distributed system you built'
    );
    assert.ok(score < 0.15, `unrelated questions should score near 0, got ${score}`);
  });
});


describe('Question matching -- threshold behavior', () => {

  it('filters out matches below the 0.25 default threshold', () => {
    const matches = findMatchesSync(SAVED_PAIRS, 'What color is the sky?');
    for (const m of matches) {
      assert.ok(m.score >= 0.25,
        `match "${m.id}" has score ${m.score} which is below threshold`);
    }
  });

  it('respects a custom higher threshold', () => {
    const looseMatches = findMatchesSync(SAVED_PAIRS,
      'Why do you want this job?', 0.25);
    const strictMatches = findMatchesSync(SAVED_PAIRS,
      'Why do you want this job?', 0.6);
    assert.ok(strictMatches.length <= looseMatches.length,
      'a higher threshold should return fewer or equal results');
  });
});
