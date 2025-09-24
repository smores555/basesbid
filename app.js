
// Fixed app.js
async function loadData() {
  try {
    const capacities = await fetch('data/capacities.json').then(r => r.json());
    const roster = await fetch('data/roster.json').then(r => r.json());
    const prefs = await fetch('data/preferences.json').then(r => r.json());

    console.log("Capacities loaded:", capacities.length);
    console.log("Roster loaded:", roster.length);
    console.log("Preferences loaded:", Object.keys(prefs).length);

    populateVacancyControls(capacities);
  } catch (err) {
    console.error("Error loading data:", err);
    document.getElementById("vacancy-controls").innerText = "Failed to load data.";
  }
}

function populateVacancyControls(capacities) {
  const container = document.getElementById("vacancy-controls");
  if (!container) return;

  container.innerHTML = '';

  capacities.forEach(entry => {
    const option = document.createElement("div");
    option.className = "vacancy-option";
    option.textContent = entry.base + " " + entry.seat + " (Cap: " + entry.startCapacity + ")";
    container.appendChild(option);
  });
}

document.addEventListener("DOMContentLoaded", loadData);
