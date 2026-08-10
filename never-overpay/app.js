const views={home:document.querySelector('#homeView'),analyze:document.querySelector('#analyzeView'),electricity:document.querySelector('#electricityView'),watch:document.querySelector('#watchView')};
function showView(name){Object.entries(views).forEach(([key,el])=>el.classList.toggle('active',key===name));window.scrollTo({top:0,behavior:'smooth'});document.querySelectorAll('[data-view]').forEach(btn=>btn.classList.toggle('is-active',btn.dataset.view===name))}
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));

const fileInput=document.querySelector('#fileInput');const chooseButton=document.querySelector('#chooseButton');const demoButton=document.querySelector('#demoButton');const dropzone=document.querySelector('#dropzone');const uploadPanel=document.querySelector('#uploadPanel');const analysisPanel=document.querySelector('#analysisPanel');const fileName=document.querySelector('#fileName');const fileMeta=document.querySelector('#fileMeta');const progressBar=document.querySelector('#progressBar');const analysisCopy=document.querySelector('#analysisCopy');const checks=[document.querySelector('#check1'),document.querySelector('#check2'),document.querySelector('#check3')];

chooseButton.addEventListener('click',e=>{e.preventDefault();fileInput.click()});
fileInput.addEventListener('change',()=>fileInput.files[0]&&startAnalysis(fileInput.files[0]));
['dragenter','dragover'].forEach(evt=>dropzone.addEventListener(evt,e=>{e.preventDefault();dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(evt=>dropzone.addEventListener(evt,e=>{e.preventDefault();dropzone.classList.remove('drag')}));
dropzone.addEventListener('drop',e=>{const file=e.dataTransfer.files[0];if(file)startAnalysis(file)});
demoButton.addEventListener('click',()=>{renderAnalysis(window.NeverOverpayEnergy.fixtures.tibberJuly2026,true);showView('electricity')});

function setProgress(stage,text){progressBar.style.width=stage===1?'22%':stage===2?'58%':stage===3?'84%':'100%';checks.forEach((c,i)=>c.classList.toggle('active',i<stage));analysisCopy.textContent=text}
function toDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
function fmt(v,d=2){return Number.isFinite(Number(v))?Number(v).toLocaleString('sv-SE',{minimumFractionDigits:d,maximumFractionDigits:d}):'–'}

async function startAnalysis(file){
  if(file.size>3*1024*1024){alert('För liveanalys är maxstorleken just nu 3 MB. Välj en mindre PDF eller bild.');return}
  uploadPanel.classList.add('hidden');analysisPanel.classList.remove('hidden');fileName.textContent=file.name||'elrakning.pdf';fileMeta.textContent=`${Math.max(.1,(file.size||0)/1024/1024).toFixed(1)} MB · säker liveanalys`;setProgress(1,'Förbereder dokumentet…');
  try{
    const dataUrl=await toDataUrl(file);setProgress(2,'AI läser leverantör, förbrukning och prisdelar…');
    const response=await fetch('/api/analyze-energy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,mimeType:file.type,dataUrl})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);
    setProgress(3,'Kontrollerar elhandel, elnät och osäkra uppgifter…');
    await new Promise(r=>setTimeout(r,350));setProgress(4,'Analysen är klar.');
    const normalized=window.NeverOverpayEnergy.normalizeBill(result.analysis||{});normalized.evidence=result.analysis?.evidence||[];normalized.warnings=result.analysis?.warnings||[];localStorage.setItem('neverOverpayLastBill',JSON.stringify(normalized));
    renderAnalysis(normalized,false);setTimeout(()=>{analysisPanel.classList.add('hidden');uploadPanel.classList.remove('hidden');showView('electricity')},300);
  }catch(error){
    console.error(error);analysisPanel.classList.add('hidden');uploadPanel.classList.remove('hidden');
    const isGithub=location.hostname.endsWith('github.io');
    alert(isGithub?'Liveanalysen är färdigbyggd men kräver Vercel-versionen av appen. GitHub Pages kan inte köra serverfunktionen.':'Analysen kunde inte genomföras just nu. Försök igen eller välj en tydligare PDF/bild.');
  }
}

function renderAnalysis(bill,isDemo=false){
  const supplier=bill.supplier||'Okänd leverantör';const contractLabels={'quarter-hourly':'Kvartspris','hourly':'Timpris','monthly':'Månadspris','fixed':'Fast pris','mixed':'Blandat avtal'};const contract=contractLabels[bill.contractType]||'Avtalstyp ej säkerställd';
  document.querySelector('.analysis-hero h3').textContent=`${supplier} · ${contract}`;
  document.querySelector('.analysis-hero p').textContent=`${bill.invoicePeriod||'Period okänd'} · ${fmt(bill.periodConsumptionKwh,2)} kWh`;
  document.querySelector('.score strong').textContent=isDemo?'Test':'Läst';document.querySelector('.score small').textContent=isDemo?'verifierat testfall':'faktiska uppgifter från din faktura';
  const total=bill.electricityTradingTotalSek??bill.invoiceTotalSek;document.querySelector('.detail-card.wide .card-head h3').textContent=total!=null?`${fmt(total,0)} kr`:'–';
  const totalOre=total!=null&&bill.periodConsumptionKwh?total/bill.periodConsumptionKwh*100:null;document.querySelector('.unit-price strong').textContent=totalOre!=null?fmt(totalOre,2):'–';
  const lines=[['Spotpris',bill.spotPriceOrePerKwh,bill.periodConsumptionKwh?bill.spotPriceOrePerKwh*bill.periodConsumptionKwh/100:null],['Fast påslag',bill.markupOrePerKwh,bill.periodConsumptionKwh?bill.markupOrePerKwh*bill.periodConsumptionKwh/100:null],['Rörliga kostnader',bill.variableCostOrePerKwh,bill.periodConsumptionKwh?bill.variableCostOrePerKwh*bill.periodConsumptionKwh/100:null],['Månadsavgift',null,bill.fixedTradingFeeSekPerMonth],['Moms',null,bill.vatSek]];
  document.querySelectorAll('.bill-line').forEach((el,i)=>{const item=lines[i];if(!item)return;el.querySelector('span').textContent=item[0];el.querySelector('strong').textContent=item[2]!=null?`${fmt(item[2],2)} kr`:'–';const bar=el.querySelector('i');if(bar&&total&&item[2]!=null)bar.style.width=`${Math.min(100,Math.max(3,item[2]/total*100))}%`});
  const influence=(Number(bill.markupOrePerKwh)||0)+(Number(bill.variableCostOrePerKwh)||0);document.querySelector('.big-number').textContent=fmt(influence,2);document.querySelector('.influence-card .mini-divider + strong').textContent=bill.fixedTradingFeeSekPerMonth!=null?`${fmt(bill.fixedTradingFeeSekPerMonth,2)} kr/mån`:'–';
  const network=document.querySelector('.network-note');network.innerHTML=`Elnät: <strong>${bill.gridCompany||'ej identifierat'}</strong><br><small>${bill.gridTotalSek!=null?`Nätkostnad i dokumentet: ${fmt(bill.gridTotalSek,0)} kr.`:'faktureras separat eller kunde inte utläsas.'}</small>`;
  const decision=document.querySelector('.decision-card');const warnings=bill.warnings||[];decision.querySelector('h3').textContent=warnings.length?'Kontrollera några uppgifter innan vi jämför.':'Fakturan är redo för marknadsjämförelse.';decision.querySelector('p').textContent=warnings.length?warnings.join(' '):'Never Overpay har separerat de kostnader som kan påverkas från elnät och marknadspris. Nästa steg är att jämföra mot aktuella svenska avtal utan att hitta på en besparing.';
}

const savedBill=localStorage.getItem('neverOverpayLastBill');if(savedBill){try{renderAnalysis(JSON.parse(savedBill),false)}catch{}}
const watchButton=document.querySelector('#watchButton');const watchCard=document.querySelector('#watchCard');const watchStatus=document.querySelector('#watchStatus');const stored=localStorage.getItem('neverOverpayElectricityWatch')==='true';applyWatch(stored);watchButton.addEventListener('click',()=>{const next=localStorage.getItem('neverOverpayElectricityWatch')!=='true';localStorage.setItem('neverOverpayElectricityWatch',String(next));applyWatch(next)});function applyWatch(active){if(active){watchButton.textContent='Bevakning aktiv ✓';watchCard.classList.add('watching');watchStatus.textContent='Aktiv'}else{watchButton.textContent='Bevaka mitt elavtal';watchCard.classList.remove('watching');watchStatus.textContent='Ej aktiverad'}}
