import { calculateSchedule, recalculateSchedule } from './core/schedule.js';
import { formatTime as formatDuration } from './core/format.js';
import {
    readPlan,
    readSession,
    writeSession,
    clearSession,
    readCustomFoods,
    readOverrides,
} from './core/storage.js';
import { findFood, findOption, defaultOption } from './core/foods.js';
import {
    generateAlerts,
    regenerateAlerts,
    partitionDueAlerts,
    summariseMissed,
} from './core/alerts.js';

function timerApp() {
    return {
        // State
        schedule: { items: [], totalTime: 0 },
        status: 'created',
        startedAt: null,
        pausedElapsed: 0,
        elapsedSeconds: 0,
        remainingSeconds: 0,
        alerts: [],
        currentAlert: null,
        alertActive: false,
        alertType: '',
        timerInterval: null,
        lastTickSecond: null,
        lastSavedSecond: null,
        nextItemId: 0,

        // G8: inline messaging instead of blocking alert() dialogs.
        message: '',
        messageTone: 'error',

        // T059-T062: State for editing during timer
        availableFoods: [],
        selectedFoods: [], // Track original selected foods for recalculation
        addingFood: false,
        newFoodId: '',
        newFoodOptionId: '',
        editingFood: null,

        // Computed
        get statusMessage() {
            switch (this.status) {
                case 'created': return 'Ready to start cooking';
                case 'running': return 'Cooking in progress...';
                case 'paused': return 'Timer paused';
                case 'completed': return 'All done!';
                default: return '';
            }
        },

        // Initialize
        async init() {
            // Load available foods from API for add food functionality
            await this.loadAvailableFoods();

            const session = readSession(localStorage);
            if (session) {
                this.restoreSession(session);
            } else {
                this.loadFromScheduleStorage();
            }

            // G9: notification permission is requested from start(), on a user
            // gesture. Browsers penalise prompts raised on page load.
        },

        // T059: Load available foods from API
        async loadAvailableFoods() {
            try {
                const response = await fetch('static/foods.json');
                const data = await response.json();
                // G24: custom foods are available mid-cook too.
                this.availableFoods = [...data.foods, ...readCustomFoods(localStorage)];
            } catch (e) {
                console.error('Failed to load foods:', e);
            }
        },

        loadFromScheduleStorage() {
            const selections = readPlan(localStorage);
            if (selections.length === 0) {
                this.schedule = { items: [], totalTime: 0 };
                this.alerts = [];
                this.remainingSeconds = 0;
                this.notify('No cooking schedule found. Go back to planning to build one.');
                return;
            }

            this.selectedFoods = selections;
            this.schedule = calculateSchedule(this.selectedFoods);
            this.alerts = generateAlerts(this.schedule);
            this.remainingSeconds = this.schedule.totalTime;
        },

        restoreSession(session) {
            this.schedule = session.schedule;
            this.status = session.status;
            this.selectedFoods = session.selectedFoods || [];
            this.alerts = session.alerts || generateAlerts(this.schedule);

            if (session.startedAt) {
                this.startedAt = new Date(session.startedAt);
            }
            if (session.pausedElapsed) {
                this.pausedElapsed = session.pausedElapsed;
            }

            // Resume timer if it was running
            if (this.status === 'running') {
                this.startTimerLoop();
            } else if (this.status === 'paused') {
                this.elapsedSeconds = this.pausedElapsed;
                this.remainingSeconds = this.schedule.totalTime - this.elapsedSeconds;
            } else {
                this.remainingSeconds = this.schedule.totalTime;
            }
        },

        // G8: inline messaging instead of blocking alert() dialogs.
        notify(text, tone = 'error') {
            this.message = text;
            this.messageTone = tone;
        },

        dismissMessage() {
            this.message = '';
        },

        // Timer controls
        start() {
            if (this.status !== 'created') return;

            // G9: browsers penalise permission prompts not tied to a gesture.
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }

            this.status = 'running';
            this.startedAt = new Date();
            this.startTimerLoop();
            this.saveSession();
        },

        pause() {
            if (this.status !== 'running') return;

            this.status = 'paused';
            this.pausedElapsed = this.elapsedSeconds;
            this.stopTimerLoop();
            this.saveSession();
        },

        resume() {
            if (this.status !== 'paused') return;

            this.status = 'running';
            // Adjust startedAt to account for pause duration
            this.startedAt = new Date(Date.now() - (this.pausedElapsed * 1000));
            this.lastTickSecond = null;
            this.startTimerLoop();
            this.saveSession();
        },

        reset() {
            this.stopTimerLoop();
            this.status = 'created';
            this.startedAt = null;
            this.pausedElapsed = 0;
            this.elapsedSeconds = 0;
            this.currentAlert = null;
            this.alertActive = false;
            this.lastTickSecond = null;
            this.lastSavedSecond = null;
            this.dismissMessage();

            // G4: Reset means "start over from the plan I made". It used to keep
            // whatever mid-cook edits were in memory, so Reset-then-Start and
            // Reset-then-reload produced different meals.
            clearSession(localStorage);
            this.loadFromScheduleStorage();
        },

        // Timer loop using requestAnimationFrame for accuracy
        startTimerLoop() {
            const tick = () => {
                if (this.status !== 'running') return;

                this.updateTimer();
                this.timerInterval = requestAnimationFrame(tick);
            };
            this.timerInterval = requestAnimationFrame(tick);
        },

        stopTimerLoop() {
            if (this.timerInterval) {
                cancelAnimationFrame(this.timerInterval);
                this.timerInterval = null;
            }
        },

        updateTimer() {
            if (!this.startedAt) return;

            const elapsed = Math.floor((Date.now() - this.startedAt.getTime()) / 1000);

            // G10: the loop runs at refresh rate, but nothing here changes more
            // than once a second. Bailing early keeps Alpine from re-rendering
            // every countdown sixty times a second.
            if (elapsed === this.lastTickSecond) return;
            this.lastTickSecond = elapsed;

            this.elapsedSeconds = elapsed;
            this.remainingSeconds = Math.max(0, this.schedule.totalTime - elapsed);

            this.checkAlerts();

            if (elapsed >= this.schedule.totalTime) {
                this.complete();
            }

            // G2: save every five seconds, once. The old modulo test was true
            // for every frame of that whole second — roughly sixty writes.
            if (elapsed % 5 === 0 && elapsed !== this.lastSavedSecond) {
                this.lastSavedSecond = elapsed;
                this.saveSession();
            }
        },

        complete() {
            this.status = 'completed';
            this.stopTimerLoop();
            this.saveSession();
        },

        // Alert management
        checkAlerts() {
            const { due, missed } = partitionDueAlerts(this.alerts, this.elapsedSeconds);
            if (!due) return;

            // G5: mark the backlog fired without announcing each one. Reopening
            // a tab after the meal finished used to fire every outstanding alert
            // in a single frame, one AudioContext apiece.
            for (const alert of missed) {
                alert.triggered = true;
            }
            const summary = summariseMissed(missed);
            if (summary) {
                this.notify(summary, 'notice');
            }

            this.triggerAlert(due);
        },

        triggerAlert(alert) {
            alert.triggered = true;
            this.currentAlert = alert;
            this.alertActive = true;
            this.alertType = alert.type;

            // Play sound
            this.playAlertSound();

            // Show notification
            this.showNotification(alert);

            // Auto-dismiss after 10 seconds
            setTimeout(() => {
                if (this.currentAlert === alert) {
                    this.dismissAlert();
                }
            }, 10000);

            this.saveSession();
        },

        dismissAlert() {
            this.currentAlert = null;
            this.alertActive = false;
            this.alertType = '';
        },

        playAlertSound() {
            // Create a simple beep sound using Web Audio API
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gainNode.gain.value = 0.3;

                oscillator.start();
                setTimeout(() => {
                    oscillator.stop();
                    audioContext.close();
                }, 300);
            } catch (e) {
                console.log('Audio not supported:', e);
            }
        },

        showNotification(alert) {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Cooking Timer', {
                    body: alert.message,
                    tag: 'cooking-timer',
                    requireInteraction: true
                });
            }
        },

        // Persistence
        saveSession() {
            writeSession(localStorage, {
                schedule: this.schedule,
                status: this.status,
                startedAt: this.startedAt ? this.startedAt.toISOString() : null,
                pausedElapsed: this.pausedElapsed,
                alerts: this.alerts,
                selectedFoods: this.selectedFoods
            });
        },

        // Food status helpers
        isWaiting(item) {
            return this.elapsedSeconds < item.startTime;
        },

        isCooking(item) {
            return this.elapsedSeconds >= item.startTime && this.elapsedSeconds < item.finishTime;
        },

        isDone(item) {
            return this.elapsedSeconds >= item.finishTime;
        },

        // Time formatting — delegates to the shared core module.
        formatTime(seconds) {
            return formatDuration(seconds);
        },

        // T059-T062: Edit functions for User Story 3

        // Check if editing is allowed (timer running or paused, not completed)
        canEdit() {
            return this.status === 'running' || this.status === 'paused';
        },

        // Change how a still-waiting dish is cooked. Keyed on itemId (D6).
        changeOption(itemId, newOptionId) {
            const index = this.selectedFoods.findIndex(f => f.itemId === itemId);
            if (index === -1) return;

            const scheduleItem = this.schedule.items.find(item => item.itemId === itemId);
            if (scheduleItem && !this.isWaiting(scheduleItem)) {
                this.notify('That dish has already started cooking, so its timing is locked in.');
                return;
            }

            const selection = this.selectedFoods[index];
            const food = findFood(this.availableFoods, selection.foodId);
            const option = food && findOption(food, newOptionId);
            if (!option) return;

            const override = readOverrides(localStorage)[`${food.id}:${option.id}`];

            this.selectedFoods[index] = {
                ...selection,
                optionId: option.id,
                optionLabel: option.label,
                cookingTime: override || option.seconds,
                overridden: Boolean(override),
            };

            this.recalculateSchedulePreservingProgress();
        },

        /** The options available for a dish already on the menu. */
        optionsFor(itemId) {
            const selection = this.selectedFoods.find(f => f.itemId === itemId);
            const food = selection && findFood(this.availableFoods, selection.foodId);
            return food ? food.options : [];
        },

        // T061: Add a new food during timer
        startAddingFood() {
            this.addingFood = true;
            this.newFoodId = '';
            this.newFoodOptionId = '';
        },

        cancelAddFood() {
            this.addingFood = false;
            this.newFoodId = '';
            this.newFoodOptionId = '';
        },

        /** Options for the food chosen in the add-food form. */
        get newFoodOptions() {
            const food = findFood(this.availableFoods, this.newFoodId);
            return food ? food.options : [];
        },

        /** Reset the option choice whenever a different food is picked. */
        onNewFoodChange() {
            const food = findFood(this.availableFoods, this.newFoodId);
            this.newFoodOptionId = food ? defaultOption(food).id : '';
        },

        addFood() {
            if (!this.newFoodId) return;

            const food = findFood(this.availableFoods, this.newFoodId);
            if (!food) return;

            const option = findOption(food, this.newFoodOptionId) || defaultOption(food);
            const override = readOverrides(localStorage)[`${food.id}:${option.id}`];

            // D6: no duplicate check. Each row has its own itemId, so a second
            // portion of the same food at a different option is legitimate.
            this.selectedFoods.push({
                itemId: `timer-${this.nextItemId++}`,
                foodId: food.id,
                foodName: food.name,
                optionId: option.id,
                optionLabel: option.label,
                cookingTime: override || option.seconds,
                overridden: Boolean(override),
            });

            this.recalculateSchedulePreservingProgress();
            this.cancelAddFood();
        },

        // Remove a still-waiting dish. Keyed on itemId (D6).
        removeFood(itemId) {
            const scheduleItem = this.schedule.items.find(item => item.itemId === itemId);
            if (scheduleItem && !this.isWaiting(scheduleItem)) {
                this.notify('That dish has already started cooking, so it cannot be removed.');
                return;
            }

            // G12: keep the actual selection so it can be restored verbatim,
            // rather than rebuilding it from schedule fields via a scheduleItem
            // that the guard above has already admitted might be missing.
            const removed = this.selectedFoods.find(f => f.itemId === itemId);
            if (!removed) return;

            this.selectedFoods = this.selectedFoods.filter(f => f.itemId !== itemId);

            if (this.selectedFoods.length === 0) {
                // Put it back: an empty schedule has nothing to count down to.
                this.selectedFoods = [removed];
                this.notify('That is the only dish left. Use Reset to start over.');
                return;
            }

            this.recalculateSchedulePreservingProgress();
        },

        // Re-plan around dishes already on the heat, then fan out the effects.
        recalculateSchedulePreservingProgress() {
            this.schedule = recalculateSchedule(
                this.selectedFoods,
                this.schedule.items,
                this.elapsedSeconds,
            );
            this.alerts = regenerateAlerts(this.schedule, this.alerts, this.elapsedSeconds);
            this.remainingSeconds = Math.max(0, this.schedule.totalTime - this.elapsedSeconds);
            this.saveSession();
        },

        // Food status helpers and formatting live above; alert generation and
        // regeneration now live in ./core/alerts.js.
    };
}

// A module's top-level bindings are not global, so `x-data="timerApp()"` cannot
// see the factory without this assignment.
//
// This module MUST execute before Alpine's script. Alpine's CDN build calls
// Alpine.start() as soon as it runs — which both walks the DOM and fires
// `alpine:init` — so registering on that event from here would always be too
// late. Deferred scripts execute in document order, so timer.html loads this
// module ahead of the Alpine tag in <head>. Do not move either tag.
window.timerApp = timerApp;
