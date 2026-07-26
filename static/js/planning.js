import { calculateSchedule } from './core/schedule.js';
import { formatTime, formatMinutes } from './core/format.js';

let foods = [];
let selectedFoods = [];
let foodCounter = 0;
const STORAGE_KEY = 'cooking-schedule';

// Load foods from API
async function loadFoods() {
    try {
        const response = await fetch('static/foods.json');
        const data = await response.json();
        foods = data.foods;
        restoreFoodSelectors();
    } catch (error) {
        console.error('Failed to load foods:', error);
        alert('Failed to load food database. Please refresh the page.');
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
    const stored = localStorage.getItem(STORAGE_KEY);
    let savedFoods = [];

    if (stored) {
        try {
            const data = JSON.parse(stored);
            if (Array.isArray(data.selectedFoods)) {
                savedFoods = data.selectedFoods;
            }
        } catch (error) {
            console.warn('Failed to parse saved schedule:', error);
        }
    }

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
    selectedFoods = [];

    foodItems.forEach(item => {
        const foodSelect = item.querySelector('.food-select');
        const donenessSelect = item.querySelector('.doneness-select');
        const foodId = foodSelect.value;
        const doneness = donenessSelect.value;

        if (foodId) {
            const food = foods.find(f => f.id === foodId);
            if (food) {
                selectedFoods.push({
                    foodId: foodId,
                    foodName: food.name,
                    doneness: doneness,
                    cookingTime: food.cookingTimes[doneness]
                });
            }
        }
    });

    if (selectedFoods.length > 0) {
        const schedule = calculateSchedule(selectedFoods);
        displaySchedule(schedule);
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
    // Save schedule to localStorage and navigate to timer page
    localStorage.setItem('cooking-schedule', JSON.stringify({
        items: selectedFoods.map(f => ({
            ...f,
            startTime: 0 // Will be calculated in timer
        })),
        selectedFoods: selectedFoods
    }));
    window.location.href = 'timer.html';
});

// Initialize
loadFoods();
