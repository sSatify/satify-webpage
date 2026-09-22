// Apply the saved preference or system theme before the stylesheet paints.
(() => {
  let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  try {
    const saved = localStorage.getItem('satify-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch {
    // The switch still works when browser storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
})();
