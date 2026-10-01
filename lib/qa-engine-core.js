// ============================================================
// QA Engine Core -- Hybrid Intent + Lexical Matching
//
// Architecture:
//   Layer 1: Intent classification -- what TYPE of question is this?
//            "Why Suno?" and "Why [company]?" are both why_company.
//            This is the primary matching signal.
//
//   Layer 2: Lexical similarity -- within the same intent category,
//            which saved answer is the best fit? This is the tiebreaker.
//
//   Final score = intent_match_weight * intent_score + lexical_weight * lexical_score
//
// Why this works: the categorizer understands question STRUCTURE
// (patterns like "why...work/company"), which handles synonym
// substitution, company name changes, and rephrasings that share
// no words but have the same intent.
// ============================================================

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

// Pure lexical similarity (Jaccard + char + phrase overlap)
function lexicalSimilarity(a, b) {
  const tA = extractTerms(a), tB = extractTerms(b);
  const jaccard = jaccardSim(tA, tB);
  const cs = charSim(normalize(a), normalize(b));
  const pA = extractPhrases(a), pB = extractPhrases(b);
  const pOverlap = pA.length > 0 && pB.length > 0 ? jaccardSim(pA, pB) : 0;
  return jaccard * 0.5 + cs * 0.2 + pOverlap * 0.3;
}

// ---- Intent classification ----
// Each category has a list of regex patterns. A question can match
// multiple categories with different confidence. The categorizer
// returns ALL matching categories with scores, not just the top one.

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
      { regex: /(?:figured|figure).*(?:needed|need)/, weight: 0.5 },
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
      { regex: /(?:discovered|learned).*recently/, weight: 0.7 },
    ]
  },
  {
    category: 'work_authorization_sponsorship',
    patterns: [
      { regex: /(?:visa|sponsor|sponsorship)/, weight: 1.0 },
      { regex: /require.*(?:sponsor|visa|sponsorship)/, weight: 1.0 },
      { regex: /(?:sponsor|visa|sponsorship).*(?:require|need)/, weight: 1.0 },
    ]
  },
  {
    category: 'work_authorization',
    patterns: [
      { regex: /(?:authorized|authorization).*work/, weight: 1.0 },
      { regex: /work.*(?:authorized|authorization|legally)/, weight: 1.0 },
      { regex: /(?:legal|permit).*work/, weight: 0.8 },
      { regex: /legally.*(?:authorized|eligible)/, weight: 0.9 },
    ]
  },
  {
    category: 'experience_years',
    patterns: [
      { regex: /(?:years|year).*(?:experience|development|engineering)/, weight: 1.0 },
      { regex: /(?:experience|development).*(?:years|year)/, weight: 1.0 },
      { regex: /(?:minimum|least).*(?:years|experience)/, weight: 0.9 },
      { regex: /how (?:many|much).*(?:experience|years)/, weight: 0.9 },
    ]
  },
  {
    category: 'remote_hybrid',
    patterns: [
      { regex: /(?:remote|hybrid|office|in.person)/, weight: 0.8 },
      { regex: /relocat/, weight: 0.9 },
      { regex: /willing.*(?:work|office|relocat)/, weight: 0.9 },
      { regex: /(?:based|located|live).*(?:area|city|office)/, weight: 0.7 },
    ]
  },
  {
    category: 'ai_tools',
    patterns: [
      { regex: /(?:copilot|chatgpt|claude|cursor|gemini)/, weight: 1.0 },
      { regex: /ai\b.*(?:tool|assist|code|workflow)/, weight: 0.9 },
      { regex: /(?:tool|assist).*ai\b/, weight: 0.9 },
      { regex: /(?:artificial|machine).*(?:intelligence|learning)/, weight: 0.8 },
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
    patterns: [
      { regex: /(?:team|collaboration|conflict|disagree|feedback|mentor)/, weight: 0.7 },
      { regex: /work.*(?:team|together|collaborate)/, weight: 0.6 },
    ]
  },
  {
    category: 'leadership',
    patterns: [
      { regex: /(?:led|lead|leadership|manage|mentor).*team/, weight: 1.0 },
      { regex: /team.*(?:size|grew|managed|led)/, weight: 0.9 },
    ]
  },
  {
    category: 'failure',
    patterns: [
      { regex: /(?:fail|mistake|wrong|setback)/, weight: 0.9 },
      { regex: /learn.*from/, weight: 0.5 },
    ]
  },
  {
    category: 'strength',
    patterns: [
      { regex: /(?:strength|superpower|best.*quality|stand.*out)/, weight: 0.9 },
    ]
  },
  {
    category: 'cover_letter',
    patterns: [
      { regex: /cover.*letter/, weight: 1.0 },
      { regex: /tell.*about.*yourself/, weight: 0.8 },
      { regex: /introduction/, weight: 0.6 },
    ]
  },
];

