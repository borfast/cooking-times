import { calculateSchedule } from './core/schedule.js';
import { formatTime, formatMinutes } from './core/format.js';
import {
    readPlan,
    writePlan,
    readSession,
    clearSession,
    isSessionLive,
    readCustomFoods,
    writeCustomFoods,
    readOverrides,
    writeOverride,
} from './core/storage.js';
import {
    findFood,
    findOption,
    defaultOption,
    resolveSelection,
    groupByCategory,
} from './core/foods.js';

let foods = [];
let selectedFoods = [];
let rowCounter = 0;

// G8: inline messaging instead of blocking alert() dialogs.
function showMessage(text, tone = 'error') {
    const region = document.getElementById('planning-message');
    region.textContent = text;
    region.className = `inline-message inline-message--${tone}`;
    region.hidden = false;
}

function clearMessage() {
    const region = document.getElementById('planning-message');
    region.hidden = true;
    region.textContent = '';
}

async function loadFoods() {
    try {
        const response = await fetch('static/foods.json');
        const data = await response.json();
        // G24: the bundled catalogue is no longer the whole world.
        foods = [...data.foods, ...readCustomFoods(localStorage)];
        restoreRows();
    } catch (error) {
        console.error('Failed to load foods:', error);
        showMessage('Could not load the food list. Check your connection and reload.');
    }
}

/** Populate a food <select> with optgroups, then select `foodId` if given. */
function fillFoodSelect(select, foodId) {
    select.innerHTML = '<option value="">Select a food...</option>';

    for (const group of groupByCategory(foods)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.category;
        for (const food of group.foods) {
            const option = document.createElement('option');
            option.value = food.id;
            option.textContent = food.name;
            optgroup.appendChild(option);
        }
        select.appendChild(optgroup);
    }

    if (foodId) {
        select.value = foodId;
    }
}

/**
 * Rebuild a row's option <select> from the chosen food's own options.
 *
 * G21/G22: the axis is per-food. A steak offers three; rice offers one. A
 * single-option food still renders the select so every row reads the same way.
 */
function fillOptionSelect(select, food, optionId) {
    select.innerHTML = '';

    if (!food) {
        select.disabled = true;
        return;
    }

    select.disabled = false;
    for (const option of food.options) {
        const element = document.createElement('option');
        element.value = option.id;
        element.textContent = option.label;
        select.appendChild(element);
    }
    select.value = findOption(food, optionId) ? optionId : defaultOption(food).id;
}

/** Show the resolved duration in the row's minutes field. */
function refreshTimeField(row) {
    const food = findFood(foods, row.querySelector('.food-select').value);
    const timeField = row.querySelector('.time-override-input');
    const resetButton = row.querySelector('.time-override-reset');

    if (!food) {
        timeField.value = '';
        timeField.disabled = true;
        resetButton.hidden = true;
        return;
    }

    timeField.disabled = false;

    const optionId = row.querySelector('.option-select').value;
    const overrides = readOverrides(localStorage);
    const override = overrides[`${food.id}:${optionId}`];
    const seconds = override || findOption(food, optionId).seconds;

    timeField.value = String(Math.round(seconds / 60));
    resetButton.hidden = !override;
    row.classList.toggle('food-item--overridden', Boolean(override));
}

function addRow(foodId = '', optionId = '') {
    const list = document.getElementById('food-list');
    const itemId = `row-${rowCounter++}`;

    const row = document.createElement('div');
    row.className = 'food-item';
    row.dataset.itemId = itemId;

    const foodSelect = document.createElement('select');
    foodSelect.className = 'food-select';
    foodSelect.setAttribute('aria-label', 'Food');
    fillFoodSelect(foodSelect, foodId);

    const optionSelect = document.createElement('select');
    optionSelect.className = 'option-select';
    optionSelect.setAttribute('aria-label', 'How you want it cooked');
    fillOptionSelect(optionSelect, findFood(foods, foodId), optionId);

    // G23/G24: the bundled times ignore quantity, thickness and method. Let the
    // cook correct the number, and remember the correction per food and option.
    const timeWrap = document.createElement('div');
    timeWrap.className = 'time-override';

    const timeField = document.createElement('input');
    timeField.type = 'number';
    timeField.min = '1';
    timeField.max = '600';
    timeField.className = 'time-override-input';
    timeField.setAttribute('aria-label', 'Cooking time in minutes');

    const timeUnit = document.createElement('span');
    timeUnit.className = 'time-override-unit';
    timeUnit.textContent = 'min';

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'time-override-reset';
    resetButton.title = 'Use the standard time again';
    resetButton.textContent = '⟲';
    resetButton.hidden = true;

    timeWrap.append(timeField, timeUnit, resetButton);

    const removeButton = document.createElement('button');
    removeButton.className = 'btn btn-danger btn-icon';
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', 'Remove food');
    removeButton.textContent = '✕';

    row.append(foodSelect, optionSelect, timeWrap, removeButton);
    list.appendChild(row);

    foodSelect.addEventListener('change', () => {
        const food = findFood(foods, foodSelect.value);
        fillOptionSelect(optionSelect, food, '');
        refreshTimeField(row);
        updateSchedule();
    });

    optionSelect.addEventListener('change', () => {
        refreshTimeField(row);
        updateSchedule();
    });

    timeField.addEventListener('change', () => {
        const food = findFood(foods, foodSelect.value);
        if (!food) {
            return;
        }
        const minutes = Number(timeField.value);
        const standard = findOption(food, optionSelect.value).seconds;
        const seconds = Math.round(minutes * 60);

        if (!Number.isFinite(seconds) || seconds <= 0) {
            refreshTimeField(row);
            showMessage('Cooking time must be at least one minute.');
            return;
        }

        clearMessage();
        // Matching the standard time means "no correction", not "correct to the
        // same number" — otherwise the reset affordance never goes away.
        writeOverride(
            localStorage,
            food.id,
            optionSelect.value,
            seconds === standard ? null : seconds,
        );
        refreshTimeField(row);
        updateSchedule();
    });

    resetButton.addEventListener('click', () => {
        const food = findFood(foods, foodSelect.value);
        if (!food) {
            return;
        }
        writeOverride(localStorage, food.id, optionSelect.value, null);
        refreshTimeField(row);
        updateSchedule();
    });

    removeButton.addEventListener('click', () => {
        row.remove();
        updateSchedule();
    });

    refreshTimeField(row);
    return row;
}

