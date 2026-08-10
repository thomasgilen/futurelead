/* Never Overpay — electricity vertical data model.
   Pure client-side prototype helpers. No personal data leaves the browser. */

window.NeverOverpayEnergy = {
  normalizeBill(input = {}) {
    const number = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
    return {
      category: 'electricity',
      supplier: input.supplier || null,
      invoicePeriod: input.invoicePeriod || null,
      postalCode: input.postalCode || null,
      biddingZone: input.biddingZone || null,
      annualConsumptionKwh: number(input.annualConsumptionKwh),
      periodConsumptionKwh: number(input.periodConsumptionKwh),
      contractType: input.contractType || null, // fixed | monthly | hourly | quarter-hourly | mixed
      energyPriceOrePerKwh: number(input.energyPriceOrePerKwh),
      markupOrePerKwh: number(input.markupOrePerKwh),
      fixedTradingFeeSekPerMonth: number(input.fixedTradingFeeSekPerMonth),
      electricityTradingTotalSek: number(input.electricityTradingTotalSek),
      gridCompany: input.gridCompany || null,
      gridTotalSek: number(input.gridTotalSek),
      taxAndVatSek: number(input.taxAndVatSek),
      invoiceTotalSek: number(input.invoiceTotalSek),
      confidence: input.confidence || {},
      source: 'uploaded_bill'
    };
  },

  annualTradingCost({ annualConsumptionKwh, energyPriceOrePerKwh, markupOrePerKwh = 0, fixedTradingFeeSekPerMonth = 0 }) {
    if (![annualConsumptionKwh, energyPriceOrePerKwh].every(v => Number.isFinite(Number(v)))) return null;
    return Number(annualConsumptionKwh) * (Number(energyPriceOrePerKwh) + Number(markupOrePerKwh || 0)) / 100 + Number(fixedTradingFeeSekPerMonth || 0) * 12;
  },

  compare(current, offer) {
    const currentCost = this.annualTradingCost(current);
    const offerCost = this.annualTradingCost({
      annualConsumptionKwh: current.annualConsumptionKwh,
      energyPriceOrePerKwh: offer.energyPriceOrePerKwh,
      markupOrePerKwh: offer.markupOrePerKwh,
      fixedTradingFeeSekPerMonth: offer.fixedTradingFeeSekPerMonth
    });
    if (currentCost == null || offerCost == null) return null;
    return {
      currentAnnualTradingCostSek: Math.round(currentCost),
      offerAnnualTradingCostSek: Math.round(offerCost),
      potentialSavingSek: Math.max(0, Math.round(currentCost - offerCost)),
      excludesGridCharges: true
    };
  }
};