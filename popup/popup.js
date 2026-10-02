// ============================================================
// Job Application Autofill -- Popup UI Logic
// ============================================================

(async function () {
  const STORAGE_KEY = 'autofill_qa_pairs';
  const PROFILE_KEY = 'autofill_profile';

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

  // ---- Tab switching ----
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });

  // ---- Profile fields ----
  const PROFILE_FIELDS = [
    'firstName', 'lastName', 'email', 'phone',
    'linkedin', 'github', 'website',
    'location', 'postalCode', 'country', 'countryCode', 'state',
    'school', 'degree', 'major'
  ];

  async function loadProfileForm() {
    const profile = await loadProfile();
    for (const key of PROFILE_FIELDS) {
      const el = document.getElementById(`prof-${key}`);
      if (el && profile[key]) el.value = profile[key];
    }
  }

  document.getElementById('save-profile').addEventListener('click', async () => {
    const profile = {};
    for (const key of PROFILE_FIELDS) {
      const el = document.getElementById(`prof-${key}`);
      if (el && el.value.trim()) profile[key] = el.value.trim();
    }
    // derive fullName
    if (profile.firstName || profile.lastName) {
      profile.fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    }
    await saveProfile(profile);
    const msg = document.getElementById('profile-saved-msg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
  });

  // ---- Render library ----
  async function renderList(filter = '') {
    const pairs = await loadPairs();
    const list = document.getElementById('qa-list');
    const count = document.getElementById('count');
    count.textContent = `${pairs.length} answer${pairs.length !== 1 ? 's' : ''}`;

    const filtered = filter
      ? pairs.filter(p =>
          p.question.toLowerCase().includes(filter) ||
          p.answer.toLowerCase().includes(filter)
        )
      : pairs;

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="emoji">${filter ? '🔍' : '📝'}</div>
          <p>${filter
            ? 'No matching answers found.'
            : 'No saved answers yet.<br>Fill out a job application and answers will be saved automatically!'
          }</p>
        </div>`;
      return;
    }

    filtered.sort((a, b) => new Date(b.updated) - new Date(a.updated));

    list.innerHTML = filtered.map(p => `
      <div class="qa-item" data-id="${p.id}">
        <div class="qa-question">${escapeHtml(p.question)}</div>
        <div class="qa-answer">${escapeHtml(p.answer)}</div>
        <div class="qa-meta">
          <span>Used ${p.useCount || 0}x &middot; ${timeAgo(p.updated)}</span>
          <div class="qa-actions">
            <button class="edit-btn" data-id="${p.id}">Edit</button>
            <button class="delete-btn" data-id="${p.id}">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pairs = await loadPairs();
        await savePairs(pairs.filter(p => p.id !== btn.dataset.id));
        renderList(filter);
      });
    });

    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pairs = await loadPairs();
        const p = pairs.find(p => p.id === btn.dataset.id);
        if (p) {
          document.getElementById('new-question').value = p.question;
          document.getElementById('new-answer').value = p.answer;
          document.querySelector('[data-tab="add"]').click();
        }
      });
    });
  }

  // ---- Search ----
  document.getElementById('search').addEventListener('input', (e) => {
    renderList(e.target.value.toLowerCase());
  });

  // ---- Add new ----
  document.getElementById('save-new').addEventListener('click', async () => {
    const q = document.getElementById('new-question').value.trim();
    const a = document.getElementById('new-answer').value.trim();
    if (!q || !a) return;
    await browser.runtime.sendMessage({ type: 'addPair', question: q, answer: a, source: 'manual' });
    document.getElementById('new-question').value = '';
    document.getElementById('new-answer').value = '';
    document.querySelector('[data-tab="library"]').click();
    renderList();
  });

  // ---- Seed answers ----
  document.getElementById('seed-answers').addEventListener('click', async () => {
    const seedData = getSeedAnswers();
    let added = 0;
    for (const { question, answer } of seedData) {
      await browser.runtime.sendMessage({
        type: 'addPair', question, answer, source: 'seeded'
      });
      added++;
    }
    alert(`Seeded ${added} answers!`);
    renderList();
  });

  // ---- Export ----
  document.getElementById('export-btn').addEventListener('click', async () => {
    const pairs = await loadPairs();
    const profile = await loadProfile();
    const blob = new Blob(
      [JSON.stringify({ profile, pairs }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autofill-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---- Import ----
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      // support both old format (array) and new format ({profile, pairs})
      const imported = Array.isArray(data) ? data : (data.pairs || []);
      const importedProfile = data.profile || null;

      const existing = await loadPairs();
      let added = 0;
      for (const entry of imported) {
        const dup = existing.some(p =>
          p.question.toLowerCase() === entry.question.toLowerCase()
        );
        if (!dup) {
          existing.push({
            ...entry,
            id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            created: entry.created || new Date().toISOString(),
            updated: new Date().toISOString()
          });
          added++;
        }
      }
      await savePairs(existing);

      if (importedProfile) {
        const currentProfile = await loadProfile();
        const merged = { ...currentProfile, ...importedProfile };
        await saveProfile(merged);
        loadProfileForm();
      }

      alert(`Imported ${added} new answers (${imported.length - added} duplicates skipped)${importedProfile ? ' + profile data' : ''}`);
      renderList();
    } catch (err) {
      alert('Invalid JSON file');
    }
  });

  // ---- Clear all ----
  document.getElementById('clear-all').addEventListener('click', async () => {
    if (confirm('Delete all saved answers? This cannot be undone.')) {
      await savePairs([]);
      renderList();
    }
  });

  // ---- Helpers ----

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    const now = new Date();
    const d = new Date(dateStr);
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  }

  function getSeedAnswers() {
    return [
      { question: "Why do you want to work at [company]?", answer: "I've spent the last 5 years building high-performance, multi-platform consumer experiences at Amazon Fire TV (200M+ devices) and Best Buy. What draws me to [company] specifically is [research the company -- mission, product, stage]. My experience shipping across Android native (Kotlin/Compose), React Native, and backend services maps directly to the full-stack nature of the work." },
      { question: "What is the most impressive project you've worked on?", answer: "The Fire TV Burton navigation architecture -- all navigation tabs stay live simultaneously with distance-ordered background preloading and a compositor keeping bitmaps resident for only the nearest 3 tabs. A 7-tier device-eligibility rollout system shipped two different UI architectures in one APK with zero downtime. Crash rate dropped 73%, tab-switch latency improved 28%." },
      { question: "Tell us about a time you built a feature for users who weren't engineers", answer: "At Amazon Fire TV, I built a device-state lookup tool for operations and QA teams. It took a DSN and returned a plain-English breakdown of the 7-tier eligibility resolution. The backend queried the same eligibility code the launcher uses (ground truth). A simple React form -- paste a DSN, get the answer." },
      { question: "Walk us through a full-stack feature you owned end to end", answer: "The 'Offers for You' recommendation slider at Best Buy Mobile. GraphQL backend, React Native horizontal ScrollView with lazy-loaded cards and impression tracking. Feature flag rollout 10% -> 50% -> 100%. 17% MAU engagement uplift." },
      { question: "Describe a tricky bug or production issue you tracked down", answer: "60K+ crash occurrences across 11 Fire TV hardware targets. NPE in LayoutNodeDrawScope.drawContent(). Decompiled debug APK smali to prove R8 had merged an unrelated lambda. Root cause: @Composable modifier with an early return before remember/DisposableEffect, causing slot table desynchronization. Crash rate dropped 73% after fix." },
      { question: "What interests you about building internal platforms?", answer: "The leverage. At Fire TV, I replaced a 3-dashboard cross-referencing workflow with a single lookup tool. Operations stopped escalating to engineering. Internal platforms have the fastest feedback loop: ship Tuesday, watch people use it Wednesday." },
      { question: "What's the most interesting technology you've discovered recently?", answer: "I built an autonomous job scanning pipeline on Kiro Crew. LaunchAgent daemon, hourly fetching from job boards, LLM-based scoring, auto-resume generation, iMessage delivery. Circuit breakers, two-layer relevance filtering, outcome-calibrated scoring." },
      { question: "Please share your proudest Android feature", answer: "Burton navigation on Fire TV -- Compose system with live tabs, distance-ordered preloading, 3-tab bitmap window. Sub-frame tab switches across 11 hardware targets, 26MB image budget, dual-architecture APK. 28% latency reduction, 73% crash rate drop, 200M+ devices." },
      { question: "Have you contributed to apps that reached a large number of users?", answer: "Fire TV Launcher ships to 200M+ devices globally. Also 12 features in Best Buy mobile app (React Native, millions of MAU) including 'Offers for You' with 17% MAU engagement uplift." },
      { question: "Are you legally authorized to work in the United States?", answer: "Yes" },
      { question: "Do you now or will you ever require employment sponsorship?", answer: "No" },
      { question: "Are you familiar with or open to using AI tools?", answer: "Yes -- I actively use AI tools and have built autonomous AI-powered pipelines with proper failure handling and quality controls." },
      { question: "How many years of Android mobile app development experience do you have?", answer: "4+ years" }
    ];
  }

  // ---- Init ----
  loadProfileForm();
  renderList();
})();
