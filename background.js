// ============================================================
// Job Application Autofill -- Background Script
// Handles QA storage operations from content scripts.
// Uses hybrid intent-classification + lexical matching.
// ============================================================

const STORAGE_KEY = 'autofill_qa_pairs';
const PROFILE_KEY = 'autofill_profile';

// ---- Text normalization ----

function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTerms(text) {
  const stop = new Set([
    'a','an','the','is','are','was','were','be','been','being','have','has',
    'had','do','does','did','will','would','could','should','may','might',
    'shall','can','want','to','of','in','for','on','with','at','by','from','as',
    'into','through','during','before','after','above','below','between',
    'out','off','over','under','again','further','then','once','here',
    'there','when','where','why','how','all','each','every','both','few',
    'more','most','other','some','such','no','nor','not','only','own',
    'same','so','than','too','very','just','because','but','and','or','if',
    'while','about','up','that','this','it','its','what','which','who',
    'whom','your','you','we','us','our','tell','describe','explain','share',
    'please','walk','through','give','provide','me','my','i','am'
  ]);
  return normalize(text).split(' ').filter(w => w.length > 2 && !stop.has(w));
}

// ---- Lexical similarity primitives ----

function jaccardSim(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const inter = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : inter.size / union.size;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function charSim(a, b) {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

function extractPhrases(text) {
  const terms = extractTerms(text);
  const phrases = [];
  for (let i = 0; i < terms.length - 1; i++) phrases.push(terms[i] + ' ' + terms[i+1]);
  const domain = new Set([
    'android','mobile','fullstack','frontend','backend','react','kotlin','java',
    'python','typescript','engineer','developer','architecture','performance',
    'team','leadership','production','bug','tricky','feature','users','internal',
    'platform','interested','company','work','impressive','project','technology',
    'recently','tradeoffs','maintainable','monitoring','testing','collaboration',
    'startup','scale','growth','remote','hybrid','authorized','sponsor','visa',
    'relocate','salary','compensation','experience','years','degree','education',
    'challenge','difficult','proud','achievement','impact','operations','support',
    'marketing','risk','revenue','commerce','healthcare','fintech','ai','data',
    'hard','fixed','tracked','debug','debugged','issue','crashed','crash',
    'shipped','built','owned','designed','led','managed','mentored',
    'sponsorship','legally','relocating','office'
  ]);
  terms.forEach(t => { if (domain.has(t)) phrases.push(t); });
  return phrases;
}

function lexicalSimilarity(a, b) {
  const tA = extractTerms(a), tB = extractTerms(b);
  const jaccard = jaccardSim(tA, tB);
  const cs = charSim(normalize(a), normalize(b));
  const pA = extractPhrases(a), pB = extractPhrases(b);
  const pOverlap = pA.length > 0 && pB.length > 0 ? jaccardSim(pA, pB) : 0;
  return jaccard * 0.5 + cs * 0.2 + pOverlap * 0.3;
}

// ---- Intent classification ----

const INTENT_PATTERNS = [
  {
    category: 'why_company',
    patterns: [
      { regex: /why .*(work|interested|join|want|apply|company|team)/, weight: 1.0 },
      { regex: /interested.*(?:working|joining|role|position|company)/, weight: 0.9 },
      { regex: /what (?:draws|attracts|excites|interests) you/, weight: 0.9 },
    ]
  },
  {
    category: 'impressive_project',
    patterns: [
      { regex: /(?:impressive|proud|best|significant|notable).*(?:project|work|feature|achievement|android)/, weight: 1.0 },
      { regex: /(?:project|work|feature|achievement).*(?:impressive|proud|best|significant|notable)/, weight: 1.0 },
      { regex: /proudest.*(?:feature|project|work|thing)/, weight: 1.0 },
      { regex: /most proud/, weight: 0.9 },
    ]
  },
  {
    category: 'tricky_bug',
    patterns: [
      { regex: /(?:tricky|difficult|challenging|complex|hard).*(?:bug|issue|problem|debug|production)/, weight: 1.0 },
      { regex: /(?:bug|issue|problem|production).*(?:tracked|fixed|found|resolved|debugged)/, weight: 0.9 },
      { regex: /(?:bug|problem).*(?:longer|unexpected|surprised)/, weight: 0.9 },
      { regex: /longer than expected.*(?:solve|fix|debug)/, weight: 0.9 },
      { regex: /production.*issue/, weight: 0.8 },
      { regex: /root.*cause/, weight: 0.7 },
    ]
  },
  {
    category: 'fullstack_feature',
    patterns: [
      { regex: /(?:full.?stack|end.to.end)/, weight: 1.0 },
      { regex: /feature.*(?:owned|shipped|built|released).*(?:end|start|planning|release)/, weight: 0.9 },
      { regex: /(?:owned|shipped).*(?:end.to.end|start.*finish|planning.*release)/, weight: 0.9 },
      { regex: /feature.*(?:shipped|released|launched)/, weight: 0.7 },
    ]
  },
  {
    category: 'non_engineers',
    patterns: [
      { regex: /non.?engineer/, weight: 1.0 },
      { regex: /(?:analyst|coach|operation|stakeholder)/, weight: 0.8 },
      { regex: /users.*(?:weren|not).*engineer/, weight: 1.0 },
    ]
  },
  {
    category: 'internal_platform',
    patterns: [
      { regex: /internal.*(?:platform|tool|system)/, weight: 1.0 },
      { regex: /(?:platform|tool).*internal/, weight: 1.0 },
      { regex: /(?:operations|support|marketing|risk).*(?:platform|tool)/, weight: 0.8 },
      { regex: /building.*(?:internal|platform)/, weight: 0.8 },
    ]
  },
  {
    category: 'technology_interest',
    patterns: [
      { regex: /(?:interesting|recent|exciting).*(?:technology|tech|tool|discovery)/, weight: 1.0 },
      { regex: /technology.*(?:discovered|learned|found)/, weight: 0.9 },
    ]
  },
  {
    category: 'work_authorization_sponsorship',
    patterns: [
      { regex: /(?:visa|sponsor|sponsorship)/, weight: 1.0 },
      { regex: /require.*(?:sponsor|visa|sponsorship)/, weight: 1.0 },
    ]
  },
  {
    category: 'work_authorization',
    patterns: [
      { regex: /(?:authorized|authorization).*work/, weight: 1.0 },
      { regex: /work.*(?:authorized|authorization|legally)/, weight: 1.0 },
      { regex: /(?:legal|permit).*work/, weight: 0.8 },
    ]
  },
  {
    category: 'experience_years',
    patterns: [
      { regex: /(?:years|year).*(?:experience|development|engineering)/, weight: 1.0 },
      { regex: /(?:experience|development).*(?:years|year)/, weight: 1.0 },
      { regex: /how (?:many|much).*(?:experience|years)/, weight: 0.9 },
    ]
  },
  {
    category: 'remote_hybrid',
    patterns: [
      { regex: /(?:remote|hybrid|office|in.person)/, weight: 0.8 },
      { regex: /relocat/, weight: 0.9 },
      { regex: /willing.*(?:work|office|relocat)/, weight: 0.9 },
    ]
  },
  {
    category: 'ai_tools',
    patterns: [
      { regex: /(?:copilot|chatgpt|claude|cursor|gemini)/, weight: 1.0 },
      { regex: /ai\b.*(?:tool|assist|code|workflow)/, weight: 0.9 },
    ]
  },
  {
    category: 'education',
    patterns: [
      { regex: /(?:bachelor|master|phd|doctorate|degree)/, weight: 1.0 },
      { regex: /(?:education|university|school|college)/, weight: 0.8 },
    ]
  },
  {
    category: 'salary',
    patterns: [
      { regex: /(?:salary|compensation|pay).*(?:expect|range|require)/, weight: 1.0 },
      { regex: /(?:expect|range|require).*(?:salary|compensation|pay)/, weight: 1.0 },
    ]
  },
  {
    category: 'team_collaboration',
    patterns: [{ regex: /(?:team|collaboration|conflict|disagree|feedback|mentor)/, weight: 0.7 }]
  },
  {
    category: 'leadership',
    patterns: [{ regex: /(?:led|lead|leadership|manage|mentor).*team/, weight: 1.0 }]
  },
  {
    category: 'failure',
    patterns: [{ regex: /(?:fail|mistake|wrong|setback)/, weight: 0.9 }]
  },
  {
    category: 'strength',
    patterns: [{ regex: /(?:strength|superpower|best.*quality|stand.*out)/, weight: 0.9 }]
  },
  {
    category: 'cover_letter',
    patterns: [{ regex: /cover.*letter/, weight: 1.0 }, { regex: /tell.*about.*yourself/, weight: 0.8 }]
  },
  {
    category: 'self_initiated',
    patterns: [
      { regex: /nobody.*(?:required|asked|told)/, weight: 1.0 },
      { regex: /(?:built|created|started).*(?:nobody|no one|own initiative)/, weight: 1.0 },
      { regex: /(?:side project|passion project|personal project)/, weight: 0.9 },
      { regex: /(?:initiative|self.motivated|self.starter)/, weight: 0.7 },
      { regex: /something.*(?:built|made|created).*(?:own|yourself)/, weight: 0.8 },
    ]
  },
  {
    category: 'learning_curve',
    patterns: [
      { regex: /(?:steepest|biggest).*(?:learning|curve|challenge)/, weight: 1.0 },
      { regex: /(?:learning curve|ramp.up|get up to speed)/, weight: 0.9 },
      { regex: /expect.*(?:difficult|challenging|hardest).*(?:learn|adjust)/, weight: 0.8 },
      { regex: /(?:grow|improve|develop).*(?:area|skill|weakness)/, weight: 0.7 },
    ]
  },
  {
    category: 'demographic_veteran',
    patterns: [
      { regex: /(?:military|veteran|served|armed forces)/, weight: 1.0 },
    ]
  },
  {
    category: 'demographic_gender',
    patterns: [
      { regex: /gender/, weight: 1.0 },
      { regex: /(?:pronouns|sex)/, weight: 0.7 },
    ]
  },
  {
    category: 'demographic_race',
    patterns: [
      { regex: /(?:racial|ethnic|race|ethnicity)/, weight: 1.0 },
    ]
  },
  {
    category: 'demographic_disability',
    patterns: [
      { regex: /disability/, weight: 1.0 },
      { regex: /(?:accommodation|impairment)/, weight: 0.7 },
    ]
  },
];

function classifyIntents(question) {
  const q = normalize(question);
  const results = [];
  for (const { category, patterns } of INTENT_PATTERNS) {
    let bestWeight = 0;
    for (const { regex, weight } of patterns) {
      if (regex.test(q) && weight > bestWeight) bestWeight = weight;
    }
    if (bestWeight > 0) results.push({ category, confidence: bestWeight });
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}

// ---- Hybrid similarity ----

function similarity(a, b) {
  const intentA = classifyIntents(a);
  const intentB = classifyIntents(b);

  let intentScore = 0;
  if (intentA.length > 0 && intentB.length > 0) {
    const catsA = new Map(intentA.map(i => [i.category, i.confidence]));
    for (const { category, confidence } of intentB) {
      if (catsA.has(category)) {
        intentScore = Math.max(intentScore, confidence * catsA.get(category));
      }
    }
  }

  const lexScore = lexicalSimilarity(a, b);

  if (intentScore > 0) {
    return intentScore * 0.65 + lexScore * 0.35;
  }
  return lexScore * 0.8;
}

// ---- Storage ----

async function loadPairs() {
  const r = await browser.storage.local.get(STORAGE_KEY);
  return r[STORAGE_KEY] || [];
}

async function savePairs(pairs) {
  await browser.storage.local.set({ [STORAGE_KEY]: pairs });
}

async function loadProfile() {
  const r = await browser.storage.local.get(PROFILE_KEY);
  return r[PROFILE_KEY] || {};
}

async function saveProfile(profile) {
  await browser.storage.local.set({ [PROFILE_KEY]: profile });
}

// ---- Message handler ----

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.type) {
    case 'findMatches':
      return (async () => {
        const pairs = await loadPairs();
        const normQ = normalize(msg.question);
        return pairs
          .map(p => ({ ...p, score: similarity(normQ, normalize(p.question)) }))
          .filter(p => p.score >= 0.25)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
      })();

    case 'addPair':
      return (async () => {
        const pairs = await loadPairs();
        const existing = pairs.findIndex(p =>
          similarity(normalize(p.question), normalize(msg.question)) > 0.85
        );
        const entry = {
          id: existing >= 0 ? pairs[existing].id : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          question: msg.question.trim(),
          answer: msg.answer.trim(),
          source: msg.source || '',
          tags: msg.tags || [],
          created: existing >= 0 ? pairs[existing].created : new Date().toISOString(),
          updated: new Date().toISOString(),
          useCount: existing >= 0 ? (pairs[existing].useCount || 0) : 0
        };
        if (existing >= 0) pairs[existing] = entry;
        else pairs.push(entry);
        await savePairs(pairs);
        return entry;
      })();

    case 'incrementUse':
      return (async () => {
        const pairs = await loadPairs();
        const p = pairs.find(p => p.id === msg.id);
        if (p) {
          p.useCount = (p.useCount || 0) + 1;
          p.lastUsed = new Date().toISOString();
          await savePairs(pairs);
        }
        return true;
      })();

    case 'loadPairs':
      return loadPairs();

    case 'savePairs':
      return savePairs(msg.pairs);

    case 'removePair':
      return (async () => {
        const pairs = await loadPairs();
        await savePairs(pairs.filter(p => p.id !== msg.id));
        return true;
      })();

    case 'getProfile':
      return loadProfile();

    case 'setProfile':
      return (async () => {
        const existing = await loadProfile();
        const merged = { ...existing, ...msg.profile };
        await saveProfile(merged);
        return merged;
      })();
  }
});

// context menu for quick save
browser.contextMenus.create({
  id: 'autofill-save-selection',
  title: 'Save selected text as answer',
  contexts: ['selection']
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'autofill-save-selection') {
    browser.tabs.sendMessage(tab.id, {
      type: 'promptSaveFromSelection',
      selectedText: info.selectionText
    });
  }
});
