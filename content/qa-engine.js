// ============================================================
// Job Application Autofill -- Q&A Knowledge Base Engine
// ============================================================

const QAEngine = (() => {
  const STORAGE_KEY = 'autofill_qa_pairs';
  const RESUME_KEY = 'autofill_resume_data';

  // ---- Storage ----

  async function loadPairs() {
    const result = await browser.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  }

  async function savePairs(pairs) {
    await browser.storage.local.set({ [STORAGE_KEY]: pairs });
  }

  async function addPair(question, answer, source = '', tags = []) {
    const pairs = await loadPairs();
    // dedupe: if a very similar question exists, update instead of adding
    const existing = pairs.findIndex(p => similarity(normalize(p.question), normalize(question)) > 0.85);
    const entry = {
      id: existing >= 0 ? pairs[existing].id : crypto.randomUUID(),
      question: question.trim(),
      answer: answer.trim(),
      source,
      tags,
      created: existing >= 0 ? pairs[existing].created : new Date().toISOString(),
      updated: new Date().toISOString(),
      useCount: existing >= 0 ? (pairs[existing].useCount || 0) : 0
    };
    if (existing >= 0) {
      pairs[existing] = entry;
    } else {
      pairs.push(entry);
    }
    await savePairs(pairs);
    return entry;
  }

  async function removePair(id) {
    const pairs = await loadPairs();
    await savePairs(pairs.filter(p => p.id !== id));
  }

  async function incrementUse(id) {
    const pairs = await loadPairs();
    const p = pairs.find(p => p.id === id);
    if (p) {
      p.useCount = (p.useCount || 0) + 1;
      p.lastUsed = new Date().toISOString();
      await savePairs(pairs);
    }
  }

  // ---- Text normalization ----

  function normalize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // extract key terms from a question
  function extractTerms(text) {
    const stop = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
      'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
      'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
      'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
      'or', 'if', 'while', 'about', 'up', 'that', 'this', 'it', 'its',
      'what', 'which', 'who', 'whom', 'your', 'you', 'we', 'us', 'our',
      'tell', 'describe', 'explain', 'share', 'please', 'walk', 'through',
      'give', 'provide', 'me', 'my', 'i', 'am'
    ]);
    return normalize(text)
      .split(' ')
      .filter(w => w.length > 2 && !stop.has(w));
  }

  // ---- Similarity scoring ----

  // Jaccard similarity on word sets
  function jaccardSim(a, b) {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  // Levenshtein-based character similarity (for short strings)
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  function charSimilarity(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshtein(a, b) / maxLen;
  }

  // Combined similarity: weighted mix of Jaccard (semantic) and char (fuzzy)
  function similarity(a, b) {
    const termsA = extractTerms(a);
    const termsB = extractTerms(b);
    const jaccard = jaccardSim(termsA, termsB);
    const charSim = charSimilarity(normalize(a), normalize(b));

    // semantic phrase matching -- check for key phrase overlap
    const phrasesA = extractPhrases(a);
    const phrasesB = extractPhrases(b);
    const phraseOverlap = phrasesA.length > 0 && phrasesB.length > 0
      ? jaccardSim(phrasesA, phrasesB)
      : 0;

    return jaccard * 0.5 + charSim * 0.2 + phraseOverlap * 0.3;
  }

  // extract 2-3 word key phrases
  function extractPhrases(text) {
    const terms = extractTerms(text);
    const phrases = [];
    for (let i = 0; i < terms.length - 1; i++) {
      phrases.push(terms[i] + ' ' + terms[i + 1]);
    }
    // also add single important terms (domain keywords)
    const domainTerms = new Set([
      'android', 'mobile', 'fullstack', 'frontend', 'backend', 'react',
      'kotlin', 'java', 'python', 'typescript', 'engineer', 'developer',
      'architecture', 'performance', 'team', 'leadership', 'production',
      'bug', 'tricky', 'feature', 'users', 'non-engineers', 'internal',
      'platform', 'interested', 'company', 'work', 'impressive', 'project',
      'technology', 'recently', 'tradeoffs', 'maintainable', 'monitoring',
      'testing', 'collaboration', 'startup', 'scale', 'growth',
      'remote', 'hybrid', 'authorized', 'sponsor', 'visa', 'relocate',
      'salary', 'compensation', 'experience', 'years', 'degree', 'education',
      'challenge', 'difficult', 'proud', 'achievement', 'impact',
      'operations', 'support', 'marketing', 'risk', 'revenue', 'commerce',
      'healthcare', 'fintech', 'ai', 'machine', 'learning', 'data',
      'pirates', 'discord', 'suno', 'ramp', 'toast', 'arlo', 'nuvo'
    ]);
    terms.forEach(t => {
      if (domainTerms.has(t)) phrases.push(t);
    });
    return phrases;
  }

  // ---- Matching ----

  async function findMatches(question, threshold = 0.25, maxResults = 5) {
    const pairs = await loadPairs();
    const normQ = normalize(question);
    const scored = pairs
      .map(p => ({
        ...p,
        score: similarity(normQ, normalize(p.question))
      }))
      .filter(p => p.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
    return scored;
  }

  // ---- Categorization ----

  function categorizeQuestion(question) {
    const q = normalize(question);
    const categories = {
      'why_company': /why .*(work|interested|join|want|apply|company|team)/,
      'impressive_project': /(impressive|proud|best|significant|notable).*(project|work|feature|achievement)/,
      'tricky_bug': /(tricky|difficult|challenging|complex).*(bug|issue|problem|debug|production)/,
      'fullstack_feature': /(full.?stack|end.to.end|feature|owned|built|shipped)/,
      'non_engineers': /(non.?engineer|analyst|coach|operation|support|marketing|stakeholder)/,
      'internal_platform': /(internal|platform|tool|infrastructure)/,
      'technology_interest': /(interesting|recent|technology|discovered|trend|excited)/,
      'team_collaboration': /(team|collaboration|conflict|disagree|feedback|mentor)/,
      'work_authorization': /(authorized|visa|sponsor|legal|permit|work.*country)/,
      'experience_years': /(years|experience|minimum|professional)/,
      'remote_hybrid': /(remote|hybrid|office|relocat|location|willing.*work)/,
      'ai_tools': /(ai|artificial|copilot|chatgpt|claude|cursor|automation)/,
      'education': /(degree|education|bachelor|master|phd|university|school)/,
      'salary': /(salary|compensation|pay|expectation|range|requirement)/,
      'leadership': /(lead|leadership|manage|mentor|grew|team.*size)/,
      'failure': /(fail|mistake|wrong|learn.*from|setback)/,
      'strength': /(strength|superpower|best.*quality|stand.*out)/,
      'cover_letter': /(cover.*letter|introduction|tell.*about.*yourself)/
    };
    for (const [cat, regex] of Object.entries(categories)) {
      if (regex.test(q)) return cat;
    }
    return 'general';
  }

  // ---- Export/Import ----

  async function exportAll() {
    const pairs = await loadPairs();
    return JSON.stringify(pairs, null, 2);
  }

  async function importPairs(json) {
    const imported = JSON.parse(json);
    const existing = await loadPairs();
    let added = 0;
    for (const entry of imported) {
      const dup = existing.findIndex(p =>
        similarity(normalize(p.question), normalize(entry.question)) > 0.85
      );
      if (dup < 0) {
        existing.push({
          ...entry,
          id: entry.id || crypto.randomUUID(),
          created: entry.created || new Date().toISOString(),
          updated: new Date().toISOString()
        });
        added++;
      }
    }
    await savePairs(existing);
    return added;
  }

  return {
    loadPairs, savePairs, addPair, removePair, incrementUse,
    findMatches, categorizeQuestion, similarity, normalize,
    exportAll, importPairs
  };
})();

// Make available to content scripts and popup
if (typeof window !== 'undefined') {
  window.QAEngine = QAEngine;
}
