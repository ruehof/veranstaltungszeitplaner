// index.js – Startseite: Plan erstellen + Liste "Meine Pläne"

import "./mock.js"; // aktiviert sich nur bei ?mock=1
import { api } from "./api.js";
import { listPlans, rememberPlan, removePlan } from "./storage.js";
import { showToast } from "./toast.js";
import { withMock } from "./util.js";
import { icons } from "./icons.js";

const form = document.getElementById("create-form");
const titleInput = document.getElementById("cf-title");
const startSelect = document.getElementById("cf-start-hour");
const endSelect = document.getElementById("cf-end-hour");
const submitBtn = document.getElementById("cf-submit");
const planList = document.getElementById("plan-list");
const planListEmpty = document.getElementById("plan-list-empty");

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr"];
const FULL_WEEK = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Stunden-Auswahlfelder füllen (Start 0–23, Ende 1–24). */
function buildHourOptions() {
  for (let h = 0; h <= 23; h++) {
    const option = document.createElement("option");
    option.value = String(h);
    option.textContent = String(h).padStart(2, "0") + ":00";
    if (h === 6) option.selected = true;
    startSelect.append(option);
  }
  for (let h = 1; h <= 24; h++) {
    const option = document.createElement("option");
    option.value = String(h);
    option.textContent = String(h).padStart(2, "0") + ":00";
    if (h === 20) option.selected = true;
    endSelect.append(option);
  }
}

/** Formular: Plan anlegen und zur Planseite weiterleiten. */
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    titleInput.reportValidity();
    return;
  }
  const startHour = parseInt(startSelect.value, 10);
  const endHour = parseInt(endSelect.value, 10);
  if (startHour >= endHour) {
    showToast("Die Startstunde muss vor der Endstunde liegen.");
    return;
  }
  const daysChoice = form.querySelector("input[name='days']:checked");
  const days = daysChoice && daysChoice.value === "fullweek" ? FULL_WEEK : WEEKDAYS;

  submitBtn.disabled = true;
  try {
    const schedule = await api.createSchedule({ title, settings: { startHour, endHour, days } });
    rememberPlan({ id: schedule.id, title: schedule.title, token: schedule.editToken });
    location.href = withMock(
      `plan.html?id=${encodeURIComponent(schedule.id)}&token=${encodeURIComponent(schedule.editToken)}`
    );
  } catch (err) {
    showToast(err.message || "Plan konnte nicht erstellt werden.");
    submitBtn.disabled = false;
  }
});

/** Liste "Meine Pläne" aus localStorage rendern. */
function renderPlanList() {
  const plans = listPlans();
  planList.innerHTML = "";
  planListEmpty.hidden = plans.length > 0;

  for (const plan of plans) {
    const item = document.createElement("li");
    item.className = "plan-item";

    const iconSpan = document.createElement("span");
    iconSpan.className = "plan-item-icon";
    iconSpan.innerHTML = icons.calendar;

    const link = document.createElement("a");
    link.className = "plan-item-title";
    link.href = withMock(
      `plan.html?id=${encodeURIComponent(plan.id)}&token=${encodeURIComponent(plan.token)}`
    );
    link.textContent = plan.title;

    const openBtn = document.createElement("a");
    openBtn.className = "btn btn-small";
    openBtn.href = link.href;
    openBtn.textContent = "Öffnen";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-small btn-ghost";
    removeBtn.textContent = "Entfernen";
    removeBtn.title = "Nur aus dieser Liste entfernen – der Plan selbst bleibt bestehen.";
    removeBtn.addEventListener("click", () => {
      removePlan(plan.id);
      renderPlanList();
    });

    item.append(iconSpan, link, openBtn, removeBtn);
    planList.append(item);
  }
}

buildHourOptions();
renderPlanList();
