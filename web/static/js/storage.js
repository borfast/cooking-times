(function (window) {
  const PLAN_KEY = "cookingTimes.plan";
  const TIMER_KEY_PREFIX = "cookingTimes.timer.";

  function savePlan(plan) {
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    } catch (err) {
      console.warn("Unable to persist plan", err);
    }
  }

  function loadPlan() {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn("Unable to load persisted plan", err);
      return null;
    }
  }

  function clearPlan() {
    try {
      localStorage.removeItem(PLAN_KEY);
    } catch (err) {
      console.warn("Unable to clear persisted plan", err);
    }
  }

  function saveTimerState(planId, state) {
    if (!planId) return;
    try {
      localStorage.setItem(TIMER_KEY_PREFIX + planId, JSON.stringify(state));
    } catch (err) {
      console.warn("Unable to persist timer state", err);
    }
  }

  function loadTimerState(planId) {
    if (!planId) return null;
    try {
      const raw = localStorage.getItem(TIMER_KEY_PREFIX + planId);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn("Unable to load timer state", err);
      return null;
    }
  }

  function clearTimerState(planId) {
    if (!planId) return;
    try {
      localStorage.removeItem(TIMER_KEY_PREFIX + planId);
    } catch (err) {
      console.warn("Unable to clear timer state", err);
    }
  }

  window.PlanStorage = {
    savePlan,
    loadPlan,
    clearPlan,
    saveTimerState,
    loadTimerState,
    clearTimerState,
  };
})(window);
