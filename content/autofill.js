// ============================================================
// Job Application Autofill -- Content Script
// Detects ALL form field types (text, textarea, select, radio,
// checkbox, contenteditable), matches against saved Q&A, and
// AUTO-POPULATES known answers on page load.
// ============================================================

(async function () {
  'use strict';

  if (window.__autofillInjected) return;
  window.__autofillInjected = true;

  // ---- Background messaging ----

  async function findMatches(question) {
    return browser.runtime.sendMessage({ type: 'findMatches', question });
  }

  async function addPair(question, answer, source) {
    return browser.runtime.sendMessage({ type: 'addPair', question, answer, source });
  }

  async function incrementUse(id) {
    return browser.runtime.sendMessage({ type: 'incrementUse', id });
  }

  async function getProfile() {
    return browser.runtime.sendMessage({ type: 'getProfile' });
  }

  // ---- Question text extraction ----
  // Walks the DOM from the field element upward to find the label/question.
  // Handles: <label for="id">, aria-label, placeholder, parent label,
  // preceding sibling text, ATS-specific question containers, fieldset/legend.

  function getQuestionText(field) {
    // label[for=id]
    if (field.id) {
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (label) return label.textContent.trim();
    }
    // aria-label
    if (field.getAttribute('aria-label')) return field.getAttribute('aria-label');
    // aria-labelledby
    const labelledBy = field.getAttribute('aria-labelledby');
    if (labelledBy) {
      const el = document.getElementById(labelledBy);
      if (el) return el.textContent.trim();
    }
    // placeholder (for short fields only)
    if (field.placeholder && field.placeholder.length > 3) return field.placeholder;
    // closest label ancestor
    const parentLabel = field.closest('label');
    if (parentLabel) {
      const text = parentLabel.textContent.trim();
      if (text.length > 3) return text;
    }
    // fieldset > legend (common for radio/checkbox groups)
    const fieldset = field.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) return legend.textContent.trim();
    }
    // ATS question container
    const container = field.closest(
      '[class*="field"], [class*="question"], [class*="form-group"], ' +
      '[class*="form-field"], [data-qa], [class*="application-question"], ' +
      '[class*="custom-question"], [class*="section-field"]'
    );
    if (container) {
      const heading = container.querySelector(
        'h1, h2, h3, h4, h5, label, [class*="label"], [class*="title"], ' +
        '[class*="question"], [class*="prompt"], legend'
      );
      if (heading && heading.textContent.trim().length > 3) {
        return heading.textContent.trim();
      }
    }
    // previous sibling text
    const prev = field.previousElementSibling;
    if (prev && prev.textContent.trim().length > 3) return prev.textContent.trim();
    // parent's previous sibling
    const parent = field.parentElement;
    if (parent) {
      const prevSib = parent.previousElementSibling;
      if (prevSib && prevSib.textContent.trim().length > 3) {
        return prevSib.textContent.trim();
      }
    }
    // name attribute as last resort
    if (field.name) return field.name.replace(/[_\-\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    return '';
  }

  // ---- Profile field matching ----
  // Maps common personal-info field labels to profile keys.

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

  // ---- Field discovery ----
  // Finds ALL interactive form elements on the page.

  function findAllFields() {
    const fields = [];
    const seen = new WeakSet();

    function addField(element, type) {
      if (seen.has(element)) return;
      seen.add(element);
      const question = getQuestionText(element);
      if (!question || question.length < 2) return;
      fields.push({ element, question, type });
    }

    // Text inputs (all types)
    document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], ' +
      'input[type="url"], input[type="number"], input[type="search"], ' +
      'input:not([type])'
    ).forEach(f => {
      if (f.type === 'hidden') return;
      if (f.closest('[style*="display: none"], [style*="display:none"], [hidden]')) return;
      addField(f, 'text');
    });

    // Textareas
    document.querySelectorAll('textarea').forEach(f => addField(f, 'textarea'));

    // Selects (dropdowns)
    document.querySelectorAll('select').forEach(f => addField(f, 'select'));

    // Radio button groups (group by name)
    const radioGroups = new Map();
    document.querySelectorAll('input[type="radio"]').forEach(f => {
      const name = f.name || f.id;
      if (!name) return;
      if (!radioGroups.has(name)) radioGroups.set(name, []);
      radioGroups.get(name).push(f);
    });
    for (const [name, radios] of radioGroups) {
      const question = getQuestionText(radios[0]);
      if (!question || question.length < 2) continue;
      if (seen.has(radios[0])) continue;
      seen.add(radios[0]);
      fields.push({
        element: radios[0],
        elements: radios,
        question,
        type: 'radio',
        options: radios.map(r => ({
          element: r,
          value: r.value,
          label: getRadioLabel(r)
        }))
      });
    }

    // Checkboxes (standalone ones with question text)
    document.querySelectorAll('input[type="checkbox"]').forEach(f => {
      const question = getQuestionText(f);
      if (!question || question.length < 2) return;
      addField(f, 'checkbox');
    });

    // Contenteditable divs
    document.querySelectorAll('[contenteditable="true"], [role="textbox"]').forEach(f => {
      if (f.tagName === 'TEXTAREA' || f.tagName === 'INPUT') return;
      addField(f, 'contenteditable');
    });

    return fields;
  }

  function getRadioLabel(radio) {
    // Check the next text node or label
    const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
    if (label) return label.textContent.trim();
    const parentLabel = radio.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();
    const next = radio.nextSibling;
    if (next && next.textContent) return next.textContent.trim();
    return radio.value;
  }

  // ---- Field filling ----

  function fillTextField(element, value) {
    // Use native setter to trigger React/Vue/Angular change detection
    const proto = element.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const nativeSet = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSet) {
      nativeSet.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function fillContentEditable(element, value) {
    element.textContent = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillSelect(element, value) {
    const normalVal = value.toLowerCase().trim();
    let matched = false;

    // Try exact value match first (skip placeholder options)
    for (const opt of element.options) {
      if (!opt.value) continue;
      if (opt.value.toLowerCase().trim() === normalVal ||
          opt.textContent.toLowerCase().trim() === normalVal) {
        element.value = opt.value;
        matched = true;
        break;
      }
    }

    // Try substring/fuzzy match (skip placeholder options)
    if (!matched) {
      for (const opt of element.options) {
        if (!opt.value) continue;
        const optText = opt.textContent.toLowerCase().trim();
        const optVal = opt.value.toLowerCase().trim();
        if (optText.includes(normalVal) || normalVal.includes(optText) ||
            optVal.includes(normalVal) || normalVal.includes(optVal)) {
          element.value = opt.value;
          matched = true;
          break;
        }
      }
    }

    // Try starts-with match for partial answers like "4+" matching "4+ years"
    if (!matched) {
      for (const opt of element.options) {
        if (!opt.value) continue;
        const optText = opt.textContent.toLowerCase().trim();
        if (optText.startsWith(normalVal) || normalVal.startsWith(optText)) {
          element.value = opt.value;
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return matched;
  }

  function fillRadio(field, value) {
    const normalVal = value.toLowerCase().trim();
    let matched = false;

    for (const opt of field.options) {
      const label = opt.label.toLowerCase().trim();
      const val = opt.value.toLowerCase().trim();
      if (label === normalVal || val === normalVal ||
          label.includes(normalVal) || normalVal.includes(label)) {
        opt.element.checked = true;
        opt.element.dispatchEvent(new Event('change', { bubbles: true }));
        opt.element.dispatchEvent(new Event('click', { bubbles: true }));
        matched = true;
        break;
      }
    }
    return matched;
  }

  function fillCheckbox(element, value) {
    const normalVal = value.toLowerCase().trim();
    const shouldCheck = ['yes', 'true', '1', 'i agree', 'agree'].includes(normalVal);
    const shouldUncheck = ['no', 'false', '0'].includes(normalVal);

    if (shouldCheck && !element.checked) {
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('click', { bubbles: true }));
      return true;
    }
    if (shouldUncheck && element.checked) {
      element.checked = false;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  function fillField(field, value) {
    switch (field.type) {
      case 'text':
      case 'textarea':
        fillTextField(field.element, value);
        return true;
      case 'contenteditable':
        fillContentEditable(field.element, value);
        return true;
      case 'select':
        return fillSelect(field.element, value);
      case 'radio':
        return fillRadio(field, value);
      case 'checkbox':
        return fillCheckbox(field.element, value);
      default:
        return false;
    }
  }

  function getFieldValue(field) {
    switch (field.type) {
      case 'contenteditable':
        return field.element.textContent.trim();
      case 'select':
        return field.element.options[field.element.selectedIndex]?.textContent.trim() || '';
      case 'radio':
        const checked = field.options.find(o => o.element.checked);
        return checked ? checked.label : '';
      case 'checkbox':
        return field.element.checked ? 'Yes' : 'No';
      default:
        return field.element.value.trim();
    }
  }

  function isFieldEmpty(field) {
    switch (field.type) {
      case 'select': {
        const idx = field.element.selectedIndex;
        // first option is usually the placeholder
        if (idx <= 0) return true;
        const val = field.element.value;
        return !val || val === '' || val === 'select' || val === 'placeholder';
      }
      case 'radio':
        return !field.options.some(o => o.element.checked);
      case 'checkbox':
        return !field.element.checked;
      case 'contenteditable':
        return !field.element.textContent.trim();
      default:
        return !field.element.value.trim();
    }
  }

  // ---- UI elements ----

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function removePopups() {
    document.querySelectorAll('.autofill-popup').forEach(p => p.remove());
  }

  function showToast(message) {
    // Remove existing toasts first
    document.querySelectorAll('.autofill-toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = 'autofill-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ---- Autofill button for fields that need human choice ----

  function createAutofillButton(field, matches) {
    const existingBtn = field.element.parentElement?.querySelector('.autofill-btn');
    if (existingBtn) existingBtn.remove();

    if (matches.length === 0) return; // no button if nothing matches

    const btn = document.createElement('div');
    btn.className = 'autofill-btn';
    btn.title = `${matches.length} saved answer(s) found -- click to fill`;
    btn.innerHTML = `<span class="autofill-icon">✨</span><span class="autofill-count">${matches.length}</span>`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showMatchPopup(field, matches);
    });

    const wrapper = field.element.parentElement;
    if (!wrapper) return;
    wrapper.style.position = wrapper.style.position || 'relative';
    btn.style.position = 'absolute';
    btn.style.right = '8px';
    btn.style.top = '8px';
    btn.style.zIndex = '10000';
    wrapper.appendChild(btn);
  }

  function showMatchPopup(field, matches) {
    removePopups();

    const popup = document.createElement('div');
    popup.className = 'autofill-popup';

    const header = document.createElement('div');
    header.className = 'autofill-popup-header';
    header.innerHTML = `
      <span>Saved Answers (${matches.length})</span>
      <button class="autofill-close">&times;</button>
    `;
    popup.appendChild(header);
    header.querySelector('.autofill-close').addEventListener('click', removePopups);

    const list = document.createElement('div');
    list.className = 'autofill-popup-list';

    matches.forEach(match => {
      const item = document.createElement('div');
      item.className = 'autofill-match-item';

      const score = Math.round(match.score * 100);
      const preview = match.answer.substring(0, 150) + (match.answer.length > 150 ? '...' : '');

      item.innerHTML = `
        <div class="autofill-match-header">
          <span class="autofill-match-score ${score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low'}">${score}%</span>
          <span class="autofill-match-question">${escapeHtml(match.question.substring(0, 80))}</span>
        </div>
        <div class="autofill-match-preview">${escapeHtml(preview)}</div>
        <div class="autofill-match-actions">
          <button class="autofill-fill-btn">Fill</button>
          <button class="autofill-preview-btn">Preview</button>
        </div>
      `;

      item.querySelector('.autofill-fill-btn').addEventListener('click', () => {
        fillField(field, match.answer);
        incrementUse(match.id);
        removePopups();
        showToast('Answer filled!');
      });

      item.querySelector('.autofill-preview-btn').addEventListener('click', () => {
        showPreview(field, match);
      });

      list.appendChild(item);
    });

    popup.appendChild(list);

    // save current answer button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'autofill-save-new-btn';
    saveBtn.textContent = '+ Save current answer';
    saveBtn.addEventListener('click', () => {
      promptSave(field);
      removePopups();
    });
    popup.appendChild(saveBtn);

    document.body.appendChild(popup);
    const rect = field.element.getBoundingClientRect();
    popup.style.top = `${window.scrollY + rect.bottom + 8}px`;
    popup.style.left = `${window.scrollX + rect.left}px`;
    popup.style.maxWidth = `${Math.min(500, Math.max(rect.width, 320))}px`;
  }

  function showPreview(field, match) {
    removePopups();

    const popup = document.createElement('div');
    popup.className = 'autofill-popup autofill-preview';

    popup.innerHTML = `
      <div class="autofill-popup-header">
        <span>Preview</span>
        <button class="autofill-close">&times;</button>
      </div>
      <div class="autofill-preview-question"><strong>Q:</strong> ${escapeHtml(match.question)}</div>
      <div class="autofill-preview-answer">${escapeHtml(match.answer)}</div>
      <div class="autofill-preview-meta">
        Saved ${new Date(match.created).toLocaleDateString()} &middot; Used ${match.useCount || 0} times
        ${match.source ? ` &middot; From ${escapeHtml(match.source)}` : ''}
      </div>
      <div class="autofill-match-actions">
        <button class="autofill-fill-btn">Use This Answer</button>
        <button class="autofill-edit-btn">Edit & Fill</button>
        <button class="autofill-back-btn">Back</button>
      </div>
    `;

    popup.querySelector('.autofill-close').addEventListener('click', removePopups);
    popup.querySelector('.autofill-fill-btn').addEventListener('click', () => {
      fillField(field, match.answer);
      incrementUse(match.id);
      removePopups();
      showToast('Answer filled!');
    });
    popup.querySelector('.autofill-edit-btn').addEventListener('click', () => {
      fillField(field, match.answer);
      removePopups();
      field.element.focus();
      showToast('Answer filled -- edit as needed');
    });
    popup.querySelector('.autofill-back-btn').addEventListener('click', async () => {
      const matches = await findMatches(field.question);
      showMatchPopup(field, matches);
    });

    document.body.appendChild(popup);
    const rect = field.element.getBoundingClientRect();
    popup.style.top = `${window.scrollY + rect.bottom + 8}px`;
    popup.style.left = `${window.scrollX + rect.left}px`;
  }

  function promptSave(field) {
    const currentValue = getFieldValue(field);
    if (!currentValue || currentValue.trim().length < 3) {
      showToast('Fill in your answer first, then save it');
      return;
    }

    removePopups();

    const popup = document.createElement('div');
    popup.className = 'autofill-popup autofill-save-popup';

    popup.innerHTML = `
      <div class="autofill-popup-header">
        <span>Save Answer</span>
        <button class="autofill-close">&times;</button>
      </div>
      <div class="autofill-save-field">
        <label>Question:</label>
        <textarea class="autofill-save-question" rows="2">${escapeHtml(field.question)}</textarea>
      </div>
      <div class="autofill-save-field">
        <label>Answer:</label>
        <textarea class="autofill-save-answer" rows="6">${escapeHtml(currentValue)}</textarea>
      </div>
      <div class="autofill-match-actions">
        <button class="autofill-confirm-save-btn">Save</button>
        <button class="autofill-close">Cancel</button>
      </div>
    `;

    popup.querySelectorAll('.autofill-close').forEach(b =>
      b.addEventListener('click', removePopups)
    );
    popup.querySelector('.autofill-confirm-save-btn').addEventListener('click', async () => {
      const q = popup.querySelector('.autofill-save-question').value;
      const a = popup.querySelector('.autofill-save-answer').value;
      if (q && a) {
        await addPair(q, a, window.location.hostname);
        removePopups();
        showToast('Answer saved!');
        setTimeout(scanPage, 500);
      }
    });

    document.body.appendChild(popup);
    const rect = field.element.getBoundingClientRect();
    popup.style.top = `${window.scrollY + rect.bottom + 8}px`;
    popup.style.left = `${window.scrollX + rect.left}px`;
  }

  // ---- Auto-learn: watch fields for new answers ----

  const watchedFields = new WeakSet();

  function watchForNewAnswers(field) {
    if (watchedFields.has(field.element)) return;
    watchedFields.add(field.element);

    if (field.type !== 'text' && field.type !== 'textarea' && field.type !== 'contenteditable') return;

    let lastValue = getFieldValue(field);
    field.element.addEventListener('blur', async () => {
      const currentValue = getFieldValue(field);
      if (currentValue && currentValue.length > 20 && currentValue !== lastValue) {
        lastValue = currentValue;
        const matches = await findMatches(field.question);
        const topMatch = matches[0];
        if (!topMatch || topMatch.score < 0.7) {
          showSavePromptBanner(field, currentValue);
        }
      }
    });
  }

  function showSavePromptBanner(field, answer) {
    if (document.querySelector('.autofill-save-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'autofill-save-banner';
    banner.innerHTML = `
      <span>💾 Save this answer for future applications?</span>
      <button class="autofill-banner-save">Save</button>
      <button class="autofill-banner-dismiss">&times;</button>
    `;

    banner.querySelector('.autofill-banner-save').addEventListener('click', async () => {
      await addPair(field.question, answer, window.location.hostname);
      banner.remove();
      showToast('Answer saved!');
      setTimeout(scanPage, 500);
    });

    banner.querySelector('.autofill-banner-dismiss').addEventListener('click', () => {
      banner.remove();
    });

    const rect = field.element.getBoundingClientRect();
    banner.style.top = `${window.scrollY + rect.top - 45}px`;
    banner.style.left = `${window.scrollX + rect.left}px`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 10000);
  }

  // ---- Main scan + auto-populate ----

  let autoFillCount = 0;

  async function scanPage() {
    const fields = findAllFields();
    const profile = await getProfile();
    autoFillCount = 0;

    for (const field of fields) {
      // Skip fields already filled
      if (!isFieldEmpty(field)) {
        watchForNewAnswers(field);
        continue;
      }

      // 1. Try profile data first (name, email, phone, etc.)
      const profileKey = matchProfileField(field.question);
      if (profileKey && profile && profile[profileKey]) {
        fillField(field, profile[profileKey]);
        autoFillCount++;
        continue;
      }

      // 2. Try QA matching
      const matches = await findMatches(field.question);

      if (matches.length > 0 && matches[0].score >= 0.5) {
        // High confidence: auto-fill directly
        const best = matches[0];

        if (field.type === 'text' || field.type === 'textarea' || field.type === 'contenteditable') {
          // For long text answers, auto-fill and show the button for alternatives
          fillField(field, best.answer);
          incrementUse(best.id);
          autoFillCount++;
          if (matches.length > 1) {
            createAutofillButton(field, matches);
          }
        } else if (field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') {
          // For choice fields, auto-select directly
          const filled = fillField(field, best.answer);
          if (filled) {
            incrementUse(best.id);
            autoFillCount++;
          } else {
            // Couldn't match option text -- show button for manual selection
            createAutofillButton(field, matches);
          }
        }
      } else if (matches.length > 0) {
        // Low confidence: show button, don't auto-fill
        createAutofillButton(field, matches);
      }

      watchForNewAnswers(field);
    }

    if (autoFillCount > 0) {
      showToast(`✨ Auto-filled ${autoFillCount} field${autoFillCount > 1 ? 's' : ''}`);
    }
  }

  // ---- Floating "Fill All" button ----
  // Shows when there are fillable fields on the page.

  function createFillAllButton() {
    if (document.getElementById('autofill-fill-all')) return;

    const btn = document.createElement('div');
    btn.id = 'autofill-fill-all';
    btn.className = 'autofill-fill-all-btn';
    btn.innerHTML = '✨ Auto-Fill';
    btn.title = 'Re-scan and fill all known fields';
    btn.addEventListener('click', async () => {
      btn.innerHTML = '⏳ Filling...';
      await scanPage();
      btn.innerHTML = '✨ Auto-Fill';
    });
    document.body.appendChild(btn);
  }

  // ---- Context menu handler ----

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'promptSaveFromSelection') {
      removePopups();
      const popup = document.createElement('div');
      popup.className = 'autofill-popup autofill-save-popup';
      popup.innerHTML = `
        <div class="autofill-popup-header">
          <span>Save Selected Text as Answer</span>
          <button class="autofill-close">&times;</button>
        </div>
        <div class="autofill-save-field">
          <label>Question (what was this answering?):</label>
          <textarea class="autofill-save-question" rows="2" placeholder="e.g. Why do you want to work at [company]?"></textarea>
        </div>
        <div class="autofill-save-field">
          <label>Answer:</label>
          <textarea class="autofill-save-answer" rows="6">${escapeHtml(msg.selectedText)}</textarea>
        </div>
        <div class="autofill-match-actions">
          <button class="autofill-confirm-save-btn">Save</button>
          <button class="autofill-close">Cancel</button>
        </div>
      `;
      popup.querySelectorAll('.autofill-close').forEach(b =>
        b.addEventListener('click', removePopups)
      );
      popup.querySelector('.autofill-confirm-save-btn').addEventListener('click', async () => {
        const q = popup.querySelector('.autofill-save-question').value;
        const a = popup.querySelector('.autofill-save-answer').value;
        if (q && a) {
          await addPair(q, a, window.location.hostname);
          removePopups();
          showToast('Answer saved!');
          setTimeout(scanPage, 500);
        }
      });
      document.body.appendChild(popup);
      popup.style.top = `${window.scrollY + window.innerHeight / 2 - 150}px`;
      popup.style.left = `${window.scrollX + window.innerWidth / 2 - 200}px`;
    }
  });

  // ---- Init ----

  // Wait for page to settle, then scan
  setTimeout(async () => {
    await scanPage();
    createFillAllButton();
  }, 1500);

  // Re-scan on DOM changes (SPAs, dynamically loaded forms)
  const observer = new MutationObserver(() => {
    clearTimeout(observer._debounce);
    observer._debounce = setTimeout(scanPage, 2000);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removePopups();
  });

  // Close popups on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autofill-popup') && !e.target.closest('.autofill-btn')) {
      removePopups();
    }
  });
})();
