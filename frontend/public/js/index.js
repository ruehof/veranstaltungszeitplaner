// index.js – Startseite: Plan erstellen + Liste "Meine Pläne"

import "./mock.js"; // aktiviert sich nur bei ?mock=1
import { api, setEditToken } from "./api.js";
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
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");

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

// ---- Import aus JSON-Datei ---------------------------------------------------

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files && importFile.files[0];
  if (!file) return;
  importBtn.disabled = true;
  try {
    const data = JSON.parse(await file.text());
    if (
      !data ||
      typeof data.title !== "string" ||
      typeof data.settings !== "object" ||
      !Array.isArray(data.cards)
    ) {
      throw new Error("Das ist keine gültige Wochenplan-Datei (JSON-Export erwartet).");
    }

    // Neuen Plan anlegen, dann die Karten einzeln übernehmen
    const schedule = await api.createSchedule({ title: data.title, settings: data.settings });
    setEditToken(schedule.editToken);

    let failed = 0;
    for (const card of data.cards) {
      try {
        await api.createCard(schedule.id, {
          title: typeof card.title === "string" && card.title.trim() ? card.title : "Ohne Titel",
          description: typeof card.description === "string" ? card.description : "",
          imageUrl: typeof card.imageUrl === "string" ? card.imageUrl : null,
          color: typeof card.color === "string" ? card.color : null,
          bgColor: typeof card.bgColor === "string" ? card.bgColor : null,
          textColor: typeof card.textColor === "string" ? card.textColor : null,
          day: card.day,
          startMinutes: card.startMinutes,
          durationMinutes: card.durationMinutes,
          collapsed: Boolean(card.collapsed),
          muted: Boolean(card.muted),
        });
      } catch {
        failed++; // z. B. Karte passt nicht ins Raster – restliche Karten trotzdem übernehmen
      }
    }

    rememberPlan({ id: schedule.id, title: schedule.title, token: schedule.editToken });
    const target = withMock(
      `plan.html?id=${encodeURIComponent(schedule.id)}&token=${encodeURIComponent(schedule.editToken)}`
    );
    if (failed > 0) {
      showToast(`${failed} von ${data.cards.length} Terminen konnten nicht übernommen werden.`);
      setTimeout(() => (location.href = target), 1800);
    } else {
      location.href = target;
    }
  } catch (err) {
    showToast(err.message || "Import fehlgeschlagen.");
  } finally {
    importBtn.disabled = false;
    importFile.value = "";
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
