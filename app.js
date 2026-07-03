const STORAGE_KEY = 'chunkFlashcardPro.library.v2';
const OLD_STORAGE_KEY = 'chunkFlashcardPro.library.v1';
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
      const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) || '[]');
      if(Array.isArray(old) && old.length){ library = old; saveLibrary(); }
    }
  }catch(e){ library = []; }
  renderLibrary();
}
function saveLibrary(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(library)); }

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
  return rows.map((r,i)=>({
    uid: `${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
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
    note: r.note || ''
  })).filter(c=>c.chunk_en || c.chunk_ja);
}

function renderLibrary(){
  const box=$('libraryList');
  if(!library.length){ box.innerHTML='<p class="hint">まだCSVが保存されていません。まずCSVを追加するか、サンプルを追加してください。</p>'; return; }
  box.innerHTML = library.map(item=>`
    <div class="library-item">
      <div class="library-title">${escapeHTML(item.name)}</div>
      <div class="library-meta">${item.cards.length}チャンク / 追加日 ${new Date(item.createdAt).toLocaleString('ja-JP')}</div>
      <div class="row">
        <button class="button primary" data-start="${item.id}">このCSVで練習</button>
        <button class="button danger" data-delete="${item.id}">削除</button>
      </div>
    </div>`).join('');
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
  setupTypeFilter(); applyFilter();
  setTimeout(()=>$('practicePanel').scrollIntoView({behavior:'smooth', block:'start'}), 50);
}

function setupTypeFilter(){
  const types=['すべて', ...Array.from(new Set(currentCards.map(c=>c.chunk_type||'その他'))).sort()];
  $('typeFilter').innerHTML=types.map(t=>`<option value="${escapeAttr(t)}">${escapeHTML(t)}</option>`).join('');
}
function applyFilter(){
  const type=$('typeFilter').value;
  filteredCards = type==='すべて' ? [...currentCards] : currentCards.filter(c=>(c.chunk_type||'その他')===type);
  if($('orderSelect').value==='shuffle') shuffleArray(filteredCards);
  index=0; flipped=false; renderCard();
}
function renderCard(){
  if(!filteredCards.length){
    $('practiceInfo').textContent='該当するカードがありません。'; $('cardFront').textContent='カードなし'; $('cardSub').textContent='';
    $('progressBar').style.width='0%'; return;
  }
  const c=filteredCards[index]; const dir=$('directionSelect').value;
  const front = dir==='en-ja' ? c.chunk_en : c.chunk_ja;
  const back = dir==='en-ja' ? c.chunk_ja : c.chunk_en;
  const frontLabel = dir==='en-ja' ? '英語 → 日本語' : '日本語 → 英語';
  $('cardLabel').textContent = flipped ? '答え' : frontLabel;
  $('practiceInfo').textContent=`${index+1} / ${filteredCards.length}　種類：${c.chunk_type || 'その他'}　文ID：${c.id}　チャンク：${c.chunk_no}`;
  $('cardFront').textContent=flipped ? back : front;
  $('cardSub').textContent=flipped ? 'タップで問題に戻る' : 'タップで答えを表示';
  $('sentenceEn').textContent=c.sentence_en || '—';
  $('sentenceJa').textContent=c.sentence_ja || '—';
  $('vocabBox').textContent=[c.vocab, c.vocab_ja, c.vocab_explanation].filter(Boolean).join(' / ') || '—';
  $('explainBox').textContent=[c.grammar_explanation, c.note].filter(Boolean).join(' / ') || '—';
  $('progressBar').style.width = `${((index+1)/filteredCards.length)*100}%`;
}
function next(){ if(!filteredCards.length)return; index=(index+1)%filteredCards.length; flipped=false; renderCard(); }
function prev(){ if(!filteredCards.length)return; index=(index-1+filteredCards.length)%filteredCards.length; flipped=false; renderCard(); }
function first(){ if(!filteredCards.length)return; index=0; flipped=false; renderCard(); }
function last(){ if(!filteredCards.length)return; index=filteredCards.length-1; flipped=false; renderCard(); }
function flip(){ flipped=!flipped; renderCard(); }
function shuffleArray(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } }
function escapeHTML(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return escapeHTML(s); }

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
$('typeFilter').onchange=applyFilter;
$('orderSelect').onchange=applyFilter;
$('card').onclick=flip; $('flipBtn').onclick=flip; $('nextBtn').onclick=next; $('prevBtn').onclick=prev;
$('firstBtn').onclick=first; $('lastBtn').onclick=last;
$('backToLibraryBtn').onclick=()=>$('libraryPanel').scrollIntoView({behavior:'smooth', block:'start'});

document.addEventListener('keydown', e=>{ if(e.key==='ArrowRight')next(); if(e.key==='ArrowLeft')prev(); if(e.key===' ') { e.preventDefault(); flip(); } });
$('card').addEventListener('touchstart', e=>{ touchStartX=e.changedTouches[0].screenX; touchStartY=e.changedTouches[0].screenY; }, {passive:true});
$('card').addEventListener('touchend', e=>{
  const dx=e.changedTouches[0].screenX-touchStartX;
  const dy=e.changedTouches[0].screenY-touchStartY;
  if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.4){ dx<0 ? next() : prev(); }
}, {passive:true});

loadLibrary();
