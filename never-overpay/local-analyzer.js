window.NeverOverpayLocalAnalyzer={
  async extractText(file,onProgress=()=>{}){
    const type=(file.type||'').toLowerCase();
    if(type.includes('pdf')||file.name?.toLowerCase().endsWith('.pdf')) return this.extractPdf(file,onProgress);
    return this.extractImage(file,onProgress);
  },
  async extractImage(file,onProgress){
    if(!window.Tesseract) throw new Error('ocr_unavailable');
    const result=await Tesseract.recognize(file,'swe+eng',{logger:m=>{if(m.status==='recognizing text')onProgress(Math.round((m.progress||0)*100));}});
    return result?.data?.text||'';
  },
  async extractPdf(file,onProgress){
    if(!window.pdfjsLib||!window.Tesseract) throw new Error('pdf_ocr_unavailable');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
    const pages=Math.min(pdf.numPages,2);let out='';
    for(let p=1;p<=pages;p++){
      const page=await pdf.getPage(p);const viewport=page.getViewport({scale:2.15});
      const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
      const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;
      await page.render({canvasContext:ctx,viewport}).promise;
      const r=await Tesseract.recognize(canvas,'swe+eng',{logger:m=>{if(m.status==='recognizing text')onProgress(Math.round(((p-1)+(m.progress||0))/pages*100));}});
      out+='\n'+(r?.data?.text||'');
    }
    return out;
  },
  parse(text){
    const raw=String(text||'');
    const t=raw
      .replace(/\u00a0/g,' ')
      .replace(/[|]/g,' ')
      .replace(/[‐‑–—]/g,'-')
      .replace(/[ ]+/g,' ');
    const lines=t.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9åäö.,%/ +*-]/gi,' ');
    const n=s=>{if(s==null)return null;const cleaned=String(s).replace(/[^0-9,.-]/g,'').replace(',','.');const v=Number(cleaned);return Number.isFinite(v)?v:null};
    const lastAmount=line=>{const ms=[...String(line).matchAll(/(-?\d{1,6}(?:[ .]\d{3})*[,.]\d{1,2}|-?\d{1,6})\s*(?:kr)?\b/gi)];return ms.length?n(ms[ms.length-1][1]):null};
    const findLine=words=>lines.find(line=>words.some(w=>norm(line).includes(norm(w))));
    const valueNear=(words,regex)=>{for(const line of lines){if(words.some(w=>norm(line).includes(norm(w)))){const m=line.match(regex);if(m)return n(m[1]);}}return null};
    const row=(words)=>findLine(words);

    const supplier=/\btibber\b/i.test(t)?'Tibber':/\bvattenfall\b/i.test(t)?'Vattenfall':/\be\.?\s*on\b/i.test(t)?'E.ON':/\bfortum\b/i.test(t)?'Fortum':/\bskellefte[aå]\s+kraft\b/i.test(t)?'Skellefteå Kraft':null;

    // Consumption: prefer a price row such as "683,44 kWh x 0,5929 kr/kWh".
    let consumption=null;
    for(const line of lines){
      const m=line.match(/(\d{1,6}[,.]\d{1,3})\s*kwh/i);
      if(m){const v=n(m[1]);if(v&&v>1){consumption=v;break;}}
    }

    function priceFromRow(line){
      if(!line)return null;
      let m=line.match(/[x×*]\s*(\d+[,.]\d{2,5})\s*kr\s*\/?\s*kwh/i);
      if(m)return n(m[1])*100;
      m=line.match(/(\d+[,.]\d{1,4})\s*(?:öre|ore)\s*\/?\s*kwh/i);
      if(m)return n(m[1]);
      return null;
    }

    const spotLine=row(['el till inköpspris','inköpspris','spotpris','spot price','elpris']);
    const markupLine=row(['fast påslag','paslag','påslag']);
    const variableLine=row(['rörliga kostnader','rorliga kostnader','inköpskostnader','inkopskostnader']);
    const monthlyLine=row(['månadsavgift','manadsavgift','fast avgift']);
    const vatLine=row(['moms 25','moms']);
    const payLine=row(['att betala','belopp att betala']);
    const sumLine=row(['summa elhandel','summa']);

    let spot=priceFromRow(spotLine);
    let markup=priceFromRow(markupLine);
    let variable=priceFromRow(variableLine);
    const monthly=monthlyLine?lastAmount(monthlyLine):null;
    const vat=vatLine?lastAmount(vatLine):null;
    let total=payLine?lastAmount(payLine):null;
    if(total==null&&sumLine)total=lastAmount(sumLine);

    // Fallback patterns across the whole OCR text.
    if(spot==null){const m=t.match(/(?:spotpris|ink[oö]pspris|elpris)[\s\S]{0,100}?(\d+[,.]\d{2,5})\s*kr\s*\/?\s*kwh/i);if(m)spot=n(m[1])*100;}
    if(markup==null){const m=t.match(/(?:fast\s+p[aå]slag|p[aå]slag)[\s\S]{0,100}?(\d+[,.]\d{2,5})\s*kr\s*\/?\s*kwh/i);if(m)markup=n(m[1])*100;}
    if(variable==null){const m=t.match(/(?:r[oö]rliga\s+kostnader|ink[oö]pskostnader)[\s\S]{0,100}?(\d+[,.]\d{2,5})\s*kr\s*\/?\s*kwh/i);if(m)variable=n(m[1])*100;}

    // If OCR catches row amounts but not kr/kWh, derive unit price from amount / consumption.
    if(consumption){
      if(spot==null&&spotLine){const a=lastAmount(spotLine);if(a!=null&&a<5000)spot=a/consumption*100;}
      if(markup==null&&markupLine){const a=lastAmount(markupLine);if(a!=null&&a<1000)markup=a/consumption*100;}
      if(variable==null&&variableLine){const a=lastAmount(variableLine);if(a!=null&&a<1000)variable=a/consumption*100;}
    }

    const grid=/vattenfall\s+eldistribution/i.test(t)?'Vattenfall Eldistribution AB':/e\.?\s*on\s+energidistribution/i.test(t)?'E.ON Energidistribution':null;
    const ctype=/kvartspris/i.test(t)?'quarter-hourly':/timpris/i.test(t)?'hourly':/fast\s*pris|fastpris/i.test(t)?'fixed':/r[oö]rligt/i.test(t)?'monthly':null;

    let invoicePeriod=null;
    const periodLine=findLine(['fakturaperiod','period','avser']);
    const periodMatch=(periodLine||t).match(/(20\d{2})[-/.](0?[1-9]|1[0-2])(?:[-/.]\d{1,2})?/);
    if(periodMatch)invoicePeriod=`${periodMatch[1]}-${String(periodMatch[2]).padStart(2,'0')}`;

    const warnings=[];
    if(!supplier)warnings.push('Leverantören kunde inte identifieras säkert.');
    if(consumption==null)warnings.push('Förbrukningen kunde inte läsas säkert.');
    if(total==null)warnings.push('Fakturans totalsumma kunde inte läsas säkert.');
    if(spot==null)warnings.push('Spot-/inköpspriset kunde inte läsas säkert.');

    const found=[supplier,consumption,spot,markup,variable,monthly,vat,total].filter(v=>v!=null).length;
    if(found<3)warnings.push('OCR hittade text men för få ekonomiska fält. Prova gärna en rak, skarp bild av hela fakturan.');

    return {
      category:'electricity',supplier,invoicePeriod,postalCode:null,biddingZone:null,annualConsumptionKwh:null,
      periodConsumptionKwh:consumption,contractType:ctype,spotPriceOrePerKwh:spot,energyPriceOrePerKwh:spot,
      markupOrePerKwh:markup,variableCostOrePerKwh:variable,fixedTradingFeeSekPerMonth:monthly,vatSek:vat,
      electricityTradingTotalSek:total,gridCompany:grid,gridTotalSek:null,invoiceTotalSek:total,
      contractNotes:'Lokalt OCR-resultat',confidence:{supplier:supplier?0.95:0.1,periodConsumptionKwh:consumption?0.9:0.1,
      spotPriceOrePerKwh:spot!=null?0.85:0.1,markupOrePerKwh:markup!=null?0.85:0.1,variableCostOrePerKwh:variable!=null?0.85:0.1,
      fixedTradingFeeSekPerMonth:monthly!=null?0.85:0.1,electricityTradingTotalSek:total!=null?0.9:0.1},warnings,source:'local_ocr',debug:{fieldsFound:found}
    };
  }
};