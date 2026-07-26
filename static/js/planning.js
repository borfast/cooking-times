import { calculateSchedule } from './core/schedule.js';
import { formatTime, formatMinutes } from './core/format.js';
import {
    readPlan,
    writePlan,
    readSession,
    clearSession,
    isSessionLive,
} from './core/storage.js';

let foods = [];
let selectedFoods = [];
let foodCounter = 0;

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

// Load foods from API
async function loadFoods() {
    try {
        const response = await fetch('static/foods.json');
        const data = await response.json();
        foods = data.foods;
        restoreFoodSelectors();
    } catch (error) {
        console.error('Failed to load foods:', error);
        showMessage('Could not load the food list. Check your connection and reload.');
    }
}

// Add a food selector row
function addFoodSelector(selectedFoodId = '', selectedDoneness = 'medium') {
    const foodList = document.getElementById('food-list');
    const id = foodCounter++;

    const div = document.createElement('div');
    div.className = 'food-item';
    div.id = `food-${id}`;

    const foodSelect = document.createElement('select');
    foodSelect.className = 'food-select';
    foodSelect.innerHTML = '<option value="">Select a food...</option>';

    // Group foods by category
    const foodsByCategory = {};
    foods.forEach(food => {
        const category = food.category || 'Other';
        if (!foodsByCategory[category]) {
            foodsByCategory[category] = [];
        }
        foodsByCategory[category].push(food);
    });

    // Create optgroups sorted by category name
    Object.keys(foodsByCategory).sort().forEach(category => {
        const group = document.createElement('optgroup');
        group.label = category;
        
        // Sort foods by name within category
        foodsByCategory[category].sort((a, b) => a.name.localeCompare(b.name)).forEach(food => {
            const option = document.createElement('option');
            option.value = food.id;
            option.textContent = food.name;
            group.appendChild(option);
        });
        
        foodSelect.appendChild(group);
    });

    const donenessSelect = document.createElement('select');
    donenessSelect.className = 'doneness-select';
    donenessSelect.innerHTML = `
        <option value="rare">Rare</option>
        <option value="medium" selected>Medium</option>
        <option value="well-done">Well Done</option>
    `;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger btn-icon';
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', 'Remove food');
    removeBtn.textContent = '✕';
    removeBtn.onclick = () => {
        div.remove();
        updateSchedule();
    };

    div.appendChild(foodSelect);
    div.appendChild(donenessSelect);
    div.appendChild(removeBtn);
    foodList.appendChild(div);

    if (selectedFoodId) {
        foodSelect.value = selectedFoodId;
    }
    if (selectedDoneness) {
        donenessSelect.value = selectedDoneness;
    }

    foodSelect.addEventListener('change', updateSchedule);
    donenessSelect.addEventListener('change', updateSchedule);
}

function restoreFoodSelectors() {
    const savedFoods = readPlan(localStorage);

    if (savedFoods.length === 0) {
        addFoodSelector();
        return;
    }

    savedFoods.forEach(item => {
        addFoodSelector(item.foodId, item.doneness);
    });
    updateSchedule();
}

// Update schedule display
function updateSchedule() {
    const foodItems = document.querySelectorAll('.food-item');
    const seen = new Set();
    const duplicates = new Set();
    selectedFoods = [];

    foodItems.forEach(item => {
        const foodId = item.querySelector('.food-select').value;
        const doneness = item.querySelector('.doneness-select').value;
        if (!foodId) {
            return;
        }

        const food = foods.find(f => f.id === foodId);
        if (!food) {
            return;
        }

        // G3: the timer identifies dishes by foodId, so two rows of the same
        // food would collide there and in Alpine's x-for keys.
        if (seen.has(foodId)) {
            duplicates.add(food.name);
            return;
        }
        seen.add(foodId);

        selectedFoods.push({
            foodId: foodId,
            foodName: food.name,
            doneness: doneness,
            cookingTime: food.cookingTimes[doneness]
        });
    });

    if (duplicates.size > 0) {
        showMessage(
            `Already on the menu: ${[...duplicates].join(', ')}. Remove the duplicate row.`,
        );
    } else {
        clearMessage();
    }

    // G7: persist on every change, not only when the timer starts.
    writePlan(localStorage, selectedFoods);

    if (selectedFoods.length > 0) {
        displaySchedule(calculateSchedule(selectedFoods));
    } else {
        document.getElementById('schedule-section').style.display = 'none';
    }
}

// Display schedule
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
                <strong>${item.foodName} (${item.doneness})</strong>
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

// Event listeners
document.getElementById('add-food-btn').addEventListener('click', addFoodSelector);

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

// Initialize
loadFoods();
