(async () => {
  const toggle = document.getElementById('toggle');
  const text = document.getElementById('stateText');
  const btn = document.getElementById('openDash');

  const { enabled = true } = await chrome.storage.sync.get({ enabled: true });
  setUI(enabled);

  toggle.addEventListener('click', async () => {
    const { enabled = true } = await chrome.storage.sync.get({ enabled: true });
    const next = !enabled;
    await chrome.storage.sync.set({ enabled: next });
    setUI(next);
  });

  btn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  function setUI(on){
    toggle.classList.toggle('on', on);
    text.textContent = on ? 'Enabled' : 'Disabled';
  }
})();
