import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export const loadHandlers = async () => {
  const handlersDir = path.join(process.cwd(), "backend/csv-handlers");
  const files = fs.readdirSync(handlersDir)
    .filter(f => f.endsWith(".js") && f !== "baseHandler.js");

  const handlers = {};
  for (const file of files) {
    // Convert absolute path to file:// URL
    const filePath = pathToFileURL(path.join(handlersDir, file)).href;
    const module = await import(filePath);
    const optionName = file.replace(".js", "");
    let handlerName;
    handlerName = handlerName ?? (optionName === 'accountClassifications' ? '金種' : undefined);
    handlerName = handlerName ?? (optionName === 'businessTypes' ? '業務形態' : undefined);
    handlerName = handlerName ?? (optionName === 'slipTypes' ? '伝票種別' : undefined);
    handlerName = handlerName ?? (optionName === 'saleSizes' ? '年商規模' : undefined);
    handlerName = handlerName ?? (optionName === 'locationConditions' ? '立地条件' : undefined);
    handlerName = handlerName ?? (optionName === 'manufacturers' ? 'メーカー' : undefined);
    handlerName = handlerName ?? (optionName === 'materials' ? '原料' : undefined);
    // handlerName = handlerName ?? (optionName === 'placeOfOrigins' ? '原産地' : undefined);
    // handlerName = handlerName ?? (optionName === 'manufactureTypes' ? '製造区分' : undefined);
    // handlerName = handlerName ?? (optionName === 'storageTypes' ? '貯蔵区分' : undefined);
    // handlerName = handlerName ?? (optionName === 'areas' ? '地区' : undefined);
    handlerName = handlerName ?? (optionName === 'brands' ? '銘柄' : undefined);
    // handlerName = handlerName ?? (optionName === 'departments' ? '部門' : undefined);
    // handlerName = handlerName ?? (optionName === 'branches' ? '支店' : undefined);
    // handlerName = handlerName ?? (optionName === 'notes' ? '備考' : undefined);
    handlers[handlerName] = module.default;
  }

  return handlers;
};
