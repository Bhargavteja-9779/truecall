const $ = s => document.querySelector(s);

const defaults = {
  enabled: true,
  demoMode: false,
  fps: 5,
  redThreshold: 60
};

async function load() {
  const cfg = await chrome.storage.sync.get(defaults);
  $("#enabled").checked = cfg.enabled;
  $("#demomode").checked = cfg.demoMode;
  $("#fps").value = cfg.fps;
  $("#fpsVal").textContent = cfg.fps;
  $("#red").value = cfg.redThreshold;
  $("#redVal").textContent = cfg.redThreshold;
}

$("#fps").addEventListener("input", e => $("#fpsVal").textContent = e.target.value);
$("#red").addEventListener("input", e => $("#redVal").textContent = e.target.value);

$("#apply").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    enabled: $("#enabled").checked,
    demoMode: $("#demomode").checked,
    fps: +$("#fps").value,
    redThreshold: +$("#red").value
  });
  window.close();
});

$("#reset").addEventListener("click", async () => {
  await chrome.storage.sync.set(defaults);
  await load();
});

load();
