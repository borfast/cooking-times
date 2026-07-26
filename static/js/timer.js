import { calculateSchedule, recalculateSchedule } from './core/schedule.js';
import { formatTime as formatDuration } from './core/format.js';

const STORAGE_KEY = 'cooking-timer-session';

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

        // T059-T062: State for editing during timer
        availableFoods: [],
        selectedFoods: [], // Track original selected foods for recalculation
        addingFood: false,
        newFoodId: '',
        newFoodDoneness: 'medium',
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

            // Try to restore session from localStorage
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const session = JSON.parse(saved);
                    this.restoreSession(session);
                } catch (e) {
                    console.error('Failed to restore session:', e);
                    this.loadFromScheduleStorage();
                }
            } else {
                this.loadFromScheduleStorage();
            }

            // Request notification permission
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        },

        // T059: Load available foods from API
        async loadAvailableFoods() {
            try {
                const response = await fetch('static/foods.json');
                const data = await response.json();
                this.availableFoods = data.foods;
            } catch (e) {
                console.error('Failed to load foods:', e);
            }
        },

        loadFromScheduleStorage() {
            // Load schedule from planning page
            const scheduleData = localStorage.getItem('cooking-schedule');
            if (scheduleData) {
                try {
                    const data = JSON.parse(scheduleData);
                    this.selectedFoods = data.selectedFoods || [];
                    this.schedule = calculateSchedule(this.selectedFoods);
                    this.alerts = this.generateAlerts();
                    this.remainingSeconds = this.schedule.totalTime;
                } catch (e) {
                    console.error('Failed to load schedule:', e);
                    alert('No cooking schedule found. Please go back and select foods.');
                }
            } else {
                alert('No cooking schedule found. Please go back and select foods.');
            }
        },

        restoreSession(session) {
            this.schedule = session.schedule;
            this.status = session.status;
            this.selectedFoods = session.selectedFoods || [];
            this.alerts = session.alerts || this.generateAlerts();

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

        // Generate alerts from schedule
        generateAlerts() {
            const alerts = [];
            for (const item of this.schedule.items) {
                alerts.push({
                    type: 'food-start',
                    triggerTime: item.startTime,
                    foodName: item.foodName,
                    message: `Time to start cooking ${item.foodName}!`,
                    triggered: false
                });
            }
            alerts.push({
                type: 'all-done',
                triggerTime: this.schedule.totalTime,
                foodName: '',
                message: 'All done! Your meal is ready!',
                triggered: false
            });
            return alerts;
        },

        // Timer controls
        start() {
            if (this.status !== 'created') return;

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
            this.startTimerLoop();
            this.saveSession();
        },

        reset() {
            this.stopTimerLoop();
            this.status = 'created';
            this.startedAt = null;
            this.pausedElapsed = 0;
            this.elapsedSeconds = 0;
            this.remainingSeconds = this.schedule.totalTime;
            this.currentAlert = null;
            this.alertActive = false;
            this.alerts = this.generateAlerts();
            // Clear session so next timer load uses fresh schedule data
            localStorage.removeItem(STORAGE_KEY);
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

            this.elapsedSeconds = Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
            this.remainingSeconds = Math.max(0, this.schedule.totalTime - this.elapsedSeconds);

            // Check for alerts
            this.checkAlerts();

            // Check for completion
            if (this.elapsedSeconds >= this.schedule.totalTime) {
                this.complete();
            }

            // Save periodically (every 5 seconds)
            if (this.elapsedSeconds % 5 === 0) {
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
            for (const alert of this.alerts) {
                if (!alert.triggered && this.elapsedSeconds >= alert.triggerTime) {
                    this.triggerAlert(alert);
                }
            }
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
                    icon: 'static/images/timer-icon.png',
                    tag: 'cooking-timer',
                    requireInteraction: true
                });
            }
        },

        // Persistence
        saveSession() {
            const session = {
                schedule: this.schedule,
                status: this.status,
                startedAt: this.startedAt ? this.startedAt.toISOString() : null,
                pausedElapsed: this.pausedElapsed,
                alerts: this.alerts,
                selectedFoods: this.selectedFoods
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
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

        // T060: Change doneness for a food item
        changeDoneness(foodId, newDoneness) {
            // Find the food in selectedFoods
            const foodIndex = this.selectedFoods.findIndex(f => f.foodId === foodId);
            if (foodIndex === -1) return;

            // Check if food has already started cooking
            const scheduleItem = this.schedule.items.find(item => item.foodId === foodId);
            if (scheduleItem && !this.isWaiting(scheduleItem)) {
                alert('Cannot change doneness for food that has already started cooking.');
                return;
            }

            // Get the food data from available foods
            const foodData = this.availableFoods.find(f => f.id === foodId);
            if (!foodData) return;

            // Update the selected food with new doneness and cooking time
            this.selectedFoods[foodIndex] = {
                ...this.selectedFoods[foodIndex],
                doneness: newDoneness,
                cookingTime: foodData.cookingTimes[newDoneness]
            };

            // Recalculate schedule preserving elapsed time
            this.recalculateSchedulePreservingProgress();
        },

        // T061: Add a new food during timer
        startAddingFood() {
            this.addingFood = true;
            this.newFoodId = '';
            this.newFoodDoneness = 'medium';
        },

        cancelAddFood() {
            this.addingFood = false;
            this.newFoodId = '';
            this.newFoodDoneness = 'medium';
        },

        addFood() {
            if (!this.newFoodId) return;

            // Get food data
            const foodData = this.availableFoods.find(f => f.id === this.newFoodId);
            if (!foodData) return;

            // Check if food is already in the schedule
            const existingIndex = this.selectedFoods.findIndex(f => f.foodId === this.newFoodId);
            if (existingIndex !== -1) {
                alert('This food is already in your cooking schedule.');
                return;
            }

            // Add new food to selectedFoods
            this.selectedFoods.push({
                foodId: this.newFoodId,
                foodName: foodData.name,
                doneness: this.newFoodDoneness,
                cookingTime: foodData.cookingTimes[this.newFoodDoneness]
            });

            // Recalculate schedule
            this.recalculateSchedulePreservingProgress();

            // Reset add food form
            this.cancelAddFood();
        },

        // T061: Remove a food during timer
        removeFood(foodId) {
            // Check if food has already started cooking
            const scheduleItem = this.schedule.items.find(item => item.foodId === foodId);
            if (scheduleItem && !this.isWaiting(scheduleItem)) {
                alert('Cannot remove food that has already started cooking.');
                return;
            }

            // Remove from selectedFoods
            this.selectedFoods = this.selectedFoods.filter(f => f.foodId !== foodId);

            // Check if any foods remain
            if (this.selectedFoods.length === 0) {
                alert('Cannot remove the last food. Use Reset to start over.');
                // Re-add the food since we can't have empty schedule
                const foodData = this.availableFoods.find(f => f.id === foodId);
                if (foodData) {
                    this.selectedFoods.push({
                        foodId: foodId,
                        foodName: foodData.name,
                        doneness: scheduleItem.doneness,
                        cookingTime: scheduleItem.duration
                    });
                }
                return;
            }

            // Recalculate schedule
            this.recalculateSchedulePreservingProgress();
        },

        // Re-plan around dishes already on the heat, then fan out the effects.
        recalculateSchedulePreservingProgress() {
            this.schedule = recalculateSchedule(
                this.selectedFoods,
                this.schedule.items,
                this.elapsedSeconds,
            );
            this.regenerateAlerts();
            this.remainingSeconds = Math.max(0, this.schedule.totalTime - this.elapsedSeconds);
            this.saveSession();
        },

        // Regenerate alerts, preserving triggered state for past events
        regenerateAlerts() {
            const newAlerts = [];

            for (const item of this.schedule.items) {
                // Check if there was already a triggered alert for this food
                const existingAlert = this.alerts.find(
                    a => a.type === 'food-start' && a.foodName === item.foodName
                );

                newAlerts.push({
                    type: 'food-start',
                    triggerTime: item.startTime,
                    foodName: item.foodName,
                    message: `Time to start cooking ${item.foodName}!`,
                    triggered: existingAlert ? existingAlert.triggered : (this.elapsedSeconds >= item.startTime)
                });
            }

            // Add completion alert
            const existingDoneAlert = this.alerts.find(a => a.type === 'all-done');
            newAlerts.push({
                type: 'all-done',
                triggerTime: this.schedule.totalTime,
                foodName: '',
                message: 'All done! Your meal is ready!',
                triggered: existingDoneAlert ? existingDoneAlert.triggered : false
            });

            this.alerts = newAlerts;
        }
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
