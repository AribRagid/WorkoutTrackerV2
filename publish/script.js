(() => {
  'use strict';
  const KEY = 'form-workout-tracker-v1';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const THEME_KEY = 'form-workout-tracker-theme';
  const themes = [
    { id: 'default', name: 'Black & White', colors: ['#111111','#777777','#f3f3f3'] },
    { id: 'navy-coral', name: 'Navy & Coral', colors: ['#172a39','#e9e4e0','#fc563c','#6e7575'] },
    { id: 'rust', name: 'Black & Rust', colors: ['#1b191a','#e9e4e0','#943a1f'] },
    { id: 'red-rose', name: 'Charcoal & Rose', colors: ['#222223','#fefefe','#b62a2d','#e6a8a8','#d5575e'] },
    { id: 'cactus', name: 'Cactus & Gold', colors: ['#ffffff','#f1b24a','#164a41','#4d774e','#9dc88d'] },
    { id: 'ice-vermilion', name: 'Ice & Vermilion', colors: ['#c9dfea','#082e43','#ff4f31'] },
    { id: 'forest-coral', name: 'Forest & Coral', colors: ['#073d35','#f7f5ed','#ff8e79'] }
  ];
  const themeOptions = $('#theme-options');
  themeOptions.innerHTML = themes.map(theme => `<label class="theme-choice"><input type="radio" name="theme" value="${theme.id}"><span class="theme-name">${theme.name}</span><span class="theme-swatches" aria-hidden="true">${theme.colors.map(color=>`<span style="background:${color}"></span>`).join('')}</span><span class="theme-check" aria-hidden="true">✓</span></label>`).join('');
  function applyTheme(id) {
    const theme = themes.find(item => item.id === id) || themes[0];
    if (theme.id === 'default') document.body.removeAttribute('data-theme');
    else document.body.dataset.theme = theme.id;
    themeOptions.querySelector(`input[value="${theme.id}"]`).checked = true;
    const colors = { default:'#111111', 'navy-coral':'#172a39', rust:'#1b191a', 'red-rose':'#222223', cactus:'#164a41', 'ice-vermilion':'#082e43', 'forest-coral':'#073d35' };
    $('meta[name="theme-color"]').setAttribute('content', colors[theme.id]);
  }
  let savedTheme;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (error) { savedTheme = null; }
  applyTheme(savedTheme);
  themeOptions.addEventListener('change', event => {
    if (event.target.name !== 'theme') return;
    applyTheme(event.target.value);
    try { localStorage.setItem(THEME_KEY, event.target.value); } catch (error) { console.warn('Could not save color preference.', error); }
  });
  $('#settings-button').addEventListener('click', () => $('#settings-dialog').showModal());
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)) || { exercises: [], logs: [], cycleStart: today(), cycleLength: 7 }; } catch { data = { exercises: [], logs: [], cycleStart: today(), cycleLength: 7 }; }
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));
  const categories = ['Legs', 'Arms', 'Chest and Back', 'Torso', 'Shoulders', 'Other'];
  // Earlier versions used Torso for what is now Chest and Back.
  if (!data.categoryVersion) {
    data.exercises.forEach(e => { if (e.type === 'Torso') e.type = 'Chest and Back'; });
    (data.pairs || []).forEach(p => { if (p.category === 'Torso') p.category = 'Chest and Back'; });
    data.categoryVersion = 2;
    save();
  }
  // Seed once for local testing; hosted installs start with an empty list.
  if (location.protocol === 'file:' && !localStorage.getItem(KEY + '-test-seeded') && Array.isArray(window.testExercises)) {
    const existing = new Set(data.exercises.map(e => `${e.type}:${e.name.toLowerCase()}`));
    for (const [name, type, sets, reps, weight, perCycle] of window.testExercises) {
      const category = type === 'Torso' ? 'Chest and Back' : type;
      if (!existing.has(`${category}:${name.toLowerCase()}`)) {
        data.exercises.push({ id: uid(), name, type: category, sets, reps, weight, perCycle, alternative: null });
      }
    }
    save();
    localStorage.setItem(KEY + '-test-seeded', '1');
  }
  const dayNumber = s => { const [y,m,d] = s.split('-').map(Number); return Math.floor(Date.UTC(y,m-1,d)/86400000); };
  const dayString = day => new Date(day * 86400000).toISOString().slice(0, 10);
  let historyDay = dayNumber(today());
  function rollCycle() { const diff = dayNumber(today()) - dayNumber(data.cycleStart); if(diff >= data.cycleLength) { const d = new Date(`${data.cycleStart}T12:00:00`); d.setDate(d.getDate() + Math.floor(diff / data.cycleLength) * data.cycleLength); data.cycleStart = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; save(); } }
  function pattern(value, isWeight = false) { const parts = String(value).split('>').map(v=>v.trim()); const re = isWeight ? /^(?:\d+(?:\.\d*)?|\.\d+)$/ : /^\d+$/; if (!parts.length || parts.some(p=>!re.test(p) || !Number.isFinite(Number(p)) || (isWeight ? Number(p)>5000 : Number(p)<1))) return null; return parts.join('>'); }
  const total = (value, sets) => { const parts = String(value).split('>').map(Number); return parts.length === 1 ? parts[0]*sets : parts.reduce((a,b)=>a+b,0); };
  const count = id => data.logs.filter(l=>l.exerciseId===id && l.day>=data.cycleStart && dayNumber(l.day)<dayNumber(data.cycleStart)+data.cycleLength).length;
  const find = id => data.exercises.find(e=>e.id===id);
  function daysSinceLog(id) {
    const days = data.logs.filter(log => log.exerciseId === id && /^\d{4}-\d{2}-\d{2}$/.test(log.day)).map(log => dayNumber(log.day));
    if (!days.length) return '–';
    const elapsed = Math.max(0, dayNumber(today()) - Math.max(...days));
    return `${elapsed} ${elapsed === 1 ? 'day' : 'days'}`;
  }
  if (!Array.isArray(data.pairs)) data.pairs = [];
  const pairFor = id => data.pairs.find(p => p.exerciseIds.includes(id));
  const editorForm = $('#exercise-form');
  editorForm.elements.type.innerHTML = categories.map(type => `<option>${type}</option>`).join('');
  $('.form-error', editorForm).insertAdjacentHTML('beforebegin', `<div class="pair-settings"><h3>Pair exercises</h3><label>Search exercises<input name="pairSearch" type="search" placeholder="Search by name"></label><label>Pair with<select name="pairPartner"><option value="">No pairing</option></select></label><label id="pair-category-field" hidden>Show pair in<select name="pairCategory">${categories.map(type=>`<option>${type}</option>`).join('')}</select></label><p class="hint">Each exercise is logged separately.</p></div>`);
  editorForm.elements.pairSearch.addEventListener('input', () => {
    const select = editorForm.elements.pairPartner;
    const selectedOption = select.selectedOptions[0];
    const query = editorForm.elements.pairSearch.value.trim().toLocaleLowerCase();
    for (const option of select.options) option.hidden = !!option.value && option !== selectedOption && !option.textContent.toLocaleLowerCase().includes(query);
  });
  editorForm.elements.pairPartner.addEventListener('change', () => { $('#pair-category-field').hidden = !editorForm.elements.pairPartner.value; });
  editorForm.elements.type.addEventListener('change', () => {
    if (!pairFor(editorForm.elements.id.value)) editorForm.elements.pairCategory.value = editorForm.elements.type.value;
  });
  let selected = null, variant = 'regular', toastTimer;
  let audioContext;
  function playMenuClick() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = audioContext || new AudioContextClass();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = audioContext.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(520, start);
      oscillator.frequency.exponentialRampToValueAtTime(390, start + 0.045);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.035, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.065);
    } catch (error) { console.warn('Menu sound unavailable.', error); }
  }
  $$('#home .home-link').forEach(button => button.addEventListener('click', playMenuClick));
  function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2200); }
  // Validate the entire backup before changing local storage. Older tracker logs
  // use snapshot field names and an ISO date instead of a separate local day.
  function readBackup(raw) {
    const validDay = value => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const d = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value;
    };
    const validId = value => typeof value === 'string' && value.trim().length > 0;
    const validSets = value => Number.isInteger(value) && value >= 1 && value <= 50;
    const validVersion = e => e && typeof e === 'object' && typeof e.name === 'string' && e.name.trim() && validSets(e.sets) && pattern(e.reps) !== null && pattern(e.weight, true) !== null;
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.exercises) || !Array.isArray(raw.logs) || !validDay(raw.cycleStart) || !Number.isInteger(raw.cycleLength) || raw.cycleLength < 1 || raw.cycleLength > 365 || (raw.pairs !== undefined && !Array.isArray(raw.pairs)) || (raw.categoryVersion !== undefined && raw.categoryVersion !== 2)) throw new Error('Invalid backup structure.');
    const categoryOf = type => raw.categoryVersion === undefined && type === 'Torso' ? 'Chest and Back' : type;
    const ids = new Set();
    const exercises = raw.exercises.map(e => {
      if (!validVersion(e) || !validId(e.id) || ids.has(e.id) || !categories.includes(categoryOf(e.type)) || !Number.isInteger(e.perCycle) || e.perCycle < 1 || e.perCycle > 999 || (e.alternative != null && !validVersion(e.alternative))) throw new Error('Invalid exercise data.');
      ids.add(e.id);
      const copyVersion = v => ({ name: v.name, sets: v.sets, reps: pattern(v.reps), weight: pattern(v.weight, true) });
      return { id: e.id, type: categoryOf(e.type), perCycle: e.perCycle, ...copyVersion(e), alternative: e.alternative == null ? null : copyVersion(e.alternative) };
    });
    const logIds = new Set();
    const logs = raw.logs.map(log => {
      if (!log || !validId(log.id) || logIds.has(log.id) || !validId(log.exerciseId) || typeof log.date !== 'string' || Number.isNaN(Date.parse(log.date)) || !Number.isInteger(log.sets) || log.sets < 0 || log.sets > 50 || pattern(log.reps) === null || pattern(log.weight, true) === null) throw new Error('Invalid history data.');
      logIds.add(log.id);
      const date = new Date(log.date);
      const day = log.day === undefined ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` : log.day;
      const name = log.name ?? log.exerciseNameSnapshot ?? exercises.find(e=>e.id===log.exerciseId)?.name ?? 'Deleted Exercise';
      if (!validDay(day) || typeof name !== 'string' || !name.trim() || (log.alternative !== undefined && typeof log.alternative !== 'boolean') || (log.isAlternativeSnapshot !== undefined && typeof log.isAlternativeSnapshot !== 'boolean')) throw new Error('Invalid history snapshot.');
      return { id: log.id, exerciseId: log.exerciseId, date: log.date, day, name, sets: log.sets, reps: pattern(log.reps), weight: pattern(log.weight, true), alternative: log.alternative ?? log.isAlternativeSnapshot ?? false };
    });
    const pairedIds = new Set();
    const pairs = (raw.pairs || []).map(pair => {
      if (!pair || !Array.isArray(pair.exerciseIds) || pair.exerciseIds.length !== 2 || !categories.includes(categoryOf(pair.category)) || pair.exerciseIds.some(id => !ids.has(id) || pairedIds.has(id)) || pair.exerciseIds[0] === pair.exerciseIds[1]) throw new Error('Invalid exercise pairing.');
      pair.exerciseIds.forEach(id=>pairedIds.add(id));
      return { exerciseIds: [...pair.exerciseIds], category: categoryOf(pair.category) };
    });
    return { categoryVersion: 2, cycleLength: raw.cycleLength, cycleStart: raw.cycleStart, exercises, logs, pairs };
  }
  $('#export-data').addEventListener('click', () => {
    const backup = { categoryVersion: 2, cycleLength: data.cycleLength, cycleStart: data.cycleStart, exercises: data.exercises, logs: data.logs, pairs: data.pairs };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'workout-tracker-backup.json'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup downloaded');
  });
  $('#import-data').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    let imported;
    try { imported = readBackup(JSON.parse(await file.text())); }
    catch (error) { alert(`Could not import backup: ${error instanceof SyntaxError ? 'Invalid JSON.' : error.message}`); return; }
    if (!confirm('Import this backup? Your current exercises, pairings, and history will be erased and replaced.')) return;
    try {
      // Persist first so a storage error cannot replace the in-memory state.
      localStorage.setItem(KEY, JSON.stringify(imported));
    } catch (error) { alert('Could not save the backup. Your current data has not been replaced.'); return; }
    data = imported;
    if (location.protocol === 'file:') {
      try { localStorage.setItem(KEY + '-test-seeded', '1'); } catch (error) { console.warn('Could not save test-data marker.', error); }
    }
    render(); toast('Backup imported');
  });
  function go(page) { $$('.page').forEach(el=>el.hidden=el.id!==page); $('.app').classList.toggle('home-active',page==='home'); $('nav').hidden=page==='home'; $$('nav button').forEach(el=>el.classList.toggle('active',el.dataset.go===page)); if(page==='history') historyDay=dayNumber(today()); window.scrollTo(0,0); render(); }
  function card(e, manage=false) { const used=count(e.id), reached=used>=e.perCycle; return `<article class="card"><div class="card-main"><h3>${esc(e.name)} ${e.alternative ? '<span class="tag">↔ alt</span>' : ''}</h3><p>${esc(e.type)} · ${e.sets} sets · ${esc(e.reps)} reps · ${esc(e.weight)} weight</p><p>${used} / ${e.perCycle} this cycle</p></div>${manage ? `<div class="card-actions"><button class="small-action" data-edit="${esc(e.id)}">Edit</button><button class="small-action" data-delete="${esc(e.id)}" aria-label="Delete ${esc(e.name)}">×</button></div>` : `<span class="days-since" aria-label="Days since last logged">${daysSinceLog(e.id)}</span><button class="action" data-log="${esc(e.id)}" ${reached?'disabled':''}>${reached?'Limit reached':'+ Log'}</button>`}</article>`; }
  function render() { rollCycle(); const formatCycleDate = day => new Date(day * 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); const start = dayNumber(data.cycleStart); $('#cycle-caption').textContent=`Cycle: ${formatCycleDate(start)} – ${formatCycleDate(start + data.cycleLength - 1)}`; $('#cycle-label').textContent=`${data.cycleLength} days`;
    const exerciseIds = new Set(data.exercises.map(e => e.id));
    const completedSets = data.logs.filter(log => exerciseIds.has(log.exerciseId) && log.day >= data.cycleStart && dayNumber(log.day) < start + data.cycleLength).reduce((sum, log) => sum + log.sets, 0);
    const plannedSets = data.exercises.reduce((sum, exercise) => sum + exercise.sets * exercise.perCycle, 0);
    const todaySets = data.logs.filter(log => log.day === today()).reduce((sum, log) => sum + log.sets, 0);
    $('#today-sets').textContent = `${todaySets} sets done today`;
    $('#cycle-sets').textContent = `${completedSets}/${plannedSets} sets`;
    const pairedIds = new Set();
    const groups = categories.flatMap(type => {
      const items = [];
      for (const pair of data.pairs) {
        if (pair.category !== type) continue;
        const exercises = pair.exerciseIds.map(find);
        if (exercises.length !== 2 || exercises.some(e => !e) || exercises.some(e => pairedIds.has(e.id))) continue;
        exercises.forEach(e => pairedIds.add(e.id));
        items.push({ name: exercises[0].name, completed: exercises.every(e => count(e.id) >= e.perCycle), html: `<div class="pair-box"><span class="pair-label">↔ PAIRED</span>${exercises.map(e=>card(e)).join('')}</div>` });
      }
      return [{ type, items }];
    });
    for (const exercise of data.exercises) {
      if (!pairedIds.has(exercise.id)) {
        const group = groups.find(g => g.type === exercise.type) || groups.find(g => g.type === 'Other');
        group.items.push({ name: exercise.name, completed: count(exercise.id) >= exercise.perCycle, html: card(exercise) });
      }
    }
    $('#quick-list').innerHTML=data.exercises.length ? groups.filter(g=>g.items.length).map(g=>`<section><h3 class="group-title">${g.type}</h3><div class="stack">${g.items.sort((a,b)=>Number(a.completed)-Number(b.completed)||a.name.localeCompare(b.name)).map(item=>item.html).join('')}</div></section>`).join('') : '<div class="empty">No exercises yet.<button class="action" data-go="exercises">Go to List ↗</button></div>';
    $('#exercise-list').innerHTML=data.exercises.length?categories.map(type=>{const items=data.exercises.filter(e=>e.type===type).sort((a,b)=>a.name.localeCompare(b.name));return items.length?`<h3 class="group-title">${type}</h3><div class="stack">${items.map(e=>card(e,true)).join('')}</div>`:''}).join(''):'<div class="empty" style="margin-top:16px">No exercises yet. Tap + to add your first one.</div>';
    renderHistory(); }
  function renderHistory() {
    const selectedDate = new Date(historyDay * 86400000);
    const weekStart = historyDay - (selectedDate.getUTCDay() + 6) % 7;
    $('#history-date-label').textContent = selectedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    $('#week-days').innerHTML = Array.from({length: 7}, (_, i) => {
      const day = weekStart + i, date = new Date(day * 86400000), ymd = dayString(day);
      const label = date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
      const fullDate = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      return `<button type="button" class="week-day ${day===historyDay?'selected':''} ${ymd===today()?'today':''}" data-history-day="${day}" aria-label="${esc(fullDate)}" aria-pressed="${day===historyDay}"><span>${esc(label)}</span><strong>${date.getUTCDate()}</strong></button>`;
    }).join('');
    const logs=data.logs.filter(l=>l.day===dayString(historyDay)).sort((a,b)=>a.date.localeCompare(b.date)); $('#history-list').innerHTML=logs.length?logs.map(l=>`<article class="card"><div class="card-main"><h3>${esc(l.name)} ${l.alternative?'<span class="tag">Alternative</span>':''}</h3><p>${l.sets} sets · ${esc(l.reps)} reps · ${esc(l.weight)} weight</p><p>${new Date(l.date).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</p></div><span class="tag">✓ logged</span></article>`).join(''):'<div class="empty">No sessions logged on this day.</div>'; }
  function openEditor(e) { const f=$('#exercise-form'); f.reset(); f.elements.id.value=e?.id||''; f.elements.name.value=e?.name||''; f.elements.type.value=e?.type||'Legs'; f.elements.sets.value=e?.sets||3; f.elements.reps.value=e?.reps??'8'; f.elements.weight.value=e?.weight??'0'; f.elements.limit.value=e?.perCycle||3; f.elements.altName.value=e?.alternative?.name||''; f.elements.altSets.value=e?.alternative?.sets||3; f.elements.altReps.value=e?.alternative?.reps??'8'; f.elements.altWeight.value=e?.alternative?.weight??'0'; $('details',f).open=!!e?.alternative; const pair=e && pairFor(e.id); const partnerId=pair?.exerciseIds.find(id=>id!==e.id); f.elements.pairPartner.innerHTML='<option value="">No pairing</option>'+data.exercises.filter(item=>item.id!==e?.id && (!pairFor(item.id) || item.id===partnerId)).sort((a,b)=>a.name.localeCompare(b.name)).map(item=>`<option value="${esc(item.id)}">${esc(item.name)} (${esc(item.type)})</option>`).join(''); f.elements.pairPartner.value=partnerId||''; f.elements.pairCategory.value=pair?.category||e?.type||'Legs'; $('#pair-category-field').hidden=!partnerId; $('.form-error',f).textContent=''; $('#editor-title').textContent=e?'Edit exercise':'New exercise'; $('#editor').showModal(); }
  function showVariant() { const e=find(selected), v=variant==='alternative'?e.alternative:e; $('#log-title').textContent=v.name; $('#log-meta').textContent=`${v.sets} sets · ${count(e.id)} of ${e.perCycle} sessions this cycle`; const last=[...data.logs].reverse().find(l=>l.exerciseId===e.id && l.alternative===(variant==='alternative')); $('#log-form').elements.reps.value=last?.reps??v.reps; $('#log-form').elements.weight.value=last?.weight??v.weight; $$('[data-variant]').forEach(b=>b.classList.toggle('active',b.dataset.variant===variant)); }
  document.addEventListener('click', event=>{ const b=event.target.closest('button'); if(!b)return; if(b.dataset.go)go(b.dataset.go); if(b.dataset.close)$('#'+b.dataset.close).close(); if(b.dataset.edit)openEditor(find(b.dataset.edit)); if(b.dataset.delete){const e=find(b.dataset.delete);if(e&&confirm(`Delete ${e.name}? Your history will stay.`)){data.exercises=data.exercises.filter(x=>x.id!==e.id);data.pairs=data.pairs.filter(p=>!p.exerciseIds.includes(e.id));save();render();toast('Exercise deleted');}} if(b.dataset.log){selected=b.dataset.log;variant='regular';const e=find(selected);if(!e||count(e.id)>=e.perCycle)return;$('#variants').hidden=!e.alternative;$('.form-error',$('#log-form')).textContent='';showVariant();$('#logger').showModal();} if(b.dataset.variant){variant=b.dataset.variant;showVariant();} });
  $('#add').addEventListener('click',()=>openEditor());
  $('#exercise-form').addEventListener('submit',event=>{ event.preventDefault(); const f=event.currentTarget, x=f.elements, reps=pattern(x.reps.value), weight=pattern(x.weight.value,true), altName=x.altName.value.trim(), ar=pattern(x.altReps.value), aw=pattern(x.altWeight.value,true); if(!reps||weight===null||(altName&&(!ar||aw===null))){$('.form-error',f).textContent='Enter valid reps and weights. Use > between sets, with no empty values.';return;} const existing=find(x.id.value); const e={id:existing?.id||uid(),name:x.name.value.trim(),type:x.type.value,sets:Number(x.sets.value),reps,weight,perCycle:Number(x.limit.value),alternative:altName?{name:altName,sets:Number(x.altSets.value),reps:ar,weight:aw}:null}; if(!e.name || (altName && (!Number.isInteger(e.alternative.sets)||e.alternative.sets<1||e.alternative.sets>50))){$('.form-error',f).textContent='Enter a name and valid set count.';return;} const partnerId=x.pairPartner.value; const partner=find(partnerId); const partnerPair=partnerId && pairFor(partnerId); if(partnerId && (!partner || partnerId===e.id || (partnerPair && !partnerPair.exerciseIds.includes(e.id)))){$('.form-error',f).textContent='This exercise is no longer available for pairing.';return;} if(existing)Object.assign(existing,e);else data.exercises.push(e); const oldPair=pairFor(e.id); if (oldPair && partnerId && oldPair.exerciseIds.includes(partnerId)) { oldPair.category=x.pairCategory.value; } else { data.pairs=data.pairs.filter(p=>!p.exerciseIds.includes(e.id)); if(partnerId)data.pairs.push({exerciseIds:[e.id,partnerId],category:x.pairCategory.value}); } save();$('#editor').close();render();toast(existing?'Exercise updated':'Exercise added'); });
  $('#log-form').addEventListener('submit',event=>{event.preventDefault();rollCycle();const e=find(selected);if(!e||count(e.id)>=e.perCycle){$('#logger').close();render();toast('Cycle limit reached');return;} const f=event.currentTarget, reps=pattern(f.elements.reps.value),weight=pattern(f.elements.weight.value,true);if(!reps||weight===null){$('.form-error',f).textContent='Enter valid reps and weights, with no empty sets.';return;} const v=variant==='alternative'?e.alternative:e;if(!v)return;const wt=total(weight,v.sets), oldWt=total(v.weight,v.sets);data.logs.push({id:uid(),exerciseId:e.id,date:new Date().toISOString(),day:today(),name:v.name,sets:v.sets,reps,weight,alternative:variant==='alternative'});if(wt>oldWt+1e-9 || (Math.abs(wt-oldWt)<=1e-9 && total(reps,v.sets)>=total(v.reps,v.sets))){v.reps=reps;v.weight=weight;}save();$('#logger').close();render();toast('Session logged ✓');});
  $('#cycle-button').addEventListener('click',()=>{const value=prompt('Days per cycle (changing this starts a new cycle):',data.cycleLength);if(value===null)return;const n=Number(value);if(!Number.isInteger(n)||n<1||n>365){toast('Enter a number from 1 to 365');return;}data.cycleLength=n;data.cycleStart=today();save();render();toast('New cycle started');});
  $('#prev-week').addEventListener('click',()=>{ historyDay-=7; renderHistory(); });
  $('#next-week').addEventListener('click',()=>{ historyDay+=7; renderHistory(); });
  $('#week-days').addEventListener('click',event=>{ const button=event.target.closest('button[data-history-day]'); if(button){ historyDay=Number(button.dataset.historyDay); renderHistory(); } });
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();})); render();
})();
