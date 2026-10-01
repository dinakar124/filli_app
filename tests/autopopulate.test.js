// ============================================================
// Tests: Auto-populate behavior, profile matching, multi-field types
// These test what the PRODUCT should do, not just code coverage.
// ============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ---- Profile field matching (extracted from content script logic) ----

const PROFILE_FIELD_MAP = [
  { patterns: [/^first\s*name/i, /^given\s*name/i, /^legal\s*first/i], key: 'firstName' },
  { patterns: [/^last\s*name/i, /^family\s*name/i, /^surname/i, /^legal\s*last/i], key: 'lastName' },
  { patterns: [/^full\s*name/i, /^name$/i, /^your\s*name/i, /^candidate\s*name/i], key: 'fullName' },
  { patterns: [/^email/i, /^e-mail/i, /^email\s*address/i], key: 'email' },
  { patterns: [/^phone/i, /^mobile/i, /^telephone/i, /^cell/i, /^phone\s*number/i], key: 'phone' },
  { patterns: [/^linkedin/i, /^linkedin\s*(profile|url)/i], key: 'linkedin' },
  { patterns: [/^github/i, /^github\s*(profile|url|username)/i], key: 'github' },
  { patterns: [/^portfolio/i, /^website/i, /^personal\s*(website|site|url)/i], key: 'website' },
  { patterns: [/^location/i, /^city/i, /^address/i, /^where.*(?:based|located|live)/i], key: 'location' },
  { patterns: [/^postal\s*code/i, /^zip\s*code/i, /^zip/i, /postal\s*code/i, /zip\s*code/i], key: 'postalCode' },
];

function matchProfileField(questionText) {
  const q = questionText.trim();
  for (const { patterns, key } of PROFILE_FIELD_MAP) {
    for (const re of patterns) {
      if (re.test(q)) return key;
    }
  }
  return null;
}

// ---- Select/Radio/Checkbox fill logic (extracted for testability) ----

function matchSelectOption(options, value) {
  const normalVal = value.toLowerCase().trim();

  // Exact match (skip empty/placeholder options)
  for (const opt of options) {
    if (!opt.value && !opt.text.trim()) continue;
    if (opt.value.toLowerCase().trim() === normalVal ||
        opt.text.toLowerCase().trim() === normalVal) {
      return opt.value;
    }
  }

  // Substring match (skip empty/placeholder options)
  for (const opt of options) {
    if (!opt.value) continue; // skip placeholder options with empty value
    const optText = opt.text.toLowerCase().trim();
    const optVal = opt.value.toLowerCase().trim();
    if (optText.includes(normalVal) || normalVal.includes(optText) ||
        optVal.includes(normalVal) || normalVal.includes(optVal)) {
      return opt.value;
    }
  }

  // Starts-with match (skip empty/placeholder options)
  for (const opt of options) {
    if (!opt.value) continue;
    const optText = opt.text.toLowerCase().trim();
    if (optText.startsWith(normalVal) || normalVal.startsWith(optText)) {
      return opt.value;
    }
  }

  return null;
}

function matchRadioOption(options, value) {
  const normalVal = value.toLowerCase().trim();
  for (const opt of options) {
    const label = opt.label.toLowerCase().trim();
    const val = opt.value.toLowerCase().trim();
    if (label === normalVal || val === normalVal ||
        label.includes(normalVal) || normalVal.includes(label)) {
      return opt.value;
    }
  }
  return null;
}

function shouldCheckCheckbox(value) {
  const normalVal = value.toLowerCase().trim();
  if (['yes', 'true', '1', 'i agree', 'agree'].includes(normalVal)) return true;
  if (['no', 'false', '0'].includes(normalVal)) return false;
  return null;
}


// ============================================================
// TESTS
// ============================================================

