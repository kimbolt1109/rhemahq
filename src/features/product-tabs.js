export function mountTabs(controls, onSelect) {
  const tabs = [...controls.querySelectorAll("button")];
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));
  const fragmentIndex = () => panels.findIndex((panel) => "#" + panel.id === location.hash);
  let active;

  function select(index) {
    if (active === index) return;
    const previous = active;
    active = index;
    tabs.forEach((tab, position) => {
      const selected = position === active;
      tab.tabIndex = selected ? 0 : -1;
      tab.setAttribute("aria-selected", String(selected));
      panels[position].hidden = !selected;
      panels[position].toggleAttribute("data-current", selected);
    });
    onSelect?.(index, previous);
  }

  controls.setAttribute("role", "tablist");
  tabs.forEach((tab, index) => {
    tab.setAttribute("role", "tab");
    panels[index].setAttribute("role", "tabpanel");
    panels[index].setAttribute("aria-labelledby", tab.id);
    panels[index].tabIndex = 0;
    tab.addEventListener("click", () => select(index));
  });

  controls.addEventListener("keydown", (event) => {
    const navigation = new Map([
      ["ArrowLeft", (active + tabs.length - 1) % tabs.length],
      ["ArrowRight", (active + 1) % tabs.length],
      ["Home", 0],
      ["End", tabs.length - 1],
    ]);
    const index = navigation.get(event.key);
    if (index === undefined) return;
    event.preventDefault();
    select(index);
    tabs[index].focus();
  });
  addEventListener("hashchange", () => {
    const index = fragmentIndex();
    if (index !== -1) select(index);
  });
  select(Math.max(0, fragmentIndex()));
  controls.hidden = false;
  return select;
}
