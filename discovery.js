(() => {
  const map = document.querySelector('#world-map');
  if (!map) return;

  const regions = [...map.querySelectorAll('.region')];
  const panel = document.querySelector('.discovery-panel');
  const status = document.querySelector('#map-status');
  const score = document.querySelector('#discovery-score');
  const progress = document.querySelector('#discovery-progress');
  const reset = document.querySelector('#discovery-reset');
  const sound = document.querySelector('#discovery-sound');
  const canvas = map.querySelector('.map-fireworks');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const found = new Set();
  const notes = new Set();
  let audio;
  let soundOn = true;
  let completed = false;
  let celebrationFrame;
  let celebrationTimer;
  let round = 0;

  map.querySelector('.map-labels').removeAttribute('hidden');
  panel.hidden = false;
  sound.hidden = false;
  progress.max = regions.length;
  map.classList.add('discovery-ready');

  function updateProgress() {
    score.textContent = `${found.size} / ${regions.length}`;
    progress.value = found.size;
    progress.textContent = `${found.size} of ${regions.length} areas discovered`;
    for (const category of ['forest', 'water', 'built']) {
      const targets = regions.filter(region => region.dataset.category === category);
      const count = targets.filter(region => found.has(region.dataset.region)).length;
      document.querySelector(`#${category}-count`).textContent = `${count}/${targets.length}`;
    }
  }

  // Create/resume audio within an input gesture.
  function unlockAudio() {
    if (!soundOn) return Promise.resolve(false);
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return Promise.resolve(false);
      audio ||= new Audio();
      return audio.resume().then(() => audio.state === 'running').catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  function silence() {
    notes.forEach(note => {
      try { note.stop(); } catch { /* It may already have ended. */ }
    });
    notes.clear();
  }

  function playTone(frequency, time, duration) {
    if (!audio || audio.state !== 'running' || !soundOn) return;
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.035, time + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(audio.destination);
    notes.add(oscillator);
    oscillator.onended = () => {
      notes.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  function playDiscovery() {
    const start = audio.currentTime;
    playTone(659.25, start, 0.09);
    playTone(1046.5, start + 0.075, 0.12);
  }

  function playVictory() {
    // Let the final discovery chime finish before the celebration fanfare.
    const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    const start = audio.currentTime + 0.23;
    melody.forEach((frequency, index) => {
      playTone(frequency, start + index * 0.13, index === melody.length - 1 ? 0.45 : 0.17);
    });
  }

  function stopFireworks() {
    cancelAnimationFrame(celebrationFrame);
    clearTimeout(celebrationTimer);
    canvas.hidden = true;
  }

  function fireworks() {
    stopFireworks();
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = map.clientWidth;
    const height = map.clientHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.scale(scale, scale);
    canvas.hidden = false;
    const colors = ['#edd182', '#a7d7a9', '#83cbe3', '#fff4d8', '#efb4a2'];
    const bursts = [
      { x: 0.25, y: 0.35, delay: 0 },
      { x: 0.72, y: 0.27, delay: 0.4 },
      { x: 0.49, y: 0.55, delay: 0.8 },
      { x: 0.78, y: 0.65, delay: 1.2 },
    ];

    // Still pixel stars provide the same celebration without motion or flashes.
    if (reducedMotion.matches) {
      bursts.forEach((burst, index) => {
        const x = Math.round(width * burst.x);
        const y = Math.round(height * burst.y);
        context.fillStyle = colors[index];
        context.fillRect(x - 3, y - 15, 6, 30);
        context.fillRect(x - 15, y - 3, 30, 6);
      });
      celebrationTimer = setTimeout(stopFireworks, 2600);
      return;
    }

    const particles = bursts.flatMap((burst, index) => Array.from({ length: 32 }, (_, n) => {
      const angle = n * Math.PI * 2 / 32;
      const speed = Math.min(width, height) * (0.13 + (n % 3) * 0.045);
      return { ...burst, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: colors[(index + n) % colors.length] };
    }));
    let start;
    function draw(now) {
      start ??= now;
      const elapsed = (now - start) / 1000;
      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        const age = elapsed - particle.delay;
        if (age < 0 || age > 1.35) continue;
        const x = width * particle.x + particle.vx * age;
        const y = height * particle.y + particle.vy * age + 28 * age * age;
        context.globalAlpha = Math.max(0, 1 - age / 1.35);
        context.fillStyle = particle.color;
        context.fillRect(Math.round(x / 3) * 3, Math.round(y / 3) * 3, 4, 4);
      }
      context.globalAlpha = 1;
      if (elapsed < 2.65) celebrationFrame = requestAnimationFrame(draw);
      else stopFireworks();
    }
    celebrationFrame = requestAnimationFrame(draw);
  }

  function discover(region) {
    if (!region || completed) return;
    if (found.has(region.dataset.region)) {
      status.textContent = `${region.dataset.name} already found. Keep exploring!`;
      return;
    }
    const audioReady = unlockAudio();
    const discoveryRound = round;
    found.add(region.dataset.region);
    region.classList.add('is-found');
    updateProgress();
    if (found.size === regions.length) {
      completed = true;
      panel.classList.add('is-complete');
      status.textContent = `World discovered! All ${regions.length} areas found.`;
      reset.hidden = false;
      fireworks();
    } else {
      const remaining = regions.length - found.size;
      status.textContent = `${region.dataset.name} found! ${remaining} ${remaining === 1 ? 'area' : 'areas'} to go.`;
    }
    const isFinalDiscovery = completed;
    audioReady.then(ready => {
      if (!ready || !soundOn || round !== discoveryRound || document.hidden) return;
      playDiscovery();
      if (isFinalDiscovery) playVictory();
    });
  }

  map.addEventListener('click', event => {
    const region = event.target.closest('.region');
    if (region) discover(region);
    else if (!completed) status.textContent = 'Keep looking — try the river, a forest, or a building.';
  });
  map.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    const rect = map.getBoundingClientRect();
    map.style.setProperty('--pointer-x', `${event.clientX - rect.left - map.clientLeft}px`);
    map.style.setProperty('--pointer-y', `${event.clientY - rect.top - map.clientTop}px`);
    map.classList.add('is-pointing');
  });
  map.addEventListener('pointerleave', () => map.classList.remove('is-pointing'));
  map.addEventListener('pointercancel', () => map.classList.remove('is-pointing'));

  reset.addEventListener('click', () => {
    round++;
    completed = false;
    found.clear();
    regions.forEach(region => {
      region.classList.remove('is-found');
    });
    panel.classList.remove('is-complete');
    stopFireworks();
    silence();
    updateProgress();
    reset.hidden = true;
    status.textContent = 'A fresh start! Find 2 water areas, 3 forests and 3 built-up areas.';
  });
  sound.addEventListener('click', () => {
    soundOn = !soundOn;
    sound.setAttribute('aria-pressed', String(soundOn));
    sound.title = soundOn ? 'Mute game sounds' : 'Unmute game sounds';
    if (soundOn) unlockAudio();
    else silence();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopFireworks();
      silence();
    }
  });
  reducedMotion.addEventListener('change', stopFireworks);
})();