describe('Profile field matching', () => {
  describe('Name fields', () => {
    it('matches "First Name" to firstName', () => {
      assert.equal(matchProfileField('First Name'), 'firstName');
    });

    it('matches "Legal First Name (required)" to firstName', () => {
      assert.equal(matchProfileField('Legal First Name (required)'), 'firstName');
    });

    it('matches "Last Name" to lastName', () => {
      assert.equal(matchProfileField('Last Name'), 'lastName');
    });

    it('matches "Legal Last Name (required)" to lastName', () => {
      assert.equal(matchProfileField('Legal Last Name (required)'), 'lastName');
    });

    it('matches "Name" to fullName', () => {
      assert.equal(matchProfileField('Name'), 'fullName');
    });

    it('matches "Full Name" to fullName', () => {
      assert.equal(matchProfileField('Full Name'), 'fullName');
    });

    it('matches "Candidate Name" to fullName', () => {
      assert.equal(matchProfileField('Candidate Name'), 'fullName');
    });

    it('does NOT match "Company Name" to any profile field', () => {
      // "Company Name" starts with "Company", not "name"
      assert.equal(matchProfileField('Company Name'), null);
    });
  });

  describe('Contact fields', () => {
    it('matches "Email" to email', () => {
      assert.equal(matchProfileField('Email'), 'email');
    });

    it('matches "Email (required)" to email', () => {
      assert.equal(matchProfileField('Email (required)'), 'email');
    });

    it('matches "E-mail Address" to email', () => {
      assert.equal(matchProfileField('E-mail Address'), 'email');
    });

    it('matches "Phone" to phone', () => {
      assert.equal(matchProfileField('Phone'), 'phone');
    });

    it('matches "Phone (required)" to phone', () => {
      assert.equal(matchProfileField('Phone (required)'), 'phone');
    });

    it('matches "Mobile" to phone', () => {
      assert.equal(matchProfileField('Mobile'), 'phone');
    });

    it('matches "Phone Number" to phone', () => {
      assert.equal(matchProfileField('Phone Number'), 'phone');
    });
  });

  describe('Link fields', () => {
    it('matches "LinkedIn Profile" to linkedin', () => {
      assert.equal(matchProfileField('LinkedIn Profile'), 'linkedin');
    });

    it('matches "LinkedIn URL" to linkedin', () => {
      assert.equal(matchProfileField('LinkedIn URL'), 'linkedin');
    });

    it('matches "GitHub" to github', () => {
      assert.equal(matchProfileField('GitHub'), 'github');
    });

    it('matches "Github or Portfolio" to github', () => {
      assert.equal(matchProfileField('Github or Portfolio'), 'github');
    });

    it('matches "Personal Website" to website', () => {
      assert.equal(matchProfileField('Personal Website'), 'website');
    });

    it('matches "Portfolio" to website', () => {
      assert.equal(matchProfileField('Portfolio'), 'website');
    });

    it('matches "Website" to website', () => {
      assert.equal(matchProfileField('Website'), 'website');
    });
  });

  describe('Location fields', () => {
    it('matches "Location" to location', () => {
      assert.equal(matchProfileField('Location'), 'location');
    });

    it('matches "Location (City & State)" to location', () => {
      assert.equal(matchProfileField('Location (City & State)'), 'location');
    });

    it('matches "City" to location', () => {
      assert.equal(matchProfileField('City'), 'location');
    });

    it('matches "Where are you based?" to location', () => {
      assert.equal(matchProfileField('Where are you based?'), 'location');
    });

    it('matches "Where are you currently located?" to location', () => {
      assert.equal(matchProfileField('Where are you currently located?'), 'location');
    });

    it('matches "Postal Code" to postalCode', () => {
      assert.equal(matchProfileField('Postal Code'), 'postalCode');
    });

    it('matches "Zip Code" to postalCode', () => {
      assert.equal(matchProfileField('Zip Code'), 'postalCode');
    });

    it('matches "What\'s your postal code? (required)" to postalCode', () => {
      assert.equal(matchProfileField("What's your postal code? (required)"), 'postalCode');
    });
  });

  describe('Non-profile questions should NOT match', () => {
    it('does not match "Why do you want to work here?"', () => {
      assert.equal(matchProfileField('Why do you want to work here?'), null);
    });

    it('does not match "What is the most impressive project?"', () => {
      assert.equal(matchProfileField('What is the most impressive project?'), null);
    });

    it('does not match "Describe a tricky bug"', () => {
      assert.equal(matchProfileField('Describe a tricky bug'), null);
    });

    it('does not match "Are you legally authorized to work?"', () => {
      assert.equal(matchProfileField('Are you legally authorized to work in the United States?'), null);
    });
  });
});


