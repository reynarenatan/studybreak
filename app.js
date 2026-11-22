/*
  StudyBreak — app.js
  CS1102 group project (CityUHK)

  This file controls the SCREENS, the TIMERS and the BUTTONS.
  It does NOT contain the rules (which break to suggest, which tips to show).
  Those come from logic.js, which must be loaded BEFORE this file.

  logic.js puts its functions inside one object called StudyBreakLogic.
  We call them like this: logic.getBreakSuggestion(...)
    logic.getBreakSuggestion(place, deadline) -> { minutes, text }
    logic.getEndResults(session)              -> { tips, services, showSupportBox }
    logic.buildSummary(session)               -> string

  How this file is organised:
    1. The session object (all the student's answers)
    2. Finding the HTML elements we need
    3. Showing one screen at a time
    4. The countdown timer (uses clock time)
    5. Getting the student's attention (tab title + beep)
    6. Form checking (validation)
    7. The session flow: start -> focus -> prompt -> break -> after-break -> ...
    8. Ending the session and showing results
    9. Copy summary and feedback form buttons
   10. Connecting buttons and forms to the functions above
*/


/* ============================================================
   0. CONNECTING TO logic.js
   A short name for the object that holds all of logic.js's functions.
   If logic.js failed to load (for example, because of a typing mistake
   in it), this explains the problem in the browser console (F12).
   ============================================================ */
const logic = window.StudyBreakLogic;
if (!logic) {
  console.error("StudyBreak: logic.js did not load. Check it for errors and that it is loaded before app.js.");
}


/* ============================================================
   1. THE SESSION OBJECT
   Uses exactly the format agreed with the logic.js teammate.
   null means "not answered yet".
   ============================================================ */
const session = {
  focusMin: null,        // 25 | 45 | 60
  place: null,           // "library" | "dorm" | "other"
  deadline: null,        // "today" | "3days" | "week" | "none"
  moodStart: null,       // 1-5
  overwhelmStart: null,  // 1-5
  breaks: [],            // one object per break prompt (see below)
  moodEnd: null,         // 1-5
  overwhelmEnd: null,    // 1-5
  shortSleep: null       // true | false
};

/*
  Each item in session.breaks looks like this:
    "Not now":         { prompted: true, taken: false, moved: null,  focus: null }
    Completed break:   { prompted: true, taken: true,  moved: "walk", focus: 4 }
*/

// Extra values app.js needs while running (NOT part of the session object)
let currentSuggestion = null;  // the { minutes, text } for the current break
let currentBreak = null;       // the break record being filled in right now
let promptIsShowing = false;   // true while the break prompt is on screen
let sessionActive = false;     // true from "Start" until the results screen


/* ============================================================
   2. FINDING THE HTML ELEMENTS
   We look them up once and keep them in constants.
   ============================================================ */
const screens = document.querySelectorAll(".screen");
const supportBox = document.getElementById("support-box");

const startForm = document.getElementById("start-form");
const afterForm = document.getElementById("after-form");
const endForm = document.getElementById("end-form");

const startError = document.getElementById("start-error");
const afterError = document.getElementById("after-error");
const endError = document.getElementById("end-error");

const focusLabel = document.getElementById("focus-label");
const focusTime = document.getElementById("focus-time");
const breakTime = document.getElementById("break-time");
const breakActivity = document.getElementById("break-activity");
const promptMinutes = document.getElementById("prompt-minutes");
const promptActivity = document.getElementById("prompt-activity");

const resultsTips = document.getElementById("results-tips");
const resultsServices = document.getElementById("results-services");
const summaryText = document.getElementById("summary-text");
const copyStatus = document.getElementById("copy-status");

const ORIGINAL_TITLE = document.title;  // "StudyBreak"
const SNOOZE_MINUTES = 5;               // "Not now" shows the prompt again after 5 minutes


/* ============================================================
   3. SHOWING ONE SCREEN AT A TIME
   ============================================================ */

// Screens that are part of the study loop. If the student chose 5 for
// overwhelm at the start, the support box shows on all of them.
const IN_SESSION_SCREENS = ["screen-focus", "screen-prompt", "screen-break", "screen-after"];

// Set to true by showResults() if getEndResults() says so
let showSupportOnResults = false;

