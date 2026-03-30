// Language switcher - initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  if (window.i18n) {
    await window.i18n.init();
    updateLangButtons();
  }
});

function updateLangButtons() {
  const currentLang = window.i18n ? window.i18n.getLang() : 'en';
  document.getElementById('lang-en').classList.toggle('active', currentLang === 'en');
  document.getElementById('lang-ru').classList.toggle('active', currentLang === 'ru');
}

document.getElementById('lang-en').addEventListener('click', async () => {
  if (window.i18n) {
    await window.i18n.setLang('en');
    // Already on English page, just update buttons
    updateLangButtons();
  }
});

document.getElementById('lang-ru').addEventListener('click', async () => {
  if (window.i18n) {
    await window.i18n.setLang('ru');
    window.location.href = 'help_ru.html';
  }
});
