const card = document.querySelector('#voicesCard');
const status = document.querySelector('#voicesStatus');
card.disabled = true;
try {
  const response = await fetch('./voices-of-dawn-manifest.json');
  if (!response.ok) throw new Error('Manifest unavailable');
  const manifest = await response.json();
  if (manifest.bookId !== 'voices-of-dawn-v1' || manifest.assets?.provider !== 'google-drive') throw new Error('Invalid pilot manifest');
  card.dataset.bookId = manifest.bookId;
  status.textContent = 'Cover assets registered · reader integration pending';
  card.disabled = false;
  card.addEventListener('click', () => {
    status.textContent = 'This pilot is not yet readable. Authorized Drive cover loading is pending.';
  });
} catch (error) {
  status.textContent = 'Pilot unavailable';
  console.error(error);
}
