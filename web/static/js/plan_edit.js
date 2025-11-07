(function (window, document) {
  function planEditorComponent(parent) {
    return {
      parent,
      editing: false,
      selectedStep: null,
      adjustment: {
        remove_food_ids: [],
        update_durations_seconds: {},
        add_steps: [],
      },
      get plan() {
        return this.parent?.plan || null;
      },
      init() {
        this.editing = !!this.plan;
      },
      toggleEditing() {
        this.editing = !this.editing;
        if (!this.editing) {
          this.reset();
        }
      },
      reset() {
        this.adjustment = {
          remove_food_ids: [],
          update_durations_seconds: {},
          add_steps: [],
        };
      },
      markForRemoval(foodId) {
        if (!foodId) return;
        if (!this.adjustment.remove_food_ids.includes(foodId)) {
          this.adjustment.remove_food_ids.push(foodId);
        }
      },
      updateDuration(foodId, minutes) {
        const value = Number(minutes);
        if (!Number.isFinite(value)) {
          delete this.adjustment.update_durations_seconds[foodId];
          return;
        }
        this.adjustment.update_durations_seconds[foodId] = value * 60;
      },
      appendStep(foodId, offsetMinutes, durationMinutes, message) {
        const offset = Number(offsetMinutes);
        const duration = Number(durationMinutes);
        if (!foodId || !Number.isFinite(offset) || !Number.isFinite(duration)) {
          return;
        }
        this.adjustment.add_steps.push({
          food_id: foodId,
          offset_seconds: offset * 60,
          duration_seconds: duration * 60,
          message,
        });
        if (this.$refs.addFood) this.$refs.addFood.value = "";
        if (this.$refs.addOffset) this.$refs.addOffset.value = "";
        if (this.$refs.addDuration) this.$refs.addDuration.value = "";
        if (this.$refs.addMessage) this.$refs.addMessage.value = "";
      },
      submit() {
        if (!this.plan) return;
        const payload = Object.assign({ plan_id: this.plan.plan_id }, this.adjustment);
        fetch(`/api/v1/plans/recalculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then((resp) => {
            if (!resp.ok) {
              return resp.json().then((data) => {
                throw new Error(data.error || "Unable to recalculate plan");
              });
            }
            return resp.json();
          })
          .then((data) => {
            if (data.plan) {
              window.PlanStorage.savePlan(data.plan);
              const results = document.getElementById("plan-results");
              if (results) {
                results.innerHTML = `<h2>Cooking timeline</h2>${window.renderPlan(data.plan)}`;
              }
              window.TimerController.loadPlan(data.plan);
              this.reset();
              this.editing = false;
            }
          })
          .catch((err) => {
            console.error(err);
            alert("Failed to apply adjustments: " + err.message);
          });
      },
    };
  }

  window.planEditorComponent = planEditorComponent;
})(window, document);
