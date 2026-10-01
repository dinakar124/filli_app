// ============================================================
// Tests: Question Categorization
//
// The categorizer determines what TYPE of question is being
// asked (why-company, tricky-bug, work-auth, etc.). This
// drives future features like category-based filtering and
// smart answer suggestions.
//
// If categorization is wrong: the product would suggest
// your "tricky bug" answer for a "why this company" question.
// ============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { categorizeQuestion } = require('../lib/qa-engine-core.js');


describe('categorizeQuestion -- real application questions', () => {

  // "Why company" variations -- the most common question across all apps
  it('categorizes "Why do you want to work at Discord?" as why_company', () => {
    assert.equal(categorizeQuestion('Why do you want to work at Discord?'), 'why_company');
  });

  it('categorizes "Why are you interested in working at Suno?" as why_company', () => {
    assert.equal(categorizeQuestion('Why are you interested in working at Suno?'), 'why_company');
  });

  it('categorizes "Why do you want to join our team?" as why_company', () => {
    assert.equal(categorizeQuestion('Why do you want to join our team?'), 'why_company');
  });

  // Project/achievement questions
  it('categorizes "What is the most impressive project?" as impressive_project', () => {
    assert.equal(
      categorizeQuestion('What is the most impressive project you\'ve worked on?'),
      'impressive_project'
    );
  });

  it('categorizes "What are you most proud of?" as impressive_project', () => {
    assert.equal(
      categorizeQuestion('What work achievement are you most proud of?'),
      'impressive_project'
    );
  });

  // Bug/debugging questions
  it('categorizes "Describe a tricky bug" as tricky_bug', () => {
    assert.equal(
      categorizeQuestion('Describe a tricky bug or production issue you tracked down'),
      'tricky_bug'
    );
  });

  it('categorizes "Tell us about a challenging production issue" as tricky_bug', () => {
    assert.equal(
      categorizeQuestion('Tell us about a challenging production issue'),
      'tricky_bug'
    );
  });

  // Work authorization -- critical to get right (yes/no answers)
  it('categorizes "Are you authorized to work in the US?" as work_authorization', () => {
    assert.equal(
      categorizeQuestion('Are you legally authorized to work in the United States?'),
      'work_authorization'
    );
  });

  it('categorizes "Do you require visa sponsorship?" as work_authorization_sponsorship', () => {
    assert.equal(
      categorizeQuestion('Do you require visa sponsorship?'),
      'work_authorization_sponsorship'
    );
  });

  // Remote/hybrid -- important for filtering
  it('categorizes "Are you willing to work from the office?" as remote_hybrid', () => {
    assert.equal(
      categorizeQuestion('Are you willing to work from the office 3 days a week?'),
      'remote_hybrid'
    );
  });

  it('categorizes "Are you open to relocating?" as remote_hybrid', () => {
    assert.equal(
      categorizeQuestion('Are you open to relocating to San Francisco?'),
      'remote_hybrid'
    );
  });

  // AI tools -- increasingly common
  it('categorizes "Are you familiar with AI coding tools?" as ai_tools', () => {
    assert.equal(
      categorizeQuestion('Are you familiar with or open to using AI tools like Copilot or Cursor?'),
      'ai_tools'
    );
  });

  // Experience
  it('categorizes "How many years of experience?" as experience_years', () => {
    assert.equal(
      categorizeQuestion('How many years of professional software engineering experience do you have?'),
      'experience_years'
    );
  });

  // Education
  it('categorizes "Do you have a Bachelor\'s degree?" as education', () => {
    assert.equal(
      categorizeQuestion('Do you have a Bachelor\'s degree?'),
      'education'
    );
  });

  // Salary
  it('categorizes "What are your salary expectations?" as salary', () => {
    assert.equal(
      categorizeQuestion('What are your salary expectations?'),
      'salary'
    );
  });

  // Technology interest
  it('categorizes "What interesting technology have you discovered?" as technology_interest', () => {
    assert.equal(
      categorizeQuestion('What\'s the most interesting technology you\'ve discovered recently?'),
      'technology_interest'
    );
  });

  // Non-engineers
  it('categorizes "built a feature for non-engineers" as non_engineers', () => {
    assert.equal(
      categorizeQuestion('Tell us about a time you built a feature for non-engineers'),
      'non_engineers'
    );
  });

  // Internal platforms
  it('categorizes "building internal platforms" as internal_platform', () => {
    assert.equal(
      categorizeQuestion('What interests you about building internal platforms?'),
      'internal_platform'
    );
  });

  // Full stack
  it('categorizes "feature you owned end to end" as fullstack_feature', () => {
    assert.equal(
      categorizeQuestion('Walk us through a feature you owned end to end'),
      'fullstack_feature'
    );
  });
});


describe('categorizeQuestion -- fallback behavior', () => {

  it('returns "general" for questions that don\'t match any category', () => {
    assert.equal(
      categorizeQuestion('What is your favorite programming language and why?'),
      'general'
    );
  });

  it('returns "general" for empty string', () => {
    assert.equal(categorizeQuestion(''), 'general');
  });

  it('returns "general" for gibberish', () => {
    assert.equal(categorizeQuestion('asdfghjkl qwerty'), 'general');
  });
});


describe('categorizeQuestion -- ambiguous questions get a reasonable category', () => {

  it('"Tell us about a time you led a team through a difficult bug" matches something', () => {
    const cat = categorizeQuestion(
      'Tell us about a time you led a team through a difficult bug');
    // Could be leadership, tricky_bug, or team_collaboration -- any is reasonable
    assert.ok(
      ['leadership', 'tricky_bug', 'team_collaboration'].includes(cat),
      `ambiguous question should match a reasonable category, got "${cat}"`
    );
  });
});
