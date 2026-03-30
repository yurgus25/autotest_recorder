// Language switcher - initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  if (window.i18n) {
    await window.i18n.init();
    updateLangButtons();
  }
});

function updateLangButtons() {
  const currentLang = window.i18n ? window.i18n.getLang() : 'ru';
  document.getElementById('lang-en').classList.toggle('active', currentLang === 'en');
  document.getElementById('lang-ru').classList.toggle('active', currentLang === 'ru');
}

document.getElementById('lang-en').addEventListener('click', async () => {
  if (window.i18n) {
    await window.i18n.setLang('en');
    window.location.href = 'help.html';
  }
});

document.getElementById('lang-ru').addEventListener('click', async () => {
  if (window.i18n) {
    await window.i18n.setLang('ru');
    // Already on Russian page, just update buttons
    updateLangButtons();
  }
});
