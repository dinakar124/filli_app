// ============================================================
// Tests: Edge Cases & Failure Modes
//
// These test the scenarios that break real products:
// - XSS in pasted text
// - giant text fields crashing the matcher
// - unicode/emoji in questions
// - empty/whitespace-only inputs
// - the seed data being importable without errors
// ============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {
  normalize, similarity, findMatchesSync, addPairSync,
  extractTerms, categorizeQuestion
} = require('../lib/qa-engine-core.js');


describe('Edge cases -- empty and degenerate inputs', () => {

  it('similarity of two empty strings is defined (not NaN/crash)', () => {
    const s = similarity('', '');
    assert.ok(Number.isFinite(s), `should be a finite number, got ${s}`);
  });

  it('similarity of empty vs non-empty is defined and low', () => {
    const s = similarity('', 'Why do you want to work here?');
    assert.ok(Number.isFinite(s), `should not be NaN, got ${s}`);
    assert.ok(s < 0.1, `empty vs real question should score near 0, got ${s}`);
  });

  it('findMatchesSync with empty question returns empty (not crash)', () => {
    const pairs = [{ id: '1', question: 'Why company?', answer: 'Because.' }];
    const matches = findMatchesSync(pairs, '');
    assert.ok(Array.isArray(matches));
  });

  it('findMatchesSync with empty pairs returns empty', () => {
    const matches = findMatchesSync([], 'Why do you want this job?');
    assert.deepEqual(matches, []);
  });

  it('addPairSync with whitespace-only question still trims and stores', () => {
    const pairs = [];
    const result = addPairSync(pairs, '  \n\t  ', 'some answer');
    assert.equal(result.entry.question, '', 'should trim to empty');
  });

  it('addPairSync with whitespace-only answer still trims', () => {
    const pairs = [];
    const result = addPairSync(pairs, 'Why this role?', '   \n  ');
    assert.equal(result.entry.answer, '');
  });
});


describe('Edge cases -- very long inputs', () => {

  it('similarity handles very long questions without crashing', () => {
    const longQ = 'Tell us about your experience '.repeat(100);
    const s = similarity(longQ, 'Tell us about your experience');
    assert.ok(Number.isFinite(s));
  });

  it('findMatchesSync handles a pair with a very long answer', () => {
    const pairs = [{
      id: 'long',
      question: 'Tell me about yourself',
      answer: 'A'.repeat(50000)  // 50KB answer
    }];
    const matches = findMatchesSync(pairs, 'Tell me about yourself');
    assert.ok(Array.isArray(matches));
    // should still match based on question, not crash on long answer
  });

  it('extractTerms handles a 10000-word input without hanging', () => {
    const huge = Array.from({ length: 10000 }, (_, i) => `word${i}`).join(' ');
    const start = Date.now();
    const terms = extractTerms(huge);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 5000, `should complete in < 5s, took ${elapsed}ms`);
    assert.ok(terms.length > 0);
  });
});


describe('Edge cases -- special characters and unicode', () => {

  it('handles curly quotes (common in copy-pasted text)', () => {
    const s = similarity(
      'Why do you want to work here\u201D',  // right double quote
      'Why do you want to work here?'
    );
    assert.ok(s > 0.8, `curly quotes should not break matching: ${s}`);
  });

  it('handles em-dashes (common in job descriptions)', () => {
    const s = similarity(
      'What\u2019s your proudest feature \u2014 and why?',
      'What is your proudest feature and why?'
    );
    assert.ok(s > 0.7, `em-dashes should not break matching: ${s}`);
  });

  it('handles HTML entities that might leak from form labels', () => {
    // some ATS forms have &amp; or &nbsp; in their labels
    const terms = extractTerms('Why do you want to work at Ramp&amp;Co?');
    assert.ok(terms.length > 0, 'should extract terms even with HTML entities');
  });

  it('handles accented characters', () => {
    const s = similarity(
      'Décrivez un bug difficile',
      'Describe a difficult bug'
    );
    // these are different languages so low similarity is fine -- 
    // the point is it doesn't crash
    assert.ok(Number.isFinite(s));
  });
});


