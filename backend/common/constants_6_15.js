export const DEFAULT_ALLOWED_COLUMNS = ["MSM030", "MSM040", "MSM110"];

export const DEFAULT_COLUMN_MAPPING = {
  MSM030: "code",
  MSM040: "name",
  MSM110: "updated_at",
  is_active: "is_active"
};

export const DEFAULT_COLUMN_MAPPING_Note = {
  MSM030: "code",
  MSM040: "content",
  MSM110: "updated_at",
  is_active: "is_active"
};

export const DEFAULT_ALLOWED_COLUMNS_LOCATIONS = ["S0104", "S0202", "S0204", "S0206"];

export const DEFAULT_COLUMN_MAPPING_Location = {
  warehouse_id: "warehouse_id",
  S0202: "code1",
  S0204: "code2",
  S0206: "code3"
};

export const client_id = 1;
export const default_date = '20260101';

/**
 * Mapping of handler file names (without .js extension) to their Japanese display names.
 * This is used to map the internal handler names to user-friendly names in the UI.
 */
export const HANDLER_NAME_MAP = {
  accountClassifications: '金種',
  businessTypes: '業務形態',
  manufacturers: 'メーカー',
  locationConditions: '立地条件',
  brands: '銘柄',
  materials: '原料',
  placeOfOrigins: '原産地',
  notes: '備考',
  areas: '地区',
  departments: '部門',
  branches: '支店',
  locations: 'ロケーション',
  warehouses: '倉庫',
  deliveryCourses: '配送コース',
  users: 'ユーザー',
  itemPartnerPrices: '個別単価',
  manufactureTypes: '製造区分',
  slipTypes: '伝票種別',
  saleSizes: '年商規模',
  storageTypes: '貯蔵区分',
  partners: '取引先',
  items: '商品管理',
  itemConnections: '商品関連付',
  itemCategories: '大中小分類',
  realStocks: '現在庫',
};