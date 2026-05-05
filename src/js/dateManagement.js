// Function to render the day panel
function renderDayPanel(date) {
    const tasks = loadTasksForDate(date);
    displayTasks(tasks);
}

// Function to render the calendar
function renderCalendar(selectedDate) {
    const today = new Date();
    if (selectedDate.getTime() === today.getTime()) {
        const tasks = loadTasksForDate(today);
        displayTasks(tasks);
    } else {
        const tasks = loadTasksForDate(selectedDate);
        displayTasks(tasks);
    }
}