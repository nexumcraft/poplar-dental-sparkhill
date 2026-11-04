// Poplar Dental Practice — 2D animation: floating shapes in page headers, tooth characters,
// scroll progress, photo parallax and button ripples. Skipped for people who prefer reduced motion.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hasPointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const SHAPES = {
    tooth: '<path d="M12 5c-2 0-3-1-5-1C4 4 2 7 2 10c0 3 1 4 2 7 1 2 1 6 3 6s2-5 5-5 3 5 5 5 2-4 3-6c1-3 2-4 2-7 0-3-2-6-5-6-2 0-3 1-5 1Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
    spark: '<path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z" fill="currentColor"/>',
    bubble: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 9a5 5 0 0 1 3-2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    brush: '<path d="M2 15h13l7-2v3l-7 2H2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 15v-5M6 15v-5M9 15v-5M12 15v-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  };
  const FLOATERS = [
    ['tooth', 6, 18, 44, 0], ['bubble', 18, 72, 22, 2], ['spark', 34, 12, 16, 1], ['bubble', 48, 80, 30, 3],
    ['brush', 56, 14, 46, 2], ['spark', 70, 70, 14, 4], ['tooth', 84, 26, 30, 1], ['bubble', 93, 66, 18, 5],
  ];

  document.querySelectorAll('.hero, .page-hero').forEach((header) => {
    const layer = document.createElement('div');
    layer.className = 'float-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = FLOATERS.map(([shape, x, y, size, delay], i) => `<span class="floater" style="left:${x}%;top:${y}%;--depth:${(i % 3) + 1};--delay:-${delay}s"><svg viewBox="0 0 24 24" width="${size}" height="${size}">${SHAPES[shape]}</svg></span>`).join('');
    header.prepend(layer);
    if (!hasPointer) return;
    header.addEventListener('pointermove', (event) => {
      const box = header.getBoundingClientRect();
      layer.style.setProperty('--px', ((event.clientX - box.left) / box.width - 0.5).toFixed(3));
      layer.style.setProperty('--py', ((event.clientY - box.top) / box.height - 0.5).toFixed(3));
    });
  });

  // Page headings rise in word by word; the label keeps them reading as one heading for screen readers.
  document.querySelectorAll('.page-hero h1').forEach((heading) => {
    const text = heading.textContent.trim();
    heading.setAttribute('aria-label', text);
    heading.innerHTML = text.split(/\s+/).map((word, i) => `<span class="word" aria-hidden="true" style="--i:${i}">${word.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join(' ');
  });

  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);
  const updateProgress = () => {
    const range = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${range > 0 ? Math.min(scrollY / range, 1) : 0})`;
  };
  addEventListener('scroll', updateProgress, { passive: true });
  addEventListener('resize', updateProgress);
  updateProgress();

  if (hasPointer) {
    // The tooth characters' eyes follow the pointer.
    addEventListener('pointermove', (event) => {
      document.querySelectorAll('[data-mascot]').forEach((mascot) => {
        const box = mascot.getBoundingClientRect();
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        const shift = `translate(${((dx / distance) * 3.5).toFixed(1)}px, ${((dy / distance) * 3.5).toFixed(1)}px)`;
        mascot.querySelectorAll('.mascot__pupil').forEach((pupil) => { pupil.style.transform = shift; });
      });
    }, { passive: true });

    document.querySelectorAll('.hero__photo, .page-hero__photo').forEach((frame) => {
      frame.addEventListener('pointermove', (event) => {
        const box = frame.getBoundingClientRect();
        frame.style.setProperty('--mx', `${((event.clientX - box.left) / box.width - 0.5) * -14}px`);
        frame.style.setProperty('--my', `${((event.clientY - box.top) / box.height - 0.5) * -14}px`);
      });
      frame.addEventListener('pointerleave', () => {
        frame.style.setProperty('--mx', '0px');
        frame.style.setProperty('--my', '0px');
      });
    });
  }

  document.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('.btn');
    if (!button) return;
    const box = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${event.clientX - box.left}px`;
    ripple.style.top = `${event.clientY - box.top}px`;
    button.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });

  // Looping scenes only run while they're on screen.
  if ('IntersectionObserver' in window) {
    const watcher = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-paused', !entry.isIntersecting));
    });
    document.querySelectorAll('.brush-scene, .footer-wave').forEach((scene) => watcher.observe(scene));
  }
})();
