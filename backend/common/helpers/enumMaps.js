export const slipFractionEnum  = { 0:"ROUND_DOWN",1:"ROUND",2:"ROUND_UP" };
export const partnerPrintEnum  = { 0:"NONE",1:"JAN",2:"PARTNER_CODE",3:"SDP" };
export const displayTaxEnum    = { 0:"POST_TAX",1:"PRE_TAX" };
export const calcMethodEnum    = { 0:"PER_SLIP",1:"PER_SLIP",2:"PER_BILL" };
export const taxFractionEnum   = { 0:"ROUND_DOWN",1:"ROUND",2:"ROUND_UP" };
export const depositPlanEnum = { 0:"THIS_MONTH", 1:"IN_ONE_MONTH", 2:"IN_TWO_MONTHS", 3:"IN_THREE_MONTHS" };
export const creditErrorTypeEnum = { 1:"WARNING", 2:"PROHIBITION" };
export const weekEnum = { 0:"SELF", 1: "HOLIDAY" };
export const paymentMethodEnum = { 0: "DEPOSIT", 1: "CASH", 2: "CASH" };
export const cashCollectionMethodEnum = { 1: "SALESMAN", 2: "DELIVERY", 3: "DEPOSIT" };

export function supplierEnum(code){
    if(code <= 9) return "SUPPLIER";
    return null;
}

export function buyerEnum(code){
    if(code>=10 && code<=19) return "SECONDARY_WHOLESALER";
    if(code>=20 && code<=29) return "RETAILER";
    if(code>=90 && code<=99) return "ADJUSTMENT";
    return null;
}