function showScreen(screenId) {
  // Hide every screen except the one we want
  screens.forEach(function (screen) {
    screen.hidden = (screen.id !== screenId);
  });

  // Decide whether the support box should be visible on this screen
  const onSessionScreen = IN_SESSION_SCREENS.includes(screenId);
  if (onSessionScreen && session.overwhelmStart === 5) {
    supportBox.hidden = false;
  } else if (screenId === "screen-results" && showSupportOnResults) {
    supportBox.hidden = false;
  } else {
    supportBox.hidden = true;
  }

  // Put the tab title back to normal (alerts change it; see section 5)
  document.title = ORIGINAL_TITLE;

  // Scroll to the top and move focus to the new screen's heading, so
  // screen-reader users hear which screen they are on
  window.scrollTo(0, 0);
  const heading = document.querySelector("#" + screenId + " h2");
  if (heading) {
    heading.focus();
  }
}


/* ============================================================
   4. THE COUNTDOWN TIMER (uses CLOCK TIME)

   Why clock time? Browsers slow down or pause code in background tabs
   and on locked phones. If we just subtracted 1 every second, the timer
   would fall behind. Instead we save the exact END time, and every tick
   we calculate: remaining = endTime - current time.
   So even if ticks are delayed, the time shown is always correct.
   ============================================================ */

let timerEndTime = 0;      // when the countdown finishes (milliseconds since 1970)
let timerId = null;        // the ID from setInterval, so we can stop it
let timerDisplay = null;   // which element shows the time
let timerOnFinish = null;  // what to do when time is up

// Start a countdown of `minutes`, showing it in `displayElement`,
// then call `onFinish` when it reaches zero.
function startCountdown(minutes, displayElement, onFinish) {
  stopCountdown();  // make sure only one timer runs at a time

  timerEndTime = Date.now() + minutes * 60 * 1000;
  timerDisplay = displayElement;
  timerOnFinish = onFinish;

  tick();                              // show the starting time straight away
  timerId = setInterval(tick, 500);    // check twice a second (smoother than once)
}

function stopCountdown() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

// Runs every 500 ms while a timer is active
function tick() {
  const msLeft = timerEndTime - Date.now();

  if (msLeft <= 0) {
    timerDisplay.textContent = "0:00";
    stopCountdown();
    timerOnFinish();
    return;
  }

  // Math.ceil rounds UP, so the display shows 25:00 at the start
  // and 0:01 in the final second (never 0:00 before time is really up)
  timerDisplay.textContent = formatTime(Math.ceil(msLeft / 1000));
}

// Turn a number of seconds into "m:ss", e.g. 299 -> "4:59"
function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ":" + String(seconds).padStart(2, "0");
}

// When the student comes back to the tab, update the timer immediately
// instead of waiting for the next (possibly delayed) tick
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && timerId !== null) {
    tick();
  }
});


/* ============================================================
   5. GETTING THE STUDENT'S ATTENTION
   When a timer ends, the tab might be in the background, so we:
   - change the tab title (visible in the tab bar)
   - play a short, soft beep using the browser's built-in Web Audio API
   ============================================================ */

let audioContext = null;

// Browsers only allow sound after the user has tapped something,
// so we prepare the sound system when they tap "Start".
function prepareSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx && !audioContext) {
      audioContext = new AudioCtx();
    }
  } catch (error) {
    audioContext = null;  // sound not supported: the app still works without it
  }
}

function playBeep() {
  if (!audioContext) {
    return;
  }
  try {
    audioContext.resume();                       // wake it up if the browser paused it
    const oscillator = audioContext.createOscillator();  // makes the tone
    const volume = audioContext.createGain();            // controls loudness
    oscillator.type = "sine";                    // smooth, gentle tone
    oscillator.frequency.value = 660;            // pitch in Hz
    volume.gain.value = 0.15;                    // quiet (1 = full volume)
    oscillator.connect(volume);
    volume.connect(audioContext.destination);    // send to the speakers
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.4);  // beep for 0.4 seconds
  } catch (error) {
    // Ignore sound errors: the title change still works
  }
}

function getAttention(titleText) {
  document.title = titleText + " – StudyBreak";
  playBeep();
}


/* ============================================================
   6. FORM CHECKING (VALIDATION)
   ============================================================ */

// Returns the value of the checked radio button called `name`
// inside `form`, or null if none is checked.
function getChecked(form, name) {
  const checked = form.querySelector('input[name="' + name + '"]:checked');
  return checked ? checked.value : null;
}