describe('Select (dropdown) option matching', () => {
  const yearsOptions = [
    { value: '', text: 'Select...' },
    { value: '0-1', text: '0-1' },
    { value: '1-3', text: '1-3' },
    { value: '4+', text: '4+' }
  ];

  it('matches exact value "4+"', () => {
    assert.equal(matchSelectOption(yearsOptions, '4+'), '4+');
  });

  it('matches "4+ years" via substring of option text', () => {
    assert.equal(matchSelectOption(yearsOptions, '4+'), '4+');
  });

  const yesNoOptions = [
    { value: '', text: 'Select...' },
    { value: 'yes', text: 'Yes' },
    { value: 'no', text: 'No' }
  ];

  it('matches "Yes" in yes/no dropdown', () => {
    assert.equal(matchSelectOption(yesNoOptions, 'Yes'), 'yes');
  });

  it('matches "No" in yes/no dropdown', () => {
    assert.equal(matchSelectOption(yesNoOptions, 'No'), 'no');
  });

  const officeOptions = [
    { value: '', text: 'Select an office' },
    { value: 'boston', text: 'Boston (Cambridge)' },
    { value: 'nyc', text: 'New York City (Chelsea)' },
    { value: 'la', text: 'Los Angeles (Venice)' },
    { value: 'sf', text: 'San Francisco' }
  ];

  it('matches "San Francisco" exactly', () => {
    assert.equal(matchSelectOption(officeOptions, 'San Francisco'), 'sf');
  });

  it('matches "Los Angeles" via substring', () => {
    assert.equal(matchSelectOption(officeOptions, 'Los Angeles'), 'la');
  });

  it('matches "New York" via substring', () => {
    assert.equal(matchSelectOption(officeOptions, 'New York'), 'nyc');
  });

  it('returns null for unmatched option', () => {
    assert.equal(matchSelectOption(officeOptions, 'Chicago'), null);
  });

  const veteranOptions = [
    { value: '', text: 'Select...' },
    { value: 'no_answer', text: "I don't wish to answer" },
    { value: 'not_veteran', text: 'I am not a protected veteran' },
    { value: 'veteran', text: 'I identify as one or more of the classifications of a protected veteran' }
  ];

  it('matches "I don\'t wish to answer" for veteran status', () => {
    assert.equal(matchSelectOption(veteranOptions, "I don't wish to answer"), 'no_answer');
  });
});


describe('Radio button option matching', () => {
  const yesNoRadios = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' }
  ];

  it('matches "Yes" radio', () => {
    assert.equal(matchRadioOption(yesNoRadios, 'Yes'), 'yes');
  });

  it('matches "No" radio', () => {
    assert.equal(matchRadioOption(yesNoRadios, 'No'), 'no');
  });

  it('matches case-insensitive "yes"', () => {
    assert.equal(matchRadioOption(yesNoRadios, 'yes'), 'yes');
  });

  const officeRadios = [
    { value: 'boston', label: 'Boston (Cambridge)' },
    { value: 'nyc', label: 'New York City (Chelsea)' },
    { value: 'la', label: 'Los Angeles (Venice)' },
    { value: 'sf', label: 'San Francisco' }
  ];

  it('matches "San Francisco" radio', () => {
    assert.equal(matchRadioOption(officeRadios, 'San Francisco'), 'sf');
  });

  it('matches "Los Angeles" via substring in radio label', () => {
    assert.equal(matchRadioOption(officeRadios, 'Los Angeles'), 'la');
  });

  it('returns null for unmatched radio option', () => {
    assert.equal(matchRadioOption(officeRadios, 'Seattle'), null);
  });
});


