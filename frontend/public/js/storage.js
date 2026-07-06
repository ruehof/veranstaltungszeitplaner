// storage.js – "Meine Pläne" in localStorage (id, titel, token merken)

const STORAGE_KEY = "vzp.myPlans";

/** Alle lokal gemerkten Pläne (neueste zuerst). */
export function listPlans() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePlans(plans) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // localStorage nicht verfügbar (z. B. privater Modus) – still ignorieren
  }
}

/** Plan merken bzw. aktualisieren (beim Erstellen und beim Öffnen). */
export function rememberPlan({ id, title, token }) {
  if (!id || !token) return;
  const plans = listPlans().filter((p) => p.id !== id);
  plans.unshift({ id, title: title || "Unbenannter Plan", token, savedAt: new Date().toISOString() });
  savePlans(plans.slice(0, 50)); // Obergrenze, damit die Liste nicht endlos wächst
}

/** Plan nur aus der lokalen Liste entfernen (löscht nichts auf dem Server). */
export function removePlan(id) {
  savePlans(listPlans().filter((p) => p.id !== id));
}
