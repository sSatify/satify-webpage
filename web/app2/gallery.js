const cards = [...document.querySelectorAll('.workflow-card')];
const inlineVideos = cards.map(card => card.querySelector('video'));
const dialog = document.querySelector('#video-dialog');
const viewer = dialog.querySelector('video');
let viewerTrigger;
let viewerGeneration = 0;

function pauseOtherVideos(active) {
    [...inlineVideos, viewer].forEach(video => {
        if (video !== active) video.pause();
    });
}

async function play(video, button) {
    const keepFocus = button && document.activeElement === button;
    if (video.ended) video.currentTime = 0;
    try {
        video.controls = true;
        video.tabIndex = 0;
        if (keepFocus) video.focus({preventScroll: true});
        await video.play();
    } catch {
        // Native controls remain available if browser playback is restricted.
        button?.focus({preventScroll: true});
    }
}

cards.forEach(card => {
    const video = card.querySelector('video');
    const button = card.querySelector('[data-play]');
    const expand = card.querySelector('[data-expand]');
    const title = card.dataset.title;
    // Leave the posters clear until the visitor starts a clip. Native controls
    // are enabled on playback and remain the fallback without JavaScript.
    video.controls = false;
    button.hidden = false;
    expand.hidden = typeof dialog.showModal !== 'function';
    button.addEventListener('click', () => play(video, button));
    video.addEventListener('play', () => {
        pauseOtherVideos(video);
        button.hidden = true;
    });
    video.addEventListener('pause', () => {
        button.hidden = false;
    });
    video.addEventListener('ended', () => {
        button.hidden = false;
        button.querySelector('span').textContent = 'Replay demo';
        button.setAttribute('aria-label', `Replay ${title}`);
    });
    expand.addEventListener('click', () => {
        const generation = ++viewerGeneration;
        const position = video.ended ? 0 : video.currentTime;
        pauseOtherVideos(viewer);
        viewerTrigger = expand;
        dialog.querySelector('#viewer-title').textContent = title;
        dialog.querySelector('#viewer-description').textContent = card.querySelector('.card-description').textContent;
        viewer.poster = video.poster;
        viewer.muted = true;
        viewer.src = video.querySelector('source').src;
        viewer.addEventListener('loadedmetadata', () => {
            if (generation !== viewerGeneration || !dialog.open) return;
            viewer.currentTime = Math.min(position, viewer.duration);
            play(viewer);
        }, {once: true});
        dialog.showModal();
        document.documentElement.classList.add('viewer-open');
        viewer.load();
    });
});

viewer.addEventListener('play', () => pauseOtherVideos(viewer));
dialog.querySelector('.close-viewer').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
    viewerGeneration++;
    viewer.pause();
    viewer.removeAttribute('src');
    viewer.load();
    document.documentElement.classList.remove('viewer-open');
    viewerTrigger?.focus({preventScroll: true});
});
dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