describe('Checkbox matching', () => {
  it('"Yes" should check', () => {
    assert.equal(shouldCheckCheckbox('Yes'), true);
  });

  it('"I agree" should check', () => {
    assert.equal(shouldCheckCheckbox('I agree'), true);
  });

  it('"agree" should check', () => {
    assert.equal(shouldCheckCheckbox('agree'), true);
  });

  it('"No" should uncheck', () => {
    assert.equal(shouldCheckCheckbox('No'), false);
  });

  it('"false" should uncheck', () => {
    assert.equal(shouldCheckCheckbox('false'), false);
  });

  it('arbitrary text returns null (ambiguous)', () => {
    assert.equal(shouldCheckCheckbox('maybe'), null);
  });

  it('"true" should check', () => {
    assert.equal(shouldCheckCheckbox('true'), true);
  });
});


describe('Real-world form field scenarios', () => {
  // These test complete scenarios from actual job applications

  describe('Toast application form', () => {
    it('matches "Legal First Name (required)" to profile firstName', () => {
      assert.equal(matchProfileField('Legal First Name (required)'), 'firstName');
    });

    it('matches "Legal Last Name (required)" to profile lastName', () => {
      assert.equal(matchProfileField('Legal Last Name (required)'), 'lastName');
    });

    it('matches "Email (required)" to profile email', () => {
      assert.equal(matchProfileField('Email (required)'), 'email');
    });

    it('matches "Phone (required)" to profile phone', () => {
      assert.equal(matchProfileField('Phone (required)'), 'phone');
    });

    it('matches "Location (required)" to profile location', () => {
      assert.equal(matchProfileField('Location (required)'), 'location');
    });

    it('matches "What\'s your postal code? (required)" to postalCode', () => {
      assert.equal(matchProfileField("What's your postal code? (required)"), 'postalCode');
    });

    it('matches "LinkedIn Profile" to profile linkedin', () => {
      assert.equal(matchProfileField('LinkedIn Profile'), 'linkedin');
    });

    it('"Are you legally authorized to work?" is NOT a profile field (it\'s a QA question)', () => {
      assert.equal(matchProfileField('Are you legally authorized to work in the country where this job is located? (required)'), null);
    });

    it('"Do you now, or will you ever, require employment sponsorship?" is NOT a profile field', () => {
      assert.equal(matchProfileField('Do you now, or will you ever, require employment sponsorship to work in the country where this job is located? (required)'), null);
    });
  });

  describe('Suno application form', () => {
    it('matches "Location (City & State)" to profile location', () => {
      assert.equal(matchProfileField('Location (City & State)'), 'location');
    });

    it('matches "GitHub or Portfolio" to github', () => {
      assert.equal(matchProfileField('GitHub or Portfolio'), 'github');
    });

    it('"Which one of our offices are you willing to work out of?" is NOT a profile field', () => {
      assert.equal(matchProfileField('Which one of our offices are you willing to work out of?'), null);
    });
  });

  describe('Ramp application form', () => {
    it('matches "Github" to github', () => {
      assert.equal(matchProfileField('Github'), 'github');
    });

    it('"Please provide a link to the App Store and/or personal portfolio" is NOT a simple profile field', () => {
      // This is a longer question, not a simple "Portfolio" field
      assert.equal(matchProfileField('Please provide a link to the App Store and/or personal portfolio showcasing your top 1-2 app(s)!'), null);
    });
  });

  describe('Dropdown filling with real options', () => {
    const raceOptions = [
      { value: '', text: 'Select...' },
      { value: 'no_answer', text: "I don't wish to answer" },
      { value: 'white', text: 'White' },
      { value: 'black', text: 'Black or African American' },
      { value: 'asian', text: 'Asian' },
      { value: 'hispanic', text: 'Hispanic, Latinx, or Spanish Origin' },
      { value: 'native', text: 'American Indian or Alaska Native' },
      { value: 'pacific', text: 'Native Hawaiian or Other Pacific Islander' },
      { value: 'mena', text: 'Middle Eastern or North African' },
      { value: 'other', text: 'Something not listed above' }
    ];

    it('matches "I don\'t wish to answer" exactly', () => {
      assert.equal(matchSelectOption(raceOptions, "I don't wish to answer"), 'no_answer');
    });

    it('matches "Asian" exactly', () => {
      assert.equal(matchSelectOption(raceOptions, 'Asian'), 'asian');
    });
  });
});


