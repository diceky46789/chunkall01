const STORAGE_KEY = 'chunkFlashcardPro.library.v3';
const OLD_KEYS = ['chunkFlashcardPro.library.v2','chunkFlashcardPro.library.v1'];
let library = [];
let currentSetId = null;
let currentCards = [];
let filteredCards = [];
let index = 0;
let flipped = false;
let touchStartX = 0;
let touchStartY = 0;

const $ = id => document.getElementById(id);

function loadLibrary(){
  try{
    library = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if(!library.length){
      for(const key of OLD_KEYS){
        const old = JSON.parse(localStorage.getItem(key) || '[]');
        if(Array.isArray(old) && old.length){ library = old.map(upgradeSet); saveLibrary(); break; }
      }
    }
  }catch(e){ library = []; }
  library = library.map(upgradeSet);
  saveLibrary();
  renderLibrary();
}
function saveLibrary(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(library)); }
function upgradeSet(set){
  const cards = (set.cards || []).map((c,i)=>({
    ...c,
    uid: c.uid || `${set.id || Date.now()}-${i}`,
    favorite: !!c.favorite,
    rating: c.rating || ''
  }));
  return {...set, cards};
}

function parseCSV(text){
  const rows=[]; let row=[]; let cell=''; let inQuotes=false;
  text = text.replace(/^\uFEFF/, '');
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(c==='"'){
      if(inQuotes && n==='"'){ cell+='"'; i++; }
      else inQuotes=!inQuotes;
    }else if(c===',' && !inQuotes){ row.push(cell); cell=''; }
    else if((c==='\n' || c==='\r') && !inQuotes){
      if(c==='\r' && n==='\n') i++;
      row.push(cell); cell='';
      if(row.some(v=>String(v).trim()!=='')) rows.push(row);
      row=[];
    }else cell+=c;
  }
  row.push(cell); if(row.some(v=>String(v).trim()!=='')) rows.push(row);
  if(rows.length<2) return [];
  const headers = rows[0].map(h=>h.trim());
  return rows.slice(1).map(r=>{
    const obj={}; headers.forEach((h,i)=>obj[h]=(r[i]||'').trim()); return obj;
  }).filter(o=>o.chunk_en || o.chunk_ja || o.sentence_en || o.sentence_ja);
}

function normalizeCards(rows){
  const base = Date.now();
  return rows.map((r,i)=>({
    uid: `${base}-${i}-${Math.random().toString(16).slice(2)}`,
    id: r.id || `S${String(i+1).padStart(3,'0')}`,
    category: r.category || '未分類',
    sentence_en: r.sentence_en || '',
    sentence_ja: r.sentence_ja || '',
    chunk_no: r.chunk_no || String(i+1),
    chunk_type: r.chunk_type || 'その他',
    chunk_en: r.chunk_en || r.sentence_en || '',
    chunk_ja: r.chunk_ja || r.sentence_ja || '',
    vocab: r.vocab || '',
    vocab_ja: r.vocab_ja || '',
    vocab_explanation: r.vocab_explanation || '',
    grammar_explanation: r.grammar_explanation || '',
    audio_text_en: r.audio_text_en || r.chunk_en || r.sentence_en || '',
    audio_text_ja: r.audio_text_ja || r.chunk_ja || r.sentence_ja || '',
    note: r.note || '',
    favorite:false,
    rating:''
  })).filter(c=>c.chunk_en || c.chunk_ja);
}

