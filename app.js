(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const homeScreen = $('#home-screen');
  const gameScreen = $('#game-screen');
  const gameContent = $('#game-content');
  const feedback = $('#feedback');
  const completion = $('#completion');
  const timerEl = $('#timer');
  const mistakesEl = $('#mistakes');
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const MODE_INFO = {
    notation: { kicker: 'RETO 01', title: 'Notación de puntos', instruction: 'Observa las coordenadas y selecciona el valor que corresponde a la letra y subíndice que se te pide.' },
    formula: { kicker: 'RETO 02', title: 'Fórmula de la pendiente', instruction: 'Completa los espacios de la fórmula seleccionando las coordenadas. Después calcula la pendiente usando los botones + y −.' },
    graph: { kicker: 'RETO 03', title: 'Ubicación y gráfica', instruction: 'Ubica los puntos A y B en el plano. Cuando ambos estén colocados, pulsa “Trazar recta”.' }
  };

  let mode = null;
  let timerInterval = null;
  let startedAt = 0;
  let mistakes = 0;
  let bestTimes = loadBestTimes();
  let modeState = {};
  let graphDrag = null;

  function loadBestTimes() {
    try { return JSON.parse(localStorage.getItem('desafiosRectasBest') || '{}'); }
    catch (_) { return {}; }
  }

  function saveBestTimes() {
    try { localStorage.setItem('desafiosRectasBest', JSON.stringify(bestTimes)); }
    catch (_) { /* El juego funciona aunque el navegador no permita guardar. */ }
  }

  function formatTime(ms) {
    const totalCs = Math.floor(ms / 10);
    const minutes = Math.floor(totalCs / 6000);
    const seconds = Math.floor((totalCs % 6000) / 100);
    const centiseconds = totalCs % 100;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
  }

  function elapsed() { return Math.max(0, Date.now() - startedAt); }

  function startTimer() {
    clearInterval(timerInterval);
    startedAt = Date.now();
    timerEl.textContent = '00:00.00';
    timerInterval = setInterval(() => { timerEl.textContent = formatTime(elapsed()); }, 50);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerEl.textContent = formatTime(elapsed());
  }

  function setFeedback(message = '', type = '') {
    feedback.textContent = message;
    feedback.className = `feedback ${type}`.trim();
  }

  function updateMistakes() { mistakesEl.textContent = String(mistakes); }

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(items) {
    const array = [...items];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function makePoints(requireIntegerSlope = false) {
    if (requireIntegerSlope) {
      const slopes = [-3, -2, -1, 0, 1, 2, 3];
      for (let tries = 0; tries < 500; tries++) {
        const x1 = randInt(-4, 4);
        let x2 = randInt(-4, 4);
        if (x1 === x2) continue;
        const m = slopes[randInt(0, slopes.length - 1)];
        const deltaY = m * (x2 - x1);
        const minY1 = Math.max(-4, -4 - deltaY);
        const maxY1 = Math.min(4, 4 - deltaY);
        if (minY1 > maxY1) continue;
        const y1 = randInt(minY1, maxY1);
        const y2 = y1 + deltaY;
        return { A: { x: x1, y: y1 }, B: { x: x2, y: y2 }, m };
      }
    }
    const x1 = randInt(-4, 4);
    let x2 = randInt(-4, 4);
    while (x2 === x1) x2 = randInt(-4, 4);
    return { A: { x: x1, y: randInt(-4, 4) }, B: { x: x2, y: randInt(-4, 4) } };
  }

  function signed(value) { return value < 0 ? `−${Math.abs(value)}` : String(value); }
  function subscript(value) { return String(value).replaceAll('1', '₁').replaceAll('2', '₂'); }

  function updateHomeBests() {
    ['notation', 'formula', 'graph'].forEach((key) => {
      const node = $(`#best-${key}`);
      node.textContent = bestTimes[key] == null ? 'Mejor tiempo: --:--' : `Mejor tiempo: ${formatTime(bestTimes[key])}`;
    });
  }

  function startMode(nextMode) {
    mode = nextMode;
    mistakes = 0;
    updateMistakes();
    setFeedback();
    completion.classList.add('hidden');
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    const info = MODE_INFO[mode];
    $('#game-kicker').textContent = info.kicker;
    $('#game-title').textContent = info.title;
    $('#game-instructions').textContent = info.instruction;

    if (mode === 'notation') initNotation();
    if (mode === 'formula') initFormula();
    if (mode === 'graph') initGraph();
    startTimer();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function completeMode() {
    if (!timerInterval) return;
    const finalTime = elapsed();
    stopTimer();
    const previous = bestTimes[mode];
    const isBest = previous == null || finalTime < previous;
    if (isBest) {
      bestTimes[mode] = finalTime;
      saveBestTimes();
    }
    $('#completion-time').textContent = `Tiempo: ${formatTime(finalTime)} · Errores: ${mistakes}`;
    $('#completion-best').textContent = isBest ? '¡Nuevo mejor tiempo en este dispositivo!' : `Tu mejor tiempo sigue siendo ${formatTime(previous)}.`;
    completion.classList.remove('hidden');
    completion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Reto 1: cada coordenada incorrecta vuelve al final de la cola.
  function initNotation() {
    const points = makePoints(false);
    const labels = ['x1', 'y1', 'x2', 'y2'];
    modeState = { points, queue: shuffle(labels), index: 0, locked: false };
    renderNotation();
  }

  function renderNotation() {
    const { points, queue } = modeState;
    const coordinate = (name) => name === 'x1' ? points.A.x : name === 'y1' ? points.A.y : name === 'x2' ? points.B.x : points.B.y;
    const done = 4 - queue.length;
    const target = queue[0];
    const targetText = target === 'x1' ? 'x₁' : target === 'y1' ? 'y₁' : target === 'x2' ? 'x₂' : 'y₂';
    gameContent.innerHTML = `
      <div class="progress-line"><span>Coordenadas identificadas</span><div class="progress-track"><div class="progress-fill" style="width:${(done / 4) * 100}%"></div></div><span>${done}/4</span></div>
      <div class="point-pair">
        <div class="point-card"><span class="point-name">Punto A</span><div class="coord-row tuple-row"><span>(</span><button class="coord-choice" type="button" data-notation-choice="x1">${signed(points.A.x)}</button><span>,</span><button class="coord-choice" type="button" data-notation-choice="y1">${signed(points.A.y)}</button><span>)</span></div></div>
        <div class="point-card"><span class="point-name">Punto B</span><div class="coord-row tuple-row"><span>(</span><button class="coord-choice" type="button" data-notation-choice="x2">${signed(points.B.x)}</button><span>,</span><button class="coord-choice" type="button" data-notation-choice="y2">${signed(points.B.y)}</button><span>)</span></div></div>
      </div>
      <div class="prompt-box"><span class="small-label">SELECCIONA LA COORDENADA</span><strong>¿Cuál es ${targetText}?</strong></div>
`;
    gameContent.querySelectorAll('[data-notation-choice]').forEach((button) => {
      button.addEventListener('click', () => chooseNotation(button.dataset.notationChoice, button));
    });
    modeState.currentTarget = target;
    modeState.currentCoordinate = coordinate;
  }

  function chooseNotation(choice, button) {
    if (modeState.locked || !timerInterval) return;
    const target = modeState.currentTarget;
    if (choice === target) {
      modeState.queue.shift();
      button.classList.add('good');
      setFeedback('¡Correcto!', 'good');
      if (modeState.queue.length === 0) {
        completeMode();
      } else {
        modeState.locked = true;
        setTimeout(() => { modeState.locked = false; renderNotation(); setFeedback(); }, 350);
      }
    } else {
      mistakes++;
      updateMistakes();
      modeState.queue.push(modeState.queue.shift());
      modeState.locked = true;
      button.style.borderColor = '#ef4444';
      button.style.background = '#fef2f2';
      button.style.color = '#b91c1c';
      setFeedback('No es esa coordenada. La volverás a encontrar al final.', 'bad');
      setTimeout(() => { modeState.locked = false; renderNotation(); setFeedback(); }, 650);
    }
  }

  // Reto 2: selección de coordenadas para cada espacio de la fórmula.
  function initFormula() {
    const points = makePoints(true);
    modeState = { points, slope: points.m, slots: { y2: null, y1: null, x2: null, x1: null }, activeSlot: 'y2', answer: 0, invalid: [] };
    renderFormula();
  }

  function renderFormula() {
    const p = modeState.points;
    const slotKeys = ['y2', 'y1', 'x2', 'x1'];
    const slotHTML = (key) => {
      const val = modeState.slots[key];
      const active = modeState.activeSlot === key ? 'active' : '';
      const invalid = modeState.invalid.includes(key) ? 'invalid' : '';
      const display = val ? `${val.label} = ${signed(val.value)}` : (key === 'y2' ? 'y₂' : key === 'y1' ? 'y₁' : key === 'x2' ? 'x₂' : 'x₁');
      return `<button type="button" class="frac-slot ${active} ${invalid}" data-slot="${key}">${display}</button>`;
    };
    const tokens = [
      { key: 'y1', label: `y₁ = ${signed(p.A.y)}` }, { key: 'x1', label: `x₁ = ${signed(p.A.x)}` },
      { key: 'y2', label: `y₂ = ${signed(p.B.y)}` }, { key: 'x2', label: `x₂ = ${signed(p.B.x)}` }
    ];
    gameContent.innerHTML = `
      <div class="point-pair">
        <div class="point-card"><span class="point-name">Punto A</span><div class="coord-row"><button class="coord-choice" type="button" disabled>(${signed(p.A.x)}, ${signed(p.A.y)})</button></div></div>
        <div class="point-card"><span class="point-name">Punto B</span><div class="coord-row"><button class="coord-choice" type="button" disabled>(${signed(p.B.x)}, ${signed(p.B.y)})</button></div></div>
      </div>
      <div class="formula-workspace">
        <div class="formula-panel">
          <div class="formula-label">COMPLETA LA FÓRMULA</div>
          <div class="formula"><span>m =</span><span class="fraction"><span class="frac-row">${slotHTML('y2')}<span class="minus-sign">−</span>${slotHTML('y1')}</span><span class="frac-bar"></span><span class="frac-row">${slotHTML('x2')}<span class="minus-sign">−</span>${slotHTML('x1')}</span></span></div>
          <p class="slot-hint">Toca un espacio de la fórmula y luego selecciona la coordenada que corresponde.</p>
        </div>
        <div><p class="coord-picker-title">COORDENADAS DISPONIBLES</p><div class="coord-picker">${tokens.map((item) => `<button type="button" class="coord-token" data-formula-token="${item.key}">${item.label}</button>`).join('')}</div></div>
        <div class="slope-answer"><span class="slope-answer-label">Resultado: m =</span><div class="stepper"><button type="button" data-step="-1" aria-label="Disminuir">−</button><output id="slope-value">0</output><button type="button" data-step="1" aria-label="Aumentar">+</button></div></div>
        <button type="button" id="check-formula" class="primary-button">Comprobar respuesta</button>
      </div>`;

    gameContent.querySelectorAll('[data-slot]').forEach((button) => button.addEventListener('click', () => {
      modeState.activeSlot = button.dataset.slot;
      modeState.invalid = modeState.invalid.filter((item) => item !== button.dataset.slot);
      renderFormula();
    }));
    gameContent.querySelectorAll('[data-formula-token]').forEach((button) => button.addEventListener('click', () => {
      const key = button.dataset.formulaToken;
      const coordValue = key === 'x1' ? p.A.x : key === 'y1' ? p.A.y : key === 'x2' ? p.B.x : p.B.y;
      const label = key === 'x1' ? 'x₁' : key === 'y1' ? 'y₁' : key === 'x2' ? 'x₂' : 'y₂';
      modeState.slots[modeState.activeSlot] = { key, label, value: coordValue };
      modeState.invalid = modeState.invalid.filter((item) => item !== modeState.activeSlot);
      const nextEmpty = ['y2', 'y1', 'x2', 'x1'].find((slot) => !modeState.slots[slot]);
      modeState.activeSlot = nextEmpty || modeState.activeSlot;
      renderFormula();
    }));
    gameContent.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => {
      modeState.answer = Math.max(-6, Math.min(6, modeState.answer + Number(button.dataset.step)));
      $('#slope-value').textContent = signed(modeState.answer);
    }));
    $('#check-formula').addEventListener('click', checkFormula);
  }

  function checkFormula() {
    const keys = ['y2', 'y1', 'x2', 'x1'];
    const allFilled = keys.every((key) => modeState.slots[key] !== null);
    if (!allFilled) {
      setFeedback('Completa los cuatro espacios de la fórmula antes de comprobar.', 'bad');
      return;
    }
    const expected = { y2: 'y2', y1: 'y1', x2: 'x2', x1: 'x1' };
    const wrong = keys.filter((key) => modeState.slots[key].key !== expected[key]);
    const slopeCorrect = modeState.answer === modeState.slope;
    if (wrong.length === 0 && slopeCorrect) {
      setFeedback('¡Fórmula y pendiente correctas!', 'good');
      completeMode();
      return;
    }
    mistakes++;
    updateMistakes();
    modeState.invalid = wrong;
    renderFormula();
    if (wrong.length && !slopeCorrect) setFeedback('Revisa los espacios marcados y el valor de la pendiente.', 'bad');
    else if (wrong.length) setFeedback('Hay coordenadas que no corresponden a su posición en la fórmula.', 'bad');
    else setFeedback('La fórmula está bien, pero el resultado de la pendiente no es correcto.', 'bad');
  }

  // Reto 3: plano cartesiano con zonas amplias de toque y puntos arrastrables.
  function initGraph() {
    const points = makePoints(false);
    modeState = { target: points, placed: { A: null, B: null }, active: 'A', line: null, tracing: false };
    renderGraph();
  }

  const GRID = { min: -5, max: 5, left: 60, top: 60, step: 50, size: 500 };
  function graphPixel(point) {
    return { x: GRID.left + (point.x - GRID.min) * GRID.step, y: GRID.top + (GRID.max - point.y) * GRID.step };
  }

  function lineAcrossSquare(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0) return [{ x: a.x, y: -5 }, { x: a.x, y: 5 }].map(graphPixel);
    const m = dy / dx;
    const candidates = [];
    [-5, 5].forEach((x) => { const y = a.y + m * (x - a.x); if (y >= -5 && y <= 5) candidates.push({ x, y }); });
    [-5, 5].forEach((y) => { const x = a.x + (y - a.y) / m; if (Number.isFinite(x) && x >= -5 && x <= 5) candidates.push({ x, y }); });
    const unique = [];
    candidates.forEach((p) => { if (!unique.some((q) => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6)) unique.push(p); });
    return unique.slice(0, 2).map(graphPixel);
  }

  function renderGraph() {
    const p = modeState.target;
    const gridLines = [];
    const labels = [];
    for (let value = -5; value <= 5; value++) {
      const x = GRID.left + (value + 5) * GRID.step;
      const y = GRID.top + (5 - value) * GRID.step;
      gridLines.push(`<line class="gridline" x1="${x}" y1="60" x2="${x}" y2="560"/><line class="gridline" x1="60" y1="${y}" x2="560" y2="${y}"/>`);
      if (value !== 0) {
        labels.push(`<text class="tick-label" x="${x}" y="580" text-anchor="middle">${value}</text>`);
        labels.push(`<text class="tick-label" x="43" y="${y + 4}" text-anchor="end">${value}</text>`);
      }
    }
    const marker = (key) => {
      const pos = modeState.placed[key];
      if (!pos) return '';
      const px = graphPixel(pos);
      const fill = key === 'A' ? '#2563eb' : '#ea580c';
      return `<circle class="hit-area" data-marker="${key}" cx="${px.x}" cy="${px.y}" r="27"/><circle class="marker" data-marker="${key}" cx="${px.x}" cy="${px.y}" r="15" fill="${fill}"/><text class="marker-label" x="${px.x}" y="${px.y}">${key}</text>`;
    };
    let lineHTML = '';
    if (modeState.line) {
      const [start, end] = lineAcrossSquare(modeState.placed.A, modeState.placed.B);
      if (start && end) lineHTML = `<line class="${modeState.line === 'correct' ? 'answer-line' : 'wrong-line'}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"/>`;
    }
    gameContent.innerHTML = `
      <div class="graph-layout">
        <div class="graph-targets"><span class="graph-target a">A = (${signed(p.A.x)}, ${signed(p.A.y)})</span><span class="graph-target b">B = (${signed(p.B.x)}, ${signed(p.B.y)})</span></div>
        <div class="graph-tools"><button type="button" class="select-point ${modeState.active === 'A' ? 'active' : ''}" data-active-point="A">Colocar punto A</button><button type="button" class="select-point ${modeState.active === 'B' ? 'active' : ''}" data-active-point="B">Colocar punto B</button></div>
        <p class="graph-hint">Selecciona A o B y toca una intersección del plano. También puedes arrastrar un punto ya colocado para ajustarlo.</p>
        <div class="graph-board"><svg id="coordinate-plane" viewBox="0 0 620 620" role="img" aria-label="Plano cartesiano de menos cinco a cinco">${gridLines.join('')}<line class="axis" x1="60" y1="310" x2="560" y2="310"/><line class="axis" x1="310" y1="560" x2="310" y2="60"/><path d="M552 304 L560 310 L552 316 M304 68 L310 60 L316 68" fill="none" stroke="#64748b" stroke-width="2"/>${labels.join('')}<text class="axis-label" x="578" y="316">x</text><text class="axis-label" x="320" y="45">y</text><text class="tick-label" x="297" y="328" text-anchor="end">0</text>${lineHTML}${marker('A')}${marker('B')}</svg></div>
        <div class="graph-actions"><button type="button" id="trace-line" class="primary-button" ${modeState.placed.A && modeState.placed.B ? '' : 'disabled'}>Trazar recta</button></div>
      </div>`;
    gameContent.querySelectorAll('[data-active-point]').forEach((button) => button.addEventListener('click', () => {
      modeState.active = button.dataset.activePoint;
      renderGraph();
    }));
    $('#trace-line').addEventListener('click', traceGraphLine);
  }

  function svgCoordinateFromEvent(event, svg) {
    const rect = svg.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * 620 / rect.width, y: (event.clientY - rect.top) * 620 / rect.height };
  }

  function snapToGrid(pixel) {
    const col = Math.round((pixel.x - GRID.left) / GRID.step);
    const row = Math.round((pixel.y - GRID.top) / GRID.step);
    const x = col + GRID.min;
    const y = GRID.max - row;
    if (x < -5 || x > 5 || y < -5 || y > 5) return null;
    return { x, y };
  }

  function graphPointerDown(event) {
    if (mode !== 'graph' || modeState.tracing || !timerInterval) return;
    const svg = $('#coordinate-plane');
    if (!svg) return;
    event.preventDefault();
    const targetMarker = event.target.closest('[data-marker]');
    const pixel = svgCoordinateFromEvent(event, svg);
    if (targetMarker) {
      graphDrag = targetMarker.dataset.marker;
      modeState.active = graphDrag;
      svg.setPointerCapture?.(event.pointerId);
      gameContent.querySelectorAll('[data-active-point]').forEach((button) => {
        button.classList.toggle('active', button.dataset.activePoint === graphDrag);
      });
      return;
    }
    const snapped = snapToGrid(pixel);
    if (!snapped) return;
    modeState.placed[modeState.active] = snapped;
    if (modeState.active === 'A' && !modeState.placed.B) modeState.active = 'B';
    renderGraph();
  }

  function graphPointerMove(event) {
    if (!graphDrag || mode !== 'graph' || modeState.tracing) return;
    const svg = $('#coordinate-plane');
    if (!svg) return;
    const snapped = snapToGrid(svgCoordinateFromEvent(event, svg));
    if (!snapped) return;
    modeState.placed[graphDrag] = snapped;
    // Actualiza solamente las posiciones visuales para que el arrastre se sienta continuo.
    const pos = graphPixel(snapped);
    const marker = svg.querySelectorAll(`[data-marker="${graphDrag}"]`);
    marker.forEach((node) => { node.setAttribute('cx', pos.x); node.setAttribute('cy', pos.y); });
    const traceButton = $('#trace-line');
    if (traceButton) traceButton.disabled = !(modeState.placed.A && modeState.placed.B);
    const targetButton = $(`[data-active-point="${graphDrag}"]`);
    if (targetButton) targetButton.classList.add('active');
  }

  function graphPointerUp() {
    if (graphDrag) {
      graphDrag = null;
      renderGraph();
    }
  }

  function traceGraphLine() {
    if (modeState.tracing || !modeState.placed.A || !modeState.placed.B) return;
    modeState.tracing = true;
    const correct = modeState.placed.A.x === modeState.target.A.x && modeState.placed.A.y === modeState.target.A.y &&
      modeState.placed.B.x === modeState.target.B.x && modeState.placed.B.y === modeState.target.B.y;
    modeState.line = correct ? 'correct' : 'wrong';
    renderGraph();
    if (correct) {
      setFeedback('¡Los dos puntos están bien ubicados! Recta trazada correctamente.', 'good');
      completeMode();
    } else {
      mistakes++;
      updateMistakes();
      setFeedback('La ubicación no es correcta. La recta se borrará y podrás intentarlo de nuevo.', 'bad');
      setTimeout(() => {
        if (mode !== 'graph' || !timerInterval) return;
        modeState.placed = { A: null, B: null };
        modeState.line = null;
        modeState.active = 'A';
        modeState.tracing = false;
        renderGraph();
        setFeedback('Inténtalo de nuevo: revisa las coordenadas de A y B.', 'bad');
      }, 1050);
    }
  }

  // Navegación y eventos permanentes.
  document.querySelectorAll('[data-start]').forEach((button) => button.addEventListener('click', () => startMode(button.dataset.start)));
  $('#back-home').addEventListener('click', () => {
    clearInterval(timerInterval);
    timerInterval = null;
    mode = null;
    gameScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
    updateHomeBests();
  });
  $('#play-again').addEventListener('click', () => startMode(mode));
  $('#return-menu').addEventListener('click', () => {
    clearInterval(timerInterval);
    timerInterval = null;
    mode = null;
    gameScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
    updateHomeBests();
  });
  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#coordinate-plane')) graphPointerDown(event);
  }, { passive: false });
  document.addEventListener('pointermove', graphPointerMove, { passive: false });
  document.addEventListener('pointerup', graphPointerUp);
  document.addEventListener('pointercancel', graphPointerUp);

  updateHomeBests();
})();