// Checks that every question in `names` has an answer.
// If not, shows a message in `errorElement`, moves focus to the first
// unanswered question, and returns false.
function allAnswered(form, names, errorElement) {
  const unanswered = names.filter(function (name) {
    return getChecked(form, name) === null;
  });

  if (unanswered.length === 0) {
    errorElement.textContent = "";
    return true;
  }

  const questionWord = unanswered.length === 1 ? "question" : "questions";
  errorElement.textContent =
    "Please answer every question before continuing (" +
    unanswered.length + " " + questionWord + " left).";

  // Move keyboard focus to the first option of the first unanswered question
  form.querySelector('input[name="' + unanswered[0] + '"]').focus();
  return false;
}

// Clear an error message as soon as the student answers anything
function clearErrorOnChange(form, errorElement) {
  form.addEventListener("change", function () {
    errorElement.textContent = "";
  });
}


/* ============================================================
   7. THE SESSION FLOW
   ============================================================ */

// Step 1: student taps "Start" on the start screen
function handleStart(event) {
  event.preventDefault();  // stop the form from reloading the page

  const questions = ["focusMin", "place", "deadline", "moodStart", "overwhelmStart"];
  if (!allAnswered(startForm, questions, startError)) {
    return;  // stay on the start screen until everything is answered
  }

  // Save the answers. Number() turns text like "25" into the number 25.
  session.focusMin = Number(getChecked(startForm, "focusMin"));
  session.place = getChecked(startForm, "place");
  session.deadline = getChecked(startForm, "deadline");
  session.moodStart = Number(getChecked(startForm, "moodStart"));
  session.overwhelmStart = Number(getChecked(startForm, "overwhelmStart"));

  sessionActive = true;
  prepareSound();
  startFocusBlock();
}

// Step 2: a focus block counts down the chosen focus time
function startFocusBlock() {
  focusLabel.textContent = "Focus time";
  showScreen("screen-focus");
  startCountdown(session.focusMin, focusTime, showBreakPrompt);
}

// Step 3: time is up, so show the break prompt with a suggestion from logic.js
function showBreakPrompt() {
  currentSuggestion = logic.getBreakSuggestion(session.place, session.deadline);
  promptMinutes.textContent = currentSuggestion.minutes;
  promptActivity.textContent = currentSuggestion.text;

  promptIsShowing = true;
  showScreen("screen-prompt");
  getAttention("⏰ Break time");
}

// Step 3a: "Not now" = prompted but not taken. Remind again in 5 minutes.
function handleNotNow() {
  session.breaks.push({ prompted: true, taken: false, moved: null, focus: null });
  promptIsShowing = false;

  // Reuse the focus screen to show the countdown to the next reminder
  focusLabel.textContent = "Next break reminder in";
  showScreen("screen-focus");
  startCountdown(SNOOZE_MINUTES, focusTime, showBreakPrompt);
}

// Step 4: "Start break" counts down the break length from logic.js
function handleStartBreak() {
  // Create the break record now; "moved" and "focus" are filled in after the break
  currentBreak = { prompted: true, taken: true, moved: null, focus: null };
  session.breaks.push(currentBreak);
  promptIsShowing = false;

  breakActivity.textContent = currentSuggestion.text;
  showScreen("screen-break");
  startCountdown(currentSuggestion.minutes, breakTime, showAfterBreak);
}

// Step 5: break is over, so ask the two after-break questions
function showAfterBreak() {
  afterForm.reset();          // clear answers from the previous break
  afterError.textContent = "";
  showScreen("screen-after");
  getAttention("Break over");
}

// Step 5a: student taps "Continue studying"
function handleAfterBreak(event) {
  event.preventDefault();

  if (!allAnswered(afterForm, ["moved", "focus"], afterError)) {
    return;
  }

  // Save the answers into the break record we created in handleStartBreak()
  currentBreak.moved = getChecked(afterForm, "moved");
  currentBreak.focus = Number(getChecked(afterForm, "focus"));
  currentBreak = null;

  startFocusBlock();  // the next focus block starts automatically
}


/* ============================================================
   8. ENDING THE SESSION AND SHOWING RESULTS
   ============================================================ */

// Step 6: "End session" (on any timer screen) leads to the end check-in
function handleEndSession() {
  // Ask first, so an accidental tap doesn't end the session
  const sure = window.confirm("End your study session now?");
  if (!sure) {
    return;
  }

  stopCountdown();

  // If the break prompt was on screen, the break was offered but not
  // taken, so record it the same way as "Not now".
  if (promptIsShowing) {
    session.breaks.push({ prompted: true, taken: false, moved: null, focus: null });
    promptIsShowing = false;
  }
  // If they end DURING a break, that break stays as taken: true with
  // moved and focus left as null (the after-break questions were never asked).

  showScreen("screen-end");
}