function restoreRows() {
    const saved = readPlan(localStorage);

    if (saved.length === 0) {
        addRow();
        return;
    }

    for (const row of saved) {
        addRow(row.foodId, row.optionId);
    }
    updateSchedule();
}

function updateSchedule() {
    const overrides = readOverrides(localStorage);
    selectedFoods = [];

    // D6: rows are independent. Two portions of the same food at different
    // options are a legitimate menu, so there is no duplicate check here.
    for (const row of document.querySelectorAll('.food-item')) {
        const foodId = row.querySelector('.food-select').value;
        if (!foodId) {
            continue;
        }

        const optionId = row.querySelector('.option-select').value;
        const selection = resolveSelection(foods, {
            itemId: row.dataset.itemId,
            foodId,
            optionId,
            overrideSeconds: overrides[`${foodId}:${optionId}`],
        });

        if (selection) {
            selectedFoods.push(selection);
        }
    }

    // G7: persist on every change, not only when the timer starts.
    writePlan(localStorage, selectedFoods);

    if (selectedFoods.length > 0) {
        displaySchedule(calculateSchedule(selectedFoods));
    } else {
        document.getElementById('schedule-section').style.display = 'none';
    }
}

function displaySchedule(schedule) {
    const section = document.getElementById('schedule-section');
    const output = document.getElementById('schedule-output');

    let html = '';
    schedule.items.forEach((item, index) => {
        let intervalText = '';
        if (index > 0) {
            const intervalSec = item.startTime - schedule.items[index - 1].startTime;
            intervalText = `<small>(${formatMinutes(intervalSec)} min after previous)</small>`;
        }

        html += `
            <div class="schedule-item">
                <strong>${item.foodName} (${item.optionLabel})</strong>
                <div class="time">
                    Start at: ${formatTime(item.startTime)}
                    ${intervalText}
                </div>
                <div class="time">Cook for: ${formatMinutes(item.duration)} minutes</div>
            </div>
        `;
    });

    html += `<div class="total-time">Total Time: ${formatMinutes(schedule.totalTime)} minutes</div>`;

    output.innerHTML = html;
    section.style.display = 'block';
}

// G24: user-defined foods, so the catalogue is no longer closed.
function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function addCustomFood() {
    const nameField = document.getElementById('custom-food-name');
    const minutesField = document.getElementById('custom-food-minutes');
    const categoryField = document.getElementById('custom-food-category');

    const name = nameField.value.trim();
    const minutes = Number(minutesField.value);

    if (!name) {
        showMessage('Give your food a name.');
        return;
    }
    if (!Number.isFinite(minutes) || minutes <= 0) {
        showMessage('Give your food a cooking time of at least one minute.');
        return;
    }

    const id = `custom-${slugify(name)}`;
    if (findFood(foods, id)) {
        showMessage(`You already have a food called ${name}.`);
        return;
    }

    const food = {
        id,
        name,
        category: categoryField.value || 'Other',
        defaultOptionId: 'cooked',
        options: [{ id: 'cooked', label: 'Cooked', seconds: Math.round(minutes * 60) }],
    };

    const mine = readCustomFoods(localStorage);
    mine.push(food);
    writeCustomFoods(localStorage, mine);
    foods = [...foods, food];

    // Existing rows need the new food in their pickers.
    for (const row of document.querySelectorAll('.food-item')) {
        const select = row.querySelector('.food-select');
        fillFoodSelect(select, select.value);
    }

    nameField.value = '';
    minutesField.value = '';
    showMessage(`Added ${name}.`, 'notice');
}

document.getElementById('add-food-btn').addEventListener('click', () => addRow());
document.getElementById('custom-food-add').addEventListener('click', addCustomFood);

document.getElementById('start-timer-btn').addEventListener('click', () => {
    // G1: the timer prefers a saved session over a saved plan, so a stale
    // session would silently mask this new plan. D5: replacing a finished or
    // unstarted session is silent; replacing a cook in progress is not.
    const session = readSession(localStorage);
    if (isSessionLive(session)) {
        const discard = window.confirm(
            'A cook is already in progress. Start this new plan and discard it?',
        );
        if (!discard) {
            return;
        }
    }

    writePlan(localStorage, selectedFoods);
    clearSession(localStorage);
    window.location.href = 'timer.html';
});

loadFoods();
