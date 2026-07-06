// menu.js – generisches Dreipunkt-Menü als Popover.
// Schließt bei Klick außerhalb, Escape und Scrollen.

let currentMenu = null;
let cleanupHandlers = [];

/** Offenes Menü schließen (falls vorhanden). */
export function closeMenu() {
  if (currentMenu) {
    currentMenu.remove();
    currentMenu = null;
  }
  for (const off of cleanupHandlers) off();
  cleanupHandlers = [];
}

/**
 * Menü an einem Anker-Element öffnen.
 * @param {HTMLElement} anchor  Element (z. B. Dreipunkt-Button), an dem das Menü erscheint
 * @param {Array<{label:string, icon?:string, danger?:boolean, onClick:Function}>} items
 */
export function openMenu(anchor, items) {
  closeMenu();

  const menu = document.createElement("div");
  menu.className = "popover-menu";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-item" + (item.danger ? " menu-item-danger" : "");
    button.setAttribute("role", "menuitem");
    if (item.icon) {
      const iconSpan = document.createElement("span");
      iconSpan.className = "menu-icon";
      iconSpan.innerHTML = item.icon; // statische, vertrauenswürdige SVG-Strings
      button.append(iconSpan);
    }
    const labelSpan = document.createElement("span");
    labelSpan.textContent = item.label;
    button.append(labelSpan);
    button.addEventListener("click", () => {
      closeMenu();
      item.onClick();
    });
    menu.append(button);
  }

  document.body.append(menu);
  currentMenu = menu;

  // Position: unter dem Anker, am Fensterrand nach innen geklappt
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = rect.right - menuRect.width;
  let top = rect.bottom + 4;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
  if (top + menuRect.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - menuRect.height - 4);
  }
  menu.style.left = left + "px";
  menu.style.top = top + "px";

  // Außenklick / Escape / Scroll schließen das Menü
  const onPointerDown = (event) => {
    if (!menu.contains(event.target)) closeMenu();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") closeMenu();
  };
  const onScroll = () => closeMenu();

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, true);
  cleanupHandlers = [
    () => document.removeEventListener("pointerdown", onPointerDown, true),
    () => document.removeEventListener("keydown", onKeyDown, true),
    () => window.removeEventListener("scroll", onScroll, true),
  ];

  const firstItem = menu.querySelector(".menu-item");
  if (firstItem) firstItem.focus();
}