// Step 7: student taps "See my results" on the end check-in
function handleEndCheckIn(event) {
  event.preventDefault();

  if (!allAnswered(endForm, ["moodEnd", "overwhelmEnd", "shortSleep"], endError)) {
    return;
  }

  session.moodEnd = Number(getChecked(endForm, "moodEnd"));
  session.overwhelmEnd = Number(getChecked(endForm, "overwhelmEnd"));
  session.shortSleep = (getChecked(endForm, "shortSleep") === "yes");  // true or false

  sessionActive = false;
  showResults();
}

// Step 8: fill in the results screen using logic.js
function showResults() {
  const results = logic.getEndResults(session);
  showSupportOnResults = results.showSupportBox;

  // Tips: one list item each.
  // We use textContent (not innerHTML) so text is always shown as plain text.
  resultsTips.innerHTML = "";  // remove anything from before
  results.tips.forEach(function (tip) {
    const item = document.createElement("li");
    // logic.js gives each tip as { id, text }. If a tip is plain text
    // instead, we use it as it is.
    item.textContent = (typeof tip === "string") ? tip : tip.text;
    resultsTips.appendChild(item);
  });

  // Services: a link with the service name, then its description
  resultsServices.innerHTML = "";
  results.services.forEach(function (service) {
    const item = document.createElement("li");

    const link = document.createElement("a");
    link.href = service.url;
    link.textContent = service.name;
    link.target = "_blank";             // open in a new tab
    link.rel = "noopener noreferrer";   // security: the new tab can't control this page

    const description = document.createElement("p");
    description.textContent = service.description;

    item.appendChild(link);
    item.appendChild(description);
    resultsServices.appendChild(item);
  });

  summaryText.textContent = logic.buildSummary(session);
  copyStatus.textContent = "";

  showScreen("screen-results");
}


/* ============================================================
   9. COPY SUMMARY AND FEEDBACK FORM BUTTONS
   ============================================================ */

function handleCopySummary() {
  const text = logic.buildSummary(session);

  // Modern method: works on HTTPS pages such as GitHub Pages
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(showCopied)
      .catch(function () {
        copyWithOldMethod(text);
      });
  } else {
    copyWithOldMethod(text);
  }
}

// Backup method for browsers where the modern one isn't available
// (e.g. when the page is opened as a local file for testing):
// put the text in a hidden text box, select it, and copy it.
function copyWithOldMethod(text) {
  const box = document.createElement("textarea");
  box.value = text;
  box.setAttribute("readonly", "");
  box.style.position = "fixed";   // keep it off-screen so the page doesn't jump
  box.style.left = "-9999px";
  document.body.appendChild(box);
  box.select();

  let worked = false;
  try {
    worked = document.execCommand("copy");
  } catch (error) {
    worked = false;
  }
  document.body.removeChild(box);

  if (worked) {
    showCopied();
  } else {
    copyStatus.textContent = "Could not copy. Please select the summary and copy it yourself.";
  }
}

function showCopied() {
  copyStatus.textContent = "Copied!";
  // Remove the message after 3 seconds
  setTimeout(function () {
    copyStatus.textContent = "";
  }, 3000);
}

function handleOpenForm() {
  // Opens the feedback form (testers fill it in themselves)
  window.open(logic.FORM_URL, "_blank", "noopener");
}


/* ============================================================
   10. CONNECTING BUTTONS AND FORMS TO THE FUNCTIONS
   ============================================================ */

startForm.addEventListener("submit", handleStart);
afterForm.addEventListener("submit", handleAfterBreak);
endForm.addEventListener("submit", handleEndCheckIn);

clearErrorOnChange(startForm, startError);
clearErrorOnChange(afterForm, afterError);
clearErrorOnChange(endForm, endError);

document.getElementById("btn-not-now").addEventListener("click", handleNotNow);
document.getElementById("btn-start-break").addEventListener("click", handleStartBreak);
document.getElementById("btn-copy").addEventListener("click", handleCopySummary);
document.getElementById("btn-form").addEventListener("click", handleOpenForm);

// There is one "End session" button on each timer screen; connect them all
document.querySelectorAll(".end-session-btn").forEach(function (button) {
  button.addEventListener("click", handleEndSession);
});

// Answers disappear when the page closes (see the privacy note), so warn
// the student if they try to close or reload in the middle of a session.
window.addEventListener("beforeunload", function (event) {
  if (sessionActive) {
    event.preventDefault();
    event.returnValue = "";  // needed by some browsers to show the warning
  }
});