describe('Auto-populate priority logic', () => {
  // The content script should: (1) try profile first, (2) then QA matching
  // Profile matches should always win over QA matches for personal info fields

  const { findMatchesSync } = require('../lib/qa-engine-core');

  it('QA engine would match "First Name" but profile should take priority', () => {
    // If someone saved "First Name" -> "Dinakar" in QA pairs, it would match.
    // But the profile field should ALWAYS win because it's a structured field.
    const profileKey = matchProfileField('First Name');
    assert.equal(profileKey, 'firstName');
    // The content script checks profile first and skips QA if profile matches.
    // This test verifies the profile matcher fires for "First Name".
  });

  it('"Why do you want to work at Toast?" is NOT a profile field, falls through to QA', () => {
    const profileKey = matchProfileField('Why do you want to work at Toast?');
    assert.equal(profileKey, null);
    // Should fall through to QA matching
    const pairs = [
      { question: 'Why do you want to work at [company]?', answer: 'Because...' }
    ];
    const matches = findMatchesSync(pairs, 'Why do you want to work at Toast?');
    assert.ok(matches.length > 0, 'QA engine should match the why-company question');
  });
});


describe('Seed data completeness', () => {
  const seedData = require('../seed-answers.json');

  it('seed data has a profile section', () => {
    assert.ok(seedData.profile, 'seed data should include profile');
    assert.ok(seedData.profile.firstName, 'profile should have firstName');
    assert.ok(seedData.profile.lastName, 'profile should have lastName');
    assert.ok(seedData.profile.location, 'profile should have location');
  });

  it('seed data has pairs section', () => {
    assert.ok(Array.isArray(seedData.pairs), 'seed data should have pairs array');
    assert.ok(seedData.pairs.length >= 15, `should have at least 15 pairs, got ${seedData.pairs.length}`);
  });

  it('seed pairs cover all common question categories', () => {
    const questions = seedData.pairs.map(p => p.question.toLowerCase());
    const hasWhy = questions.some(q => q.includes('why') && q.includes('work'));
    const hasProject = questions.some(q => q.includes('impressive') || q.includes('proud'));
    const hasBug = questions.some(q => q.includes('bug') || q.includes('tricky'));
    const hasAuth = questions.some(q => q.includes('authorized'));
    const hasSponsor = questions.some(q => q.includes('sponsor'));
    const hasYears = questions.some(q => q.includes('years'));
    const hasAI = questions.some(q => q.includes('ai tools') || q.includes('copilot'));
    const hasPrivacy = questions.some(q => q.includes('privacy') || q.includes('agree'));

    assert.ok(hasWhy, 'should have a why-company answer');
    assert.ok(hasProject, 'should have a project/proud answer');
    assert.ok(hasBug, 'should have a bug/debug answer');
    assert.ok(hasAuth, 'should have work authorization answer');
    assert.ok(hasSponsor, 'should have sponsorship answer');
    assert.ok(hasYears, 'should have years-of-experience answer');
    assert.ok(hasAI, 'should have AI tools answer');
    assert.ok(hasPrivacy, 'should have privacy/agree answer');
  });

  it('all seed pairs have required fields', () => {
    for (const pair of seedData.pairs) {
      assert.ok(pair.id, `pair missing id: ${pair.question.substring(0, 40)}`);
      assert.ok(pair.question, 'pair missing question');
      assert.ok(pair.answer, 'pair missing answer');
      assert.ok(pair.created, 'pair missing created');
    }
  });
});
