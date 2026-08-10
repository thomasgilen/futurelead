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
      spotPriceOrePerKwh: number(input.spotPriceOrePerKwh),
      energyPriceOrePerKwh: number(input.energyPriceOrePerKwh),
      markupOrePerKwh: number(input.markupOrePerKwh),
      variableCostOrePerKwh: number(input.variableCostOrePerKwh),
      fixedTradingFeeSekPerMonth: number(input.fixedTradingFeeSekPerMonth),
      vatSek: number(input.vatSek),
      roundingSek: number(input.roundingSek),
      electricityTradingTotalSek: number(input.electricityTradingTotalSek),
      gridCompany: input.gridCompany || null,
      gridTotalSek: number(input.gridTotalSek),
      invoiceTotalSek: number(input.invoiceTotalSek),
      contractNotes: input.contractNotes || null,
      confidence: input.confidence || {},
      source: 'uploaded_bill'
    };
  },

  annualTradingCost({ annualConsumptionKwh, energyPriceOrePerKwh, markupOrePerKwh = 0, variableCostOrePerKwh = 0, fixedTradingFeeSekPerMonth = 0 }) {
    if (![annualConsumptionKwh, energyPriceOrePerKwh].every(v => Number.isFinite(Number(v)))) return null;
    return Number(annualConsumptionKwh) * (Number(energyPriceOrePerKwh) + Number(markupOrePerKwh || 0) + Number(variableCostOrePerKwh || 0)) / 100 + Number(fixedTradingFeeSekPerMonth || 0) * 12;
  },

  compare(current, offer) {
    const currentCost = this.annualTradingCost(current);
    const offerCost = this.annualTradingCost({
      annualConsumptionKwh: current.annualConsumptionKwh,
      energyPriceOrePerKwh: offer.energyPriceOrePerKwh,
      markupOrePerKwh: offer.markupOrePerKwh,
      variableCostOrePerKwh: offer.variableCostOrePerKwh,
      fixedTradingFeeSekPerMonth: offer.fixedTradingFeeSekPerMonth
    });
    if (currentCost == null || offerCost == null) return null;
    return {
      currentAnnualTradingCostSek: Math.round(currentCost),
      offerAnnualTradingCostSek: Math.round(offerCost),
      potentialSavingSek: Math.max(0, Math.round(currentCost - offerCost)),
      excludesGridCharges: true
    };
  },

  // First real fixture, transcribed from an uploaded Tibber invoice for July 2026.
  // Personal identifiers and payment details are intentionally excluded.
  fixtures: {
    tibberJuly2026: {
      supplier: 'Tibber',
      invoicePeriod: '2026-07',
      periodConsumptionKwh: 683.44,
      contractType: 'quarter-hourly',
      spotPriceOrePerKwh: 59.29,
      energyPriceOrePerKwh: 59.29,
      markupOrePerKwh: 6.00,
      variableCostOrePerKwh: 3.28,
      fixedTradingFeeSekPerMonth: 39.20,
      vatSek: 126.95,
      roundingSek: 0.22,
      electricityTradingTotalSek: 635.00,
      gridCompany: 'Vattenfall Eldistribution AB',
      gridTotalSek: null,
      invoiceTotalSek: 635.00,
      contractNotes: 'Löpande kvartsprisavtal. Nätavgiften faktureras separat.',
      confidence: {
        supplier: 1,
        periodConsumptionKwh: 1,
        contractType: 0.98,
        spotPriceOrePerKwh: 1,
        markupOrePerKwh: 1,
        variableCostOrePerKwh: 1,
        fixedTradingFeeSekPerMonth: 1,
        electricityTradingTotalSek: 1
      }
    }
  }
};