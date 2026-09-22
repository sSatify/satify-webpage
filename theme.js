// Apply the saved preference before the stylesheet paints the page.
(() => {
  let theme = 'light';
  try {
    const saved = localStorage.getItem('satify-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch {
    // The switch still works when browser storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
})();
