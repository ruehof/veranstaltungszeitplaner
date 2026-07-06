// toast.js – kleine Meldungen unten am Bildschirmrand

let region = null;

function ensureRegion() {
  if (region && document.body.contains(region)) return region;
  region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    document.body.append(region);
  }
  return region;
}

/**
 * Toast anzeigen.
 * @param {string} message  Text der Meldung
 * @param {"error"|"info"|"success"} type  Optik der Meldung
 */
export function showToast(message, type = "error") {
  const host = ensureRegion();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  host.append(toast);
  // Nach kurzer Zeit ausblenden und entfernen
  setTimeout(() => {
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}
