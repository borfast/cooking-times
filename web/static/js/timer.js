(function (window) {
  function timerComponent() {
    return {
      visible: false,
      plan: null,
      pendingSteps: [],
      elapsedSeconds: 0,
      status: "idle",
      pollingId: null,
      liveMessage: "",
      init() {
        window.__timerComponent = this;
        const persistedPlan = window.PlanStorage.loadPlan();
        if (persistedPlan) {
          this.attachPlan(persistedPlan);
          const savedState = window.PlanStorage.loadTimerState(persistedPlan.plan_id);
          if (savedState) {
            this.ingestSession(savedState);
            if (!this.isComplete()) {
              this.schedulePoll();
            }
          } else {
            this.refreshState();
          }
        }
      },
      attachPlan(plan) {
        this.plan = plan;
        this.visible = true;
        this.status = "ready";
        window.PlanStorage.savePlan(plan);
        window.PlanStorage.clearTimerState(plan.plan_id);
        this.pendingSteps = plan.steps || [];
        this.elapsedSeconds = 0;
        this.liveMessage = "";
      },
      start() {
        if (!this.plan) return;
        const stop = window.TimerMetrics.measure("timer.start");
        this.status = "starting";
        fetch("/api/v1/timer/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_id: this.plan.plan_id }),
        })
          .then((resp) => resp.json())
          .then((data) => {
            stop();
            this.ingestSession(data);
            this.status = "running";
            window.NotificationService.ensurePermission();
            this.schedulePoll();
          })
          .catch((err) => {
            console.error("Failed to start timer", err);
            this.status = "error";
          });
      },
      pause() {
        this.postCommand("/api/v1/timer/pause");
      },
      resume() {
        this.postCommand("/api/v1/timer/resume");
      },
      acknowledge(sequence) {
        this.postCommand("/api/v1/timer/acknowledge", { sequence_number: sequence });
      },
      postCommand(endpoint, extra) {
        if (!this.plan) return;
        const payload = Object.assign({ plan_id: this.plan.plan_id }, extra || {});
        const stop = window.TimerMetrics.measure(endpoint);
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then((resp) => resp.json())
          .then((data) => {
            stop();
            this.ingestSession(data);
            if (!this.isComplete()) {
              this.status = "running";
              this.schedulePoll();
            } else {
              this.status = "complete";
              this.clearPoll();
            }
          })
          .catch((err) => {
            console.error(`Command ${endpoint} failed`, err);
            this.status = "error";
          });
      },
      ingestSession(session) {
        if (!session || !this.plan) return;
        this.plan.plan_id = session.plan_id || this.plan.plan_id;
        this.elapsedSeconds = session.elapsed_seconds || 0;
        this.pendingSteps = session.pending_steps || [];
        this.liveMessage = this.pendingSteps.length ? this.pendingSteps[0].message : "All steps complete";
        window.PlanStorage.saveTimerState(this.plan.plan_id, session);
        this.maybeNotify();
      },
      maybeNotify() {
        if (!this.pendingSteps.length) return;
        const next = this.pendingSteps[0];
        if (next.offset_seconds <= this.elapsedSeconds + 1) {
          window.NotificationService.notify("Next cooking step", next.message);
        }
      },
      schedulePoll() {
        this.clearPoll();
        this.pollingId = window.setTimeout(() => this.refreshState(), 5000);
      },
      clearPoll() {
        if (this.pollingId) {
          window.clearTimeout(this.pollingId);
          this.pollingId = null;
        }
      },
      refreshState() {
        if (!this.plan) return;
        fetch(`/api/v1/timer/state?planId=${encodeURIComponent(this.plan.plan_id)}`)
          .then((resp) => {
            if (resp.status === 404) {
              this.status = "ready";
              return null;
            }
            return resp.json();
          })
          .then((data) => {
            if (!data) {
              return;
            }
            this.ingestSession(data);
            if (!this.isComplete()) {
              this.status = data.paused ? "paused" : "running";
              this.schedulePoll();
            } else {
              this.status = "complete";
            }
          })
          .catch((err) => console.error("Failed to refresh timer", err));
      },
      isComplete() {
        return this.pendingSteps.length === 0;
      },
    };
  }

  window.timerComponent = timerComponent;
  window.TimerController = {
    loadPlan(plan) {
      window.PlanStorage.savePlan(plan);
      if (window.__timerComponent) {
        window.__timerComponent.attachPlan(plan);
        window.__timerComponent.refreshState();
      }
    },
  };
})(window);
