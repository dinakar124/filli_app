// ============================================================
// Tests: Normalization & Term Extraction
//
// These are the building blocks of matching. If normalization
// strips the wrong things or keeps the wrong things, matching
// breaks in ways that are hard to debug from the matching
// tests alone.
// ============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalize, extractTerms, extractPhrases, levenshtein, charSim
} = require('../lib/qa-engine-core.js');


describe('normalize -- text cleaning', () => {

  it('lowercases everything', () => {
    assert.equal(normalize('Why Do You Want THIS Job?'), 'why do you want this job');
  });

  it('replaces punctuation with spaces', () => {
    assert.equal(normalize("What's your proudest feature?"), 'what s your proudest feature');
  });

  it('collapses multiple spaces', () => {
    assert.equal(normalize('tell  me   about    a   bug'), 'tell me about a bug');
  });

  it('trims leading/trailing whitespace', () => {
    assert.equal(normalize('  hello world  '), 'hello world');
  });

  it('handles empty string', () => {
    assert.equal(normalize(''), '');
  });

  it('handles emoji and unicode', () => {
    // real job forms sometimes have emoji in labels
    const result = normalize('🚀 Why join us?');
    assert.ok(!result.includes('🚀'), 'emoji should be stripped');
    assert.ok(result.includes('why join us'), `should keep the words: "${result}"`);
  });

  it('handles newlines and tabs (from pasted text)', () => {
    assert.equal(normalize('line one\nline two\ttab'), 'line one line two tab');
  });
});


describe('extractTerms -- stop word removal', () => {

  it('removes common stop words', () => {
    const terms = extractTerms('Why do you want to work at this company?');
    assert.ok(!terms.includes('why'));
    assert.ok(!terms.includes('you'));
    assert.ok(!terms.includes('want'));
    assert.ok(!terms.includes('want'), '"want" should be a stop word');
    assert.ok(terms.includes('work') || terms.includes('company'),
      'should keep meaningful words');
  });

  it('removes question-specific stop words (tell, describe, explain, share)', () => {
    const terms = extractTerms('Tell us about a tricky bug');
    assert.ok(!terms.includes('tell'));
    assert.ok(terms.includes('tricky'));
    assert.ok(terms.includes('bug'));
  });

  it('keeps domain-relevant short words that happen to be 3+ chars', () => {
    const terms = extractTerms('What is your experience with AI and React?');
    // "AI" is 2 chars, gets filtered by length. That's a known limitation.
    assert.ok(terms.includes('experience'));
    assert.ok(terms.includes('react'));
  });

  it('filters words shorter than 3 characters', () => {
    const terms = extractTerms('I am a QA at ML');
    // all are <= 2 chars after stop removal
    assert.equal(terms.length, 0, 'very short words should be filtered');
  });

  it('handles an empty string', () => {
    assert.deepEqual(extractTerms(''), []);
  });

  it('handles a string of only stop words', () => {
    assert.deepEqual(extractTerms('the is a an of to in for'), []);
  });
});


describe('extractPhrases -- bigram + domain keyword extraction', () => {

  it('extracts consecutive term pairs as bigrams', () => {
    const phrases = extractPhrases('tricky production bug');
    assert.ok(phrases.includes('tricky production'));
    assert.ok(phrases.includes('production bug'));
  });

  it('extracts domain keywords as standalone phrases', () => {
    const phrases = extractPhrases('What is your experience with Android development?');
    assert.ok(phrases.includes('android'), 'android is a domain keyword');
    assert.ok(phrases.includes('developer') || phrases.includes('experience'),
      'should include at least one domain term');
  });

  it('returns empty for a string with no extractable terms', () => {
    const phrases = extractPhrases('the is a');
    assert.deepEqual(phrases, []);
  });
});


describe('levenshtein -- edit distance correctness', () => {

  it('identical strings have distance 0', () => {
    assert.equal(levenshtein('hello', 'hello'), 0);
  });

  it('one insertion', () => {
    assert.equal(levenshtein('cat', 'cats'), 1);
  });

  it('one deletion', () => {
    assert.equal(levenshtein('cats', 'cat'), 1);
  });

  it('one substitution', () => {
    assert.equal(levenshtein('cat', 'car'), 1);
  });

  it('empty vs non-empty', () => {
    assert.equal(levenshtein('', 'hello'), 5);
    assert.equal(levenshtein('hello', ''), 5);
  });

  it('both empty', () => {
    assert.equal(levenshtein('', ''), 0);
  });

  it('completely different strings', () => {
    assert.equal(levenshtein('abc', 'xyz'), 3);
  });
});


describe('charSim -- character-level similarity', () => {

  it('identical strings return 1.0', () => {
    assert.equal(charSim('hello', 'hello'), 1);
  });

  it('empty strings return 1.0 (both are identical nothings)', () => {
    assert.equal(charSim('', ''), 1);
  });

  it('completely different short strings return near 0', () => {
    const s = charSim('abc', 'xyz');
    assert.ok(s === 0, `should be 0 for fully different strings, got ${s}`);
  });

  it('one typo in a long string scores high', () => {
    const s = charSim(
      'why do you want to work at this company',
      'why do you want to work at this compay'  // typo: compay
    );
    assert.ok(s > 0.9, `one typo should barely dent similarity: ${s}`);
  });
});
