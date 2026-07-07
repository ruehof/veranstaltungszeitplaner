// index.js – Startseite: Plan erstellen + Liste "Meine Pläne"

import "./mock.js"; // aktiviert sich nur bei ?mock=1
import { api } from "./api.js";
import { listPlans, rememberPlan, removePlan } from "./storage.js";
import { showToast } from "./toast.js";
import { withMock } from "./util.js";
import { icons } from "./icons.js";
import { createScheduleSettingsForm } from "./scheduleform.js";

const form = document.getElementById("create-form");
const titleInput = document.getElementById("cf-title");
const submitBtn = document.getElementById("cf-submit");
const planList = document.getElementById("plan-list");
const planListEmpty = document.getElementById("plan-list-empty");

// Tage/Datum/Uhrzeiten: gemeinsames Formularmodul (auch im Einstellungen-Dialog der Planseite)
const settingsForm = createScheduleSettingsForm(document.getElementById("cf-settings"), {
  idPrefix: "cf",
});

/** Formular: Plan anlegen und zur Planseite weiterleiten. */
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    titleInput.reportValidity();
    return;
  }
  let settings;
  try {
    settings = settingsForm.getValues();
  } catch (err) {
    showToast(err.message);
    return;
  }

  submitBtn.disabled = true;
  try {
    const schedule = await api.createSchedule({ title, settings });
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

renderPlanList();
