/*
 * StudyBreak - Coder B logic (Frederick)
 *
 * Functions for Coder A:
 * getBreakSuggestion(place, deadline)
 * getEndResults(session)
 * buildSummary(session)
 *
 * This file contains logic/data only. It does not create HTML.
 *
 * Changes made when combining with app.js (22 Nov):
 * - Removed a stray "x`" line in buildSummary() that stopped the file loading.
 * - Added PLACE_LABELS and DEADLINE_LABELS so the summary uses readable text.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StudyBreakLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSdm0D8-wD6F-SZpFpR8X9VCwD183cH7dLySZ5ZvOIS1okDEnQ/viewform";

  // Readable text for each code, used in the session summary.
  const PLACE_LABELS = Object.freeze({
    library: "Library",
    dorm: "Dorm or home",
    other: "Other"
  });

  const DEADLINE_LABELS = Object.freeze({
    today: "Today or tomorrow",
    "3days": "Within 3 days",
    week: "Within a week",
    none: "Nothing soon"
  });

  const SAFETY_BOX_TEXT =
    "If you would like support, contact CityUHK Counselling Service at 3442 8478. " +
    "Outside office hours, call the Caring Hotline at 5117 7807. " +
    "For an immediate emergency, call 999 (off campus) or CityUHK Security at 3442 8888 (on campus).";

  const DISCLAIMER =
    "This is a self-reflection tool, not medical advice.";

  const CITYU_SERVICES = Object.freeze([
    {
      id: "counselling",
      name: "CityUHK Counselling Service",
      description:
        "Confidential, free student counselling for academic, emotional or personal concerns. Appointments: 3442 8478. After-hours Caring Hotline: 5117 7807.",
      phone: "3442 8478",
      afterHoursPhone: "5117 7807",
      url: "https://www.cityu.edu.hk/en/sds/counselling-service/psychological-counselling/meeting-counsellor"
    },
    {
      id: "tourheart",
      name: "TourHeart+ online self-help resources",
      description:
        "CityUHK-linked mental wellbeing resources, self-help modules, exercises and the Boon AI companion. This is not a substitute for professional counselling.",
      url: "https://www.cityu.edu.hk/sds/cs/tourheart/"
    },
    {
      id: "caringLeague",
      name: "Caring League",
      description:
        "A Counselling Service programme promoting caring and peer support.",
      url: "https://www.cityu.edu.hk/en/sds/counselling-service/growth-corner/growth-caring/caring-league"
    },
    {
      id: "fitnessRoom",
      name: "Physical Fitness Room",
      description:
        "7/F Hu Fa Kuang Sports Centre, Jockey Club One Health Tower. Open 08:00–22:00 daily except public holidays. Eligible users must book through SFBI; charges may apply.",
      openingHours: "08:00–22:00 daily except public holidays",
      url: "https://www.cityu.edu.hk/sds/physical-education-wellness-and-sports/sports-and-recreation-facilities/general-information"
    }
  ]);

  const SERVICE_BY_ID = Object.freeze(
    Object.fromEntries(CITYU_SERVICES.map(service => [service.id, service]))
  );

  function normalisePlace(place) {
    const value = String(place || "").trim().toLowerCase();

    if (value === "library") return "library";

    if (
      ["dorm", "home", "dorm or home", "dorm/home"].includes(value)
    ) return "dorm";

    if (value === "other") return "other";

    throw new TypeError(
      'place must be "library", "dorm", or "other".'
    );
  }

  function normaliseDeadline(deadline) {
    const value = String(deadline || "").trim().toLowerCase();

    if (
      ["today", "today/tomorrow", "today or tomorrow", "tomorrow"].includes(value)
    ) return "today";

    if (
      ["3days", "3 days", "within 3 days", "within_3_days"].includes(value)
    ) return "3days";

    if (
      ["week", "within a week", "within_a_week"].includes(value)
    ) return "week";

    if (
      ["none", "nothing soon", "nothing_soon"].includes(value)
    ) return "none";

    throw new TypeError(
      'deadline must be "today", "3days", "week", or "none".'
    );
  }

  function isDeadlineClose(deadline) {
    const value = normaliseDeadline(deadline);
    return value === "today" || value === "3days";
  }

  // Fixed break durations agreed with Coder A.
  function getBreakSuggestion(place, deadline) {
    const location = normalisePlace(place);
    const close = isDeadlineClose(deadline);

    if (location === "library" && close) {
      return {
        minutes: 3,
        text: "Stand up and stretch quietly at your desk."
      };
    }

    if (location === "library" && !close) {
      return {
        minutes: 5,
        text: "Take a short walk to refill your water, or use the stairs for one floor."
      };
    }

    if (location === "dorm" && close) {
      return {
        minutes: 3,
        text: "Stand up, stretch gently, and walk around the room."
      };
    }

    if (location === "dorm" && !close) {
      return {
        minutes: 10,
        text: "Walk outside your room, refill your water, or do some light stretches."
      };
    }

    return {
      minutes: 5,
      text: "Stand up and stretch, or take a short walk if space allows."
    };
  }

  function validateRating(value, fieldName) {
    const number = Number(value);

    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > 5
    ) {
      throw new TypeError(
        fieldName + " must be a whole number from 1 to 5."
      );
    }

    return number;
  }

  function getBreakStats(session) {
    const breaks = Array.isArray(session.breaks)
      ? session.breaks
      : [];

    const prompted = breaks.filter(
      item => item && item.prompted === true
    );

    const taken = prompted.filter(
      item => item.taken === true
    );

    const moving = taken.filter(
      item => item.moved === "walk" || item.moved === "stand"
    );

    const seated = taken.filter(
      item => item.moved === "seated"
    );

    const average = list => {
      const ratings = list
        .map(item => Number(item.focus))
        .filter(
          value =>
            Number.isInteger(value) &&
            value >= 1 &&
            value <= 5
        );

      if (ratings.length === 0) return null;

      return Math.round(
        (ratings.reduce((sum, value) => sum + value, 0) /
          ratings.length) * 10
      ) / 10;
    };

    return {
      breaksPrompted: prompted.length,
      breaksTaken: taken.length,
      movingBreaks: moving.length,
      seatedBreaks: seated.length,
      averageFocusMoving: average(moving),
      averageFocusSeated: average(seated)
    };
  }

  function getEndResults(session) {
    if (!session || typeof session !== "object") {
      throw new TypeError("A session object is required.");
    }

    const moodStart = validateRating(session.moodStart, "moodStart");
    const overwhelmStart = validateRating(
      session.overwhelmStart,
      "overwhelmStart"
    );
    const moodEnd = validateRating(session.moodEnd, "moodEnd");
    const overwhelmEnd = validateRating(
      session.overwhelmEnd,
      "overwhelmEnd"
    );

    const place = normalisePlace(session.place);
    const closeDeadline = isDeadlineClose(session.deadline);
    const stats = getBreakStats(session);

    const allBreaksSkipped =
      stats.breaksPrompted > 0 &&
      stats.breaksTaken === 0;

    const mostBreaksSeated =
      stats.seatedBreaks > stats.movingBreaks;

    const stayedSeated =
      allBreaksSkipped || mostBreaksSeated;

    const shortSleep = session.shortSleep === true;

    const overwhelmed =
      overwhelmEnd === 4 || overwhelmEnd === 5;

    const showSupportBox =
      overwhelmStart === 5 || overwhelmEnd === 5;

    const tips = [];
    const serviceIds = [];

    if (overwhelmed) {
      tips.push({
        id: "overwhelmed",
        text: "It may help to share how you are feeling. CityUHK Counselling Service and Caring League are two places to explore support."
      });

      serviceIds.push("counselling", "caringLeague");
    }

    if (stayedSeated) {
      tips.push({
        id: "stayedSeated",
        text: "If it feels comfortable, try standing or walking briefly during your next break. For a longer activity, explore the Physical Fitness Room and check eligibility before booking."
      });

      serviceIds.push("fitnessRoom");
    }

    if (shortSleep && closeDeadline) {
      tips.push({
        id: "shortSleepAndDeadline",
        text: "Consider choosing tomorrow’s top priorities and planning a realistic stopping time, rather than cutting more sleep to finish everything."
      });
    }

    if (closeDeadline && !overwhelmed) {
      tips.push({
        id: "deadlineNotOverwhelmed",
        text: "With a deadline approaching, short check-ins may help. Explore CityUHK’s TourHeart+ online self-help resources."
      });

      serviceIds.push("tourheart");
    }

    if (tips.length === 0) {
      tips.push({
        id: "goodSession",
        text: "Good session. Keep choosing breaks that fit your schedule, and notice what helps you feel ready to study again."
      });
    }

    const uniqueServices = [
      ...new Set(serviceIds)
    ].map(id => SERVICE_BY_ID[id]);

    return {
      tips,
      services: uniqueServices,
      showSupportBox
    };
  }

  function displayAverage(value) {
    return value === null ? "N/A" : String(value);
  }

  function buildSummary(session) {
    if (!session || typeof session !== "object") {
      throw new TypeError("A session object is required.");
    }

    const stats = getBreakStats(session);

    const moodStart = validateRating(session.moodStart, "moodStart");
    const moodEnd = validateRating(session.moodEnd, "moodEnd");
    const overwhelmStart = validateRating(
      session.overwhelmStart,
      "overwhelmStart"
    );
    const overwhelmEnd = validateRating(
      session.overwhelmEnd,
      "overwhelmEnd"
    );

    return [
      "StudyBreak session summary",
      `${stats.breaksPrompted} breaks prompted, ${stats.breaksTaken} taken, ${stats.movingBreaks} involving movement.`,
      `Average focus after moving breaks: ${displayAverage(stats.averageFocusMoving)}; after seated breaks: ${displayAverage(stats.averageFocusSeated)}.`,
      `Mood: ${moodStart} → ${moodEnd}.`,
      `Overwhelm: ${overwhelmStart} → ${overwhelmEnd}.`,
      `Focus length: ${Number(session.focusMin)} minutes.`,
      `Study place: ${PLACE_LABELS[normalisePlace(session.place)]}.`,
      `Next deadline: ${DEADLINE_LABELS[normaliseDeadline(session.deadline)]}.`,
      DISCLAIMER
    ].join("\n");
  }

  return Object.freeze({
    getBreakSuggestion,
    getEndResults,
    buildSummary,
    getBreakStats,
    isDeadlineClose,
    CITYU_SERVICES,
    SAFETY_BOX_TEXT,
    DISCLAIMER,
    FORM_URL
  });
});