function renderLibrary(){
  const box=$('libraryList');
  if(!library.length){ box.innerHTML='<p class="hint">まだCSVが保存されていません。まずCSVを追加するか、サンプルを追加してください。</p>'; return; }
  box.innerHTML = library.map(item=>{
    const fav = item.cards.filter(c=>c.favorite).length;
    const weak = item.cards.filter(c=>c.rating==='weak').length;
    const cats = new Set(item.cards.map(c=>c.category||'未分類')).size;
    const types = new Set(item.cards.map(c=>c.chunk_type||'その他')).size;
    return `<div class="library-item">
      <div class="library-title">${escapeHTML(item.name)}</div>
      <div class="library-meta">${item.cards.length}チャンク / ${cats}カテゴリ / ${types}種類 / お気に入り${fav} / 苦手${weak}</div>
      <div class="library-meta">追加日 ${new Date(item.createdAt).toLocaleString('ja-JP')}</div>
      <div class="row">
        <button class="button primary" data-start="${item.id}">このCSVで練習</button>
        <button class="button danger" data-delete="${item.id}">削除</button>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-start]').forEach(btn=>btn.onclick=()=>startPractice(btn.dataset.start));
  box.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=()=>deleteSet(btn.dataset.delete));
}

function deleteSet(id){
  if(!confirm('このCSVを削除しますか？')) return;
  library = library.filter(x=>x.id!==id); saveLibrary(); renderLibrary();
  if(currentSetId===id){ currentSetId=null; $('practicePanel').classList.remove('active'); }
}

function startPractice(id){
  const set = library.find(x=>x.id===id); if(!set) return;
  currentSetId=id; currentCards=set.cards; index=0; flipped=false;
  $('practicePanel').classList.add('active');
  $('practiceTitle').textContent=set.name;
  setupFilters(); applyFilter();
  setTimeout(()=>$('practicePanel').scrollIntoView({behavior:'smooth', block:'start'}), 50);
}

function setupFilters(){
  const types=['すべて', ...Array.from(new Set(currentCards.map(c=>c.chunk_type||'その他'))).sort()];
  const cats=['すべて', ...Array.from(new Set(currentCards.map(c=>c.category||'未分類'))).sort()];
  $('typeFilter').innerHTML=types.map(t=>`<option value="${escapeAttr(t)}">${escapeHTML(t)}</option>`).join('');
  $('categoryFilter').innerHTML=cats.map(t=>`<option value="${escapeAttr(t)}">${escapeHTML(t)}</option>`).join('');
  $('searchInput').value='';
  $('studyModeSelect').value='all';
}
function applyFilter(){
  const type=$('typeFilter').value;
  const category=$('categoryFilter').value;
  const mode=$('studyModeSelect').value;
  const q=$('searchInput').value.trim().toLowerCase();
  filteredCards = currentCards.filter(c=>{
    if(type!=='すべて' && (c.chunk_type||'その他')!==type) return false;
    if(category!=='すべて' && (c.category||'未分類')!==category) return false;
    if(mode==='favorite' && !c.favorite) return false;
    if(mode==='weak' && c.rating!=='weak') return false;
    if(mode==='unrated' && c.rating) return false;
    if(q){
      const text=[c.id,c.category,c.sentence_en,c.sentence_ja,c.chunk_type,c.chunk_en,c.chunk_ja,c.vocab,c.vocab_ja,c.vocab_explanation,c.grammar_explanation,c.note].join(' ').toLowerCase();
      if(!text.includes(q)) return false;
    }
    return true;
  });
  if($('orderSelect').value==='shuffle') shuffleArray(filteredCards);
  index=0; flipped=false; renderCard();
}
function getCurrentCard(){ return filteredCards[index] || null; }
function renderCard(){
  $('filterSummary').textContent = `表示中 ${filteredCards.length} / 全${currentCards.length}チャンク`;
  if(!filteredCards.length){
    $('practiceInfo').textContent='該当するカードがありません。条件を変えてください。'; $('cardLabel').textContent='カードなし'; $('cardFront').textContent='カードなし'; $('cardSub').textContent='絞り込み条件を変更してください';
    $('sentenceEn').textContent='—'; $('sentenceJa').textContent='—'; $('vocabBox').textContent='—'; $('explainBox').textContent='—'; $('progressBar').style.width='0%'; updateActionButtons(); return;
  }
  const c=getCurrentCard(); const dir=$('directionSelect').value;
  const front = dir==='en-ja' ? c.chunk_en : c.chunk_ja;
  const back = dir==='en-ja' ? c.chunk_ja : c.chunk_en;
  const frontLabel = dir==='en-ja' ? '英語 → 日本語' : '日本語 → 英語';
  $('cardLabel').textContent = flipped ? '答え' : frontLabel;
  $('practiceInfo').textContent=`${index+1} / ${filteredCards.length}　種類：${c.chunk_type || 'その他'}　カテゴリ：${c.category || '未分類'}　文ID：${c.id}　チャンク：${c.chunk_no}`;
  $('cardFront').textContent=flipped ? back : front;
  $('cardSub').textContent=flipped ? 'タップで問題に戻る' : 'タップで答えを表示';
  $('sentenceEn').textContent=c.sentence_en || '—';
  $('sentenceJa').textContent=c.sentence_ja || '—';
  $('vocabBox').textContent=[c.vocab, c.vocab_ja, c.vocab_explanation].filter(Boolean).join(' / ') || '—';
  $('explainBox').textContent=[c.grammar_explanation, c.note].filter(Boolean).join(' / ') || '—';
  $('progressBar').style.width = `${((index+1)/filteredCards.length)*100}%`;
  updateActionButtons();
}
function updateActionButtons(){
  const c=getCurrentCard();
  $('favoriteBtn').textContent = c && c.favorite ? '★ お気に入り' : '☆ お気に入り';
  $('easyBtn').style.outline = c && c.rating==='easy' ? '3px solid #86efac' : 'none';
  $('normalBtn').style.outline = c && c.rating==='normal' ? '3px solid #bfdbfe' : 'none';
  $('weakBtn').style.outline = c && c.rating==='weak' ? '3px solid #fcd34d' : 'none';
}
function next(){ if(!filteredCards.length)return; index=(index+1)%filteredCards.length; flipped=false; renderCard(); }
function prev(){ if(!filteredCards.length)return; index=(index-1+filteredCards.length)%filteredCards.length; flipped=false; renderCard(); }
function first(){ if(!filteredCards.length)return; index=0; flipped=false; renderCard(); }
function last(){ if(!filteredCards.length)return; index=filteredCards.length-1; flipped=false; renderCard(); }
function flip(){ flipped=!flipped; renderCard(); }
function shuffleArray(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } }
function escapeHTML(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return escapeHTML(s); }
function persistCurrentSet(){
  const set=library.find(x=>x.id===currentSetId); if(set){ set.cards=currentCards; saveLibrary(); renderLibrary(); }
}
function toggleFavorite(){
  const c=getCurrentCard(); if(!c) return;
  c.favorite=!c.favorite; persistCurrentSet(); renderCard();
}
function setRating(rating){
  const c=getCurrentCard(); if(!c) return;
  c.rating=rating; persistCurrentSet(); renderCard();
}

async function addCSVFile(file){
  const text=await file.text(); const rows=parseCSV(text); const cards=normalizeCards(rows);
  if(!cards.length){ $('importStatus').textContent='CSVを読み込めませんでした。列名を確認してください。'; return; }
  const item={id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name:file.name, createdAt:new Date().toISOString(), cards};
  library.unshift(item); saveLibrary(); renderLibrary();
  $('importStatus').textContent=`${file.name} を保存しました。${cards.length}チャンクを練習できます。`;
}

$('csvInput').addEventListener('change', async e=>{
  const file=e.target.files[0]; if(!file) return;
  await addCSVFile(file); e.target.value='';
});
$('loadSampleBtn').onclick = async ()=>{
  const res = await fetch('sample_chunk_flashcards.csv');
  const blob = await res.blob();
  const file = new File([blob], 'sample_chunk_flashcards.csv', {type:'text/csv'});
  await addCSVFile(file);
};
$('directionSelect').onchange=()=>{flipped=false;renderCard();};
['typeFilter','categoryFilter','studyModeSelect','orderSelect'].forEach(id=>$(id).onchange=applyFilter);
$('searchInput').addEventListener('input', applyFilter);
$('card').onclick=flip; $('flipBtn').onclick=flip; $('nextBtn').onclick=next; $('prevBtn').onclick=prev;
$('firstBtn').onclick=first; $('lastBtn').onclick=last; $('favoriteBtn').onclick=toggleFavorite;
$('easyBtn').onclick=()=>setRating('easy'); $('normalBtn').onclick=()=>setRating('normal'); $('weakBtn').onclick=()=>setRating('weak');
$('backToLibraryBtn').onclick=()=>$('libraryPanel').scrollIntoView({behavior:'smooth', block:'start'});

document.addEventListener('keydown', e=>{ if(e.key==='ArrowRight')next(); if(e.key==='ArrowLeft')prev(); if(e.key===' ') { e.preventDefault(); flip(); } });
$('card').addEventListener('touchstart', e=>{ touchStartX=e.changedTouches[0].screenX; touchStartY=e.changedTouches[0].screenY; }, {passive:true});
$('card').addEventListener('touchend', e=>{
  const dx=e.changedTouches[0].screenX-touchStartX;
  const dy=e.changedTouches[0].screenY-touchStartY;
  if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.4){ dx<0 ? next() : prev(); }
}, {passive:true});

loadLibrary();
