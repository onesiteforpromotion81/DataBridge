export const slipFractionEnum  = { 0:"ROUND_DOWN",1:"ROUND",2:"ROUND_UP" };
export const partnerPrintEnum  = { 0:"NONE",1:"JAN",2:"PARTNER_CODE",3:"SDP" };
export const displayTaxEnum    = { 0:"POST_TAX",1:"PRE_TAX" };
export const calcMethodEnum    = { 0:"PER_SLIP",1:"PER_SLIP",2:"PER_BILL" };
export const taxFractionEnum   = { 0:"ROUND_DOWN",1:"ROUND",2:"ROUND_UP" };
export const depositPlanEnum = { 0:"THIS_MONTH", 1:"IN_ONE_MONTH", 2:"IN_TWO_MONTHS", 3:"IN_THREE_MONTHS" };
export const creditErrorTypeEnum = { 0:"WARNING", 1:"PROHIBITION" };
export const weekEnum = { 0:"SELF", 1: "HOLIDAY" };
export const paymentMethodEnum = { 0: "DEPOSIT", 1: "CASH", 2: "CASH" };
export const cashCollectionMethodEnum = { 1: "SALESMAN", 2: "DELIVERY", 3: "DEPOSIT" };

export function supplierEnum(code){
    const num = Number(code);
    if(isNaN(num)) return null;
    if(num <= 9) return "SUPPLIER";
    return null;
}

export function buyerEnum(code){
    const num = Number(code);
    if(isNaN(num)) return null;
    if(num>=10 && num<=19) return "SECONDARY_WHOLESALER";
    if(num>=20 && num<=29) return "RETAILER";
    if(num>=90 && num<=99) return "ADJUSTMENT";
    return null;
}

export const itemTypeEnum = {
  1: "ALCOHOL",
  2: "CONTAINER",
  3: "NOT_ALCOHOL",
  8: "NOT_ALCOHOL",
  9: "NOT_ALCOHOL"
};

export const unitPriceTypeEnum = {
  0: "PURCHASE_UNIT_SALE_UNIT",
  1: "PURCHASE_CASE_SALE_UNIT",
  2: "PURCHASE_CASE_SALE_CASE",
  3: "PURCHASE_UNIT_SALE_CASE"
};

// helper for category codes
export function categoryLevels(code) {
  const s = code.toString().padStart(5,"0");
  return {
    cat1: "00" + s[0],
    cat2: "00" + s[0] + "0" + s[1] + s[2],
    cat3: "00" + s[0] + "0" + s[1] + s[2] + "0" + s[3] + s[4]
  };
}
