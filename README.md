# Filli ✨

**Stop retyping the same job application answers. Filli remembers them for you.**

Filli is a Firefox extension that auto-fills job application forms using your saved answers and profile data. It works on Greenhouse, Lever, Ashby, Workday, LinkedIn, and 20+ other job platforms — every field type, every time.

---

## The Problem

You're applying to 10, 20, 50 jobs. Every application asks the same questions:

- "Why do you want to work here?"
- "Describe your most impressive project"
- "Are you authorized to work in the US?"
- First name, last name, email, phone, LinkedIn...

You're copying and pasting from a doc. Or worse, retyping. Each application takes 15–30 minutes of mechanical work that adds zero value.

## The Solution

Filli watches you fill out one application. It asks to save your answers. From then on, every similar question on every future application is filled automatically the moment the page loads.

**One application's effort. Every future application's benefit.**

---

## What It Does

### 🚀 Auto-fills on page load
Open a job application — Filli scans the page, matches questions against your saved answers, and fills everything it recognizes. Text fields, dropdowns, radio buttons, checkboxes. You see a toast: "✨ Auto-filled 12 fields."

### 👤 Profile data fills instantly
Name, email, phone, LinkedIn, GitHub, location, zip code — saved once in your profile, filled on every application form. No matching needed, no delay.

### 🧠 Learns as you apply
Type an answer Filli hasn't seen before, tab out of the field, and it asks: "Save this for future applications?" One click. Next time a similar question appears — filled.

### 🎯 Smart matching, not keyword matching
Filli uses intent-based matching. It understands that "Why are you interested in working at Suno?" and "Why do you want to work at Discord?" are the same type of question, even though the words are completely different. It matches the *structure* of the question, not just the keywords.

### 📋 Handles every field type
- **Text fields** and **textareas** — short answers and long essays
- **Dropdowns** (`<select>`) — years of experience, office location, veteran status
- **Radio buttons** — Yes/No, multiple choice
- **Checkboxes** — "I agree to the privacy policy", confirmations
- **Contenteditable divs** — rich text editors used by some platforms

### 🔒 100% local
All data stays in your browser. No accounts, no servers, no analytics, no tracking. Your answers never leave your machine.

---

## How to Use It

### First time setup (2 minutes)

1. **Install from the Firefox Add-ons store** (or load temporarily via `about:debugging`)
2. **Click the ✨ icon** in the toolbar → **Profile** tab
3. **Fill in your info**: name, email, phone, LinkedIn, location
4. **Click Save Profile**
5. **Go to Settings** → **Seed from Jobscanner History** to load 19 pre-built answers for common questions, or start fresh

### Daily use (zero effort)

1. Open a job application page
2. Watch fields fill automatically
3. Review and adjust as needed (click ✨ buttons for alternative answers)
4. When you type a new answer, Filli asks to save it
5. Next application — even more fields fill automatically

### Building your answer library

**Automatic**: Just apply to jobs normally. Filli prompts you to save new answers as you go. After 5–10 applications, most questions are covered.

**Manual**: Click the ✨ icon → **+ Add** tab → type a question and answer → Save.

**Right-click**: Select any text on a page → right-click → "Save selected text as answer" → add the question it answers.

**Import**: Click ✨ → **Settings** → **Import JSON**. Share answer libraries between browsers or back them up.

---

## Supported Platforms

Works on any site with a URL containing `careers`, `jobs`, `apply`, `application`, `hiring`, `openings`, or `position` — plus direct support for:

| Platform | Coverage |
|----------|----------|
| Greenhouse | ✅ Full |
| Lever | ✅ Full |
| Ashby | ✅ Full |
| Workday | ✅ Full |
| LinkedIn | ✅ Full |
| Indeed | ✅ Full |
| SmartRecruiters | ✅ Full |
| iCIMS | ✅ Full |
| Taleo | ✅ Full |
| Jobvite | ✅ Full |
| BreezyHR | ✅ Full |
| BambooHR | ✅ Full |
| JazzHR | ✅ Full |
| Recruitee | ✅ Full |
| Gem | ✅ Full |
| Dover | ✅ Full |
| Rippling | ✅ Full |
| Wellfound | ✅ Full |
| Comeet | ✅ Full |
| Fountain | ✅ Full |
| SuccessFactors | ✅ Full |
| Any careers page | ✅ Via URL matching |

---

## Time Saved

| Scenario | Without Filli | With Filli |
|----------|--------------|------------|
| First application | 20 min | 20 min (answers get saved) |
| Second application | 20 min | 5 min (most fields auto-filled) |
| 10th application | 20 min | 2 min (review and submit) |
| 50 applications | ~17 hours | ~3 hours |

**At 50 applications, Filli saves you ~14 hours of mechanical typing.**

---

## Privacy

- All data stored locally in `browser.storage.local`
- Zero network requests — the extension never contacts any server
- No analytics, no telemetry, no tracking
- No account required
- Export your data anytime as JSON — you own it completely
- Open source: read every line of code yourself

---

## FAQ

**Q: Does it work on Chrome?**
A: Not yet. Firefox only for now.

**Q: Will it overwrite answers I've already typed?**
A: No. Filli only fills empty fields. If a field already has content, it's skipped.

**Q: What if the match is wrong?**
A: Click the ✨ button next to any field to see all matching answers, preview them, or pick a different one. You can also edit after filling.

**Q: Can I use different answers for different companies?**
A: Yes. Save company-specific "Why [company]?" answers — Filli matches on question intent, so "Why Discord?" pulls your Discord-specific answer, not a generic one.

**Q: How do I back up my answers?**
A: Click ✨ → Settings → Export JSON. Import it on another browser or after a reinstall.

**Q: Does it handle file uploads (resume, cover letter)?**
A: No. Filli handles text-based form fields only. Resume upload fields are left untouched.

---

## Install

**Firefox Add-ons Store**: [addons.mozilla.org/addon/filli](https://addons.mozilla.org/addon/filli)

**Manual install**:
1. Download the latest `.xpi` from Releases
2. Open Firefox → `about:addons` → gear icon → "Install Add-on From File"
3. Select the `.xpi` file

---

## License

MIT