describe('Edge cases -- XSS vectors in saved answers', () => {

  it('addPairSync stores raw text (escaping is the renderer\'s job)', () => {
    const pairs = [];
    const result = addPairSync(pairs,
      '<script>alert("xss")</script>Why this company?',
      '<img onerror=alert(1) src=x>My answer'
    );
    // the engine stores raw text -- escaping happens at render time
    // in escapeHtml() in the content script. Here we just verify it
    // doesn't crash or mangle the data.
    assert.ok(result.entry.question.includes('<script>'));
    assert.ok(result.entry.answer.includes('<img'));
  });

  it('matching works on XSS-laden questions (doesn\'t break on angle brackets)', () => {
    const pairs = [{
      id: '1',
      question: '<b>Why do you want to work here?</b>',
      answer: 'Because...'
    }];
    const matches = findMatchesSync(pairs, 'Why do you want to work here?');
    assert.ok(matches.length > 0, 'HTML tags should not prevent matching');
  });
});


describe('Seed data integrity', () => {

  it('seed-answers.json is valid JSON', () => {
    const seedPath = path.join(__dirname, '..', 'seed-answers.json');
    const raw = fs.readFileSync(seedPath, 'utf8');
    const data = JSON.parse(raw);
    // supports both old format (array) and new format ({profile, pairs})
    const pairs = Array.isArray(data) ? data : (data.pairs || []);
    assert.ok(Array.isArray(pairs), 'seed file pairs should be a JSON array');
    assert.ok(pairs.length > 0, 'seed file should have at least one entry');
  });

  it('every seed entry has required fields', () => {
    const seedPath = path.join(__dirname, '..', 'seed-answers.json');
    const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const data = Array.isArray(raw) ? raw : (raw.pairs || []);

    for (const entry of data) {
      assert.ok(entry.id, `entry missing id: ${JSON.stringify(entry).slice(0, 80)}`);
      assert.ok(entry.question, `entry missing question: ${entry.id}`);
      assert.ok(entry.answer !== undefined, `entry missing answer: ${entry.id}`);
      assert.ok(entry.created, `entry missing created: ${entry.id}`);
      assert.ok(entry.updated, `entry missing updated: ${entry.id}`);
    }
  });

  it('no duplicate IDs in seed data', () => {
    const seedPath = path.join(__dirname, '..', 'seed-answers.json');
    const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const data = Array.isArray(raw) ? raw : (raw.pairs || []);
    const ids = data.map(e => e.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size,
      `found duplicate IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  });

  it('seed entries are findable by their own question text', () => {
    const seedPath = path.join(__dirname, '..', 'seed-answers.json');
    const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const data = Array.isArray(raw) ? raw : (raw.pairs || []);

    // every seed entry should match itself when queried
    for (const entry of data) {
      if (entry.answer.length <= 3) continue; // skip yes/no answers
      const matches = findMatchesSync(data, entry.question);
      assert.ok(matches.length > 0,
        `seed entry "${entry.id}" should match its own question "${entry.question.slice(0, 50)}"`);
      assert.equal(matches[0].id, entry.id,
        `seed entry "${entry.id}" should be its own top match, got "${matches[0].id}"`);
    }
  });
});


describe('Manifest integrity', () => {

  it('manifest.json is valid JSON', () => {
    const p = path.join(__dirname, '..', 'manifest.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(data.manifest_version, 2);
    assert.ok(data.name);
    assert.ok(data.content_scripts.length > 0);
  });

  it('all files referenced in manifest exist on disk', () => {
    const base = path.join(__dirname, '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));

    // check icons
    for (const icon of Object.values(manifest.icons)) {
      assert.ok(fs.existsSync(path.join(base, icon)),
        `icon file missing: ${icon}`);
    }

    // check background scripts
    for (const script of manifest.background.scripts) {
      assert.ok(fs.existsSync(path.join(base, script)),
        `background script missing: ${script}`);
    }

    // check content scripts
    for (const cs of manifest.content_scripts) {
      for (const js of cs.js) {
        assert.ok(fs.existsSync(path.join(base, js)),
          `content script missing: ${js}`);
      }
      for (const css of cs.css || []) {
        assert.ok(fs.existsSync(path.join(base, css)),
          `content CSS missing: ${css}`);
      }
    }
  });

  it('manifest matches at least Greenhouse, Lever, and Ashby URLs', () => {
    const base = path.join(__dirname, '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
    const patterns = manifest.content_scripts[0].matches;

    // these are the three ATS platforms the product is built for
    const mustMatch = ['greenhouse.io', 'lever.co', 'ashbyhq.com'];
    for (const domain of mustMatch) {
      assert.ok(
        patterns.some(p => p.includes(domain)),
        `manifest must include ${domain} in content_scripts matches`
      );
    }
  });
});