// Returns the single best matching category (for backward compat)
function categorizeQuestion(question) {
  const scored = classifyIntents(question);
  return scored.length > 0 ? scored[0].category : 'general';
}

// Returns all matching categories with scores, sorted by confidence
function classifyIntents(question) {
  const q = normalize(question);
  const results = [];

  for (const { category, patterns } of INTENT_PATTERNS) {
    let bestWeight = 0;
    for (const { regex, weight } of patterns) {
      if (regex.test(q) && weight > bestWeight) {
        bestWeight = weight;
      }
    }
    if (bestWeight > 0) {
      results.push({ category, confidence: bestWeight });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

// ---- Hybrid similarity ----
// This is the core matching function.
// It combines intent match (do these two questions ask the same TYPE of thing?)
// with lexical similarity (how much word overlap?) to produce a final score.

function similarity(a, b) {
  const intentA = classifyIntents(a);
  const intentB = classifyIntents(b);

  // Intent match score: how much do the intent categories overlap?
  let intentScore = 0;
  if (intentA.length > 0 && intentB.length > 0) {
    // check for shared categories
    const catsA = new Map(intentA.map(i => [i.category, i.confidence]));
    for (const { category, confidence } of intentB) {
      if (catsA.has(category)) {
        // shared category -- score is the product of both confidences
        const sharedScore = confidence * catsA.get(category);
        intentScore = Math.max(intentScore, sharedScore);
      }
    }
  }

  // Lexical similarity
  const lexScore = lexicalSimilarity(a, b);

  // If both questions are in the same intent category, the intent signal
  // dominates. Otherwise, fall back to pure lexical.
  if (intentScore > 0) {
    // Weighted: intent is the primary signal (0.65), lexical is tiebreaker (0.35)
    return intentScore * 0.65 + lexScore * 0.35;
  }

  // No shared intent -- pure lexical (but penalized slightly since intent
  // didn't confirm the match)
  return lexScore * 0.8;
}

// ---- Matching ----

function findMatchesSync(pairs, question, threshold = 0.25, maxResults = 5) {
  const normQ = normalize(question);
  return pairs
    .map(p => ({ ...p, score: similarity(normQ, normalize(p.question)) }))
    .filter(p => p.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ---- Dedup (for addPair) ----

function addPairSync(pairs, question, answer, source = '') {
  const existing = pairs.findIndex(p =>
    similarity(normalize(p.question), normalize(question)) > 0.85
  );
  const entry = {
    id: existing >= 0 ? pairs[existing].id : `test-${Date.now()}`,
    question: question.trim(),
    answer: answer.trim(),
    source,
    tags: [],
    created: existing >= 0 ? pairs[existing].created : new Date().toISOString(),
    updated: new Date().toISOString(),
    useCount: existing >= 0 ? (pairs[existing].useCount || 0) : 0
  };
  if (existing >= 0) pairs[existing] = entry;
  else pairs.push(entry);
  return { pairs, entry, replaced: existing >= 0 };
}

module.exports = {
  normalize, extractTerms, jaccardSim, levenshtein, charSim,
  extractPhrases, similarity, lexicalSimilarity, categorizeQuestion,
  classifyIntents, findMatchesSync, addPairSync
};
