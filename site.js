const themeToggle = document.querySelector('#theme-toggle');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let preferredTheme;
try {
  const saved = localStorage.getItem('satify-theme');
  if (saved === 'light' || saved === 'dark') preferredTheme = saved;
} catch {
  // Follow the system until a theme is selected on this page.
}

document.querySelectorAll('.app-preview-open, .game-preview-open').forEach(screenshotTrigger => {
  const screenshotPanel = document.getElementById(screenshotTrigger.getAttribute('aria-controls'));
  if (!screenshotPanel) return;
  screenshotTrigger.addEventListener('click', () => {
    screenshotPanel.showModal();
    document.documentElement.classList.add('screenshot-open');
  });
  screenshotPanel.querySelector('.screenshot-panel-close').addEventListener('click', () => screenshotPanel.close());
  screenshotPanel.addEventListener('click', event => {
    if (event.target !== screenshotPanel) return;
    const bounds = screenshotPanel.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) screenshotPanel.close();
  });
  screenshotPanel.addEventListener('close', () => {
    document.documentElement.classList.remove('screenshot-open');
    screenshotTrigger.focus({ preventScroll: true });
  });
});

function currentTheme() {
  return preferredTheme || (systemTheme.matches ? 'dark' : 'light');
}

function showTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (themeToggle) {
    themeToggle.setAttribute('aria-pressed', String(dark));
    themeToggle.title = `Switch to ${dark ? 'light' : 'dark'} theme`;
    themeToggle.querySelector('.theme-label').textContent = dark ? 'Dark' : 'Light';
  }
}

if (themeToggle) {
  showTheme(currentTheme());
  themeToggle.hidden = false;
  themeToggle.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    preferredTheme = theme;
    showTheme(theme);
    try {
      localStorage.setItem('satify-theme', theme);
    } catch {
      // Retain the selection for this page even if saving is blocked.
    }
  });
  systemTheme.addEventListener('change', () => {
    if (!preferredTheme) showTheme(currentTheme());
  });
  window.addEventListener('storage', event => {
    if (event.storageArea === localStorage && (event.key === 'satify-theme' || event.key === null)) {
      preferredTheme = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : undefined;
      showTheme(currentTheme());
    }
  });
}
