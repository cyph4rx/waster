(() => {
  const canvas = document.getElementById("nodeBackground");
  const context = canvas.getContext("2d");
  if (!context) return;

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = matchMedia("(max-width: 600px)");
  const frameInterval = 1000 / 30;
  let visible = false;
  let frame = 0;
  let lastDraw;
  let elapsed = 0;
  let width = 0;
  let height = 0;
  let connectionDistance = 0;
  let nodes = [];

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return;

    const density = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);

    const count = mobile.matches ? 18 : 54;
    const columns = Math.min(count, Math.max(2, Math.round(Math.sqrt(count * width / height))));
    const rows = Math.ceil(count / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    connectionDistance = Math.min(265, Math.max(108, Math.hypot(cellWidth, cellHeight) * 1.24));
    nodes = Array.from({ length: count }, (_, index) => ({
      baseX: (index % columns + .15 + Math.random() * .7) * cellWidth,
      baseY: (Math.floor(index / columns) + .15 + Math.random() * .7) * cellHeight,
      swayX: cellWidth * (.24 + Math.random() * .20),
      swayY: cellHeight * (.12 + Math.random() * .24),
      phase: Math.random() * 2 * Math.PI,
      speed: .27 + Math.random() * .42,
      radius: 1.3 + Math.random() * 1.45
    }));
    draw();
    syncAnimation();
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    const rangeSquared = connectionDistance ** 2;
    for (const node of nodes) {
      const angle = elapsed * node.speed + node.phase;
      node.x = node.baseX + Math.cos(angle) * node.swayX;
      node.y = node.baseY + Math.sin(angle * .83 + node.phase) * node.swayY;
    }

    context.strokeStyle = "#b6b6b6";
    context.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const distanceSquared = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (distanceSquared >= rangeSquared) continue;
        const strength = 1 - Math.sqrt(distanceSquared) / connectionDistance;
        context.globalAlpha = strength * .53;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }

    context.fillStyle = "#eee";
    for (const node of nodes) {
      context.globalAlpha = .60 + .27 * Math.sin(elapsed * node.speed + node.phase);
      context.beginPath();
      context.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function tick(now) {
    if (lastDraw === undefined || now - lastDraw >= frameInterval) {
      if (lastDraw !== undefined) elapsed += Math.min(80, now - lastDraw) / 1000;
      lastDraw = now;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function syncAnimation() {
    if (!motion.matches && visible && !document.hidden && width && height) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      lastDraw = undefined;
    }
  }

  motion.addEventListener("change", syncAnimation);
  document.addEventListener("visibilitychange", syncAnimation);
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncAnimation();
  }).observe(canvas);
})();
