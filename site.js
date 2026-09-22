const themeToggle = document.querySelector('#theme-toggle');

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
  showTheme(document.documentElement.dataset.theme);
  themeToggle.hidden = false;
  themeToggle.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    showTheme(theme);
    try {
      localStorage.setItem('satify-theme', theme);
    } catch {
      // Retain the selection for this page even if saving is blocked.
    }
  });
  window.addEventListener('storage', event => {
    if (event.key === 'satify-theme' || event.key === null) {
      showTheme(event.newValue === 'dark' ? 'dark' : 'light');
    }
  });
}
