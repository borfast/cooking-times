function plannerForm() {
  return {
    mode: "start_now",
    foods: [],
    items: [newPlannerItem()],
    async init() {
      // Fetch foods from the API
      try {
        const response = await fetch('/api/v1/foods');
        const data = await response.json();
        this.foods = data.foods || [];
      } catch (err) {
        console.error('Failed to load foods:', err);
        // Fallback to empty array - user will see error in UI
        this.foods = [];
      }
    },
    addItem() {
      this.items.push(newPlannerItem());
    },
    removeItem(index) {
      this.items.splice(index, 1);
    },
    levelOptions(foodId) {
      const food = this.foods.find((f) => f.id === foodId);
      return food ? food.levels : [];
    },
  };
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for browsers without crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function newPlannerItem() {
  return { id: generateUUID(), foodId: "", level: "" };
}

function buildPayload(form) {
  const mode = form.querySelector('input[name="mode"]:checked')?.value ?? "start_now";
  const finishValue = form.querySelector('input[name="target_finish_time"]')?.value;
  const items = [];

  form.querySelectorAll(".planner__item").forEach((row) => {
    const food = row.querySelector('[data-food-select]')?.value;
    const level = row.querySelector('[data-level-select]')?.value;
    if (food && level) {
      items.push({ food_id: food, selected_level: level });
    }
  });

  const payload = { mode, items };
  if (mode === "finish_by" && finishValue) {
    const finish = new Date(finishValue);
    payload.target_finish_time = finish.toISOString();
  }

  const stored = window.PlanStorage.loadPlan();
  if (stored?.plan_id) {
    payload.plan_id = stored.plan_id;
  }

  return payload;
}

window.renderPlan = function renderPlan(plan) {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    return `<p class="results__empty">We couldn't generate a schedule for the selected foods.</p>`;
  }

  const start = new Date(plan.start_time);
  const finish = new Date(plan.target_finish_time);

  const stepsMarkup = plan.steps
    .map((step) => {
      const stepTime = new Date(start.getTime() + (step.offset_seconds || 0) * 1000);
      const timeLabel = stepTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `
        <li class="timeline__item">
          <div class="timeline__time">${timeLabel}</div>
          <div class="timeline__message">${step.message}</div>
        </li>
      `;
    })
    .join("");

  const finishLabel = finish.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return `
    <div class="timeline__summary">
      <p><strong>Plan ID:</strong> ${plan.plan_id}</p>
      <p><strong>Start:</strong> ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
      <p><strong>Finish:</strong> ${finishLabel}</p>
    </div>
    <ul class="timeline">${stepsMarkup}</ul>
  `;
}

function renderError(message) {
  return `<p role="alert" class="results__empty">${message}</p>`;
}

function attachHTMXHooks() {
  document.body.addEventListener("htmx:configRequest", (event) => {
    const { elt } = event.detail;
    if (elt && elt.id === "plan-form") {
      const payload = buildPayload(elt);
      event.detail.headers["Content-Type"] = "application/json";
      event.detail.parameters = {};
      event.detail.body = JSON.stringify(payload);
    }
  });

  document.body.addEventListener("htmx:afterRequest", (event) => {
    const { elt, xhr, target } = event.detail;
    if (elt && elt.id === "plan-form") {
      event.detail.shouldSwap = false;
      try {
        const response = JSON.parse(xhr.responseText || "{}");
        if (response.plan) {
          window.PlanStorage.savePlan(response.plan);
          window.TimerController.loadPlan(response.plan);
        }
        if (target) {
          target.innerHTML = `<h2>Cooking timeline</h2>${renderPlan(response.plan)} `;
        }
      } catch (err) {
        if (target) {
          target.innerHTML = renderError("We could not read the planner response.");
        }
      }
    }
  });

  document.body.addEventListener("htmx:responseError", (event) => {
    const { elt, target, xhr } = event.detail;
    if (elt && elt.id === "plan-form") {
      event.detail.shouldSwap = false;
      let message = "Unable to generate plan. Please adjust your selections.";
      try {
        const payload = JSON.parse(xhr.responseText || "{}");
        if (payload.error) {
          message = payload.error;
        }
      } catch (err) {
        // ignore parse errors and fall back to default message
      }
      if (target) {
        target.innerHTML = renderError(message);
      }
    }
  });
}

function restoreExistingPlan() {
  const stored = window.PlanStorage.loadPlan();
  if (!stored?.plan_id) {
    return;
  }

  fetch(`/api/v1/plans/${encodeURIComponent(stored.plan_id)}`)
    .then((resp) => {
      if (!resp.ok) {
        throw new Error("plan not found");
      }
      return resp.json();
    })
    .then((data) => {
      if (data.plan) {
        window.PlanStorage.savePlan(data.plan);
        const results = document.getElementById("plan-results");
        if (results) {
          results.innerHTML = `<h2>Cooking timeline</h2>${renderPlan(data.plan)}`;
        }
        window.TimerController.loadPlan(data.plan);
      }
    })
    .catch(() => {
      window.PlanStorage.clearPlan();
    });
}

document.addEventListener("DOMContentLoaded", () => {
  attachHTMXHooks();
  restoreExistingPlan();
});
