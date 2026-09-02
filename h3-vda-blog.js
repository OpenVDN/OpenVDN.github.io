(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const embeddedPromptData = window.VDN_PROMPT_DATA || {};
  const canFetchPromptAssets = window.location.protocol !== 'file:';
  const originalVideoPromptsPromise = canFetchPromptAssets ? fetch('./generated-video-prompts.json?v=20260831-3')
    .then((response) => response.ok ? response.json() : {})
    .catch(() => ({})) : Promise.resolve({});
  const hfTestPromptsPromise = canFetchPromptAssets ? fetch('./hf-test-prompts.jsonl?v=20260902-1')
    .then((response) => response.ok ? response.text() : '')
    .then((text) => text.split(/\r?\n/).reduce((prompts, line, index) => {
      if (!line.trim()) return prompts;
      try {
        const entry = JSON.parse(line);
        if (typeof entry.prompt === 'string') prompts[String(index)] = entry.prompt;
      } catch (_) {
        // Ignore malformed rows while keeping the remaining HF-test prompts available.
      }
      return prompts;
    }, {}))
    .catch(() => ({})) : Promise.resolve({});
  const moreArtisticPromptsPromise = canFetchPromptAssets ? fetch('./more-artistic-prompt.jsonl?v=20260902-1')
    .then((response) => response.ok ? response.text() : '')
    .then((text) => text.split(/\r?\n/).reduce((prompts, line) => {
      if (!line.trim()) return prompts;
      try {
        const entry = JSON.parse(line);
        if (Number.isFinite(entry.id) && typeof entry.prompt === 'string') {
          prompts[`cb${entry.id}`] = entry.prompt;
        }
      } catch (_) {
        // Ignore malformed manifest rows and keep the remaining prompts available.
      }
      return prompts;
    }, {}))
    .catch(() => ({})) : Promise.resolve({});
  const teaserVideoPromptsPromise = (canFetchPromptAssets ? fetch('./teaser-video-prompts.json?v=20260902-2')
    .then((response) => response.ok ? response.json() : {})
    .catch(() => ({})) : Promise.resolve({}))
    .then((prompts) => ({ ...prompts, ...(embeddedPromptData.teaser || {}) }));
  const supplementalVideoPromptsPromise = canFetchPromptAssets ? fetch('./supplemental-video-prompts.json?v=20260901-2')
    .then((response) => response.ok ? response.json() : {})
    .catch(() => ({})) : Promise.resolve({});
  const trainVideoPromptsPromise = canFetchPromptAssets ? fetch('./train-video-prompts.json?v=20260901-1')
    .then((response) => response.ok ? response.json() : {})
    .catch(() => ({})) : Promise.resolve({});
  const videoPromptsPromise = Promise.all([hfTestPromptsPromise, originalVideoPromptsPromise, moreArtisticPromptsPromise, supplementalVideoPromptsPromise, trainVideoPromptsPromise])
    .then(([hfTestPrompts, originalPrompts, moreArtisticPrompts, supplementalPrompts, trainPrompts]) => ({ ...hfTestPrompts, ...originalPrompts, ...moreArtisticPrompts, ...supplementalPrompts, ...trainPrompts, ...(embeddedPromptData.video || {}) }));

  function initVdnResultShowcases() {
    const showcases = $$('[data-vdn-result-showcase]');
    if (!showcases.length) return;

    showcases.forEach((showcase) => {
      const strip = $('[data-vdn-result-strip]', showcase);
      const previousButton = $('[data-vdn-strip-prev]', showcase);
      const nextButton = $('[data-vdn-strip-next]', showcase);
      const status = $('[data-vdn-strip-status]', showcase);
      const videoFiles = (showcase.dataset.videos || '').split(',').map((file) => file.trim()).filter(Boolean);
      if (!strip || !videoFiles.length) return;

      const cards = [];
      const videos = [];
      const promptDisclosures = [];
      let activeIndex = 0;
      let heightFrame = 0;

      const pauseAllVideos = () => {
        videos.forEach((video) => video.pause());
      };

      videoFiles.forEach((videoFile, index) => {
        const label = `Teaser video ${index + 1}`;
        const card = document.createElement('article');
        card.className = 'vdn-result-card';
        card.setAttribute('role', 'listitem');
        card.setAttribute('aria-label', label);

        const video = document.createElement('video');
        video.className = 'vdn-result-video';
        video.src = `./GeneratedVideos/${videoFile}`;
        video.controls = true;
        video.loop = true;
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('aria-label', label);
        video.addEventListener('play', () => {
          if (index !== activeIndex) {
            video.pause();
            return;
          }
          videos.forEach((otherVideo, otherIndex) => {
            if (otherIndex !== activeIndex) otherVideo.pause();
          });
        });
        cards.push(card);
        videos.push(video);

        const promptDisclosure = document.createElement('div');
        promptDisclosure.className = 'vdn-result-prompt-disclosure';

        const promptToggle = document.createElement('button');
        promptToggle.className = 'vdn-result-prompt-toggle';
        promptToggle.type = 'button';
        promptToggle.textContent = 'Show prompt';
        promptToggle.setAttribute('aria-expanded', 'false');

        const promptText = document.createElement('p');
        promptText.className = 'vdn-result-prompt-text';
        promptText.id = `vdn-result-prompt-${index}`;
        promptText.hidden = true;
        promptToggle.setAttribute('aria-controls', promptText.id);

        const loadPrompt = () => {
          const hfMatch = videoFile.match(/^hf_test_(\d+)_/);
          if (hfMatch) {
            return videoPromptsPromise.then((prompts) => prompts[hfMatch[1]] || 'Prompt unavailable.');
          }
          const promptKey = videoFile.replace(/^\d+-/, '');
          return teaserVideoPromptsPromise.then((prompts) => prompts[promptKey] || 'Prompt unavailable.');
        };

        const setPromptExpanded = (expanded) => {
          promptToggle.setAttribute('aria-expanded', String(expanded));
          promptToggle.textContent = expanded ? 'Hide prompt' : 'Show prompt';
          promptText.hidden = !expanded;
          if (expanded && !promptText.dataset.loaded) {
            promptText.textContent = 'Loading…';
            loadPrompt().then((prompt) => {
              promptText.textContent = prompt;
              promptText.dataset.loaded = 'true';
              updateHeight();
            });
          }
          updateHeight();
        };

        promptToggle.addEventListener('click', () => {
          setPromptExpanded(promptToggle.getAttribute('aria-expanded') !== 'true');
        });
        promptDisclosure.append(promptToggle, promptText);
        promptDisclosures.push({ setExpanded: setPromptExpanded });

        card.append(video, promptDisclosure);
        strip.appendChild(card);
      });

      strip.tabIndex = 0;

      const updateHeight = () => {
        if (heightFrame) cancelAnimationFrame(heightFrame);
        heightFrame = requestAnimationFrame(() => {
          heightFrame = 0;
          const activeCard = cards[activeIndex];
          if (activeCard) strip.style.setProperty('--vdn-carousel-height', `${activeCard.offsetHeight}px`);
        });
      };

      const updatePlayback = () => {
        const showcaseRect = showcase.getBoundingClientRect();
        const verticalVisibility = Math.max(0, Math.min(showcaseRect.bottom, window.innerHeight) - Math.max(showcaseRect.top, 0));
        if (document.hidden || verticalVisibility < Math.min(120, showcaseRect.height * .25)) {
          pauseAllVideos();
          return;
        }
        videos.forEach((video, index) => {
          if (index === activeIndex) video.play().catch(() => {});
          else video.pause();
        });
      };

      let activeVideoFrame = 0;
      const scheduleActiveVideoUpdate = () => {
        if (activeVideoFrame) return;
        activeVideoFrame = requestAnimationFrame(() => {
          activeVideoFrame = 0;
          updatePlayback();
        });
      };

      const updateCarousel = (nextIndex, shouldPlay = true) => {
        activeIndex = (nextIndex + cards.length) % cards.length;
        cards.forEach((card, index) => {
          const forwardDistance = (index - activeIndex + cards.length) % cards.length;
          const isCurrent = index === activeIndex;
          const isNext = forwardDistance === 1;
          const isPrevious = forwardDistance === cards.length - 1;
          const position = isCurrent ? 'current' : isPrevious ? 'previous' : isNext ? 'next' : 'hidden';

          card.dataset.carouselPosition = position;
          card.style.setProperty('--vdn-carousel-scale', isCurrent ? '1' : '.92');
          card.toggleAttribute('aria-current', isCurrent);
          card.setAttribute('aria-hidden', String(!isCurrent));
          card.inert = !isCurrent;
          if (!isCurrent) {
            videos[index].pause();
            promptDisclosures[index]?.setExpanded(false);
          }
        });

        strip.dataset.activeIndex = String(activeIndex);
        if (status) status.textContent = `${String(activeIndex + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
        updateHeight();
        if (shouldPlay) scheduleActiveVideoUpdate();
      };

      previousButton?.addEventListener('click', () => updateCarousel(activeIndex - 1));
      nextButton?.addEventListener('click', () => updateCarousel(activeIndex + 1));

      strip.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        updateCarousel(activeIndex + (event.key === 'ArrowRight' ? 1 : -1));
      });

      let pointerStartX = null;
      strip.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        pointerStartX = event.clientX;
      });
      strip.addEventListener('pointerup', (event) => {
        if (pointerStartX === null) return;
        const distance = event.clientX - pointerStartX;
        pointerStartX = null;
        if (Math.abs(distance) > 44) updateCarousel(activeIndex + (distance < 0 ? 1 : -1));
      });
      strip.addEventListener('pointercancel', () => { pointerStartX = null; });

      if ('ResizeObserver' in window) {
        const heightObserver = new ResizeObserver(() => updateHeight());
        cards.forEach((card) => heightObserver.observe(card));
      }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(scheduleActiveVideoUpdate, { threshold: [0, .25, .5] }).observe(showcase);
      }
      document.addEventListener('visibilitychange', scheduleActiveVideoUpdate);
      updateCarousel(0, false);
      scheduleActiveVideoUpdate();
    });
  }

  function initResultGalleries() {
    const galleries = $$('[data-comparison-gallery]');
    if (!galleries.length) return;

    const methods = [
      { key: 'dense_50nfe', name: 'Dense H3' },
      { key: 'fasth3_4nfe', name: 'FastH3' },
      { key: 'vdn_stage_d_step250_8nfe', name: 'VDN-H3', ours: true }
    ];
    const getVideoPath = (sampleId, methodKey) => {
      if (sampleId.startsWith('cb')) {
        const sourceId = sampleId.slice(2);
        const sourceMethod = methodKey === 'vdn_stage_d_step250_8nfe' ? 'vdn_step250_8nfe' : methodKey;
        return `./GeneratedVideos/2026-09-01_come_benjamin_${sourceId}_${sourceMethod}.mp4`;
      }
      if (sampleId.startsWith('train')) {
        const sourceId = sampleId.slice(5);
        const sourceMethod = methodKey === 'vdn_stage_d_step250_8nfe' ? 'vdn_8nfe' : methodKey;
        return `./GeneratedVideos/train_${sourceId}_${sourceMethod}.mp4`;
      }
      return `./GeneratedVideos/hf_test_${sampleId}_${methodKey}.mp4`;
    };

    const lightbox = document.createElement('dialog');
    lightbox.className = 'comparison-lightbox';
    lightbox.setAttribute('aria-label', 'Enlarged video comparison');
    lightbox.innerHTML = `
      <div class="comparison-lightbox-shell">
        <div class="comparison-lightbox-toolbar">
          <div class="comparison-lightbox-transport">
            <span class="comparison-lightbox-time">0:00 / 0:00</span>
            <input class="comparison-lightbox-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek enlarged videos">
            <div class="comparison-speed-control" role="group" aria-label="Playback speed for enlarged videos">
              <span>Speed</span>
              <div class="comparison-speed-options">
                <button type="button" data-playback-rate="0.5" aria-pressed="false">0.5×</button>
                <button type="button" data-playback-rate="1" aria-pressed="true">1×</button>
                <button type="button" data-playback-rate="1.5" aria-pressed="false">1.5×</button>
                <button type="button" data-playback-rate="2" aria-pressed="false">2×</button>
              </div>
            </div>
          </div>
          <div class="comparison-lightbox-controls">
            <button class="comparison-lightbox-close" type="button" aria-label="Close enlarged comparison">Close</button>
            <button class="comparison-lightbox-action comparison-lightbox-restart" type="button">Restart</button>
            <button class="comparison-lightbox-action comparison-lightbox-pause" type="button" aria-pressed="false">Pause</button>
          </div>
        </div>
        <div class="comparison-lightbox-grid">
          <div class="comparison-lightbox-prompt" tabindex="0">
            <div class="comparison-lightbox-prompt-head">
              <span>Text prompt</span>
              <small>Full text prompt · scroll to read</small>
            </div>
            <p class="comparison-lightbox-prompt-text">Loading text prompt…</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(lightbox);

    const lightboxGrid = $('.comparison-lightbox-grid', lightbox);
    const lightboxRestart = $('.comparison-lightbox-restart', lightbox);
    const lightboxPause = $('.comparison-lightbox-pause', lightbox);
    const lightboxClose = $('.comparison-lightbox-close', lightbox);
    const lightboxSeek = $('.comparison-lightbox-seek', lightbox);
    const lightboxTime = $('.comparison-lightbox-time', lightbox);
    const lightboxSpeedControl = $('.comparison-speed-control', lightbox);
    const lightboxPrompt = $('.comparison-lightbox-prompt', lightbox);
    const lightboxPromptText = $('.comparison-lightbox-prompt-text', lightbox);
    let lightboxSourceSample = null;
    let lightboxSourceVideos = [];
    let lightboxSampleId = null;
    let lightboxSampleLabel = '';
    let lightboxUserPaused = false;
    let lightboxPlaybackRate = 1;
    let lightboxSeeking = false;

    const formatVideoTime = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      const rounded = Math.floor(seconds);
      const minutes = Math.floor(rounded / 60);
      return `${minutes}:${String(rounded % 60).padStart(2, '0')}`;
    };

    const getLightboxDuration = () => {
      const durations = $$('.comparison-lightbox-video', lightboxGrid)
        .map((video) => video.duration)
        .filter((duration) => Number.isFinite(duration) && duration > 0);
      return durations.length ? Math.min(...durations) : 0;
    };

    const updateLightboxTransport = (sourceVideo = null) => {
      const modalVideos = $$('.comparison-lightbox-video', lightboxGrid);
      const anchor = sourceVideo || $('.result-video-card.is-ours video', lightboxGrid) || modalVideos[0];
      const duration = getLightboxDuration();
      const currentTime = Math.min(anchor?.currentTime || 0, duration || Infinity);

      if (!lightboxSeeking) {
        lightboxSeek.value = duration ? String(Math.round((currentTime / duration) * 1000)) : '0';
      }
      lightboxTime.textContent = `${formatVideoTime(currentTime)} / ${formatVideoTime(duration)}`;
      lightboxSeek.setAttribute('aria-valuetext', `${formatVideoTime(currentTime)} of ${formatVideoTime(duration)}`);

      if (!lightboxSeeking && anchor) {
        modalVideos.forEach((video) => {
          if (video !== anchor && Math.abs(video.currentTime - currentTime) > .18) {
            try { video.currentTime = Math.min(currentTime, Math.max(0, video.duration - .05)); } catch (_) {}
          }
        });
      }
    };

    const setLightboxPlaybackRate = (rate) => {
      lightboxPlaybackRate = rate;
      $$('[data-playback-rate]', lightboxSpeedControl).forEach((button) => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.playbackRate) === rate));
      });
      $$('.comparison-lightbox-video', lightboxGrid).forEach((video) => {
        video.playbackRate = rate;
      });
    };

    const renderLightboxVideos = (startTime = 0) => {
      $$('.comparison-lightbox video', lightbox).forEach((video) => {
        video.pause();
        video.removeAttribute('src');
        video.load();
      });
      lightboxGrid.replaceChildren();

      const comparisonMethods = methods;
      const comparisonNames = comparisonMethods.map((method) => method.name).join(', ');
      lightboxGrid.classList.add('is-all');
      lightboxGrid.setAttribute('aria-label', `${comparisonNames} enlarged comparison`);

      comparisonMethods.forEach((method) => {
        const card = document.createElement('div');
        card.className = `result-video-card${method.ours ? ' is-ours' : ''}`;

        const head = document.createElement('div');
        head.className = 'result-video-head';
        const name = document.createElement('strong');
        name.textContent = method.name;
        head.append(name);

        const video = document.createElement('video');
        video.className = 'result-video comparison-lightbox-video';
        video.src = getVideoPath(lightboxSampleId, method.key);
        video.controls = true;
        video.loop = true;
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.playbackRate = lightboxPlaybackRate;
        video.setAttribute('aria-label', `${method.name} enlarged video for evaluation sample ${lightboxSampleId}`);
        if (method.ours) {
          video.addEventListener('timeupdate', () => updateLightboxTransport(video));
          video.addEventListener('durationchange', () => updateLightboxTransport(video));
        }
        video.addEventListener('loadedmetadata', () => {
          try { video.currentTime = Math.min(startTime, Math.max(0, video.duration - .05)); } catch (_) {}
          video.playbackRate = lightboxPlaybackRate;
          updateLightboxTransport(method.ours ? video : null);
          if (!lightboxUserPaused) video.play().catch(() => {});
        }, { once: true });

        card.append(head, video);
        lightboxGrid.appendChild(card);
      });
      lightboxGrid.appendChild(lightboxPrompt);
    };

    const clearLightbox = () => {
      const modalOursVideo = $('.result-video-card.is-ours video', lightboxGrid);
      const resumeTime = modalOursVideo?.currentTime;
      $$('.comparison-lightbox video', lightbox).forEach((video) => {
        video.pause();
        video.removeAttribute('src');
        video.load();
      });
      lightboxGrid.replaceChildren();
      lightboxSeek.value = '0';
      lightboxTime.textContent = '0:00 / 0:00';
      lightboxPromptText.textContent = '';
      lightboxSeeking = false;
      document.body.classList.remove('has-comparison-lightbox');
      if (Number.isFinite(resumeTime)) {
        lightboxSourceVideos.forEach((video) => {
          try { video.currentTime = Math.min(resumeTime, Math.max(0, video.duration - .05)); } catch (_) {}
        });
      }
      if (lightboxSourceSample?.dataset.userPaused !== 'true') {
        lightboxSourceVideos.forEach((video) => video.play().catch(() => {}));
      }
      lightboxSourceSample = null;
      lightboxSourceVideos = [];
      lightboxSampleId = null;
      lightboxSampleLabel = '';
      lightboxUserPaused = false;
    };

    const closeLightbox = () => {
      if (lightbox.open && typeof lightbox.close === 'function') lightbox.close();
      else {
        lightbox.removeAttribute('open');
        clearLightbox();
      }
    };

    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('close', clearLightbox);
    lightbox.addEventListener('click', (event) => {
      const rect = lightbox.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) closeLightbox();
    });

    const openLightbox = (sample, sampleId, sampleLabel, sourceVideos) => {
      lightboxSourceSample = sample;
      lightboxSourceVideos = sourceVideos;
      lightboxSampleId = sampleId;
      lightboxSampleLabel = sampleLabel;
      lightbox.setAttribute('aria-label', `Enlarged comparison for ${sampleLabel}`);
      lightboxUserPaused = false;
      lightboxSeeking = false;
      lightboxPrompt.scrollTop = 0;
      lightboxPrompt.setAttribute('aria-label', `Text prompt for ${sampleLabel}`);
      lightboxPromptText.textContent = 'Loading text prompt…';
      videoPromptsPromise.then((prompts) => {
        if (lightboxSampleId !== sampleId || !lightbox.open) return;
        lightboxPromptText.textContent = prompts[sampleId] || 'Text prompt unavailable.';
      });
      setLightboxPlaybackRate(1);
      lightboxRestart.setAttribute('aria-label', `Restart enlarged videos in ${sampleLabel}`);
      lightboxPause.textContent = 'Pause';
      lightboxPause.setAttribute('aria-label', `Pause enlarged videos in ${sampleLabel}`);
      lightboxPause.setAttribute('aria-pressed', 'false');
      const sourceTime = sourceVideos.find((video) => video.closest('.is-ours'))?.currentTime || sourceVideos[0]?.currentTime || 0;
      renderLightboxVideos(sourceTime);

      sourceVideos.forEach((video) => video.pause());
      document.body.classList.add('has-comparison-lightbox');
      if (typeof lightbox.showModal === 'function') lightbox.showModal();
      else lightbox.setAttribute('open', '');
    };

    lightboxRestart.addEventListener('click', () => {
      $$('.comparison-lightbox-video', lightboxGrid).forEach((video) => {
        try { video.currentTime = 0; } catch (_) {}
        video.play().catch(() => {});
      });
      lightboxSeeking = false;
      lightboxUserPaused = false;
      lightboxPause.textContent = 'Pause';
      lightboxPause.setAttribute('aria-label', `Pause enlarged videos in ${lightboxSampleLabel}`);
      lightboxPause.setAttribute('aria-pressed', 'false');
    });

    lightboxPause.addEventListener('click', () => {
      lightboxUserPaused = !lightboxUserPaused;
      lightboxPause.textContent = lightboxUserPaused ? 'Play' : 'Pause';
      lightboxPause.setAttribute('aria-label', `${lightboxUserPaused ? 'Play' : 'Pause'} enlarged videos in ${lightboxSampleLabel}`);
      lightboxPause.setAttribute('aria-pressed', String(lightboxUserPaused));
      $$('.comparison-lightbox-video', lightboxGrid).forEach((video) => {
        if (lightboxUserPaused) video.pause();
        else video.play().catch(() => {});
      });
    });

    const seekLightboxVideos = () => {
      const duration = getLightboxDuration();
      if (!duration) return;
      const targetTime = (Number(lightboxSeek.value) / 1000) * duration;
      $$('.comparison-lightbox-video', lightboxGrid).forEach((video) => {
        try { video.currentTime = Math.min(targetTime, Math.max(0, video.duration - .05)); } catch (_) {}
      });
      lightboxTime.textContent = `${formatVideoTime(targetTime)} / ${formatVideoTime(duration)}`;
      lightboxSeek.setAttribute('aria-valuetext', `${formatVideoTime(targetTime)} of ${formatVideoTime(duration)}`);
    };

    lightboxSeek.addEventListener('pointerdown', () => { lightboxSeeking = true; });
    lightboxSeek.addEventListener('input', () => {
      lightboxSeeking = true;
      seekLightboxVideos();
    });
    lightboxSeek.addEventListener('change', () => {
      seekLightboxVideos();
      lightboxSeeking = false;
      updateLightboxTransport();
    });

    lightboxSpeedControl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-playback-rate]');
      if (!button) return;
      setLightboxPlaybackRate(Number(button.dataset.playbackRate));
    });

    galleries.forEach((gallery) => {
      const sampleIds = (gallery.dataset.samples || '').split(',').map((id) => id.trim()).filter(Boolean);
      const explicitIndices = (gallery.dataset.indices || '').split(',').map((value) => Number.parseInt(value.trim(), 10));
      const labelPrefix = gallery.dataset.labelPrefix || 'Sample';
      const parsedIndexStart = Number.parseInt(gallery.dataset.indexStart || '1', 10);
      const indexStart = Number.isFinite(parsedIndexStart) ? parsedIndexStart : 1;
      const isSelectedGallery = Boolean(gallery.closest('.qualitative-results.is-featured'));

      sampleIds.forEach((sampleId, index) => {
        const displayIndex = Number.isFinite(explicitIndices[index]) ? explicitIndices[index] : indexStart + index;
        const sampleLabel = `${labelPrefix} ${String(displayIndex).padStart(2, '0')}`;
        const sample = document.createElement('section');
        sample.className = 'comparison-sample';
        sample.setAttribute('role', 'listitem');
        sample.setAttribute('aria-label', sampleLabel);

        const sampleHead = document.createElement('div');
        sampleHead.className = 'comparison-sample-head';
        const sampleHeading = document.createElement('div');
        sampleHeading.className = 'comparison-sample-heading';
        const sampleTitle = document.createElement('strong');
        sampleTitle.textContent = sampleLabel;
        sampleHeading.appendChild(sampleTitle);
        const sampleActions = document.createElement('div');
        sampleActions.className = 'comparison-sample-actions';
        const enlargeButton = document.createElement('button');
        const restartButton = document.createElement('button');
        const pauseButton = document.createElement('button');
        enlargeButton.className = `comparison-enlarge-button${isSelectedGallery ? ' is-labeled' : ''}`;
        enlargeButton.type = 'button';
        restartButton.type = 'button';
        pauseButton.type = 'button';
        enlargeButton.innerHTML = isSelectedGallery
          ? '<span>Zoom in</span>'
          : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 8V3.5H8M12 3.5h4.5V8M16.5 12v4.5H12M8 16.5H3.5V12"/></svg>';
        restartButton.textContent = 'Restart';
        pauseButton.textContent = 'Pause';
        enlargeButton.setAttribute('aria-label', `Enlarge all videos in ${sampleLabel}`);
        enlargeButton.title = 'Enlarge all videos';
        restartButton.setAttribute('aria-label', `Restart all videos in ${sampleLabel}`);
        pauseButton.setAttribute('aria-label', `Pause all videos in ${sampleLabel}`);
        pauseButton.setAttribute('aria-pressed', 'false');
        sampleActions.append(enlargeButton, restartButton, pauseButton);
        sampleHead.append(sampleHeading, sampleActions);

        const comparison = document.createElement('div');
        comparison.className = 'result-comparison is-all';
        comparison.setAttribute('role', 'group');
        comparison.setAttribute('aria-label', `Dense H3, FastH3, and VDN-H3 comparison for evaluation sample ${sampleId}`);

        const sampleVideos = [];

        methods.forEach((method) => {
          const card = document.createElement('div');
          card.className = `result-video-card${method.ours ? ' is-ours' : ''}`;
          card.dataset.methodKey = method.key;

          const head = document.createElement('div');
          head.className = 'result-video-head';
          const name = document.createElement('strong');
          name.textContent = method.name;
          head.append(name);

          const video = document.createElement('video');
          video.className = 'result-video';
          video.src = getVideoPath(sampleId, method.key);
          video.controls = true;
          video.loop = true;
          video.muted = true;
          video.defaultMuted = true;
          video.playsInline = true;
          video.preload = 'metadata';
          video.setAttribute('aria-label', `${method.name} video for evaluation sample ${sampleId}`);
          sampleVideos.push(video);

          card.append(head, video);
          comparison.appendChild(card);
        });

        let inlineTransport = null;
        let inlineSeek = null;
        let inlineTime = null;
        let inlineSpeedControl = null;
        let inlineSeeking = false;
        let inlinePlaybackRate = 1;

        const getInlineDuration = () => {
          const durations = sampleVideos
            .map((video) => video.duration)
            .filter((duration) => Number.isFinite(duration) && duration > 0);
          return durations.length ? Math.min(...durations) : 0;
        };

        const updateInlineTransport = (sourceVideo = null) => {
          if (!inlineSeek || !inlineTime) return;
          const anchor = sourceVideo || sampleVideos.find((video) => video.closest('.is-ours')) || sampleVideos[0];
          const duration = getInlineDuration();
          const currentTime = Math.min(anchor?.currentTime || 0, duration || Infinity);
          if (!inlineSeeking) inlineSeek.value = duration ? String(Math.round((currentTime / duration) * 1000)) : '0';
          inlineTime.textContent = `${formatVideoTime(currentTime)} / ${formatVideoTime(duration)}`;
          inlineSeek.setAttribute('aria-valuetext', `${formatVideoTime(currentTime)} of ${formatVideoTime(duration)}`);

          if (!inlineSeeking && anchor) {
            sampleVideos.forEach((video) => {
              if (video !== anchor && Math.abs(video.currentTime - currentTime) > .18) {
                try { video.currentTime = Math.min(currentTime, Math.max(0, video.duration - .05)); } catch (_) {}
              }
            });
          }
        };

        const setInlinePlaybackRate = (rate) => {
          inlinePlaybackRate = rate;
          $$('[data-inline-playback-rate]', inlineSpeedControl).forEach((button) => {
            button.setAttribute('aria-pressed', String(Number(button.dataset.inlinePlaybackRate) === rate));
          });
          sampleVideos.forEach((video) => { video.playbackRate = rate; });
        };

        if (isSelectedGallery) {
          inlineTransport = document.createElement('div');
          inlineTransport.className = 'comparison-inline-transport';
          inlineTransport.setAttribute('aria-label', `Persistent playback controls for ${sampleLabel}`);

          inlineTime = document.createElement('span');
          inlineTime.className = 'comparison-inline-time';
          inlineTime.textContent = '0:00 / 0:00';

          inlineSeek = document.createElement('input');
          inlineSeek.className = 'comparison-inline-seek';
          inlineSeek.type = 'range';
          inlineSeek.min = '0';
          inlineSeek.max = '1000';
          inlineSeek.step = '1';
          inlineSeek.value = '0';
          inlineSeek.setAttribute('aria-label', `Seek both videos in ${sampleLabel}`);

          inlineSpeedControl = document.createElement('div');
          inlineSpeedControl.className = 'comparison-speed-control comparison-inline-speed';
          inlineSpeedControl.setAttribute('role', 'group');
          inlineSpeedControl.setAttribute('aria-label', `Playback speed for both videos in ${sampleLabel}`);
          const speedLabel = document.createElement('span');
          speedLabel.textContent = 'Speed';
          const speedOptions = document.createElement('div');
          speedOptions.className = 'comparison-speed-options';
          [0.5, 1, 1.5, 2].forEach((rate) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.inlinePlaybackRate = String(rate);
            button.textContent = `${rate}×`;
            button.setAttribute('aria-pressed', String(rate === 1));
            speedOptions.appendChild(button);
          });
          inlineSpeedControl.append(speedLabel, speedOptions);
          inlineTransport.append(inlineTime, inlineSeek, inlineSpeedControl);

          const seekInlineVideos = () => {
            const duration = getInlineDuration();
            if (!duration) return;
            const targetTime = (Number(inlineSeek.value) / 1000) * duration;
            sampleVideos.forEach((video) => {
              try { video.currentTime = Math.min(targetTime, Math.max(0, video.duration - .05)); } catch (_) {}
            });
            inlineTime.textContent = `${formatVideoTime(targetTime)} / ${formatVideoTime(duration)}`;
            inlineSeek.setAttribute('aria-valuetext', `${formatVideoTime(targetTime)} of ${formatVideoTime(duration)}`);
          };

          inlineSeek.addEventListener('pointerdown', () => { inlineSeeking = true; });
          inlineSeek.addEventListener('input', () => {
            inlineSeeking = true;
            seekInlineVideos();
          });
          inlineSeek.addEventListener('change', () => {
            seekInlineVideos();
            inlineSeeking = false;
            updateInlineTransport();
          });
          inlineSpeedControl.addEventListener('click', (event) => {
            const button = event.target.closest('[data-inline-playback-rate]');
            if (!button) return;
            setInlinePlaybackRate(Number(button.dataset.inlinePlaybackRate));
          });

          const oursVideo = sampleVideos.find((video) => video.closest('.is-ours'));
          oursVideo?.addEventListener('timeupdate', () => updateInlineTransport(oursVideo));
          sampleVideos.forEach((video) => video.addEventListener('durationchange', () => updateInlineTransport(oursVideo)));
          setInlinePlaybackRate(1);
        }

        const playSample = () => {
          sample.dataset.userPaused = 'false';
          pauseButton.textContent = 'Pause';
          pauseButton.setAttribute('aria-label', `Pause all videos in ${sampleLabel}`);
          pauseButton.setAttribute('aria-pressed', 'false');
          sampleVideos.forEach((video) => video.play().catch(() => {}));
        };

        enlargeButton.addEventListener('click', () => {
          openLightbox(sample, sampleId, sampleLabel, sampleVideos);
        });

        restartButton.addEventListener('click', () => {
          sampleVideos.forEach((video) => {
            try { video.currentTime = 0; } catch (_) {}
          });
          updateInlineTransport();
          playSample();
        });

        pauseButton.addEventListener('click', () => {
          const shouldPause = sample.dataset.userPaused !== 'true';
          sample.dataset.userPaused = String(shouldPause);
          pauseButton.textContent = shouldPause ? 'Play' : 'Pause';
          pauseButton.setAttribute('aria-label', `${shouldPause ? 'Play' : 'Pause'} all videos in ${sampleLabel}`);
          pauseButton.setAttribute('aria-pressed', String(shouldPause));
          sampleVideos.forEach((video) => {
            if (shouldPause) video.pause();
            else video.play().catch(() => {});
          });
        });

        sample.appendChild(sampleHead);
        if (inlineTransport) sample.appendChild(inlineTransport);
        sample.appendChild(comparison);
        gallery.appendChild(sample);
      });

    });

    const videos = $$('.result-video');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          const sample = video.closest('.comparison-sample');
          if (entry.isIntersecting && sample?.dataset.userPaused !== 'true') {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      }, { rootMargin: '80px 0px', threshold: .35 });
      videos.forEach((video) => observer.observe(video));
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) videos.forEach((video) => video.pause());
    });
  }

  function initAttentionMap() {
    const map = $("#attention-map");
    const radiusInput = $("#radius-control");
    const radiusOutput = $("#radius-output");
    const tooltip = $("#attention-tooltip");
    const summary = $("#attention-summary");
    const softmaxPercent = $("#softmax-percent");
    const linearPercent = $("#linear-percent");
    const shareFill = $("#attention-share-fill");
    if (!map || !radiusInput || !tooltip) return;

    const size = 16;
    map.style.setProperty("--grid-size", size);

    const cellStrength = (query, key) => {
      const distance = Math.abs(query - key);
      const wave = (Math.sin((query + 1) * 1.7 + (key + 1) * 2.3) + 1) / 2;
      return clamp(.2 + .58 * wave + .18 / (1 + distance), .18, .96);
    };

    const clearHover = () => {
      map.classList.remove("has-hover");
      $$(".attn-cell", map).forEach((cell) => cell.classList.remove("is-row", "is-col", "is-hot"));
      $$(".attention-flow-row", map).forEach((row) => row.classList.remove("is-row"));
      tooltip.classList.remove("on");
    };

    const highlight = (target, event) => {
      const query = Number(target.dataset.query);
      const key = Number(target.dataset.key);
      map.classList.add("has-hover");
      $$(".attn-cell", map).forEach((cell) => {
        const rowMatch = Number(cell.dataset.query) === query;
        const colMatch = Number(cell.dataset.key) === key;
        cell.classList.toggle("is-row", rowMatch);
        cell.classList.toggle("is-col", colMatch);
        cell.classList.toggle("is-hot", cell === target);
      });
      $$(".attention-flow-row", map).forEach((row) => {
        row.classList.toggle("is-row", Number(row.dataset.query) === query);
      });

      const isSoftmax = target.classList.contains("softmax");
      const branch = isSoftmax ? "Sliding Window Softmax" : "Linear Attention";
      const role = isSoftmax
        ? key < query ? "Past Neighbor" : key > query ? "Future Neighbor" : "Current Frame"
        : key < query ? "Forward State" : "Backward State";
      tooltip.innerHTML = `<strong>${branch}</strong><br><span>${role}</span>`;

      const wrap = target.closest(".attention-map-wrap");
      const rect = wrap.getBoundingClientRect();
      const pointerX = event && Number.isFinite(event.clientX) ? event.clientX - rect.left : target.offsetLeft + target.offsetWidth;
      const pointerY = event && Number.isFinite(event.clientY) ? event.clientY - rect.top : target.offsetTop + target.offsetHeight;
      tooltip.style.left = `${clamp(pointerX + 6, 8, wrap.clientWidth - 210)}px`;
      tooltip.style.top = `${clamp(pointerY + 6, 8, wrap.clientHeight - 86)}px`;
      tooltip.classList.add("on");
    };

    const render = () => {
      const windowWidth = Number(radiusInput.value);
      const radius = (windowWidth - 1) / 2;
      if (radiusOutput) radiusOutput.textContent = `${windowWidth} ${windowWidth === 1 ? "frame" : "frames"}`;
      map.replaceChildren();

      for (let query = 0; query < size; query += 1) {
        for (let key = 0; key < size; key += 1) {
          const cell = document.createElement("button");
          const isSoftmax = Math.abs(query - key) <= radius;
          const directionClass = key < query ? "past" : key > query ? "future" : "same";
          cell.type = "button";
          cell.className = isSoftmax ? "attn-cell softmax" : `attn-cell linear ${directionClass}`;
          cell.dataset.query = String(query);
          cell.dataset.key = String(key);
          cell.style.setProperty("--strength", cellStrength(query, key).toFixed(3));
          cell.style.setProperty("--cell-alpha", (.52 + cellStrength(query, key) * .45).toFixed(3));
          cell.setAttribute("aria-label", `query frame ${query + 1}, key frame ${key + 1}, ${isSoftmax ? "Softmax local window" : "Linear distant context"}`);
          cell.addEventListener("pointerenter", (event) => highlight(cell, event));
          cell.addEventListener("pointermove", (event) => highlight(cell, event));
          cell.addEventListener("focus", (event) => highlight(cell, event));
          cell.addEventListener("blur", clearHover);
          map.appendChild(cell);
        }
      }

      const flow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      flow.classList.add("attention-flow");
      flow.setAttribute("viewBox", `0 0 ${size} ${size}`);
      flow.setAttribute("preserveAspectRatio", "none");
      flow.setAttribute("aria-hidden", "true");

      const addArrow = (startX, endX, y, query) => {
        const row = document.createElementNS("http://www.w3.org/2000/svg", "g");
        row.classList.add("attention-flow-row");
        row.dataset.query = String(query);

        const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const pointsRight = endX > startX;
        const headOffset = pointsRight ? -.22 : .22;
        line.setAttribute("d", `M ${startX} ${y} L ${endX} ${y}`);
        row.appendChild(line);

        const head = document.createElementNS("http://www.w3.org/2000/svg", "path");
        head.classList.add("arrow-head");
        head.setAttribute("d", `M ${endX + headOffset} ${y - .17} L ${endX} ${y} L ${endX + headOffset} ${y + .17}`);
        row.appendChild(head);
        flow.appendChild(row);
      };

      for (let query = 0; query < size; query += 1) {
        const lastPastKey = query - radius - 1;
        const firstFutureKey = query + radius + 1;
        if (lastPastKey >= 0) addArrow(1.3, lastPastKey + .7, query + .5, query);
        if (firstFutureKey <= size - 1) addArrow(size - 1.3, firstFutureKey + .3, query + .5, query);
      }

      map.appendChild(flow);

      const localPairs = [...map.children].filter((cell) => cell.classList.contains("softmax")).length;
      const farPairs = size * size - localPairs;
      const localShare = (localPairs / (size * size)) * 100;
      if (softmaxPercent) softmaxPercent.textContent = `${Math.round(localShare)}%`;
      if (linearPercent) linearPercent.textContent = `${Math.round(100 - localShare)}%`;
      if (shareFill) shareFill.style.width = `${localShare}%`;
      if (summary) summary.textContent = `${Math.round(localShare)}% Softmax / ${Math.round(100 - localShare)}% Linear`;
      radiusInput.setAttribute("aria-valuetext", `${windowWidth}-frame sliding window, ${Math.round(localShare)}% Softmax and ${Math.round(100 - localShare)}% Linear`);
    };

    map.addEventListener("pointerleave", clearHover);
    radiusInput.addEventListener("input", render);

    $$("[data-attn-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        $$("[data-attn-filter]").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        map.dataset.filter = button.dataset.attnFilter;
      });
    });

    render();
  }

  function initBranchFigure() {
    const stage = $(".branch-stage");
    if (!stage) return;
    const canvas = $(".branch-canvas", stage);
    const svg = $(".branch-svg-simple", stage);
    const tooltip = $(".branch-tooltip", stage);
    const focusButtons = $$("[data-branch-focus]", stage);
    const blocks = $$("[data-branch-block]", stage);
    const blockNotes = {
      "shared-input": {
        title: "Shared hidden state",
        formula: "\\(X \\in \\mathbb{R}^{N \\times d}\\)",
        copy: "The same QKV projections feed both Softmax and Linear Attention."
      },
      "softmax-attention": {
        title: "Sliding-window Softmax",
        formula: "\\(O_{\\mathrm{sw}} = \\operatorname{Softmax}(QK^\\top / \\sqrt{d})\\,V\\)",
        copy: "Attends only to nearby video chunks and the four-way boundary anchors."
      },
      "linear-attention": {
        title: "Bidirectional Linear Attention",
        formula: "\\(o_{t,p}^{\\mathrm{far}} = S_t^{\\rightarrow}q_{t,p} + S_t^{\\leftarrow}q_{t,p}\\)",
        copy: "Scans distant video context in both forward and reverse temporal directions."
      },
      "softmax-projection": {
        title: "Softmax gate projection",
        formula: "\\(u_{\\mathrm{sw}} = W_{\\uparrow}W_{\\downarrow}x + b\\)",
        copy: "Predicts how much to rescale the Softmax output. Initialized to 0.99."
      },
      "linear-projection": {
        title: "Far gate projection",
        formula: "\\(u_{\\mathrm{far}} = W_{\\uparrow}W_{\\downarrow}x + b\\)",
        copy: "Selects useful distant-state features for each token. Initialized with random × zero."
      },
      "softmax-sigmoid": {
        title: "Local sigmoid gate",
        formula: "\\(g_{\\mathrm{sw}} = \\sigma(u_{\\mathrm{sw}}) \\in (0,1)\\)",
        copy: "Maps gate logits to values in (0, 1)."
      },
      "linear-sigmoid": {
        title: "Far sigmoid gate",
        formula: "\\(g_{\\mathrm{far}} = \\sigma(u_{\\mathrm{far}}) \\in (0,1)\\)",
        copy: "Maps gate logits to values in (0, 1)."
      },
      "softmax-multiply": {
        title: "Gate the local readout",
        formula: "\\(\\widetilde O_{\\mathrm{sw}} = g_{\\mathrm{sw}} \\odot O_{\\mathrm{sw}}\\)",
        copy: "Applies the predicted scale to the Softmax output."
      },
      "linear-multiply": {
        title: "Gate the distant readout",
        formula: "\\(\\widetilde O_{\\mathrm{far}} = g_{\\mathrm{far}} \\odot \\operatorname{RMSNorm}(O_{\\mathrm{far}})\\)",
        copy: "Applies the predicted gate to the normalized distant-state output."
      },
      "softmax-output-projection": {
        title: "Softmax output projection",
        formula: "\\(Y_{\\mathrm{sw}} = \\widetilde O_{\\mathrm{sw}}W_O^{\\mathrm{sw}}\\)",
        copy: "Inherited from the pretrained backbone."
      },
      "linear-output-projection": {
        title: "Linear output projection",
        formula: "\\(Y_{\\mathrm{far}} = \\widetilde O_{\\mathrm{far}}W_O^{\\mathrm{far}}\\)",
        copy: "A separate trainable linear layer maps Linear Attention features into the residual stream."
      },
      sum: {
        title: "Gated residual sum",
        formula: "\\(Y = Y_{\\mathrm{sw}} + Y_{\\mathrm{far}}\\)",
        copy: "Adds the Softmax and Linear Attention outputs together."
      }
    };

    const setFocus = (focus, source = null) => {
      stage.dataset.focus = focus;
      focusButtons.forEach((button) => button.classList.toggle("is-active", button === source));
    };

    const placeTooltip = (event, block) => {
      if (!canvas || !svg || !tooltip) return;
      const canvasRect = canvas.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();
      const scaleX = svgRect.width / 920;
      const bounds = {
        left: svgRect.left - canvasRect.left + 20 * scaleX + 8,
        right: svgRect.left - canvasRect.left + 900 * scaleX - 8,
        top: svgRect.top - canvasRect.top + 14,
        bottom: svgRect.bottom - canvasRect.top - 14
      };
      const tipWidth = tooltip.offsetWidth;
      const tipHeight = tooltip.offsetHeight;
      const anchorX = event && event.clientX ? event.clientX - canvasRect.left : blockRect.left - canvasRect.left + blockRect.width / 2;
      const anchorY = event && event.clientY ? event.clientY - canvasRect.top : blockRect.bottom - canvasRect.top;
      let left = anchorX - tipWidth / 2;
      let top = anchorY + 16;

      if (top + tipHeight > bounds.bottom) top = anchorY - tipHeight - 16;
      if (top < bounds.top) top = bounds.top + Math.max(0, (bounds.bottom - bounds.top - tipHeight) / 2);

      tooltip.style.left = `${clamp(left, bounds.left, Math.max(bounds.left, bounds.right - tipWidth))}px`;
      tooltip.style.top = `${clamp(top, bounds.top, Math.max(bounds.top, bounds.bottom - tipHeight))}px`;
    };

    const hideBlock = (resetFocus = true) => {
      delete stage.dataset.block;
      blocks.forEach((block) => block.classList.remove("is-active"));
      if (tooltip) {
        tooltip.classList.remove("on");
        tooltip.removeAttribute("style");
      }
      if (resetFocus) setFocus("all");
    };

    const showBlock = (block, event = null) => {
      const key = block.dataset.branchBlock;
      const note = blockNotes[key];
      if (!note || !tooltip) return;
      const branch = block.closest("[data-branch-part]")?.dataset.branchPart || "all";
      stage.dataset.block = key;
      blocks.forEach((item) => item.classList.toggle("is-active", item === block));
      setFocus(branch === "shared" ? "all" : branch);
      window.MathJax?.typesetClear?.([tooltip]);
      tooltip.innerHTML = `<strong class="branch-tooltip-title">${note.title}</strong><span class="branch-tooltip-formula">${note.formula}</span><span class="branch-tooltip-copy">${note.copy}</span>`;
      tooltip.classList.add("on");
      placeTooltip(event, block);
      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([tooltip]).then(() => {
          if (stage.dataset.block === key) placeTooltip(event, block);
        }).catch(() => {});
      }
    };

    focusButtons.forEach((button) => {
      const focus = button.dataset.branchFocus;
      button.addEventListener("pointerenter", () => {
        hideBlock(false);
        setFocus(focus, button);
      });
      button.addEventListener("focus", () => {
        hideBlock(false);
        setFocus(focus, button);
      });
      button.addEventListener("click", () => setFocus(stage.dataset.focus === focus ? "all" : focus, button));
    });

    blocks.forEach((block) => {
      block.addEventListener("pointerenter", (event) => showBlock(block, event));
      block.addEventListener("pointermove", (event) => placeTooltip(event, block));
      block.addEventListener("pointerleave", () => hideBlock());
      block.addEventListener("click", (event) => showBlock(block, event));
      block.addEventListener("focus", () => showBlock(block));
      block.addEventListener("blur", () => hideBlock());
    });

    stage.addEventListener("pointerleave", () => hideBlock());
  }

  function svgNode(name, attributes = {}, text = "") {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text) node.textContent = text;
    return node;
  }

  function initWorkloadFigure() {
    const bidirectionalRead = $("#bidirectional-read");
    const sequenceFigure = $("#state-build-figure");
    const sequenceIntro = sequenceFigure?.previousElementSibling;

    if (bidirectionalRead && sequenceFigure && sequenceIntro?.tagName === "P") {
      bidirectionalRead.after(sequenceIntro, sequenceFigure);
    }

    {
      const figure = $("#workload-figure");
      const map = $("#workload-attention-map");
      const radiusInput = $("#workload-radius-control");
      const radiusOutput = $("#workload-radius-output");
      const tooltip = $("#workload-attention-tooltip");
      const summary = $("#workload-attention-summary");
      const softmaxPercent = $("#workload-softmax-percent");
      const linearPercent = $("#workload-linear-percent");
      const shareFill = $("#workload-share-fill");
      if (!figure || !map || !radiusInput || !tooltip || !summary) return;

      const size = 16;
      const chunkSize = 2;
      const anchorWidth = 1;
      const modalityCells = 2;
      const videoOffset = 1;
      const gridSize = size + modalityCells;
      const audioIndex = gridSize - 1;
      map.style.setProperty("--grid-size", gridSize);

      const cellStrength = (query, key) => {
        const distance = Math.abs(query - key);
        const wave = (Math.sin((query + 1) * 1.7 + (key + 1) * 2.3) + 1) / 2;
        return clamp(.2 + .58 * wave + .18 / (1 + distance), .18, .96);
      };
      const modalityStrength = (query, key, phase) => {
        const wave = (Math.sin((query + 1) * 1.37 + (key + 1) * .91 + phase) + 1) / 2;
        return clamp(.3 + .6 * wave, .3, .9);
      };
      const isAnchor = (query, key) => query < anchorWidth || query >= size - anchorWidth || key < anchorWidth || key >= size - anchorWidth;
      const rowHasLinearVideo = (query, radius) => {
        const queryGroup = Math.floor(query / chunkSize);
        return Array.from({ length: size }, (_, key) => key).some((key) => {
          const keyGroup = Math.floor(key / chunkSize);
          const isLocalSoftmax = Math.abs(queryGroup - keyGroup) <= radius;
          return !isAnchor(query, key) && !isLocalSoftmax;
        });
      };

      let pinnedCell = null;

      const hideHighlight = () => {
        map.classList.remove("has-hover");
        $$(".attn-cell", map).forEach((cell) => cell.classList.remove("is-row", "is-col", "is-hot"));
        $$(".attention-flow-row", map).forEach((row) => row.classList.remove("is-row"));
        tooltip.classList.remove("on");
      };

      const clearHover = () => {
        if (pinnedCell?.isConnected) highlight(pinnedCell);
        else hideHighlight();
      };

      const highlight = (target, event) => {
        const displayQuery = Number(target.dataset.query);
        const displayKey = Number(target.dataset.key);
        const query = displayQuery - videoOffset;
        const key = displayKey - videoOffset;
        map.classList.add("has-hover");
        $$(".attn-cell", map).forEach((cell) => {
          const rowMatch = Number(cell.dataset.query) === displayQuery;
          const colMatch = Number(cell.dataset.key) === displayKey;
          cell.classList.toggle("is-row", rowMatch);
          cell.classList.toggle("is-col", colMatch);
          cell.classList.toggle("is-hot", cell === target);
        });
        $$(".attention-flow-row", map).forEach((row) => {
          row.classList.toggle("is-row", Number(row.dataset.query) === query);
        });

        let branch;
        let role;
        if (target.classList.contains("text")) {
          branch = "Text Context";
          role = target.classList.contains("shared-text-key") ? "Softmax + Linear" : "Softmax Attention";
        } else if (target.classList.contains("audio")) {
          branch = "Audio Context";
          role = "Softmax Attention";
        } else if (target.classList.contains("anchor")) {
          branch = "Sliding Window Softmax";
          role = "Boundary Anchor";
        } else if (target.classList.contains("softmax")) {
          branch = "Sliding Window Softmax";
          const queryGroup = Math.floor(query / chunkSize);
          const keyGroup = Math.floor(key / chunkSize);
          role = keyGroup < queryGroup ? "Past Neighbor" : keyGroup > queryGroup ? "Future Neighbor" : "Current Frame";
        } else {
          branch = "Linear Attention";
          role = key < query ? "Forward State" : "Backward State";
        }
        tooltip.innerHTML = `<strong>${branch}</strong><br><span>${role}</span>`;

        const wrap = target.closest(".attention-map-wrap");
        const rect = wrap.getBoundingClientRect();
        const pointerX = event && Number.isFinite(event.clientX) ? event.clientX - rect.left : target.offsetLeft + target.offsetWidth;
        const pointerY = event && Number.isFinite(event.clientY) ? event.clientY - rect.top : target.offsetTop + target.offsetHeight;
        tooltip.style.left = `${clamp(pointerX + 6, 8, wrap.clientWidth - 210)}px`;
        tooltip.style.top = `${clamp(pointerY + 6, 8, wrap.clientHeight - 86)}px`;
        tooltip.classList.add("on");
      };

      const render = () => {
        const radius = Number(radiusInput.value);
        if (radiusOutput) radiusOutput.textContent = `${radius} ${radius === 1 ? "chunk" : "chunks"}`;
        pinnedCell = null;
        hideHighlight();
        map.replaceChildren();

        for (let displayQuery = 0; displayQuery < gridSize; displayQuery += 1) {
          for (let displayKey = 0; displayKey < gridSize; displayKey += 1) {
            const cell = document.createElement("button");
            const isText = displayQuery === 0 || displayKey === 0;
            const isAudio = !isText && (displayQuery === audioIndex || displayKey === audioIndex);
            const query = displayQuery - videoOffset;
            const key = displayKey - videoOffset;

            cell.type = "button";
            cell.tabIndex = -1;
            cell.setAttribute("aria-pressed", "false");
            cell.dataset.query = String(displayQuery);
            cell.dataset.key = String(displayKey);

            if (isText) {
              const isSharedTextKey = displayKey === 0
                && displayQuery >= videoOffset
                && displayQuery < audioIndex
                && rowHasLinearVideo(query, radius);
              cell.className = "attn-cell text softmax";
              if (isSharedTextKey) cell.classList.add("linear", "shared-text-key");
              cell.style.setProperty("--strength", modalityStrength(displayQuery, displayKey, .35).toFixed(3));
              cell.style.setProperty("--cell-alpha", ".94");
              cell.setAttribute("aria-label", isSharedTextKey
                ? "Text key context, visible to both Softmax and Linear Attention"
                : "Text query context, retained in Softmax Attention");
              map.appendChild(cell);
              continue;
            }

            if (isAudio) {
              cell.className = "attn-cell audio softmax";
              cell.style.setProperty("--strength", modalityStrength(displayQuery, displayKey, 2.1).toFixed(3));
              cell.style.setProperty("--cell-alpha", ".92");
              cell.setAttribute("aria-label", "Audio context, retained in Softmax Attention");
              map.appendChild(cell);
              continue;
            }

            const boundaryAnchor = isAnchor(query, key);
            const queryGroup = Math.floor(query / chunkSize);
            const keyGroup = Math.floor(key / chunkSize);
            const isLocalSoftmax = Math.abs(queryGroup - keyGroup) <= radius;
            const isSoftmax = boundaryAnchor || isLocalSoftmax;
            const directionClass = key < query ? "past" : key > query ? "future" : "same";
            cell.className = isSoftmax ? "attn-cell video softmax" : `attn-cell video linear ${directionClass}`;
            if (isLocalSoftmax) cell.classList.add("local-softmax");
            if (boundaryAnchor) cell.classList.add("anchor");
            if ((query + 1) % chunkSize === 0 && query < size - 1) cell.classList.add("vae-row-end");
            if ((key + 1) % chunkSize === 0 && key < size - 1) cell.classList.add("vae-col-end");
            cell.style.setProperty("--strength", cellStrength(query, key).toFixed(3));
            cell.style.setProperty("--cell-alpha", (.52 + cellStrength(query, key) * .45).toFixed(3));
            cell.setAttribute("aria-label", `query frame ${query + 1}, key frame ${key + 1}, ${boundaryAnchor ? "boundary-anchor Softmax" : isSoftmax ? "Softmax local window" : "Linear distant context"}`);
            map.appendChild(cell);
          }
        }

        const flow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        flow.classList.add("attention-flow");
        flow.setAttribute("viewBox", `0 0 ${gridSize} ${gridSize}`);
        flow.setAttribute("preserveAspectRatio", "none");
        flow.setAttribute("aria-hidden", "true");

        const addArrow = (startX, endX, y, query) => {
          const row = document.createElementNS("http://www.w3.org/2000/svg", "g");
          row.classList.add("attention-flow-row");
          row.dataset.query = String(query);
          const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
          const pointsRight = endX > startX;
          const headOffset = pointsRight ? -.22 : .22;
          line.setAttribute("d", `M ${startX} ${y} L ${endX} ${y}`);
          row.appendChild(line);
          const head = document.createElementNS("http://www.w3.org/2000/svg", "path");
          head.classList.add("arrow-head");
          head.setAttribute("d", `M ${endX + headOffset} ${y - .17} L ${endX} ${y} L ${endX + headOffset} ${y + .17}`);
          row.appendChild(head);
          flow.appendChild(row);
        };

        for (let query = 0; query < size; query += 1) {
          const queryGroup = Math.floor(query / chunkSize);
          const firstLocalKey = Math.max(0, (queryGroup - radius) * chunkSize);
          const lastLocalKey = Math.min(size - 1, (queryGroup + radius + 1) * chunkSize - 1);
          const lastPastKey = firstLocalKey - 1;
          const firstFutureKey = lastLocalKey + 1;
          if (lastPastKey >= anchorWidth) addArrow(videoOffset + anchorWidth + .3, videoOffset + lastPastKey + .7, videoOffset + query + .5, query);
          if (firstFutureKey <= size - anchorWidth - 1) addArrow(videoOffset + size - anchorWidth - .3, videoOffset + firstFutureKey + .3, videoOffset + query + .5, query);
        }
        map.appendChild(flow);

        const exactPairs = $$(".attn-cell.video.softmax", map).length;
        const exactShare = exactPairs / (size * size) * 100;
        const roundedExact = Math.round(exactShare);
        const roundedLinear = Math.round(100 - exactShare);
        if (softmaxPercent) softmaxPercent.textContent = `${roundedExact}%`;
        if (linearPercent) linearPercent.textContent = `${roundedLinear}%`;
        if (shareFill) shareFill.style.width = `${exactShare}%`;
        summary.textContent = `${roundedExact}% Softmax / ${roundedLinear}% Linear`;
        radiusInput.setAttribute("aria-valuetext", `${radius}-chunk VAE range, ${roundedExact}% Softmax and ${roundedLinear}% Linear`);
      };

      map.addEventListener("pointerover", (event) => {
        const cell = event.target.closest?.(".attn-cell");
        if (cell && map.contains(cell)) highlight(cell, event);
      });
      map.addEventListener("pointermove", (event) => {
        const cell = event.target.closest?.(".attn-cell");
        if (cell && map.contains(cell)) highlight(cell, event);
      });
      map.addEventListener("click", (event) => {
        const cell = event.target.closest?.(".attn-cell");
        if (!cell || !map.contains(cell)) return;
        const shouldPin = pinnedCell !== cell;
        if (pinnedCell) {
          pinnedCell.classList.remove("is-pinned");
          pinnedCell.setAttribute("aria-pressed", "false");
        }
        pinnedCell = shouldPin ? cell : null;
        if (pinnedCell) {
          pinnedCell.classList.add("is-pinned");
          pinnedCell.setAttribute("aria-pressed", "true");
          highlight(pinnedCell, event);
        } else {
          hideHighlight();
        }
      });
      map.addEventListener("pointerleave", clearHover);
      radiusInput.addEventListener("input", render);
      const legend = $(".workload-category-legend", figure);
      let pinnedFilter = "";
      const setFilter = (filter) => {
        if (filter) map.dataset.filter = filter;
        else delete map.dataset.filter;
      };
      $$("[data-workload-filter]", figure).forEach((button) => {
        button.addEventListener("pointerenter", () => setFilter(button.dataset.workloadFilter));
        button.addEventListener("pointerleave", () => setFilter(pinnedFilter));
        button.addEventListener("focus", () => setFilter(button.dataset.workloadFilter));
        button.addEventListener("blur", () => setFilter(pinnedFilter));
        button.addEventListener("click", () => {
          pinnedFilter = pinnedFilter === button.dataset.workloadFilter ? "" : button.dataset.workloadFilter;
          $$("[data-workload-filter]", figure).forEach((item) => {
            const active = item.dataset.workloadFilter === pinnedFilter;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-pressed", String(active));
          });
          legend?.classList.toggle("has-active-filter", Boolean(pinnedFilter));
          setFilter(pinnedFilter);
        });
      });
      render();
    }
    return;

    const canvas = $("#workload-matrix");
    if (!canvas) return;

    const context = canvas.getContext("2d");
    const figure = $("#workload-figure");
    const softmaxPresets = $$('input[name="workload-softmax-palette"]', figure);
    const linearPresets = $$('input[name="workload-linear-palette"]', figure);
    const styles = getComputedStyle(document.documentElement);
    const unitCount = 15;
    const exactRadius = 1;
    let cellSize = 0;

    const colors = {
      softmax: styles.getPropertyValue("--matrix-softmax").trim(),
      linear: styles.getPropertyValue("--matrix-linear").trim(),
      both: styles.getPropertyValue("--matrix-both").trim(),
      anchor: styles.getPropertyValue("--matrix-anchor").trim(),
      paper: styles.getPropertyValue("--paper").trim(),
      ink: styles.getPropertyValue("--ink").trim(),
      line: styles.getPropertyValue("--ink").trim()
    };

    const restorePreset = (inputs, key) => {
      try {
        const stored = window.localStorage.getItem(key);
        const match = inputs.find((input) => input.value.toLowerCase() === stored?.toLowerCase());
        if (match) match.checked = true;
      } catch (_) {}
    };

    const classify = (query, key) => {
      const boundaryAnchor = query === 0 || query === unitCount - 1 || key === 0 || key === unitCount - 1;
      if (boundaryAnchor) return "anchor";
      return Math.abs(query - key) <= exactRadius ? "softmax" : "linear";
    };

    const cellColor = (query, key, path) => {
      if (path === "anchor") return colors.anchor;
      return path === "softmax" ? colors.softmax : colors.linear;
    };

    const cellStrength = (query, key) => {
      const distance = Math.abs(query - key);
      const wave = (Math.sin((query + 1) * 1.7 + (key + 1) * 2.3) + 1) / 2;
      return clamp(.32 + .48 * wave + .16 / (1 + distance), .28, .94);
    };

    const mixHex = (foreground, background, amount) => {
      const parse = (hex) => {
        const value = hex.replace("#", "").trim();
        if (!/^[0-9a-f]{6}$/i.test(value)) return null;
        return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
      };
      const front = parse(foreground);
      const back = parse(background);
      if (!front || !back) return foreground;
      const rgb = front.map((channel, index) => Math.round(back[index] + (channel - back[index]) * amount));
      return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
    };

    const drawCell = (query, key, path) => {
      const gap = Math.min(1.2, cellSize * .035);
      const x = key * cellSize + gap / 2;
      const y = query * cellSize + gap / 2;
      const width = Math.max(0, cellSize - gap);
      const height = Math.max(0, cellSize - gap);

      const amount = path === "anchor" ? .9 : .5 + cellStrength(query, key) * .46;
      context.fillStyle = mixHex(cellColor(query, key, path), colors.paper, amount);
      context.fillRect(x, y, width, height);
    };

    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const cssSize = Math.max(280, Math.round(bounds.width));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssSize * pixelRatio);
      canvas.height = Math.round(cssSize * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, cssSize, cssSize);
      context.fillStyle = colors.line;
      context.fillRect(0, 0, cssSize, cssSize);

      cellSize = cssSize / unitCount;
      for (let query = 0; query < unitCount; query += 1) {
        for (let key = 0; key < unitCount; key += 1) {
          drawCell(query, key, classify(query, key));
        }
      }

    };

    const syncPalette = () => {
      colors.softmax = softmaxPresets.find((input) => input.checked)?.value || "#e0c1b6";
      colors.linear = linearPresets.find((input) => input.checked)?.value || "#cad8d8";

      figure?.style.setProperty("--matrix-softmax", colors.softmax);
      figure?.style.setProperty("--matrix-linear", colors.linear);
      draw();
    };

    restorePreset(softmaxPresets, "vdn-workload-softmax-preset");
    restorePreset(linearPresets, "vdn-workload-linear-preset");
    [...softmaxPresets, ...linearPresets].forEach((input) => {
      input.addEventListener("change", () => {
        try {
          window.localStorage.setItem("vdn-workload-softmax-preset", softmaxPresets.find((preset) => preset.checked)?.value || "");
          window.localStorage.setItem("vdn-workload-linear-preset", linearPresets.find((preset) => preset.checked)?.value || "");
        } catch (_) {}
        syncPalette();
      });
    });

    if ("ResizeObserver" in window) {
      new ResizeObserver(draw).observe(canvas);
    } else {
      window.addEventListener("resize", draw);
    }
    syncPalette();
  }

  function initDirectionalStateAnimation() {
    const root = $("#state-build-figure");
    if (!root) return;

    const stage = $(".state-build-stage", root);
    const frames = $$(".state-frame", root);
    const frameByIndex = new Map(frames.map((frame) => [Number(frame.dataset.frame), frame]));
    const probes = $$(".soft-probe", root);
    const forwardState = $(".direction-state-forward", root);
    const reverseState = $(".direction-state-reverse", root);
    const joinedMemory = $(".state-joined-memory", root);
    const snapshots = $$(".state-snapshot", root);
    const mergeResult = $(".state-merge-result", root);
    const progressSteps = $$(".state-progress-step", root);
    const progressButtons = $$("[data-state-step-button]", root);
    if (!stage || !forwardState || !reverseState || !joinedMemory || !mergeResult || !progressSteps.length || !progressButtons.length) return;

    const positions = ["max(20px, 4%)", "10.57%", "17.14%", "23.71%", "30.29%", "36.86%", "43.43%", "50%", "56.57%", "63.14%", "69.71%", "76.29%", "82.86%", "89.43%", "min(calc(100% - 20px), 96%)"];
    const queryFrameIndex = 7;
    const queryPosition = positions[queryFrameIndex];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let runToken = 0;
    let loopTimer = 0;
    let inView = false;
    let userControlled = false;

    const snapshotFor = (index) => snapshots.find((item) => Number(item.dataset.step) === index);
    const setStatus = (step) => {
      root.classList.toggle("is-readout-status", step === 6);
      progressSteps.forEach((item, index) => {
        const isCurrent = index === step - 1;
        item.classList.toggle("is-reached", index < step);
        item.classList.toggle("is-current", isCurrent);
        if (isCurrent) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
    };

    const reset = () => {
      stage.classList.remove("is-aligning", "is-joining", "has-joined-memory", "is-merging");
      frames.forEach((frame) => frame.classList.remove("is-selected", "is-local", "is-sink", "is-feeding", "is-aligning"));
      probes.forEach((probe) => probe.classList.remove("is-visible", "is-spread"));
      [forwardState, reverseState].forEach((state) => state.classList.remove("is-visible"));
      snapshots.forEach((snapshot) => snapshot.classList.remove("is-visible", "is-terminal"));
      joinedMemory.classList.remove("is-visible");
      mergeResult.classList.remove("is-visible");
      forwardState.style.left = positions[0];
      reverseState.style.left = positions[14];
      frameByIndex.get(queryFrameIndex)?.classList.add("is-selected");
      setStatus(1);
    };

    const completeLocalWindow = () => {
      probes.forEach((probe) => probe.classList.add("is-visible", "is-spread"));
      [6, 7, 8].forEach((index) => frameByIndex.get(index)?.classList.add("is-local"));
      [0, 14].forEach((index) => frameByIndex.get(index)?.classList.add("is-sink"));
    };

    const completeForwardScan = () => {
      forwardState.classList.add("is-visible");
      forwardState.style.left = positions[5];
      [1, 2, 3, 4, 5].forEach((index) => {
        frameByIndex.get(index)?.classList.add("is-feeding");
        snapshotFor(index)?.classList.add("is-visible");
      });
    };

    const completeReverseScan = () => {
      reverseState.classList.add("is-visible");
      reverseState.style.left = positions[9];
      [13, 12, 11, 10, 9].forEach((index) => {
        frameByIndex.get(index)?.classList.add("is-feeding");
        snapshotFor(index)?.classList.add("is-visible");
      });
    };

    const completeAlignment = () => {
      probes.forEach((probe) => probe.classList.remove("is-visible"));
      stage.classList.add("is-aligning");
      [5, 9].forEach((index) => snapshotFor(index)?.classList.add("is-terminal"));
      [0, 6, 7, 8, 14].forEach((index) => frameByIndex.get(index)?.classList.add("is-aligning"));
    };

    const startMemoryJoin = () => {
      forwardState.style.left = queryPosition;
      reverseState.style.left = queryPosition;
      stage.classList.add("is-joining");
    };

    const revealJoinedMemory = () => {
      stage.classList.add("has-joined-memory");
      joinedMemory.classList.add("is-visible");
    };

    const completeReadout = () => {
      forwardState.style.left = queryPosition;
      reverseState.style.left = queryPosition;
      stage.classList.remove("is-joining", "has-joined-memory");
      stage.classList.add("is-merging");
      mergeResult.classList.add("is-visible");
    };

    const wait = (milliseconds, token) => new Promise((resolve) => {
      window.setTimeout(() => resolve(token === runToken), milliseconds);
    });

    const showReducedMotionPhase = (step = 6) => {
      reset();
      if (step >= 2) completeLocalWindow();
      if (step >= 3) completeForwardScan();
      if (step >= 4) completeReverseScan();
      if (step >= 5) completeAlignment();
      if (step >= 6) completeReadout();
      setStatus(step);
    };

    const run = async (startStep = 1) => {
      window.clearTimeout(loopTimer);
      const token = ++runToken;
      reset();

      if (startStep > 2) completeLocalWindow();
      if (startStep > 3) completeForwardScan();
      if (startStep > 4) completeReverseScan();
      if (startStep > 5) completeAlignment();

      if (startStep <= 1 && !(await wait(900, token))) return;

      if (startStep <= 2) {
        setStatus(2);
        if (!(await wait(520, token))) return;
        probes.forEach((probe) => probe.classList.add("is-visible"));
        if (!(await wait(260, token))) return;
        probes.forEach((probe) => probe.classList.add("is-spread"));
        if (!(await wait(720, token))) return;
        [6, 7, 8].forEach((index) => frameByIndex.get(index)?.classList.add("is-local"));
        [0, 14].forEach((index) => frameByIndex.get(index)?.classList.add("is-sink"));
        if (!(await wait(620, token))) return;
      }

      if (startStep <= 3) {
        setStatus(3);
        forwardState.classList.add("is-visible");
        for (const index of [1, 2, 3, 4, 5]) {
          forwardState.style.left = positions[index];
          if (!(await wait(300, token))) return;
          frameByIndex.get(index)?.classList.add("is-feeding");
          if (!(await wait(300, token))) return;
          snapshotFor(index)?.classList.add("is-visible");
          if (!(await wait(190, token))) return;
        }
      }

      if (startStep <= 4) {
        setStatus(4);
        reverseState.classList.add("is-visible");
        for (const index of [13, 12, 11, 10, 9]) {
          reverseState.style.left = positions[index];
          if (!(await wait(300, token))) return;
          frameByIndex.get(index)?.classList.add("is-feeding");
          if (!(await wait(300, token))) return;
          snapshotFor(index)?.classList.add("is-visible");
          if (!(await wait(190, token))) return;
        }
        if (!(await wait(260, token))) return;
      }

      if (startStep <= 5) {
        completeAlignment();
        setStatus(5);
        if (!(await wait(1400, token))) return;
      }

      if (startStep <= 6) {
        setStatus(6);
        if (startStep === 6 && !(await wait(220, token))) return;
        startMemoryJoin();
        if (!(await wait(900, token))) return;
        revealJoinedMemory();
        if (!(await wait(850, token))) return;
        completeReadout();
        setStatus(6);
      }

      if (!(await wait(4200, token))) return;
      if (inView && !userControlled) loopTimer = window.setTimeout(() => run(1), 900);
    };

    progressButtons.forEach((button) => {
      button.addEventListener("click", () => {
        userControlled = true;
        const step = Number(button.dataset.stateStepButton);
        if (reducedMotion) showReducedMotionPhase(step);
        else run(step);
      });
    });

    if (reducedMotion) {
      showReducedMotionPhase(6);
      return;
    }

    if (!("IntersectionObserver" in window)) {
      inView = true;
      run(1);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && entry.intersectionRatio >= .28) {
        if (!inView) {
          inView = true;
          if (!userControlled) run(1);
        }
      } else if (inView) {
        inView = false;
        runToken += 1;
        window.clearTimeout(loopTimer);
        if (!userControlled) reset();
      }
    }, { threshold: [0, .28, .55] });

    observer.observe(root);
  }

  function initSpectrum() {
    const svg = $("#spectrum-plot");
    const input = $("#lambda-control");
    if (!svg || !input) return;

    const width = 620;
    const height = 330;
    const margin = { top: 24, right: 22, bottom: 42, left: 52 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const xMax = 6;
    const yMin = -5.2;
    const yMax = 1.2;
    const x = (value) => margin.left + (value / xMax) * plotW;
    const y = (value) => margin.top + ((yMax - value) / (yMax - yMin)) * plotH;

    const band = svgNode("rect", {
      x: margin.left,
      y: y(1),
      width: plotW,
      height: y(-1) - y(1),
      class: "stable-band"
    });
    svg.appendChild(band);

    [-5, -4, -3, -2, -1, 0, 1].forEach((tick) => {
      svg.appendChild(svgNode("line", { x1: margin.left, x2: width - margin.right, y1: y(tick), y2: y(tick), class: tick === 0 ? "axis" : "grid" }));
      svg.appendChild(svgNode("text", { x: margin.left - 10, y: y(tick) + 4, "text-anchor": "end", class: "plot-label" }, String(tick)));
    });

    [0, 1, 2, 3, 4, 5, 6].forEach((tick) => {
      svg.appendChild(svgNode("line", { x1: x(tick), x2: x(tick), y1: margin.top, y2: height - margin.bottom, class: tick === 0 ? "axis" : "grid" }));
      svg.appendChild(svgNode("text", { x: x(tick), y: height - margin.bottom + 23, "text-anchor": "middle", class: "plot-label" }, String(tick)));
    });

    svg.appendChild(svgNode("text", { x: width - margin.right, y: height - 8, "text-anchor": "end", class: "plot-label" }, "Gram eigenvalue λ"));
    svg.appendChild(svgNode("text", { x: 14, y: margin.top, class: "plot-label", transform: `rotate(-90 14 ${margin.top})` }, "state multiplier"));
    svg.appendChild(svgNode("text", { x: width - 110, y: y(.52), class: "curve-label", fill: "#176b64" }, "VDA  1/(1+λ)"));
    svg.appendChild(svgNode("text", { x: width - 145, y: y(-4.65), class: "curve-label", fill: "#a33e2d" }, "SANA  1−λ"));
    svg.appendChild(svgNode("text", { x: width - 105, y: y(-.78), class: "plot-label", fill: "#176b64" }, "non-expansive band"));

    const pathFor = (fn) => {
      const points = [];
      for (let step = 0; step <= 180; step += 1) {
        const lambda = (step / 180) * xMax;
        points.push(`${step === 0 ? "M" : "L"}${x(lambda).toFixed(2)},${y(fn(lambda)).toFixed(2)}`);
      }
      return points.join(" ");
    };

    svg.appendChild(svgNode("path", { d: pathFor((lambda) => 1 - lambda), class: "sana-curve" }));
    svg.appendChild(svgNode("path", { d: pathFor((lambda) => 1 / (1 + lambda)), class: "vda-curve" }));

    const cursor = svgNode("line", { y1: margin.top, y2: height - margin.bottom, class: "cursor" });
    const sanaDot = svgNode("circle", { r: 6, class: "sana-dot" });
    const vdaDot = svgNode("circle", { r: 6, class: "vda-dot" });
    svg.append(cursor, sanaDot, vdaDot);

    const lambdaOutput = $("#lambda-output");
    const sanaOutput = $("#sana-output");
    const vdaOutput = $("#vda-output");
    const note = $("#spectrum-note");

    const update = () => {
      const lambda = Number(input.value);
      const sana = 1 - lambda;
      const vda = 1 / (1 + lambda);
      const px = x(lambda);
      cursor.setAttribute("x1", px);
      cursor.setAttribute("x2", px);
      sanaDot.setAttribute("cx", px);
      sanaDot.setAttribute("cy", y(sana));
      vdaDot.setAttribute("cx", px);
      vdaDot.setAttribute("cy", y(vda));
      lambdaOutput.textContent = lambda.toFixed(2);
      sanaOutput.textContent = sana.toFixed(2);
      vdaOutput.textContent = vda.toFixed(2);

      if (lambda <= 2) {
        note.textContent = lambda < 1.95
          ? "Both transitions are non-expansive; VDA stays positive and contracts smoothly."
          : "The SANA-style transition is approaching its stable boundary at −1.";
      } else {
        note.textContent = "The SANA-style magnitude exceeds 1; VDA stays positive and does not amplify old state.";
      }
    };

    input.addEventListener("input", update);
    update();
  }

  function initLatencyFigure() {
    const section = $("#latency") || $("#performance");
    const figure = $("#latency-figure");
    if (!section || !figure) return;

    const components = $$(".latency-component", figure);
    const hardwareSwitch = $("[data-hardware-switch]", section);
    const hardwareOptions = $$("[data-hardware-option]", section);
    const detailContext = $("[data-latency-detail-context]", figure);
    const detailSummary = $("[data-latency-detail-summary]", figure);
    const detailGrid = $("[data-latency-detail-grid]", figure);
    if (!components.length || !hardwareSwitch || !detailContext || !detailSummary || !detailGrid) return;

    const hardwareBenchmarks = {
      h200: {
        copy: {
          overview: "On a single H200, the 50-step DiT denoising loop for a 15-second 768p video takes about 27.6 minutes with dense H3. VDN-H3 reduces the same one-card, 50-step workload to about 9.4 minutes with optimized inference kernels and FP8 Linear Layers. Using our customized parallelization techniques across eight H200s, the 50-step denoising time falls to about 1.94 minutes, a 14.2× overall speedup relative to dense H3 on one H200. With eight-step generation on the same eight H200s, DiT denoising takes 18.3 seconds; measured against the original one-H200, 50-step dense baseline, the <strong>complete speedup is 90.5×</strong>.",
          block: "To see where the gain comes from, we first isolate a single H3 block. Dense H3 takes 657.9 ms on H200. Tuning the local Softmax and distant VDA paths reduces the hybrid block to 293.8 ms. Dedicated kernels accelerate windowed Softmax, VDA state updates and readouts, and the final gating and scatter operations; cached geometry avoids repeated setup, while FP8 accelerates the wide Linear Layers. The complete stack reaches 223.0 ms, a measured <strong>2.95× reduction in latency</strong>.",
          ulysses: "Our next goal is to use parallelization and few-step distillation to accelerate VDN-H3 further. Standard Ulysses shards the sequence across eight H200s so each GPU processes only a fraction of the rows, reducing the tuned one-card reference <strong>from 11.198 to 2.924 s/NFE</strong><sup class=\"note-ref\" id=\"nfe-note-ref\"><a href=\"#nfe-note\">†</a></sup>, a 3.83× speedup. However, this is far from optimal. We observe another speedup opportunity by serving local Softmax and distant VDA on separate GPU groups, rather than asking every GPU to execute both branches.",
          organization: "The residual stream remains sequence-sharded across all eight GPUs: each device owns a contiguous slice and computes QKV only for those rows. <strong>An uneven all-to-all</strong> then gathers the projected heads by branch. Six H200s receive the local-Softmax work, while two receive the VDA state scan. The branches run concurrently, and the split is chosen so that neither side leaves the other waiting.",
          parallelResult: "With real weights on H200, this six-plus-two assignment reaches 2.327 s/NFE, reducing latency by another <strong>20.4% beyond Standard Ulysses</strong>.",
          overall: "Overall, the DiT denoising process takes 18.3 seconds on 8 H200 GPUs, leading to a <strong>90.5× speedup</strong>."
        },
        values: {
          denseVideo: "27.6 min", denseVideoLabel: "Dense · 50 steps · 1 H200", denseRowLabel: "released model",
          optimizedVideo: "9.4 min", optimizedVideoLabel: "VDN-H3 · 50 steps · 1 H200",
          denseBlock: "657.9 ms", hybridBlock: "293.8 ms", hybridVideo: "12.41 min", optimizedBlock: "223.0 ms",
          systemHardware50: "50 steps · 8 H200s", systemHardware8: "8 steps · 8 H200s",
          ulyssesTime: "2.44 min", parallelTime: "1.94 min", fewStepTime: "18.3 s",
          parallelGain: "20.4% faster than Ulysses", overallGain: "90.5× vs. dense 50-NFE"
        },
        widths: {
          dense: { attention: 86.26, ffn: 11.81, others: 1.93 },
          hybrid: { attention: 32.47, ffn: 11.77, others: .56 },
          optimized: { attention: 27.27, ffn: 6.06, others: .56 },
          system: { parallel: 79.6, fewStep: 12.5 }
        },
        profiles: {
          dense: {
            attention: { context: "Dense H3 · H200 Attention internals", summary: "Measured shares of the 567.5 ms Attention path.", items: [["Softmax kernel", "497.5 ms", "87.7% of attention"], ["QKV projections", "34.1 ms", "6.0%"], ["RoPE", "20.3 ms", "3.6%"], ["Output projection", "11.2 ms", "2.0%"], ["QK-norm", "8.4 ms", "1.5%"], ["Permutes", "5.4 ms", "1.0%"]] },
            ffn: { context: "Dense H3 · H200 FFN internals", summary: "The BF16 SwiGLU path is formed by two wide GEMMs.", items: [["Projection + gate", "53.0 ms", "69.8% of FFN"], ["Down projection", "23.0 ms", "30.2%"]] },
            others: { context: "Dense H3 · H200 other block work", summary: "Pointwise work outside Attention and FFN.", items: [["AdaLN affine ×2", "5.5 ms", "43.3% of Others"], ["Gate + residual ×2", "3.8 ms", "29.9%"], ["RMSNorm ×2", "1.4 ms", "11.0%"], ["AdaLN proj + residual", "2.0 ms", "15.7%"]] }
          },
          hybrid: {
            attention: { context: "Hybrid attention · H200 internals", summary: "BF16 hybrid path after the dedicated Attention kernels are enabled.", items: [["Window Softmax", "117.3 ms", "54.9% of attention"], ["QKV + RoPE + QK-norm", "40.4 ms", "18.9%"], ["VDA branch", "31.6 ms", "14.8%"], ["Softmax output", "10.8 ms", "5.1%"], ["VDA output + scatter", "10.1 ms", "4.7%"], ["Gate + flatten", "1.1 ms", "0.5%"]] },
            ffn: { context: "Hybrid attention · H200 FFN internals", summary: "The hybrid geometry leaves the BF16 SwiGLU GEMMs unchanged.", items: [["Projection + gate", "53.0 ms", "69.8% of FFN"], ["Down projection", "23.0 ms", "30.2%"]] },
            others: { context: "Hybrid attention · H200 other block work", summary: "Fused pointwise work outside Attention and FFN.", items: [["RMSNorm + AdaLN ×2", "2.0 ms", "54.1% of Others"], ["Gate + residual ×2", "1.6 ms", "43.2%"], ["AdaLN proj", "0.1 ms", "2.7%"]] }
          },
          optimized: {
            attention: { context: "VDN-H3, optimized · H200 Attention internals", summary: "FP8 accelerates the wide projections; Softmax and the VDA state kernels remain unchanged.", items: [["Window Softmax", "110.6 ms", "61.7% of attention"], ["VDA branch", "31.6 ms", "17.6%"], ["QKV · FP8", "23.6 ms", "13.2%"], ["VDA output + scatter · FP8", "6.9 ms", "3.8%"], ["Softmax output · FP8", "5.6 ms", "3.1%"], ["Gate + flatten", "1.1 ms", "0.6%"]] },
            ffn: { context: "VDN-H3, optimized · H200 FFN internals", summary: "Both wide SwiGLU GEMMs use FP8 e4m3.", items: [["Projection + gate · FP8", "≈27.4 ms", "68.7% of FFN"], ["Down projection · FP8", "≈12.5 ms", "31.3%"]] },
            others: { context: "VDN-H3, optimized · H200 other block work", summary: "The fused pointwise tail is unchanged by FP8.", items: [["RMSNorm + AdaLN ×2", "2.0 ms", "54.1% of Others"], ["Gate + residual ×2", "1.6 ms", "43.2%"], ["AdaLN proj", "0.1 ms", "2.7%"]] }
          }
        }
      },
      b200: {
        copy: {
          overview: "On a single B200, the 50-step Dense Attention DiT takes about 13.95 minutes to generate a 15 second, 768p video. VDN-H3 reduces this to about <strong>5.35 minutes</strong> with optimized kernels and FP8 linear layers.",
          block: "To see where the gain comes from, we first isolate a single H3 block. Dense H3 takes 332.5ms on a single B200. By applying Video Delta Attention and Sliding Window Softmax, this number is reduced to 192.1ms. With optimized inference kernels and FP8 linear attention, we achieve 125.3ms inference speed per layer, corresponding to <strong>2.65x speedup</strong>.",
          ulysses: "Our next goal is to use parallelization and few step distillation techniques to further accelerate VDN-H3. Standard Ulysses parallelism shards the sequence across 8 B200s, so each GPU processes only a fraction of the sequence or attention heads. This reduces latency <strong>from 6.46s / NFE to 1.62s / NFE</strong><sup class=\"note-ref\" id=\"nfe-note-ref\"><a href=\"#nfe-note\">†</a></sup>, a 3.99x per-step speedup.",
          organization: "The tensor remains sharded along the sequence dimension during QKV projection. After that, an uneven all-to-all gathers the heads in a way that <strong>5 GPUs receive the Softmax branch, and 3 GPUs receive the VDA branch</strong>. This split is chosen based on profiling results.",
          parallelResult: "After both branches finish, a reverse all-to-all sends their outputs back to the original sequence-sharded layout. This design reduces inference latency to <strong>1.405 s / NFE</strong>, reducing the latency by 13.3% beyond the standard Ulysses algorithm.",
          overall: "Overall, the DiT denoising process only takes 11.23 seconds to generate a 14.3s video, leading to a <strong>74.5x speedup over the dense MiniMax H3 baseline</strong>."
        },
        values: {
          denseVideo: "13.95 min", denseVideoLabel: "Dense · 50 steps · 1 B200", denseRowLabel: "production cuDNN Attention",
          optimizedVideo: "5.34 min", optimizedVideoLabel: "VDN-H3 · 50 steps · 1 B200",
          denseBlock: "332.5 ms", hybridBlock: "192.1 ms", hybridVideo: "8.21 min", optimizedBlock: "125.3 ms",
          systemHardware50: "50 steps · 8 B200s", systemHardware8: "8 steps · 8 B200s",
          ulyssesTime: "1.35 min", parallelTime: "1.17 min", fewStepTime: "11.23 s",
          parallelGain: "13.3% lower latency than Ulysses", overallGain: "74.5× vs. dense 50-NFE"
        },
        widths: {
          dense: { attention: 84.75, ffn: 12.15, others: 3.10 },
          hybrid: { attention: 42.14, ffn: 12.12, others: 3.52 },
          optimized: { attention: 31.28, ffn: 5.83, others: .57 },
          system: { parallel: 86.7, fewStep: 14.9 }
        },
        profiles: {
          dense: {
            attention: { context: "Dense H3 · B200 Attention internals", summary: "A dedicated L3 rerun measures the production cuDNN Attention path at 284.1 ms, within 0.8% of the 281.8 ms block-sweep value.", items: [["Softmax kernel · cuDNN SDPA", "230.5 ms", "81.1% of attention"], ["RoPE", "22.5 ms", "7.9%"], ["QKV projections", "16.3 ms", "5.7%"], ["QK-norm", "12.2 ms", "4.3%"], ["Permutes", "5.2 ms", "1.8%"], ["Output projection", "4.9 ms", "1.7%"]] },
            ffn: { context: "Dense H3 · B200 FFN internals", summary: "The in-block BF16 SwiGLU path measures 40.4 ms; the separately timed GEMMs account for 96.1% of it.", items: [["Projection + gate", "28.2 ms", "69.9% of FFN"], ["Down projection", "10.6 ms", "26.2%"], ["Launch + allocator residual", "1.6 ms", "4.0%"]] },
            others: { context: "Dense H3 · B200 other block work", summary: "The 10.4 ms outside Attention and FFN is now measured component by component.", items: [["RMSNorm + AdaLN affine ×2", "5.2 ms", "50.0% of Others"], ["Gate + residual ×2", "2.8 ms", "26.9%"], ["AdaLN projection", "0.1 ms", "1.0%"], ["Unaccounted", "2.3 ms", "22.1%"]] }
          },
          hybrid: {
            attention: { context: "Hybrid attention · B200 internals", summary: "The decomposed window and tuned VDA path reduce Attention to 140.1 ms.", items: [["Window Softmax · decomposed", "≈54.6 ms", "39.0% of attention"], ["QKV + RoPE + QK-norm", "45.9 ms", "32.8%"], ["VDA branch", "26.0 ms", "18.6%"], ["Softmax output", "4.5 ms", "3.2%"], ["VDA output + scatter", "4.6 ms", "3.3%"], ["Gate + flatten", "2.0 ms", "1.5%"], ["Unaccounted", "2.5 ms", "1.8%"]] },
            ffn: { context: "Hybrid attention · B200 FFN internals", summary: "The hybrid geometry leaves the BF16 SwiGLU path unchanged.", items: [["Projection + gate", "27.6 ms", "73.2% of standalone parts"], ["Down projection", "10.1 ms", "26.8%"]] },
            others: { context: "Hybrid attention · B200 other block work", summary: "Pointwise work and the measured block residual.", items: [["RMSNorm + AdaLN ×2", "4.9 ms", "42.2% of Others"], ["Gate + residual ×2", "2.7 ms", "23.3%"], ["AdaLN proj", "0.1 ms", "0.9%"], ["Unaccounted residual", "3.9 ms", "33.6%"]] }
          },
          optimized: {
            attention: { context: "VDN-H3, optimized · B200 Attention internals", summary: "Production B200 path with the decomposed window and FP8 Linear Layers.", items: [["Window Softmax · decomposed", "≈54.6 ms", "52.5% of attention"], ["VDA branch", "24.7 ms", "23.8%"], ["QKV · FP8", "12.1 ms", "11.6%"], ["VDA output + scatter · FP8", "2.9 ms", "2.8%"], ["Softmax output · FP8", "2.8 ms", "2.7%"], ["Gate + flatten", "0.7 ms", "0.7%"], ["Unaccounted", "6.2 ms", "6.0%"]] },
            ffn: { context: "VDN-H3, optimized · B200 FFN internals", summary: "The in-block FP8 FFN measures 19.4 ms; standalone GEMMs overlap differently inside the block.", items: [["Projection + gate · FP8", "18.6 ms", "75.0% of standalone parts"], ["Down projection · FP8", "6.2 ms", "25.0%"]] },
            others: { context: "VDN-H3, optimized · B200 other block work", summary: "Fused pointwise work outside Attention and FFN.", items: [["RMSNorm + AdaLN ×2", "1.3 ms", "54.2% of timed parts"], ["Gate + residual ×2", "1.0 ms", "41.7%"], ["AdaLN proj", "0.1 ms", "4.1%"]] }
          }
        }
      }
    };

    let activeHardware = "b200";
    let refreshTimer;

    const detailKind = (label) => {
      const name = label.toLowerCase();
      if (/unaccounted|launch|allocator/.test(name)) return "overhead";
      if (/vda|far branch|state|scan|frame statistics|text state|readout/.test(name)) return "linear";
      if (/softmax kernel|window softmax|window ·/.test(name)) return "softmax";
      if (/qkv|projection|proj\b|softmax output|output projection|down\b|feed-forward|ffn|gemm/.test(name)) return "projection";
      return "pointwise";
    };

    const detailPalette = [
      "#3f7771",
      "#a96853",
      "#7486a5",
      "#b18a4f",
      "#7d7095",
      "#829466",
      "#a36d82"
    ];

    const showDetails = (component) => {
      const detail = hardwareBenchmarks[activeHardware].profiles[component.dataset.latencyProfile]?.[component.dataset.latencyCategory];
      if (!detail) return;
      detailContext.textContent = detail.context;
      detailSummary.textContent = detail.summary;
      detailGrid.replaceChildren(...detail.items.map(([label, value, share], index) => {
        const item = document.createElement("div");
        item.className = "latency-detail-item";
        item.dataset.detailKind = detailKind(label);
        item.style.setProperty("--detail-share", `${Math.max(0, Math.min(100, Number.parseFloat(share) || 0))}%`);
        item.style.setProperty("--detail-color", detailPalette[index % detailPalette.length]);

        const labelBlock = document.createElement("div");
        labelBlock.className = "latency-detail-label";
        const name = document.createElement("span");
        const measurement = document.createElement("strong");

        const bar = document.createElement("div");
        bar.className = "latency-detail-bar";
        bar.setAttribute("aria-hidden", "true");
        const fill = document.createElement("i");

        const proportion = document.createElement("em");
        name.textContent = label;
        measurement.textContent = value;
        proportion.textContent = share;
        labelBlock.append(name, measurement);
        bar.append(fill);
        item.append(labelBlock, bar, proportion);
        return item;
      }));
    };

    const updateHardware = (hardware, animate = true) => {
      if (!hardwareBenchmarks[hardware]) return;
      if (animate) {
        window.clearTimeout(refreshTimer);
        section.classList.remove("is-refreshing");
        void section.offsetWidth;
      }
      activeHardware = hardware;
      const benchmark = hardwareBenchmarks[hardware];
      section.dataset.hardware = hardware;
      hardwareSwitch.classList.toggle("is-h200", hardware === "h200");

      hardwareOptions.forEach((option) => {
        const selected = option.dataset.hardwareOption === hardware;
        option.classList.toggle("is-active", selected);
        option.setAttribute("aria-pressed", String(selected));
      });

      $$('[data-hardware-copy]', section).forEach((node) => {
        const copy = benchmark.copy[node.dataset.hardwareCopy];
        if (copy) node.innerHTML = copy;
      });

      $$('[data-benchmark]', section).forEach((node) => {
        const value = benchmark.values[node.dataset.benchmark];
        if (value) node.textContent = value;
      });

      components.forEach((component) => {
        const width = benchmark.widths[component.dataset.latencyProfile]?.[component.dataset.latencyCategory];
        if (Number.isFinite(width)) component.style.setProperty("--component-width", `${width}%`);
      });

      $$('[data-system-width]', section).forEach((bar) => {
        const width = benchmark.widths.system[bar.dataset.systemWidth];
        if (Number.isFinite(width)) bar.style.setProperty("--system-width", `${width}%`);
      });

      showDetails(components[0]);
      if (animate) {
        section.classList.add("is-refreshing");
        refreshTimer = window.setTimeout(() => section.classList.remove("is-refreshing"), 520);
      }
    };

    components.forEach((component) => {
      component.addEventListener("mouseenter", () => showDetails(component));
      component.addEventListener("focus", () => showDetails(component));
      component.addEventListener("click", () => showDetails(component));
    });

    hardwareOptions.forEach((option) => {
      option.addEventListener("click", () => updateHardware(option.dataset.hardwareOption, true));
    });

    updateHardware("b200", false);
  }

  function initBibtexCopy() {
    const button = $('[data-copy-bibtex]');
    const code = $('[data-bibtex]');
    if (!button || !code) return;

    let resetTimer = 0;
    button.addEventListener('click', async () => {
      const bibtex = `${code.textContent.trim()}\n`;
      let copied = false;
      try {
        await navigator.clipboard.writeText(bibtex);
        copied = true;
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = bibtex;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        textarea.remove();
      }

      button.textContent = copied ? 'Copied' : 'Copy failed';
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => { button.textContent = 'Copy BibTeX'; }, 1600);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initVdnResultShowcases();
    initResultGalleries();
    initAttentionMap();
    initBranchFigure();
    initWorkloadFigure();
    initDirectionalStateAnimation();
    initSpectrum();
    initLatencyFigure();
    initBibtexCopy();
  });
})();
