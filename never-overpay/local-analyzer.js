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
      const page=await pdf.getPage(p);const viewport=page.getViewport({scale:1.7});
      const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const r=await Tesseract.recognize(canvas,'swe+eng',{logger:m=>{if(m.status==='recognizing text')onProgress(Math.round(((p-1)+(m.progress||0))/pages*100));}});
      out+='\n'+(r?.data?.text||'');
    }
    return out;
  },
  parse(text){
    const raw=text||'';const t=raw.replace(/\u00a0/g,' ').replace(/[ ]+/g,' ');
    const num=s=>{if(!s)return null;const n=Number(String(s).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:null};
    const first=(patterns)=>{for(const r of patterns){const m=t.match(r);if(m)return m;}return null};
    const supplier=/\btibber\b/i.test(t)?'Tibber':/\bvattenfall\b/i.test(t)?'Vattenfall':/\be\.on\b|\beon\b/i.test(t)?'E.ON':/\bfortum\b/i.test(t)?'Fortum':/\bskellefteå kraft\b/i.test(t)?'Skellefteå Kraft':null;
    const cons=first([/(?:förbrukning|elförbrukning)[^\d]{0,25}([\d\s]+[,.]\d+)\s*kwh/i,/([\d\s]+[,.]\d+)\s*kwh/i]);
    const spot=first([/(?:spotpris|elpris)[^\d]{0,30}(\d+[,.]\d+)\s*(?:öre|ore)\/?kwh/i]);
    const markup=first([/(?:fast\s+påslag|påslag)[^\d]{0,30}(\d+[,.]\d+)\s*(?:öre|ore)\/?kwh/i]);
    const variable=first([/(?:rörliga\s+(?:kostnader|inköpskostnader)|inköpskostnader)[^\d]{0,30}(\d+[,.]\d+)\s*(?:öre|ore)\/?kwh/i]);
    const monthly=first([/(?:månadsavgift|fast\s+avgift)[^\d]{0,30}(\d+[,.]\d+)\s*kr/i]);
    const vat=first([/(?:moms)[^\d]{0,30}(\d+[\s\d]*[,.]\d+)\s*kr/i]);
    const total=first([/(?:att betala|totalt|summa)[^\d]{0,30}(\d+[\s\d]*[,.]\d+)\s*kr/i]);
    const grid=/vattenfall\s+eldistribution/i.test(t)?'Vattenfall Eldistribution AB':/e\.on\s+energidistribution/i.test(t)?'E.ON Energidistribution':null;
    const ctype=/kvartspris/i.test(t)?'quarter-hourly':/timpris/i.test(t)?'hourly':/fast pris|fastpris/i.test(t)?'fixed':/rörligt/i.test(t)?'monthly':null;
    const warnings=[];
    if(!supplier)warnings.push('Leverantören kunde inte identifieras säkert.');
    if(!cons)warnings.push('Förbrukningen kunde inte läsas säkert.');
    if(!total)warnings.push('Fakturans totalsumma kunde inte läsas säkert.');
    return {category:'electricity',supplier,invoicePeriod:null,postalCode:null,biddingZone:null,annualConsumptionKwh:null,periodConsumptionKwh:num(cons?.[1]),contractType:ctype,spotPriceOrePerKwh:num(spot?.[1]),energyPriceOrePerKwh:num(spot?.[1]),markupOrePerKwh:num(markup?.[1]),variableCostOrePerKwh:num(variable?.[1]),fixedTradingFeeSekPerMonth:num(monthly?.[1]),vatSek:num(vat?.[1]),electricityTradingTotalSek:num(total?.[1]),gridCompany:grid,gridTotalSek:null,invoiceTotalSek:num(total?.[1]),contractNotes:'Lokalt OCR-resultat',confidence:{supplier:supplier?.length?0.9:0.2,periodConsumptionKwh:cons?0.75:0.1,spotPriceOrePerKwh:spot?0.75:0.1,markupOrePerKwh:markup?0.75:0.1,fixedTradingFeeSekPerMonth:monthly?0.75:0.1},warnings,source:'local_ocr'};
  }
};